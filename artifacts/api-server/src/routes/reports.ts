import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  peopleTable,
  manualInputsTable,
  commissionEntriesTable,
  type Person,
} from "@workspace/db";
import {
  GetLeaderboardParams,
  GetLeaderboardQueryParams,
  GetLeaderboardResponse,
  GetBreakdownParams,
  GetBreakdownQueryParams,
  GetBreakdownResponse,
  GetSpendParams,
  GetSpendQueryParams,
  GetSpendResponse,
  RunCustomReportParams,
  RunCustomReportBody,
  RunCustomReportResponse,
} from "@workspace/api-zod";
import { requireTenantAccess } from "../lib/rbac";
import {
  derivePeriodRange,
  isPeriodType,
  type PeriodType,
} from "../lib/manualInputs";
import { computeLeaderboard } from "../lib/repMetrics";

const router: IRouter = Router();

router.use("/tenants/:tenantId", requireTenantAccess);

const round2 = (n: number) => Math.round(n * 100) / 100;
const UNASSIGNED = "Unassigned";

const NON_TERMINAL_STATES_SQL = sql`('accrued', 'payable', 'paid', 'disputed')`;

/**
 * Sum commission entry amounts per person within an accrual-date window.
 * Pushes the SUM into Postgres so a tenant with hundreds of thousands of
 * entries doesn't have to stream into the API process.
 */
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

router.get(
  "/tenants/:tenantId/reports/leaderboard",
  async (req: Request, res: Response): Promise<void> => {
    const params = GetLeaderboardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const query = GetLeaderboardQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const { tenantId } = params.data;
    const { periodType, periodKey } = query.data;
    if (!isPeriodType(periodType)) {
      res.status(400).json({ error: "Invalid periodType" });
      return;
    }
    const range = derivePeriodRange(periodType as PeriodType, periodKey);
    if (!range) {
      res
        .status(400)
        .json({ error: `Invalid periodKey "${periodKey}" for ${periodType}` });
      return;
    }

    const rows = await computeLeaderboard(
      tenantId,
      periodType as PeriodType,
      periodKey,
    );

    res.json(GetLeaderboardResponse.parse(rows));
  },
);

function dimensionColumnOf(
  dimension: string,
): keyof Pick<Person, "region" | "cohort" | "team" | "position"> | null {
  switch (dimension) {
    case "region":
    case "cohort":
    case "team":
    case "position":
      return dimension;
    default:
      return null;
  }
}

router.get(
  "/tenants/:tenantId/reports/breakdown",
  async (req: Request, res: Response): Promise<void> => {
    const params = GetBreakdownParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const query = GetBreakdownQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const { tenantId } = params.data;
    const { dimension, periodType, periodKey } = query.data;
    const dimCol = dimensionColumnOf(dimension);
    if (!dimCol) {
      res.status(400).json({ error: `Invalid dimension "${dimension}"` });
      return;
    }
    if (!isPeriodType(periodType)) {
      res.status(400).json({ error: "Invalid periodType" });
      return;
    }
    const range = derivePeriodRange(periodType as PeriodType, periodKey);
    if (!range) {
      res
        .status(400)
        .json({ error: `Invalid periodKey "${periodKey}" for ${periodType}` });
      return;
    }

    const [people, inputs, earnedByPerson] = await Promise.all([
      db
        .select()
        .from(peopleTable)
        .where(eq(peopleTable.tenantId, tenantId)),
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

    const quotaByPerson = new Map(inputs.map((i) => [i.personId, i.quota ?? 0]));

    type Bucket = {
      bucket: string;
      personCount: number;
      quotaTotal: number;
      earnedTotal: number;
    };
    const buckets = new Map<string, Bucket>();
    for (const p of people) {
      if (!p.active) continue;
      const key = (p[dimCol] as string | null) ?? UNASSIGNED;
      const b = buckets.get(key) ?? {
        bucket: key,
        personCount: 0,
        quotaTotal: 0,
        earnedTotal: 0,
      };
      b.personCount += 1;
      b.quotaTotal += quotaByPerson.get(p.id) ?? 0;
      b.earnedTotal += earnedByPerson.get(p.id) ?? 0;
      buckets.set(key, b);
    }

    const rows = [...buckets.values()]
      .map((b) => ({
        bucket: b.bucket,
        personCount: b.personCount,
        quotaTotal: round2(b.quotaTotal),
        earnedTotal: round2(b.earnedTotal),
        attainmentPct:
          b.quotaTotal > 0 ? round2((b.earnedTotal / b.quotaTotal) * 100) : null,
      }))
      .sort((a, b) => b.earnedTotal - a.earnedTotal);

    res.json(GetBreakdownResponse.parse(rows));
  },
);

/**
 * Map an entry to its "spend date" — when the dollar will hit cash.
 * Prefer paidAt (cash-out) → payableAt (obligated) → accruedAt (earned).
 */
const SPEND_DATE_SQL = sql`COALESCE(paid_at, payable_at, accrued_at)`;

function periodBucketSqlFor(periodType: PeriodType | null) {
  if (periodType === "monthly") return sql`to_char(${SPEND_DATE_SQL}, 'YYYY-MM')`;
  if (periodType === "quarterly")
    return sql`to_char(${SPEND_DATE_SQL}, 'YYYY-"Q"Q')`;
  if (periodType === "annual") return sql`to_char(${SPEND_DATE_SQL}, 'YYYY')`;
  // Default monthly when no periodType supplied.
  return sql`to_char(${SPEND_DATE_SQL}, 'YYYY-MM')`;
}

router.get(
  "/tenants/:tenantId/reports/spend",
  async (req: Request, res: Response): Promise<void> => {
    const params = GetSpendParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const query = GetSpendQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const { tenantId } = params.data;
    const { groupBy, periodType, from, to } = query.data;

    const validGroupBy = ["period", "team", "person"] as const;
    if (!(validGroupBy as readonly string[]).includes(groupBy)) {
      res.status(400).json({ error: `Invalid groupBy "${groupBy}"` });
      return;
    }
    if (periodType != null && !isPeriodType(periodType)) {
      res.status(400).json({ error: "Invalid periodType" });
      return;
    }

    let bucketSql;
    if (groupBy === "period") {
      bucketSql = periodBucketSqlFor((periodType as PeriodType) ?? null);
    } else if (groupBy === "team") {
      // Left-join people for the team label; fall back to "Unassigned".
      bucketSql = sql`COALESCE(p.team, ${UNASSIGNED})`;
    } else {
      bucketSql = sql`COALESCE(p.name, e.person_name)`;
    }

    const fromClause =
      groupBy === "period"
        ? sql`FROM commission_entries e`
        : sql`FROM commission_entries e LEFT JOIN people p ON p.id = e.person_id`;

    const fromDateFilter = from
      ? sql`AND ${SPEND_DATE_SQL} >= ${from}::date`
      : sql``;
    const toDateFilter = to
      ? sql`AND ${SPEND_DATE_SQL} < (${to}::date + INTERVAL '1 day')`
      : sql``;

    const result = (await db.execute(sql`
      SELECT
        ${bucketSql} AS bucket,
        COALESCE(SUM(amount) FILTER (WHERE e.state = 'accrued'), 0)::float AS accrued_amount,
        COALESCE(SUM(amount) FILTER (WHERE e.state = 'payable'), 0)::float AS payable_amount,
        COALESCE(SUM(amount) FILTER (WHERE e.state = 'paid'), 0)::float AS paid_amount,
        COALESCE(SUM(amount) FILTER (WHERE e.state = 'clawed_back'), 0)::float AS clawed_back_amount,
        COALESCE(SUM(amount) FILTER (WHERE e.state IN ('accrued','payable','paid')), 0)::float AS total_liability
      ${fromClause}
      WHERE e.tenant_id = ${tenantId}
        AND ${SPEND_DATE_SQL} IS NOT NULL
        ${fromDateFilter}
        ${toDateFilter}
      GROUP BY bucket
      ORDER BY bucket
    `)) as unknown as {
      rows: Array<{
        bucket: string;
        accrued_amount: number;
        payable_amount: number;
        paid_amount: number;
        clawed_back_amount: number;
        total_liability: number;
      }>;
    };

    const rows = result.rows.map((r) => ({
      bucket: r.bucket,
      accruedAmount: round2(Number(r.accrued_amount) || 0),
      payableAmount: round2(Number(r.payable_amount) || 0),
      paidAmount: round2(Number(r.paid_amount) || 0),
      clawedBackAmount: round2(Number(r.clawed_back_amount) || 0),
      totalLiability: round2(Number(r.total_liability) || 0),
    }));

    res.json(GetSpendResponse.parse(rows));
  },
);

// Custom report — picks dimensions + metrics from a fixed allowlist (enforced
// via the openapi enum) and runs a Postgres GROUP BY. Hard-capped at 5,000
// rows; callers receive `truncated: true` when the cap is hit.
//
// Access control: the router-level requireTenantAccess already excludes reps
// (only platform operators or admin-of-this-tenant pass). That matches the spec
// "operator/admin-only" — no further guard is needed.
const ROW_CAP = 5000;

type Dimension =
  | "person"
  | "region"
  | "cohort"
  | "team"
  | "position"
  | "period"
  | "entryType"
  | "state";

type Metric =
  | "commissionTotal"
  | "entryCount"
  | "quotaAttainmentPct"
  | "paidAmount"
  | "accruedAmount"
  | "payableAmount"
  | "clawedBackAmount"
  | "spendAmount";

const DIMENSION_LABELS: Record<Dimension, string> = {
  person: "Person",
  region: "Region",
  cohort: "Cohort",
  team: "Team",
  position: "Position",
  period: "Period",
  entryType: "Entry Type",
  state: "State",
};

const METRIC_LABELS: Record<Metric, string> = {
  commissionTotal: "Commission Total",
  entryCount: "Entry Count",
  quotaAttainmentPct: "Attainment %",
  paidAmount: "Paid",
  accruedAmount: "Accrued",
  payableAmount: "Payable",
  clawedBackAmount: "Clawed Back",
  spendAmount: "Spend",
};

function dimensionSelectSql(d: Dimension, periodType: PeriodType | null) {
  switch (d) {
    case "person":
      return sql`COALESCE(p.name, e.person_name)`;
    case "region":
      return sql`COALESCE(p.region, ${UNASSIGNED})`;
    case "cohort":
      return sql`COALESCE(p.cohort, ${UNASSIGNED})`;
    case "team":
      return sql`COALESCE(p.team, ${UNASSIGNED})`;
    case "position":
      return sql`COALESCE(p.position, e.position_at_costed, ${UNASSIGNED})`;
    case "period":
      return periodBucketSqlFor(periodType);
    case "entryType":
      return sql`e.type`;
    case "state":
      return sql`e.state`;
  }
}

function metricExpressionSql(m: Metric) {
  switch (m) {
    case "commissionTotal":
      return sql`COALESCE(SUM(e.amount) FILTER (WHERE e.state IN ('accrued','payable','paid')), 0)::float`;
    case "entryCount":
      return sql`COUNT(*)::int`;
    case "paidAmount":
      return sql`COALESCE(SUM(e.amount) FILTER (WHERE e.state = 'paid'), 0)::float`;
    case "accruedAmount":
      return sql`COALESCE(SUM(e.amount) FILTER (WHERE e.state = 'accrued'), 0)::float`;
    case "payableAmount":
      return sql`COALESCE(SUM(e.amount) FILTER (WHERE e.state = 'payable'), 0)::float`;
    case "clawedBackAmount":
      return sql`COALESCE(SUM(e.amount) FILTER (WHERE e.state = 'clawed_back'), 0)::float`;
    case "spendAmount":
      return sql`COALESCE(SUM(e.amount) FILTER (WHERE e.state IN ('payable','paid')) - SUM(e.amount) FILTER (WHERE e.state = 'clawed_back'), 0)::float`;
    case "quotaAttainmentPct":
      // Computed below from earned + quota sums; placeholder column here.
      return sql`COALESCE(SUM(e.amount) FILTER (WHERE e.state IN ('accrued','payable','paid')), 0)::float`;
  }
}

router.post(
  "/tenants/:tenantId/reports/custom",
  async (req: Request, res: Response): Promise<void> => {
    const params = RunCustomReportParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = RunCustomReportBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const { tenantId } = params.data;
    const dimensions = body.data.dimensions as Dimension[];
    const metrics = body.data.metrics as Metric[];

    if (dimensions.length === 0) {
      res
        .status(400)
        .json({ error: "At least one dimension is required" });
      return;
    }
    if (metrics.length === 0) {
      res.status(400).json({ error: "At least one metric is required" });
      return;
    }

    const periodType = (body.data.periodType ?? null) as PeriodType | null;
    const periodKey = body.data.periodKey ?? null;
    const from = body.data.from ?? null;
    const to = body.data.to ?? null;

    if (dimensions.includes("period") && !periodType) {
      res
        .status(400)
        .json({ error: "periodType is required when 'period' is a dimension" });
      return;
    }
    if (metrics.includes("quotaAttainmentPct") && (!periodType || !periodKey)) {
      res.status(400).json({
        error:
          "periodType and periodKey are required when 'quotaAttainmentPct' is a metric",
      });
      return;
    }

    // Build SELECT clauses: one column per dimension, one per metric.
    const selectParts: ReturnType<typeof sql>[] = [];
    dimensions.forEach((d, i) => {
      selectParts.push(sql`${dimensionSelectSql(d, periodType)} AS d${sql.raw(String(i))}`);
    });
    metrics.forEach((m, i) => {
      selectParts.push(sql`${metricExpressionSql(m)} AS m${sql.raw(String(i))}`);
    });

    const selectClause = sql.join(selectParts, sql`, `);
    const groupByCols = sql.join(
      dimensions.map((_, i) => sql`d${sql.raw(String(i))}`),
      sql`, `,
    );

    const fromDateFilter = from
      ? sql`AND e.accrued_at >= ${from}::date`
      : sql``;
    const toDateFilter = to
      ? sql`AND e.accrued_at < (${to}::date + INTERVAL '1 day')`
      : sql``;

    const result = (await db.execute(sql`
      SELECT ${selectClause}
      FROM commission_entries e
      LEFT JOIN people p ON p.id = e.person_id
      WHERE e.tenant_id = ${tenantId}
        ${fromDateFilter}
        ${toDateFilter}
      GROUP BY ${groupByCols}
      ORDER BY ${groupByCols}
      LIMIT ${ROW_CAP + 1}
    `)) as unknown as { rows: Array<Record<string, unknown>> };

    const truncated = result.rows.length > ROW_CAP;
    const rawRows = truncated ? result.rows.slice(0, ROW_CAP) : result.rows;

    // For quotaAttainmentPct we need a parallel quota lookup keyed by person.
    // Cheaper than a second SQL join because attainment is only meaningful when
    // grouped at person granularity; otherwise we leave it null.
    let quotaByPerson: Map<string, number> | null = null;
    if (metrics.includes("quotaAttainmentPct") && periodType && periodKey) {
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
      const peopleRows = await db
        .select()
        .from(peopleTable)
        .where(eq(peopleTable.tenantId, tenantId));
      const idByName = new Map(peopleRows.map((p) => [p.name, p.id]));
      const quotaByPersonId = new Map(
        inputs.map((i) => [i.personId, i.quota ?? 0]),
      );
      quotaByPerson = new Map();
      for (const [name, id] of idByName.entries()) {
        const q = quotaByPersonId.get(id);
        if (q != null) quotaByPerson.set(name, q);
      }
    }

    const columns = [
      ...dimensions.map((d) => ({
        key: d,
        label: DIMENSION_LABELS[d],
        kind: "dimension" as const,
      })),
      ...metrics.map((m) => ({
        key: m,
        label: METRIC_LABELS[m],
        kind: "metric" as const,
      })),
    ];

    const personDimIdx = dimensions.indexOf("person");
    const rows = rawRows.map((row) => {
      const out: Record<string, string | number | null> = {};
      dimensions.forEach((d, i) => {
        const v = row[`d${i}`];
        out[d] = v == null ? null : String(v);
      });
      metrics.forEach((m, i) => {
        const v = row[`m${i}`];
        if (m === "quotaAttainmentPct") {
          if (personDimIdx === -1 || quotaByPerson == null) {
            out[m] = null;
            return;
          }
          const personName = String(row[`d${personDimIdx}`] ?? "");
          const quota = quotaByPerson.get(personName);
          if (!quota || quota <= 0) {
            out[m] = null;
          } else {
            const earned = Number(v) || 0;
            out[m] = round2((earned / quota) * 100);
          }
          return;
        }
        out[m] = v == null ? null : round2(Number(v));
      });
      return out;
    });

    res.json(
      RunCustomReportResponse.parse({
        columns,
        rows,
        truncated,
        rowCount: rows.length,
      }),
    );
  },
);

export default router;
