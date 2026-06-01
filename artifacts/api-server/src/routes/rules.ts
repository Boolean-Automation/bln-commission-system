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
  CreateRuleInstanceParams,
  CreateRuleInstanceBody,
  CreateRuleInstanceResponse,
  ReorderRuleInstancesParams,
  ReorderRuleInstancesBody,
  ReorderRuleInstancesResponse,
  DeleteRuleInstanceParams,
} from "@workspace/api-zod";
import { RULE_MODULES, RULE_MODULE_BY_KEY } from "../lib/ruleCatalog";
import { serializePlan, serializeRuleInstance } from "../lib/serialize";

const router: IRouter = Router();

async function loadPlanWithInstances(planId: string) {
  const [plan] = await db
    .select()
    .from(commissionPlansTable)
    .where(eq(commissionPlansTable.id, planId));
  const instances = await db
    .select()
    .from(ruleInstancesTable)
    .where(eq(ruleInstancesTable.planId, planId))
    .orderBy(ruleInstancesTable.orderIndex);
  return { plan, instances };
}

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

router.post(
  "/tenants/:tenantId/rule-instances",
  async (req, res): Promise<void> => {
    const params = CreateRuleInstanceParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = CreateRuleInstanceBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const tenantId = params.data.tenantId;
    const moduleDef = RULE_MODULE_BY_KEY.get(body.data.ruleModuleKey);
    if (!moduleDef) {
      res.status(400).json({ error: "Unknown rule module" });
      return;
    }

    // Create-plan-if-missing + insert run in a single transaction so concurrent
    // first-rule adds for a brand-new tenant cannot create duplicate plans or
    // race on the next order index.
    const planId = await db.transaction(async (tx) => {
      let [plan] = await tx
        .select()
        .from(commissionPlansTable)
        .where(eq(commissionPlansTable.tenantId, tenantId));
      if (!plan) {
        [plan] = await tx
          .insert(commissionPlansTable)
          .values({
            tenantId,
            name: "Commission Plan",
            effectiveFrom: new Date().toISOString().slice(0, 10),
          })
          .returning();
      }

      const existing = await tx
        .select()
        .from(ruleInstancesTable)
        .where(eq(ruleInstancesTable.planId, plan!.id));
      const nextOrder = existing.reduce(
        (max, r) => Math.max(max, r.orderIndex + 1),
        0,
      );

      await tx.insert(ruleInstancesTable).values({
        planId: plan!.id,
        ruleModuleKey: moduleDef.key,
        ruleModuleName: body.data.name?.trim() || moduleDef.name,
        description: body.data.description?.trim() || moduleDef.description,
        params: (body.data.params ??
          moduleDef.defaultParams) as Record<string, unknown>,
        enabled: body.data.enabled ?? true,
        orderIndex: nextOrder,
      });
      return plan!.id;
    });

    const { plan: fresh, instances } = await loadPlanWithInstances(planId);
    res.json(CreateRuleInstanceResponse.parse(serializePlan(fresh, instances)));
  },
);

router.post(
  "/tenants/:tenantId/rule-instances/reorder",
  async (req, res): Promise<void> => {
    const params = ReorderRuleInstancesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = ReorderRuleInstancesBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
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
      .where(eq(ruleInstancesTable.planId, plan.id));
    const validIds = new Set(instances.map((r) => r.id));
    const orderedIds = body.data.orderedIds;
    const uniqueOrdered = new Set(orderedIds);
    if (
      orderedIds.length !== instances.length ||
      uniqueOrdered.size !== orderedIds.length ||
      !orderedIds.every((id) => validIds.has(id))
    ) {
      res.status(400).json({
        error:
          "orderedIds must be an exact permutation of the plan's rule instances (no duplicates, no omissions)",
      });
      return;
    }
    await db.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx
          .update(ruleInstancesTable)
          .set({ orderIndex: i })
          .where(eq(ruleInstancesTable.id, orderedIds[i]!));
      }
    });
    const { plan: fresh, instances: reordered } = await loadPlanWithInstances(
      plan.id,
    );
    res.json(
      ReorderRuleInstancesResponse.parse(serializePlan(fresh, reordered)),
    );
  },
);

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

router.delete(
  "/rule-instances/:ruleInstanceId",
  async (req, res): Promise<void> => {
    const params = DeleteRuleInstanceParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [deleted] = await db
      .delete(ruleInstancesTable)
      .where(eq(ruleInstancesTable.id, params.data.ruleInstanceId))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Rule instance not found" });
      return;
    }
    res.status(204).end();
  },
);

export default router;
