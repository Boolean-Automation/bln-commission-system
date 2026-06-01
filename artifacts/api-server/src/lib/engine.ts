import { and, eq, isNotNull } from "drizzle-orm";
import {
  db,
  jobsTable,
  peopleTable,
  commissionPlansTable,
  ruleInstancesTable,
  commissionEntriesTable,
  commissionEventsTable,
  type Job,
  type Person,
  type RuleInstanceRow,
} from "@workspace/db";

type Tier = { ytdUpTo: number | null; rate: number };
type PositionTiers = { position: string; tiers: Tier[] };

// ---- Custom (declarative) rule config ----
type CustomOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "notContains";
type CustomCondition = { field: string; op: CustomOp; value: string | number };
type CustomRecipient = {
  source: "salesRep" | "manager" | "match";
  positionContains?: string;
  rolesInclude?: string[];
};
type CustomTier = { upTo: number | null; rate: number };
type CustomCalculation =
  | { kind: "flat"; amount: number }
  | { kind: "percent"; field: "totalAmount" | "gpAmount"; rate: number }
  | {
      kind: "tiered";
      basisField: "totalAmount" | "gpAmount";
      tiers: CustomTier[];
    };
type CustomConfig = {
  label?: string;
  recipient: CustomRecipient;
  conditions: CustomCondition[];
  calculation: CustomCalculation;
  respectGate?: boolean;
};

type DesiredEntry = {
  dedupeKey: string;
  personId: string;
  personName: string;
  type: string;
  sourceKind: string;
  sourceId: string | null;
  sourceLabel: string | null;
  amount: number;
  positionAtCosted: string | null;
  ruleInstanceIds: string[];
  computationSnapshot: Record<string, unknown>;
};

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function findPersonByName(
  people: Person[],
  name: string | null,
): Person | undefined {
  if (!name) return undefined;
  const target = name.trim().toLowerCase();
  return people.find((p) => p.name.trim().toLowerCase() === target);
}

// Positions come from Airtable's "Company Position (No Abbr.)" as full labels
// (e.g. "Sales Level 2"), and rule tier tables are keyed by the same full label.
// Normalize for a case/whitespace-insensitive compare.
function normalizePosition(position: string | null): string | null {
  if (!position) return null;
  return position.trim().toLowerCase();
}

function pickTier(tiers: Tier[], ytd: number): Tier | undefined {
  // tiers are ordered ascending by ytdUpTo; null means "no upper bound"
  for (const t of tiers) {
    if (t.ytdUpTo === null || ytd < t.ytdUpTo) return t;
  }
  return tiers[tiers.length - 1];
}

function pickCustomTier(
  tiers: CustomTier[],
  ytd: number,
): CustomTier | undefined {
  for (const t of tiers) {
    if (t.upTo === null || ytd < t.upTo) return t;
  }
  return tiers[tiers.length - 1];
}

// Resolve the value of a custom-condition field from a job/person pair.
function customFieldValue(
  field: string,
  job: Job,
  person: Person,
): string | number | null {
  switch (field) {
    case "job.totalAmount":
      return job.totalAmount ?? null;
    case "job.gpAmount":
      return job.gpAmount ?? null;
    case "job.gpPct":
      return job.gpPct ?? null;
    case "job.leadSource":
      return job.leadSource ?? null;
    case "job.status":
      return job.status ?? null;
    case "job.customer":
      return job.customer ?? null;
    case "person.position":
      return person.position ?? null;
    case "person.ytdSales":
      return person.ytdSales ?? null;
    case "person.roles":
      return (person.roles ?? []).join(", ");
    default:
      return null;
  }
}

function evalCustomCondition(
  cond: CustomCondition,
  job: Job,
  person: Person,
): boolean {
  const actual = customFieldValue(cond.field, job, person);
  const expected = cond.value;
  switch (cond.op) {
    case "eq":
    case "neq": {
      const eq =
        String(actual ?? "")
          .trim()
          .toLowerCase() ===
        String(expected ?? "")
          .trim()
          .toLowerCase();
      return cond.op === "eq" ? eq : !eq;
    }
    case "contains":
    case "notContains": {
      const has = String(actual ?? "")
        .toLowerCase()
        .includes(String(expected ?? "").toLowerCase());
      return cond.op === "contains" ? has : !has;
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = typeof actual === "number" ? actual : Number(actual);
      const b = typeof expected === "number" ? expected : Number(expected);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      if (cond.op === "gt") return a > b;
      if (cond.op === "gte") return a >= b;
      if (cond.op === "lt") return a < b;
      return a <= b;
    }
    default:
      return false;
  }
}

function resolveCustomRecipients(
  recipient: CustomRecipient,
  job: Job,
  people: Person[],
): Person[] {
  if (recipient.source === "salesRep") {
    const p = findPersonByName(people, job.salesRep);
    return p ? [p] : [];
  }
  if (recipient.source === "manager") {
    const p = findPersonByName(people, job.manager);
    return p ? [p] : [];
  }
  // match by position substring and/or role
  const positionContains = (recipient.positionContains ?? "").trim().toLowerCase();
  const rolesInclude = (recipient.rolesInclude ?? [])
    .map((r) => r.trim().toLowerCase())
    .filter((r) => r.length > 0);
  if (!positionContains && rolesInclude.length === 0) return [];
  return people.filter((p) => {
    const byPosition =
      positionContains.length > 0 &&
      (p.position ?? "").trim().toLowerCase().includes(positionContains);
    const byRole =
      rolesInclude.length > 0 &&
      (p.roles ?? []).some((r) => rolesInclude.includes(r.trim().toLowerCase()));
    return byPosition || byRole;
  });
}

export type RecomputeResult = {
  entriesCreated: number;
  entriesUpdated: number;
  entriesUnchanged: number;
  adjustmentsCreated: number;
};

export async function recomputeTenant(
  tenantId: string,
): Promise<RecomputeResult> {
  const [plan] = await db
    .select()
    .from(commissionPlansTable)
    .where(eq(commissionPlansTable.tenantId, tenantId));

  const instances: RuleInstanceRow[] = plan
    ? await db
        .select()
        .from(ruleInstancesTable)
        .where(eq(ruleInstancesTable.planId, plan.id))
    : [];

  const enabled = instances.filter((i) => i.enabled);

  const jobs = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.tenantId, tenantId));
  const people = await db
    .select()
    .from(peopleTable)
    .where(eq(peopleTable.tenantId, tenantId));

  // YTD Sales is computed in-system (not synced from Airtable): the sum of each
  // sales rep's non-cancelled jobs won in the current calendar year. This is the
  // value the tiered_ytd_rate rule uses to pick a commission tier, and what the
  // People page displays.
  await computeYtdSales(jobs, people);

  const gatekeeper = enabled.find((i) => i.ruleModuleKey === "gp_gatekeeper");
  const gateFloor = gatekeeper ? num(gatekeeper.params["floorPct"], 40) : null;
  const gatedTypes = new Set<string>(
    gatekeeper && Array.isArray(gatekeeper.params["gatedTypes"])
      ? (gatekeeper.params["gatedTypes"] as string[])
      : ["SL", "SM", "PM", "PMM"],
  );

  const isGated = (job: Job, type: string): boolean => {
    if (gateFloor === null) return false;
    if (!gatedTypes.has(type)) return false;
    if (job.gpPct === null || job.gpPct === undefined) return false;
    return job.gpPct < gateFloor;
  };

  const desired: DesiredEntry[] = [];

  for (const job of jobs) {
    if (job.cancelled) continue;
    const total = job.totalAmount ?? 0;
    const gp = job.gpAmount ?? 0;
    const label = `Job ${job.jobNumber}${job.customer ? ` - ${job.customer}` : ""}`;

    for (const inst of enabled) {
      if (inst.ruleModuleKey === "tiered_ytd_rate") {
        const rep = findPersonByName(people, job.salesRep);
        if (!rep) continue;
        const positions = Array.isArray(inst.params["positions"])
          ? (inst.params["positions"] as PositionTiers[])
          : [];
        const position = rep.position ?? positions[0]?.position ?? null;
        const repPosition = normalizePosition(position);
        const table =
          positions.find((p) => normalizePosition(p.position) === repPosition) ??
          positions[0];
        if (!table) continue;
        const ytd = rep.ytdSales ?? 0;
        const tier = pickTier(table.tiers, ytd);
        if (!tier) continue;
        const gated = isGated(job, "SL");
        const amount = gated ? 0 : round2(total * tier.rate);
        desired.push({
          dedupeKey: `${inst.id}:${job.id}:${rep.id}:SL`,
          personId: rep.id,
          personName: rep.name,
          type: "SL",
          sourceKind: "job",
          sourceId: job.id,
          sourceLabel: label,
          amount,
          positionAtCosted: position,
          ruleInstanceIds: [inst.id],
          computationSnapshot: {
            rule: "tiered_ytd_rate",
            position,
            ytdSales: ytd,
            jobTotal: total,
            rate: tier.rate,
            gpPct: job.gpPct,
            gated,
            formula: `${(tier.rate * 100).toFixed(2)}% x ${total}`,
          },
        });
      } else if (inst.ruleModuleKey === "sm_cut") {
        // Blanket sales-manager override: every person who qualifies as a sales
        // manager earns the override on each job. Managers are matched by
        // position substring and/or role; a legacy single `managerName` is
        // still honored when no matcher is configured.
        const positionRaw =
          typeof inst.params["positionContains"] === "string"
            ? (inst.params["positionContains"] as string).trim().toLowerCase()
            : "";
        // Treat an empty/whitespace matcher as absent so it never matches every
        // person via `"".includes("")`.
        const positionContains = positionRaw.length > 0 ? positionRaw : null;
        const rolesInclude = (
          Array.isArray(inst.params["rolesInclude"])
            ? (inst.params["rolesInclude"] as string[])
            : []
        )
          .map((r) => r.trim().toLowerCase())
          .filter((r) => r.length > 0);
        const managerName =
          typeof inst.params["managerName"] === "string"
            ? (inst.params["managerName"] as string)
            : null;

        let managers: Person[];
        if (positionContains || rolesInclude.length > 0) {
          managers = people.filter((p) => {
            const byPosition =
              positionContains !== null &&
              (p.position ?? "")
                .trim()
                .toLowerCase()
                .includes(positionContains);
            const byRole =
              rolesInclude.length > 0 &&
              (p.roles ?? []).some((r) =>
                rolesInclude.includes(r.trim().toLowerCase()),
              );
            return byPosition || byRole;
          });
        } else {
          const m = findPersonByName(people, managerName);
          managers = m ? [m] : [];
        }
        if (managers.length === 0) continue;

        const excludeSoldBy = (
          Array.isArray(inst.params["excludeSoldBy"])
            ? (inst.params["excludeSoldBy"] as string[])
            : []
        ).map((n) => n.trim().toLowerCase());
        if (
          job.salesRep &&
          excludeSoldBy.includes(job.salesRep.trim().toLowerCase())
        )
          continue;
        const rate = num(inst.params["rate"], 0.0075);
        const gated = isGated(job, "SM");
        const amount = gated ? 0 : round2(total * rate);
        for (const mgr of managers) {
          desired.push({
            dedupeKey: `${inst.id}:${job.id}:${mgr.id}:SM`,
            personId: mgr.id,
            personName: mgr.name,
            type: "SM",
            sourceKind: "job",
            sourceId: job.id,
            sourceLabel: label,
            amount,
            positionAtCosted: mgr.position ?? null,
            ruleInstanceIds: [inst.id],
            computationSnapshot: {
              rule: "sm_cut",
              jobTotal: total,
              rate,
              soldBy: job.salesRep,
              gpPct: job.gpPct,
              gated,
              formula: `${(rate * 100).toFixed(2)}% x ${total}`,
            },
          });
        }
      } else if (inst.ruleModuleKey === "pm_gp_rate") {
        const mgr = findPersonByName(people, job.manager);
        if (!mgr) continue;
        const rate = num(inst.params["rate"], 0.02);
        const type =
          inst.params["type"] === "PMM" ? "PMM" : ("PM" as "PM" | "PMM");
        const gated = isGated(job, type);
        const amount = gated ? 0 : round2(gp * rate);
        desired.push({
          dedupeKey: `${inst.id}:${job.id}:${mgr.id}:${type}`,
          personId: mgr.id,
          personName: mgr.name,
          type,
          sourceKind: "job",
          sourceId: job.id,
          sourceLabel: label,
          amount,
          positionAtCosted: mgr.position ?? null,
          ruleInstanceIds: [inst.id],
          computationSnapshot: {
            rule: "pm_gp_rate",
            projectGp: gp,
            rate,
            gpPct: job.gpPct,
            gated,
            formula: `${(rate * 100).toFixed(2)}% x ${gp}`,
          },
        });
      } else if (inst.ruleModuleKey === "referral_bonus") {
        if (!job.leadSource) continue;
        if (!job.leadSource.toLowerCase().includes("referral")) continue;
        const rep = findPersonByName(people, job.salesRep);
        if (!rep) continue;
        // Roles already compensated on the sale (e.g. SL/SM) are excluded from
        // the referral bonus per the rate card.
        const excludeRoles = (
          Array.isArray(inst.params["excludeRoles"])
            ? (inst.params["excludeRoles"] as string[])
            : []
        ).map((r) => r.toUpperCase());
        const repRoles = rep.roles.map((r) => r.toUpperCase());
        if (repRoles.some((r) => excludeRoles.includes(r))) continue;
        const amount = num(inst.params["amount"], 50);
        desired.push({
          dedupeKey: `${inst.id}:${job.id}:${rep.id}:REF`,
          personId: rep.id,
          personName: rep.name,
          type: "REF",
          sourceKind: "job",
          sourceId: job.id,
          sourceLabel: label,
          amount,
          positionAtCosted: rep.position ?? null,
          ruleInstanceIds: [inst.id],
          computationSnapshot: {
            rule: "referral_bonus",
            leadSource: job.leadSource,
            flat: amount,
          },
        });
      } else if (inst.ruleModuleKey === "custom") {
        const cfg = inst.params as unknown as CustomConfig;
        if (!cfg || !cfg.recipient || !cfg.calculation) continue;
        const recipients = resolveCustomRecipients(cfg.recipient, job, people);
        if (recipients.length === 0) continue;
        const conditions = Array.isArray(cfg.conditions) ? cfg.conditions : [];
        const respectGate = cfg.respectGate === true;
        const gated =
          respectGate &&
          gateFloor !== null &&
          job.gpPct !== null &&
          job.gpPct !== undefined &&
          job.gpPct < gateFloor;

        for (const person of recipients) {
          // All conditions must pass (AND) for this job/person pair.
          if (!conditions.every((c) => evalCustomCondition(c, job, person)))
            continue;

          const calc = cfg.calculation;
          let raw = 0;
          const snapshot: Record<string, unknown> = {
            rule: "custom",
            label: cfg.label ?? "Custom rule",
            recipient: cfg.recipient.source,
          };
          if (calc.kind === "flat") {
            raw = num(calc.amount, 0);
            snapshot["calculation"] = "flat";
            snapshot["flat"] = raw;
          } else if (calc.kind === "percent") {
            const basis =
              calc.field === "gpAmount" ? (job.gpAmount ?? 0) : total;
            const rate = num(calc.rate, 0);
            raw = basis * rate;
            snapshot["calculation"] = "percent";
            snapshot["basisField"] = calc.field;
            snapshot["basis"] = basis;
            snapshot["rate"] = rate;
            snapshot["formula"] = `${(rate * 100).toFixed(2)}% x ${basis}`;
          } else if (calc.kind === "tiered") {
            const ytd = person.ytdSales ?? 0;
            const tier = pickCustomTier(
              Array.isArray(calc.tiers) ? calc.tiers : [],
              ytd,
            );
            if (!tier) continue;
            const basis =
              calc.basisField === "gpAmount" ? (job.gpAmount ?? 0) : total;
            raw = basis * tier.rate;
            snapshot["calculation"] = "tiered";
            snapshot["basisField"] = calc.basisField;
            snapshot["basis"] = basis;
            snapshot["ytdSales"] = ytd;
            snapshot["rate"] = tier.rate;
            snapshot["formula"] = `${(tier.rate * 100).toFixed(2)}% x ${basis}`;
          } else {
            continue;
          }

          const amount = gated ? 0 : round2(raw);
          snapshot["gpPct"] = job.gpPct;
          snapshot["gated"] = gated;
          desired.push({
            dedupeKey: `${inst.id}:${job.id}:${person.id}:MSC`,
            personId: person.id,
            personName: person.name,
            type: "MSC",
            sourceKind: "job",
            sourceId: job.id,
            sourceLabel: label,
            amount,
            positionAtCosted: person.position ?? null,
            ruleInstanceIds: [inst.id],
            computationSnapshot: snapshot,
          });
        }
      }
    }
  }

  // Reconcile against existing rule-derived entries (dedupeKey not null).
  const existing = await db
    .select()
    .from(commissionEntriesTable)
    .where(
      and(
        eq(commissionEntriesTable.tenantId, tenantId),
        isNotNull(commissionEntriesTable.dedupeKey),
      ),
    );
  const existingByKey = new Map(existing.map((e) => [e.dedupeKey as string, e]));
  const desiredKeys = new Set(desired.map((d) => d.dedupeKey));

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  const now = new Date();

  for (const d of desired) {
    const prev = existingByKey.get(d.dedupeKey);
    if (!prev) {
      // Each ledger mutation + its audit event are written atomically so the
      // immutable log can never drift from the entry state.
      await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(commissionEntriesTable)
          .values({
            tenantId,
            personId: d.personId,
            personName: d.personName,
            type: d.type,
            sourceKind: d.sourceKind,
            sourceId: d.sourceId,
            sourceLabel: d.sourceLabel,
            dedupeKey: d.dedupeKey,
            amount: d.amount,
            state: "accrued",
            positionAtCosted: d.positionAtCosted,
            ruleInstanceIds: d.ruleInstanceIds,
            computationSnapshot: d.computationSnapshot,
            accruedAt: now,
          })
          .returning();
        await tx.insert(commissionEventsTable).values({
          entryId: inserted!.id,
          tenantId,
          eventKind: "created",
          before: null,
          after: { amount: d.amount, state: "accrued" },
          actor: "engine",
        });
      });
      created += 1;
    } else if (prev.state === "voided" || prev.state === "clawed_back") {
      // A rule-derived entry that was previously retired (rule disabled, job
      // cancelled) is produced again — reactivate it back to accrued.
      await db.transaction(async (tx) => {
        await tx
          .update(commissionEntriesTable)
          .set({
            state: "accrued",
            amount: d.amount,
            computationSnapshot: d.computationSnapshot,
            positionAtCosted: d.positionAtCosted,
            accruedAt: now,
            clawedBackAt: null,
          })
          .where(eq(commissionEntriesTable.id, prev.id));
        await tx.insert(commissionEventsTable).values({
          entryId: prev.id,
          tenantId,
          eventKind: "state_change",
          before: { amount: prev.amount, state: prev.state },
          after: {
            amount: d.amount,
            state: "accrued",
            reason: "reactivated by active rules",
          },
          actor: "engine",
        });
      });
      updated += 1;
    } else if (Math.abs(prev.amount - d.amount) > 0.005) {
      await db.transaction(async (tx) => {
        await tx
          .update(commissionEntriesTable)
          .set({
            amount: d.amount,
            computationSnapshot: d.computationSnapshot,
            positionAtCosted: d.positionAtCosted,
          })
          .where(eq(commissionEntriesTable.id, prev.id));
        await tx.insert(commissionEventsTable).values({
          entryId: prev.id,
          tenantId,
          eventKind: "recomputed",
          before: { amount: prev.amount },
          after: { amount: d.amount },
          actor: "engine",
        });
      });
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  // Reconcile removals: rule-derived entries that are no longer produced (job
  // cancelled, rule disabled, mapping changed). Void unpaid entries; treat
  // already-paid entries as clawbacks. Already-terminal entries are left alone.
  for (const prev of existing) {
    if (desiredKeys.has(prev.dedupeKey as string)) continue;
    if (prev.state === "voided" || prev.state === "clawed_back") continue;
    const toState = prev.state === "paid" ? "clawed_back" : "voided";
    await db.transaction(async (tx) => {
      await tx
        .update(commissionEntriesTable)
        .set({
          state: toState,
          amount: 0,
          clawedBackAt: toState === "clawed_back" ? now : prev.clawedBackAt,
        })
        .where(eq(commissionEntriesTable.id, prev.id));
      await tx.insert(commissionEventsTable).values({
        entryId: prev.id,
        tenantId,
        eventKind: toState === "clawed_back" ? "clawed_back" : "state_change",
        before: { amount: prev.amount, state: prev.state },
        after: {
          amount: 0,
          state: toState,
          reason: "no longer produced by active rules",
        },
        actor: "engine",
      });
    });
    updated += 1;
  }

  return {
    entriesCreated: created,
    entriesUpdated: updated,
    entriesUnchanged: unchanged,
    adjustmentsCreated: 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function yearOf(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const m = dateStr.match(/\b(20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

/**
 * Recompute each person's YTD Sales from the jobs table and persist it.
 * YTD Sales = sum of `totalAmount` over non-cancelled jobs the person sold
 * (matched on `salesRep`) whose won/signed date falls in the current calendar
 * year. Mutates the in-memory `people` rows so tier selection downstream uses
 * the fresh value, and only writes rows whose stored value actually changed.
 */
async function computeYtdSales(jobs: Job[], people: Person[]): Promise<void> {
  const currentYear = new Date().getFullYear();
  const ytdByName = new Map<string, number>();
  for (const job of jobs) {
    if (job.cancelled) continue;
    if (!job.salesRep) continue;
    const total = job.totalAmount ?? 0;
    if (!total) continue;
    const year = yearOf(job.signedDate) ?? yearOf(job.completedDate);
    if (year !== currentYear) continue;
    const key = job.salesRep.trim().toLowerCase();
    ytdByName.set(key, (ytdByName.get(key) ?? 0) + total);
  }
  for (const p of people) {
    const next = round2(ytdByName.get(p.name.trim().toLowerCase()) ?? 0);
    if ((p.ytdSales ?? 0) !== next) {
      await db
        .update(peopleTable)
        .set({ ytdSales: next })
        .where(eq(peopleTable.id, p.id));
      p.ytdSales = next;
    }
  }
}
