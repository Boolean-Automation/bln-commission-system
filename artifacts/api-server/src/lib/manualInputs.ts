import { and, eq } from "drizzle-orm";
import { db, manualInputsTable, peopleTable, type Person } from "@workspace/db";

export type PeriodType = "monthly" | "quarterly" | "annual";

export const PERIOD_TYPES: PeriodType[] = ["monthly", "quarterly", "annual"];

export function isPeriodType(v: unknown): v is PeriodType {
  return typeof v === "string" && (PERIOD_TYPES as string[]).includes(v);
}

const MONTHLY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const QUARTERLY_RE = /^(\d{4})-Q([1-4])$/;
const ANNUAL_RE = /^(\d{4})$/;

function lastDayOfMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Validate that a periodKey matches its periodType and derive the inclusive
 * date range it covers. Returns null when the key is malformed for the type.
 *   monthly   "YYYY-MM"  -> first..last day of that month
 *   quarterly "YYYY-Qn"  -> first..last day of that quarter
 *   annual    "YYYY"     -> Jan 1..Dec 31 of that year
 */
export function derivePeriodRange(
  periodType: PeriodType,
  periodKey: string,
): { effectiveFrom: string; effectiveTo: string } | null {
  if (periodType === "monthly") {
    const m = MONTHLY_RE.exec(periodKey);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    return {
      effectiveFrom: `${m[1]}-${pad2(month)}-01`,
      effectiveTo: `${m[1]}-${pad2(month)}-${pad2(lastDayOfMonth(year, month))}`,
    };
  }
  if (periodType === "quarterly") {
    const m = QUARTERLY_RE.exec(periodKey);
    if (!m) return null;
    const year = Number(m[1]);
    const q = Number(m[2]);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    return {
      effectiveFrom: `${m[1]}-${pad2(startMonth)}-01`,
      effectiveTo: `${m[1]}-${pad2(endMonth)}-${pad2(lastDayOfMonth(year, endMonth))}`,
    };
  }
  const m = ANNUAL_RE.exec(periodKey);
  if (!m) return null;
  return { effectiveFrom: `${m[1]}-01-01`, effectiveTo: `${m[1]}-12-31` };
}

export type ManualInputVariables = {
  personId: string;
  personName: string;
  quota: number | null;
  ote: number | null;
  acceleratorThreshold: number | null;
  acceleratorMultiplier: number | null;
};

/**
 * Resolve manual inputs into named variables keyed by person for a given
 * tenant + period. Every active person in the tenant is represented (with null
 * values when nothing is set), so downstream consumers (rep dashboard,
 * attainment, forecasting, leaderboards) get a complete, stable contract.
 */
export async function resolveManualInputVariables(
  tenantId: string,
  periodType: PeriodType,
  periodKey: string,
): Promise<ManualInputVariables[]> {
  const people: Person[] = await db
    .select()
    .from(peopleTable)
    .where(eq(peopleTable.tenantId, tenantId))
    .orderBy(peopleTable.name);

  const inputs = await db
    .select()
    .from(manualInputsTable)
    .where(
      and(
        eq(manualInputsTable.tenantId, tenantId),
        eq(manualInputsTable.periodType, periodType),
        eq(manualInputsTable.periodKey, periodKey),
      ),
    );
  const byPerson = new Map(inputs.map((i) => [i.personId, i]));

  return people.map((p) => {
    const i = byPerson.get(p.id);
    return {
      personId: p.id,
      personName: p.name,
      quota: i?.quota ?? null,
      ote: i?.ote ?? null,
      acceleratorThreshold: i?.acceleratorThreshold ?? null,
      acceleratorMultiplier: i?.acceleratorMultiplier ?? null,
    };
  });
}
