import { Router, type IRouter } from "express";
import { eq, desc, inArray, and } from "drizzle-orm";
import {
  db,
  commissionEntriesTable,
  commissionEventsTable,
  peopleTable,
} from "@workspace/db";
import {
  GetDashboardParams,
  GetDashboardResponse,
  GetActivityParams,
  GetActivityQueryParams,
  GetActivityResponse,
  GetPayrollSummaryParams,
  GetPayrollSummaryResponse,
  GetReconciliationParams,
  GetReconciliationResponse,
} from "@workspace/api-zod";
import { requireTenantAccess } from "../lib/rbac";

const router: IRouter = Router();

router.use("/tenants/:tenantId", requireTenantAccess);

const round2 = (n: number) => Math.round(n * 100) / 100;

router.get("/tenants/:tenantId/dashboard", async (req, res): Promise<void> => {
  const params = GetDashboardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const entries = await db
    .select()
    .from(commissionEntriesTable)
    .where(eq(commissionEntriesTable.tenantId, params.data.tenantId));

  const byState = new Map<string, { count: number; amount: number }>();
  const byType = new Map<string, { count: number; amount: number }>();
  const byPerson = new Map<
    string,
    { personName: string; amount: number; entryCount: number }
  >();
  let accruedTotal = 0;
  let payableTotal = 0;
  let paidTotal = 0;
  let clawedBackTotal = 0;

  for (const e of entries) {
    const s = byState.get(e.state) ?? { count: 0, amount: 0 };
    s.count += 1;
    s.amount += e.amount;
    byState.set(e.state, s);

    const t = byType.get(e.type) ?? { count: 0, amount: 0 };
    t.count += 1;
    t.amount += e.amount;
    byType.set(e.type, t);

    if (e.state === "accrued") accruedTotal += e.amount;
    if (e.state === "payable") payableTotal += e.amount;
    if (e.state === "paid") paidTotal += e.amount;
    if (e.state === "clawed_back") clawedBackTotal += e.amount;

    if (e.state !== "voided" && e.state !== "clawed_back") {
      const p = byPerson.get(e.personId) ?? {
        personName: e.personName,
        amount: 0,
        entryCount: 0,
      };
      p.amount += e.amount;
      p.entryCount += 1;
      byPerson.set(e.personId, p);
    }
  }

  const topEarners = [...byPerson.entries()]
    .map(([personId, v]) => ({
      personId,
      personName: v.personName,
      amount: round2(v.amount),
      entryCount: v.entryCount,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  res.json(
    GetDashboardResponse.parse({
      tenantId: params.data.tenantId,
      entryCount: entries.length,
      accruedTotal: round2(accruedTotal),
      payableTotal: round2(payableTotal),
      paidTotal: round2(paidTotal),
      clawedBackTotal: round2(clawedBackTotal),
      totalsByState: [...byState.entries()].map(([state, v]) => ({
        state,
        count: v.count,
        amount: round2(v.amount),
      })),
      totalsByType: [...byType.entries()].map(([type, v]) => ({
        type,
        count: v.count,
        amount: round2(v.amount),
      })),
      topEarners,
    }),
  );
});

router.get("/tenants/:tenantId/payroll", async (req, res): Promise<void> => {
  const params = GetPayrollSummaryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const entries = await db
    .select()
    .from(commissionEntriesTable)
    .where(eq(commissionEntriesTable.tenantId, params.data.tenantId));

  const byPerson = new Map<
    string,
    {
      personName: string;
      position: string | null;
      accruedTotal: number;
      payableTotal: number;
      paidTotal: number;
      entryCount: number;
    }
  >();

  for (const e of entries) {
    const p = byPerson.get(e.personId) ?? {
      personName: e.personName,
      position: e.positionAtCosted ?? null,
      accruedTotal: 0,
      payableTotal: 0,
      paidTotal: 0,
      entryCount: 0,
    };
    if (e.state === "accrued") p.accruedTotal += e.amount;
    if (e.state === "payable") p.payableTotal += e.amount;
    if (e.state === "paid") p.paidTotal += e.amount;
    p.entryCount += 1;
    if (!p.position && e.positionAtCosted) p.position = e.positionAtCosted;
    byPerson.set(e.personId, p);
  }

  const lines = [...byPerson.entries()]
    .map(([personId, v]) => ({
      personId,
      personName: v.personName,
      position: v.position,
      accruedTotal: round2(v.accruedTotal),
      payableTotal: round2(v.payableTotal),
      paidTotal: round2(v.paidTotal),
      netOwed: round2(v.accruedTotal + v.payableTotal),
      entryCount: v.entryCount,
    }))
    .sort((a, b) => b.netOwed - a.netOwed);

  res.json(GetPayrollSummaryResponse.parse(lines));
});

router.get("/tenants/:tenantId/activity", async (req, res): Promise<void> => {
  const params = GetActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const query = GetActivityQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const limit = query.data.limit ?? 30;
  const events = await db
    .select()
    .from(commissionEventsTable)
    .where(eq(commissionEventsTable.tenantId, params.data.tenantId))
    .orderBy(desc(commissionEventsTable.at))
    .limit(limit);

  const entryIds = [...new Set(events.map((e) => e.entryId))];
  const entries = entryIds.length
    ? await db
        .select()
        .from(commissionEntriesTable)
        .where(inArray(commissionEntriesTable.id, entryIds))
    : [];
  const entryById = new Map(entries.map((e) => [e.id, e]));

  const items = events.map((ev) => {
    const entry = entryById.get(ev.entryId);
    const after = (ev.after ?? {}) as Record<string, unknown>;
    let summary: string;
    switch (ev.eventKind) {
      case "created":
        summary = `Accrued ${entry?.type ?? ""} commission`;
        break;
      case "recomputed":
        summary = "Recomputed by engine";
        break;
      case "state_change":
        summary = `Moved to ${String(after["state"] ?? "")}`;
        break;
      case "manually_adjusted":
        summary = "Amount adjusted by operator";
        break;
      case "clawed_back":
        summary = "Commission clawed back";
        break;
      default:
        summary = ev.eventKind;
    }
    return {
      id: ev.id,
      entryId: ev.entryId,
      eventKind: ev.eventKind,
      actor: ev.actor,
      at: ev.at.toISOString(),
      summary,
      personName: entry?.personName ?? null,
      amount: entry?.amount ?? null,
    };
  });

  res.json(GetActivityResponse.parse(items));
});

// Absolute dollar tolerance for the match indicator. Summing many rounded
// per-job amounts can drift by a cent or two against a source's own rounded
// totals, so anything within this band is treated as a match.
const RECON_TOLERANCE = 0.01;

const TERMINAL_STATES = new Set(["voided", "clawed_back"]);

/**
 * Reconcile our engine-computed per-person commission totals against the
 * reference "benchmark" figures pulled from the tenant's data source. Benchmark
 * values are read-only reference numbers stored on `people` — they never feed
 * the engine, ledger, dashboard, or payroll.
 *
 * Per-person computed metrics:
 *  - netOwed    = accrued + payable (same as the payroll Net Owed)
 *  - totalEarned= sum of non-voided / non-clawed-back entry amounts
 *  - paid       = sum of paid entry amounts
 *  - adjustments= operator-originated adjustment dollars (see below)
 *
 * "Total Adjustments" definition: the dollars that came from an operator rather
 * than directly from a rule, namely (a) the current amount of every manual
 * entry (`sourceKind = "manual"`, excluding voided/clawed-back) — these entries
 * exist only because an operator created them — plus (b) the net change applied
 * via `manually_adjusted` events on rule-derived entries (Σ after − before),
 * i.e. hand edits layered on top of rule output. Manual entries' own adjustment
 * events are excluded from (b) so an adjusted manual entry is not double-counted
 * (its current amount in (a) already reflects the edit).
 */
router.get(
  "/tenants/:tenantId/reconciliation",
  async (req, res): Promise<void> => {
    const params = GetReconciliationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const tenantId = params.data.tenantId;

    const [entries, people, adjustEvents] = await Promise.all([
      db
        .select()
        .from(commissionEntriesTable)
        .where(eq(commissionEntriesTable.tenantId, tenantId)),
      db.select().from(peopleTable).where(eq(peopleTable.tenantId, tenantId)),
      db
        .select()
        .from(commissionEventsTable)
        .where(
          and(
            eq(commissionEventsTable.tenantId, tenantId),
            eq(commissionEventsTable.eventKind, "manually_adjusted"),
          ),
        ),
    ]);

    type Computed = {
      netOwed: number;
      totalEarned: number;
      paid: number;
      adjustments: number;
    };
    type Acc = {
      personId: string;
      personName: string;
      inPeople: boolean;
      hasEntries: boolean;
      computed: Computed;
      benchmark: {
        netOwed: number | null;
        totalEarned: number | null;
        paid: number | null;
        adjustments: number | null;
      };
    };

    const byPerson = new Map<string, Acc>();
    const ensure = (personId: string, personName: string): Acc => {
      let acc = byPerson.get(personId);
      if (!acc) {
        acc = {
          personId,
          personName,
          inPeople: false,
          hasEntries: false,
          computed: { netOwed: 0, totalEarned: 0, paid: 0, adjustments: 0 },
          benchmark: {
            netOwed: null,
            totalEarned: null,
            paid: null,
            adjustments: null,
          },
        };
        byPerson.set(personId, acc);
      }
      return acc;
    };

    // Benchmark side: one row per person from the people table.
    for (const p of people) {
      const acc = ensure(p.id, p.name);
      acc.inPeople = true;
      acc.personName = p.name;
      acc.benchmark = {
        netOwed: p.benchmarkCommissionOwed ?? null,
        totalEarned: p.benchmarkTotalEarned ?? null,
        paid: p.benchmarkTotalPaid ?? null,
        adjustments: p.benchmarkTotalAdjustments ?? null,
      };
    }

    // Computed side: aggregate the ledger. An entry can reference a person whose
    // people row was pruned, so this may introduce people-less rows (surfaced as
    // missing on the benchmark side rather than hidden).
    const manualEntryIds = new Set<string>();
    const entryPersonId = new Map<string, string>();
    for (const e of entries) {
      entryPersonId.set(e.id, e.personId);
      if (e.sourceKind === "manual") manualEntryIds.add(e.id);
      const acc = ensure(e.personId, e.personName);
      acc.hasEntries = true;
      if (!acc.inPeople) acc.personName = e.personName;
      if (!TERMINAL_STATES.has(e.state)) acc.computed.totalEarned += e.amount;
      if (e.state === "accrued") acc.computed.netOwed += e.amount;
      if (e.state === "payable") acc.computed.netOwed += e.amount;
      if (e.state === "paid") acc.computed.paid += e.amount;
      // (a) manual entries are themselves adjustments.
      if (e.sourceKind === "manual" && !TERMINAL_STATES.has(e.state)) {
        acc.computed.adjustments += e.amount;
      }
    }

    // (b) net hand-edits on rule-derived entries.
    for (const ev of adjustEvents) {
      if (manualEntryIds.has(ev.entryId)) continue; // avoid double-count of (a)
      const personId = entryPersonId.get(ev.entryId);
      if (!personId) continue;
      const before = Number((ev.before as Record<string, unknown>)?.["amount"]);
      const after = Number((ev.after as Record<string, unknown>)?.["amount"]);
      if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
      const acc = byPerson.get(personId);
      if (acc) acc.computed.adjustments += after - before;
    }

    const matchOf = (
      computed: number,
      benchmark: number | null,
    ): boolean | null =>
      benchmark === null
        ? null
        : Math.abs(round2(computed - benchmark)) <= RECON_TOLERANCE;
    const deltaOf = (computed: number, benchmark: number | null): number | null =>
      benchmark === null ? null : round2(computed - benchmark);

    const rollup = {
      peopleCount: 0,
      matchCount: 0,
      mismatchCount: 0,
      noBenchmarkCount: 0,
      computed: { netOwed: 0, totalEarned: 0, paid: 0, adjustments: 0 },
      benchmark: { netOwed: 0, totalEarned: 0, paid: 0, adjustments: 0 },
    };

    const lines = [...byPerson.values()].map((acc) => {
      const computed = {
        netOwed: round2(acc.computed.netOwed),
        totalEarned: round2(acc.computed.totalEarned),
        paid: round2(acc.computed.paid),
        adjustments: round2(acc.computed.adjustments),
      };
      const b = acc.benchmark;
      const hasBenchmark =
        b.netOwed !== null ||
        b.totalEarned !== null ||
        b.paid !== null ||
        b.adjustments !== null;
      const match = {
        netOwed: matchOf(computed.netOwed, b.netOwed),
        totalEarned: matchOf(computed.totalEarned, b.totalEarned),
        paid: matchOf(computed.paid, b.paid),
        adjustments: matchOf(computed.adjustments, b.adjustments),
      };
      const delta = {
        netOwed: deltaOf(computed.netOwed, b.netOwed),
        totalEarned: deltaOf(computed.totalEarned, b.totalEarned),
        paid: deltaOf(computed.paid, b.paid),
        adjustments: deltaOf(computed.adjustments, b.adjustments),
      };
      const flags = [
        match.netOwed,
        match.totalEarned,
        match.paid,
        match.adjustments,
      ];
      const status: "match" | "mismatch" | "no_benchmark" = !hasBenchmark
        ? "no_benchmark"
        : flags.some((f) => f === false)
          ? "mismatch"
          : "match";

      rollup.peopleCount += 1;
      if (status === "match") rollup.matchCount += 1;
      else if (status === "mismatch") rollup.mismatchCount += 1;
      else rollup.noBenchmarkCount += 1;
      rollup.computed.netOwed += computed.netOwed;
      rollup.computed.totalEarned += computed.totalEarned;
      rollup.computed.paid += computed.paid;
      rollup.computed.adjustments += computed.adjustments;
      rollup.benchmark.netOwed += b.netOwed ?? 0;
      rollup.benchmark.totalEarned += b.totalEarned ?? 0;
      rollup.benchmark.paid += b.paid ?? 0;
      rollup.benchmark.adjustments += b.adjustments ?? 0;

      return {
        personId: acc.personId,
        personName: acc.personName,
        inPeople: acc.inPeople,
        hasEntries: acc.hasEntries,
        hasBenchmark,
        status,
        computed,
        benchmark: b,
        delta,
        match,
      };
    });

    // Mismatches first, then no-benchmark, then matches; by net owed within each.
    const order = { mismatch: 0, no_benchmark: 1, match: 2 };
    lines.sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        b.computed.netOwed - a.computed.netOwed,
    );

    res.json(
      GetReconciliationResponse.parse({
        tenantId,
        tolerance: RECON_TOLERANCE,
        rollup: {
          ...rollup,
          computed: {
            netOwed: round2(rollup.computed.netOwed),
            totalEarned: round2(rollup.computed.totalEarned),
            paid: round2(rollup.computed.paid),
            adjustments: round2(rollup.computed.adjustments),
          },
          benchmark: {
            netOwed: round2(rollup.benchmark.netOwed),
            totalEarned: round2(rollup.benchmark.totalEarned),
            paid: round2(rollup.benchmark.paid),
            adjustments: round2(rollup.benchmark.adjustments),
          },
        },
        lines,
      }),
    );
  },
);

export default router;
