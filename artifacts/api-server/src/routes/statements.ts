import { Router, type IRouter, type Request } from "express";
import {
  GetStatementForSelfParams,
  GetStatementForSelfQueryParams,
  GetStatementForSelfResponse,
  GetStatementForPersonParams,
  GetStatementForPersonQueryParams,
  GetStatementForPersonResponse,
} from "@workspace/api-zod";
import {
  hasTenantAccess,
  requireTenantAccessOrSelfRep,
} from "../lib/rbac";
import { assembleStatement } from "../lib/statement";
import { isPeriodType, type PeriodType } from "../lib/manualInputs";

const router: IRouter = Router();

function queryString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function resolveStatementPersonId(
  req: Request,
  tenantId: string,
): string | null {
  if (req.repPersonId) return req.repPersonId;
  if (!req.authContext || !hasTenantAccess(req.authContext, tenantId)) {
    return null;
  }
  return queryString(req.query.personId) ?? null;
}

router.get(
  "/tenants/:tenantId/statements/me",
  requireTenantAccessOrSelfRep,
  async (req, res): Promise<void> => {
    const params = GetStatementForSelfParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const query = GetStatementForSelfQueryParams.safeParse(req.query);
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

    const personId = resolveStatementPersonId(req, tenantId);
    if (!personId) {
      res
        .status(400)
        .json({ error: "personId is required for staff users" });
      return;
    }

    const statement = await assembleStatement(
      tenantId,
      personId,
      periodType as PeriodType,
      periodKey,
    );
    if (!statement) {
      res.status(404).json({ error: "Statement not available" });
      return;
    }

    res.json(GetStatementForSelfResponse.parse(statement));
  },
);

router.get(
  "/tenants/:tenantId/statements/:personId",
  requireTenantAccessOrSelfRep,
  async (req, res): Promise<void> => {
    const params = GetStatementForPersonParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const query = GetStatementForPersonQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const { tenantId, personId } = params.data;
    const { periodType, periodKey } = query.data;
    if (!isPeriodType(periodType)) {
      res.status(400).json({ error: "Invalid periodType" });
      return;
    }

    const statement = await assembleStatement(
      tenantId,
      personId,
      periodType as PeriodType,
      periodKey,
    );
    if (!statement) {
      res.status(404).json({ error: "Statement not available" });
      return;
    }

    res.json(GetStatementForPersonResponse.parse(statement));
  },
);

export default router;
