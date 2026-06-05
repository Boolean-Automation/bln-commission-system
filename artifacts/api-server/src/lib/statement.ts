import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import {
  db,
  commissionEntriesTable,
  jobsTable,
  peopleTable,
  ruleInstancesTable,
  type CommissionEntryRow,
  type Job,
  type RuleInstanceRow,
} from "@workspace/db";
import { derivePeriodRange, type PeriodType } from "./manualInputs";
import {
  formatSnapshot,
  type FormulaBreakdown,
} from "./snapshotFormat";

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
  };
}
