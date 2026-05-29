import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  commissionPlansTable,
  ruleInstancesTable,
} from "@workspace/db";
import {
  ListRuleModulesResponse,
  GetActivePlanParams,
  GetActivePlanResponse,
  UpdateRuleInstanceParams,
  UpdateRuleInstanceBody,
  UpdateRuleInstanceResponse,
} from "@workspace/api-zod";
import { RULE_MODULES } from "../lib/ruleCatalog";
import { serializePlan, serializeRuleInstance } from "../lib/serialize";

const router: IRouter = Router();

router.get("/rule-modules", async (_req, res): Promise<void> => {
  res.json(ListRuleModulesResponse.parse(RULE_MODULES));
});

router.get("/tenants/:tenantId/plan", async (req, res): Promise<void> => {
  const params = GetActivePlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [plan] = await db
    .select()
    .from(commissionPlansTable)
    .where(eq(commissionPlansTable.tenantId, params.data.tenantId));
  if (!plan) {
    res.status(404).json({ error: "No active plan for tenant" });
    return;
  }
  const instances = await db
    .select()
    .from(ruleInstancesTable)
    .where(eq(ruleInstancesTable.planId, plan.id))
    .orderBy(ruleInstancesTable.orderIndex);
  res.json(GetActivePlanResponse.parse(serializePlan(plan, instances)));
});

router.patch(
  "/rule-instances/:ruleInstanceId",
  async (req, res): Promise<void> => {
    const params = UpdateRuleInstanceParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateRuleInstanceBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const set: Record<string, unknown> = {};
    if (body.data.params !== undefined)
      set["params"] = body.data.params as Record<string, unknown>;
    if (body.data.enabled !== undefined) set["enabled"] = body.data.enabled;
    const [updated] = await db
      .update(ruleInstancesTable)
      .set(set)
      .where(eq(ruleInstancesTable.id, params.data.ruleInstanceId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Rule instance not found" });
      return;
    }
    res.json(UpdateRuleInstanceResponse.parse(serializeRuleInstance(updated)));
  },
);

export default router;
