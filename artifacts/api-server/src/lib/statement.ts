import { and, eq, inArray, isNotNull, gte, lte, sql } from "drizzle-orm";
import {
  db,
  commissionEntriesTable,
  jobsTable,
  peopleTable,
  ruleInstancesTable,
  statementsTable,
  statementThreadsTable,
  usersTable,
  type CommissionEntryRow,
  type Job,
  type RuleInstanceRow,
  type StatementRow,
} from "@workspace/db";
import { derivePeriodRange, type PeriodType } from "./manualInputs";
import {
  formatSnapshot,
  type FormulaBreakdown,
} from "./snapshotFormat";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type StatementDeal = {
  jobId: string;
  jobNumber: string;
  jobName: string | null;
  customer: string | null;
  totalAmount: number | null;
  gpAmount: number | null;
  gpPct: number | null;
  status: string;
  signedDate: string | null;
  completedDate: string | null;
};

export type StatementItem = {
  entryId: string;
  type: string;
  amount: number;
  state: string;
  ruleModuleKey: string | null;
  ruleDescription: string | null;
  source: { kind: string; id: string | null; label: string | null };
  formula: FormulaBreakdown;
  deal: StatementDeal | null;
  accruedAt: string | null;
  payableAt: string | null;
  paidAt: string | null;
  notes: string | null;
};

export type StatementSummary = {
  totalEarned: number;
  byType: { type: string; total: number; count: number }[];
  byState: {
    accrued: number;
    payable: number;
    paid: number;
    clawedBack: number;
  };
  entryCount: number;
  dealCount: number;
};

export type SignoffState = "none" | "requested" | "acknowledged";

export type StatementSignoff = {
  state: SignoffState;
  requestedAt: string | null;
  requestedByName: string | null;
  acknowledgedAt: string | null;
};

export type ThreadSummary = {
  id: string;
  entryId: string | null;
  subject: string | null;
  status: "open" | "resolved";
  messageCount: number;
  lastMessageAt: string;
  openedByName: string | null;
};

export type Statement = {
  personId: string;
  personName: string;
  period: {
    type: PeriodType;
    key: string;
    startDate: string;
    endDate: string;
  };
  summary: StatementSummary;
  items: StatementItem[];
  signoff: StatementSignoff;
  threads: ThreadSummary[];
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

function dealFromJob(job: Job): StatementDeal {
  return {
    jobId: job.id,
    jobNumber: job.jobNumber,
    jobName: job.jobName ?? null,
    customer: job.customer ?? null,
    totalAmount: job.totalAmount ?? null,
    gpAmount: job.gpAmount ?? null,
    gpPct: job.gpPct ?? null,
    status: job.status,
    signedDate: job.signedDate ?? null,
    completedDate: job.completedDate ?? null,
  };
}

function composeItem(
  entry: CommissionEntryRow,
  jobsById: Map<string, Job>,
  ruleById: Map<string, RuleInstanceRow>,
): StatementItem {
  const ruleInstance =
    entry.ruleInstanceIds && entry.ruleInstanceIds.length > 0
      ? (ruleById.get(entry.ruleInstanceIds[0]!) ?? null)
      : null;
  const deal =
    entry.sourceKind === "job" && entry.sourceId
      ? (jobsById.get(entry.sourceId) ?? null)
      : null;
  return {
    entryId: entry.id,
    type: entry.type,
    amount: entry.amount,
    state: entry.state,
    ruleModuleKey: ruleInstance?.ruleModuleKey ?? null,
    ruleDescription: ruleInstance?.description ?? null,
    source: {
      kind: entry.sourceKind,
      id: entry.sourceId ?? null,
      label: entry.sourceLabel ?? null,
    },
    formula: formatSnapshot(
      entry.computationSnapshot ?? null,
      ruleInstance,
      entry.amount,
    ),
    deal: deal ? dealFromJob(deal) : null,
    accruedAt: entry.accruedAt ? entry.accruedAt.toISOString() : null,
    payableAt: entry.payableAt ? entry.payableAt.toISOString() : null,
    paidAt: entry.paidAt ? entry.paidAt.toISOString() : null,
    notes: entry.notes ?? null,
  };
}

function computeSummary(items: StatementItem[]): StatementSummary {
  const byTypeMap = new Map<string, { total: number; count: number }>();
  const byState = { accrued: 0, payable: 0, paid: 0, clawedBack: 0 };
  const jobIds = new Set<string>();
  let totalEarned = 0;

  for (const item of items) {
    totalEarned += item.amount;
    const bucket = byTypeMap.get(item.type) ?? { total: 0, count: 0 };
    bucket.total += item.amount;
    bucket.count += 1;
    byTypeMap.set(item.type, bucket);

    if (item.state === "accrued") byState.accrued += item.amount;
    else if (item.state === "payable") byState.payable += item.amount;
    else if (item.state === "paid") byState.paid += item.amount;
    else if (item.state === "clawed_back") byState.clawedBack += item.amount;

    if (item.deal) jobIds.add(item.deal.jobId);
  }

  const byType = Array.from(byTypeMap.entries())
    .map(([type, bucket]) => ({
      type,
      total: round2(bucket.total),
      count: bucket.count,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    totalEarned: round2(totalEarned),
    byType,
    byState: {
      accrued: round2(byState.accrued),
      payable: round2(byState.payable),
      paid: round2(byState.paid),
      clawedBack: round2(byState.clawedBack),
    },
    entryCount: items.length,
    dealCount: jobIds.size,
  };
}

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export async function assembleStatement(
  tenantId: string,
  personId: string,
  periodType: PeriodType,
  periodKey: string,
): Promise<Statement | null> {
  const range = derivePeriodRange(periodType, periodKey);
  if (!range) return null;

  const startDate = new Date(`${range.effectiveFrom}T00:00:00.000Z`);
  // Period end is the last instant of the last day (UTC). Anything accrued in
  // that final second is included; anything one second later is excluded.
  const endDate = new Date(`${range.effectiveTo}T23:59:59.999Z`);

  const [person] = await db
    .select()
    .from(peopleTable)
    .where(eq(peopleTable.id, personId))
    .limit(1);
  if (!person || person.tenantId !== tenantId) return null;

  const entries = await db
    .select()
    .from(commissionEntriesTable)
    .where(
      and(
        eq(commissionEntriesTable.tenantId, tenantId),
        eq(commissionEntriesTable.personId, personId),
        isNotNull(commissionEntriesTable.accruedAt),
        gte(commissionEntriesTable.accruedAt, startDate),
        lte(commissionEntriesTable.accruedAt, endDate),
      ),
    )
    .orderBy(
      sql`${commissionEntriesTable.accruedAt} ASC NULLS LAST`,
      commissionEntriesTable.id,
    );

  const jobIds = uniq(
    entries
      .filter((e) => e.sourceKind === "job" && e.sourceId)
      .map((e) => e.sourceId as string),
  );
  const jobs =
    jobIds.length > 0
      ? await db
          .select()
          .from(jobsTable)
          .where(inArray(jobsTable.id, jobIds))
      : [];
  const jobsById = new Map(jobs.map((j) => [j.id, j]));

  const ruleInstanceIds = uniq(
    entries.flatMap((e) => e.ruleInstanceIds ?? []),
  );
  const ruleInstances =
    ruleInstanceIds.length > 0
      ? await db
          .select()
          .from(ruleInstancesTable)
          .where(inArray(ruleInstancesTable.id, ruleInstanceIds))
      : [];
  const ruleById = new Map(ruleInstances.map((r) => [r.id, r]));

  const items = entries.map((e) => composeItem(e, jobsById, ruleById));
  const summary = computeSummary(items);

  const [statementRow] = await db
    .select()
    .from(statementsTable)
    .where(
      and(
        eq(statementsTable.tenantId, tenantId),
        eq(statementsTable.personId, personId),
        eq(statementsTable.periodType, periodType),
        eq(statementsTable.periodKey, periodKey),
      ),
    )
    .limit(1);

  const signoff = await composeSignoff(statementRow ?? null);
  const threads = statementRow
    ? await loadThreadSummaries(statementRow.id)
    : [];

  return {
    personId: person.id,
    personName: person.name,
    period: {
      type: periodType,
      key: periodKey,
      startDate: range.effectiveFrom,
      endDate: range.effectiveTo,
    },
    summary,
    items,
    signoff,
    threads,
  };
}

/**
 * Look up a statements row by its (tenant, person, period) coordinate or
 * create it if missing. Statements are materialized lazily — the first write
 * path that needs a stable FK target creates the row inside its transaction.
 *
 * `onConflictDoUpdate` with a no-op set + `.returning()` is the cheapest way
 * to get the row back regardless of whether it existed.
 */
export async function findOrCreateStatement(
  tx: Tx,
  tenantId: string,
  personId: string,
  periodType: PeriodType,
  periodKey: string,
): Promise<StatementRow> {
  const [row] = await tx
    .insert(statementsTable)
    .values({ tenantId, personId, periodType, periodKey })
    .onConflictDoUpdate({
      target: [
        statementsTable.tenantId,
        statementsTable.personId,
        statementsTable.periodType,
        statementsTable.periodKey,
      ],
      set: { tenantId: sql`excluded.tenant_id` },
    })
    .returning();
  return row!;
}

async function composeSignoff(
  row: StatementRow | null,
): Promise<StatementSignoff> {
  if (!row) {
    return {
      state: "none",
      requestedAt: null,
      requestedByName: null,
      acknowledgedAt: null,
    };
  }
  const userIds = [
    row.signoffRequestedByUserId,
    row.signoffAcknowledgedByUserId,
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
  const nameById = await loadUserNames(userIds);
  return {
    state: (row.signoffState as SignoffState) ?? "none",
    requestedAt: row.signoffRequestedAt
      ? row.signoffRequestedAt.toISOString()
      : null,
    requestedByName: row.signoffRequestedByUserId
      ? (nameById.get(row.signoffRequestedByUserId) ?? null)
      : null,
    acknowledgedAt: row.signoffAcknowledgedAt
      ? row.signoffAcknowledgedAt.toISOString()
      : null,
  };
}

async function loadThreadSummaries(
  statementId: string,
): Promise<ThreadSummary[]> {
  const rows = await db
    .select()
    .from(statementThreadsTable)
    .where(eq(statementThreadsTable.statementId, statementId))
    .orderBy(sql`${statementThreadsTable.lastMessageAt} DESC`);
  const openedByIds = uniq(rows.map((r) => r.openedByUserId));
  const nameById = await loadUserNames(openedByIds);
  return rows.map((r) => ({
    id: r.id,
    entryId: r.entryId ?? null,
    subject: r.subject ?? null,
    status: (r.status as "open" | "resolved") ?? "open",
    messageCount: r.messageCount,
    lastMessageAt: r.lastMessageAt.toISOString(),
    openedByName: nameById.get(r.openedByUserId) ?? null,
  }));
}

export async function loadUserNames(
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, uniq(userIds)));
  const result = new Map<string, string>();
  for (const r of rows) {
    const name = [r.firstName, r.lastName].filter(Boolean).join(" ").trim();
    result.set(r.id, name.length > 0 ? name : (r.email ?? r.id));
  }
  return result;
}
