import { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  repDashboardConfigTable,
} from "@workspace/db";
import {
  GetRepDashboardMeParams,
  GetRepDashboardMeQueryParams,
  GetRepDashboardMeResponse,
  GetRepDashboardKpiConfigParams,
  GetRepDashboardKpiConfigResponse,
  UpdateRepDashboardKpiConfigParams,
  UpdateRepDashboardKpiConfigBody,
  UpdateRepDashboardKpiConfigResponse,
} from "@workspace/api-zod";
import {
  hasTenantAccess,
  requireTenantAccess,
  requireTenantAccessOrSelfRep,
} from "../lib/rbac";
import {
  aggregateCommissionByStateForPerson,
  computeLeaderboard,
  computeProjection,
  DEFAULT_REP_DASHBOARD_KPIS,
  normalizeKpiKeys,
  periodRangeFor,
} from "../lib/repMetrics";
import { isPeriodType, type PeriodType } from "../lib/manualInputs";

const router: IRouter = Router();

function queryString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

async function readKpiConfig(tenantId: string): Promise<{
  enabledKpis: string[];
  updatedAt: string | null;
}> {
  const [row] = await db
    .select()
    .from(repDashboardConfigTable)
    .where(eq(repDashboardConfigTable.tenantId, tenantId))
    .limit(1);

  return {
    enabledKpis: row?.enabledKpis ?? DEFAULT_REP_DASHBOARD_KPIS,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

function resolveDashboardPersonId(req: Request, tenantId: string): string | null {
  if (req.repPersonId) return req.repPersonId;
  if (!req.authContext || !hasTenantAccess(req.authContext, tenantId)) return null;
  return queryString(req.query.personId) ?? null;
}

router.get(
  "/tenants/:tenantId/rep-dashboard/me",
  requireTenantAccessOrSelfRep,
  async (req, res): Promise<void> => {
    const params = GetRepDashboardMeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const query = GetRepDashboardMeQueryParams.safeParse(req.query);
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
    const range = periodRangeFor(periodType as PeriodType, periodKey);
    if (!range) {
      res
        .status(400)
        .json({ error: `Invalid periodKey "${periodKey}" for ${periodType}` });
      return;
    }

    const personId = resolveDashboardPersonId(req, tenantId);
    if (!personId) {
      res.status(400).json({ error: "personId is required for staff users" });
      return;
    }

    const [leaderboard, config] = await Promise.all([
      computeLeaderboard(tenantId, periodType as PeriodType, periodKey),
      readKpiConfig(tenantId),
    ]);
    const repRow = leaderboard.find((row) => row.personId === personId);
    if (!repRow) {
      res.status(404).json({ error: "Rep not found for this period" });
      return;
    }

    const commissionByState = await aggregateCommissionByStateForPerson(
      tenantId,
      personId,
      range,
    );
    const projection = computeProjection(
      repRow.earnedInPeriod,
      repRow.quota,
      range,
    );

    res.json(
      GetRepDashboardMeResponse.parse({
        personId: repRow.personId,
        personName: repRow.personName,
        period: { type: periodType, key: periodKey },
        commissionByState,
        quota: repRow.quota,
        ote: repRow.ote,
        earnedInPeriod: repRow.earnedInPeriod,
        attainmentPct: repRow.attainmentPct,
        deltaToQuota: repRow.deltaToQuota,
        rank: repRow.rank,
        peerCount: leaderboard.length,
        state: repRow.state,
        projection,
        enabledKpis: config.enabledKpis,
      }),
    );
  },
);

router.get(
  "/tenants/:tenantId/rep-dashboard/kpi-config",
  requireTenantAccessOrSelfRep,
  async (req, res): Promise<void> => {
    const params = GetRepDashboardKpiConfigParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const config = await readKpiConfig(params.data.tenantId);
    res.json(GetRepDashboardKpiConfigResponse.parse(config));
  },
);

router.put(
  "/tenants/:tenantId/rep-dashboard/kpi-config",
  requireTenantAccess,
  async (req, res): Promise<void> => {
    const params = UpdateRepDashboardKpiConfigParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateRepDashboardKpiConfigBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const enabledKpis = normalizeKpiKeys(body.data.enabledKpis);
    if (!enabledKpis) {
      res.status(400).json({ error: "enabledKpis contains an unknown key" });
      return;
    }

    const [row] = await db
      .insert(repDashboardConfigTable)
      .values({
        tenantId: params.data.tenantId,
        enabledKpis,
        updatedByUserId: req.authContext?.user.id ?? null,
      })
      .onConflictDoUpdate({
        target: repDashboardConfigTable.tenantId,
        set: {
          enabledKpis,
          updatedAt: new Date(),
          updatedByUserId: req.authContext?.user.id ?? null,
        },
      })
      .returning();

    res.json(
      UpdateRepDashboardKpiConfigResponse.parse({
        enabledKpis: row.enabledKpis,
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      }),
    );
  },
);

export default router;
