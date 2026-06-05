import { and, eq, sql } from "drizzle-orm";
import {
  db,
  commissionEntriesTable,
  manualInputsTable,
  peopleTable,
} from "@workspace/db";
import {
  derivePeriodRange,
  type PeriodType,
} from "./manualInputs";

export const KPI_KEYS = [
  "earnedInPeriod",
  "attainmentPct",
  "rank",
  "projectedEarning",
  "quota",
  "ote",
  "accrued",
  "payable",
  "paid",
  "deltaToQuota",
] as const;

export type KpiKey = (typeof KPI_KEYS)[number];

export const DEFAULT_REP_DASHBOARD_KPIS: KpiKey[] = [
  "earnedInPeriod",
  "attainmentPct",
  "rank",
  "projectedEarning",
];

export type LeaderboardState = "over" | "on_track" | "under" | "no_quota";

export type LeaderboardMetricRow = {
  rank: number | null;
  personId: string;
  personName: string;
  position: string | null;
  region: string | null;
  cohort: string | null;
  team: string | null;
  quota: number | null;
  ote: number | null;
  earnedInPeriod: number;
  attainmentPct: number | null;
  deltaToQuota: number | null;
  state: LeaderboardState;
};

export type PeriodRange = { effectiveFrom: string; effectiveTo: string };

export type CommissionByState = {
  accrued: number;
  payable: number;
  paid: number;
  clawedBack: number;
};

export type RepProjection = {
  projectedEarning: number;
  paceVsQuota: number | null;
  daysElapsed: number;
  daysRemaining: number;
};

const NON_TERMINAL_STATES_SQL = sql`('accrued', 'payable', 'paid', 'disputed')`;

const round2 = (n: number) => Math.round(n * 100) / 100;

function stateOf(earned: number, quota: number | null): LeaderboardState {
  if (quota == null || quota <= 0) return "no_quota";
  const pct = earned / quota;
  if (pct >= 1) return "over";
  if (pct >= 0.9) return "on_track";
  return "under";
}

function dateOnlyUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function inclusiveDays(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.floor((to.getTime() - from.getTime()) / msPerDay) + 1);
}

async function aggregateEarnedByPerson(
  tenantId: string,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const rows = (await db.execute(sql`
    SELECT person_id, COALESCE(SUM(amount), 0)::float AS earned
    FROM commission_entries
    WHERE tenant_id = ${tenantId}
      AND state IN ${NON_TERMINAL_STATES_SQL}
      AND accrued_at >= ${from}::date
      AND accrued_at < (${to}::date + INTERVAL '1 day')
    GROUP BY person_id
  `)) as unknown as { rows: Array<{ person_id: string; earned: number }> };
  const out = new Map<string, number>();
  for (const r of rows.rows) out.set(r.person_id, Number(r.earned) || 0);
  return out;
}

export function periodRangeFor(
  periodType: PeriodType,
  periodKey: string,
): PeriodRange | null {
  return derivePeriodRange(periodType, periodKey);
}

export async function computeLeaderboard(
  tenantId: string,
  periodType: PeriodType,
  periodKey: string,
): Promise<LeaderboardMetricRow[]> {
  const range = periodRangeFor(periodType, periodKey);
  if (!range) {
    throw new Error(`Invalid periodKey "${periodKey}" for ${periodType}`);
  }

  const [people, inputs, earnedByPerson] = await Promise.all([
    db
      .select()
      .from(peopleTable)
      .where(eq(peopleTable.tenantId, tenantId))
      .orderBy(peopleTable.name),
    db
      .select()
      .from(manualInputsTable)
      .where(
        and(
          eq(manualInputsTable.tenantId, tenantId),
          eq(manualInputsTable.periodType, periodType),
          eq(manualInputsTable.periodKey, periodKey),
        ),
      ),
    aggregateEarnedByPerson(tenantId, range.effectiveFrom, range.effectiveTo),
  ]);

  const inputsByPerson = new Map(inputs.map((i) => [i.personId, i]));

  const rows: LeaderboardMetricRow[] = people
    .filter((p) => p.active)
    .map((p) => {
      const input = inputsByPerson.get(p.id);
      const quota = input?.quota ?? null;
      const ote = input?.ote ?? null;
      const earned = round2(earnedByPerson.get(p.id) ?? 0);
      const state = stateOf(earned, quota);
      return {
        rank: null,
        personId: p.id,
        personName: p.name,
        position: p.position ?? null,
        region: p.region ?? null,
        cohort: p.cohort ?? null,
        team: p.team ?? null,
        quota,
        ote,
        earnedInPeriod: earned,
        attainmentPct:
          quota != null && quota > 0 ? round2((earned / quota) * 100) : null,
        deltaToQuota: quota != null ? round2(earned - quota) : null,
        state,
      };
    });

  const ranked = rows
    .filter((r) => r.state !== "no_quota")
    .sort((a, b) => (b.attainmentPct ?? 0) - (a.attainmentPct ?? 0));
  ranked.forEach((r, i) => (r.rank = i + 1));
  const unranked = rows
    .filter((r) => r.state === "no_quota")
    .sort((a, b) => b.earnedInPeriod - a.earnedInPeriod);

  return [...ranked, ...unranked];
}

export async function aggregateCommissionByStateForPerson(
  tenantId: string,
  personId: string,
  range: PeriodRange,
): Promise<CommissionByState> {
  const rows = await db
    .select({
      state: commissionEntriesTable.state,
      amount: sql<number>`COALESCE(SUM(${commissionEntriesTable.amount}), 0)::float`,
    })
    .from(commissionEntriesTable)
    .where(
      and(
        eq(commissionEntriesTable.tenantId, tenantId),
        eq(commissionEntriesTable.personId, personId),
        sql`${commissionEntriesTable.accruedAt} >= ${range.effectiveFrom}::date`,
        sql`${commissionEntriesTable.accruedAt} < (${range.effectiveTo}::date + INTERVAL '1 day')`,
      ),
    )
    .groupBy(commissionEntriesTable.state);

  const out: CommissionByState = {
    accrued: 0,
    payable: 0,
    paid: 0,
    clawedBack: 0,
  };
  for (const row of rows) {
    if (row.state === "accrued") out.accrued += Number(row.amount) || 0;
    if (row.state === "payable") out.payable += Number(row.amount) || 0;
    if (row.state === "paid") out.paid += Number(row.amount) || 0;
    if (row.state === "clawed_back") {
      out.clawedBack += Number(row.amount) || 0;
    }
  }

  return {
    accrued: round2(out.accrued),
    payable: round2(out.payable),
    paid: round2(out.paid),
    clawedBack: round2(out.clawedBack),
  };
}

export function computeProjection(
  earnedInPeriod: number,
  quota: number | null,
  range: PeriodRange,
  now = new Date(),
): RepProjection {
  const start = dateOnlyUtc(range.effectiveFrom);
  const end = dateOnlyUtc(range.effectiveTo);
  const periodLengthDays = inclusiveDays(start, end);
  const todayUtc = dateOnlyUtc(now.toISOString().slice(0, 10));

  let daysElapsed: number;
  let daysRemaining: number;
  if (todayUtc < start) {
    daysElapsed = 1;
    daysRemaining = periodLengthDays;
  } else if (todayUtc > end) {
    daysElapsed = periodLengthDays;
    daysRemaining = 0;
  } else {
    daysElapsed = inclusiveDays(start, todayUtc);
    daysRemaining = Math.max(0, periodLengthDays - daysElapsed);
  }

  const projectedEarning = round2(
    earnedInPeriod * (periodLengthDays / Math.max(1, daysElapsed)),
  );

  return {
    projectedEarning,
    paceVsQuota: quota != null ? round2(projectedEarning - quota) : null,
    daysElapsed,
    daysRemaining,
  };
}

export function normalizeKpiKeys(value: unknown): KpiKey[] | null {
  if (!Array.isArray(value)) return null;
  const allowed = new Set<string>(KPI_KEYS);
  const deduped: KpiKey[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !allowed.has(item)) return null;
    if (!deduped.includes(item as KpiKey)) deduped.push(item as KpiKey);
  }
  return deduped;
}
