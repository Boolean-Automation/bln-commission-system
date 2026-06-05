import { Router, type IRouter } from "express";
import { and, eq, desc, ilike, or } from "drizzle-orm";
import {
  db,
  commissionEntriesTable,
  commissionEventsTable,
} from "@workspace/db";
import {
  ListCommissionsParams,
  ListCommissionsQueryParams,
  ListCommissionsResponse,
  GetCommissionParams,
  GetCommissionResponse,
  AdjustCommissionParams,
  AdjustCommissionBody,
  AdjustCommissionResponse,
  TransitionCommissionParams,
  TransitionCommissionBody,
  TransitionCommissionResponse,
  GetCommissionEventsParams,
  GetCommissionEventsResponse,
  RecomputeCommissionsParams,
  RecomputeCommissionsResponse,
} from "@workspace/api-zod";
import { serializeEntry, serializeEvent } from "../lib/serialize";
import { recomputeTenant } from "../lib/engine";
import { requireTenantAccess, hasTenantAccess } from "../lib/rbac";

const router: IRouter = Router();

router.use("/tenants/:tenantId", requireTenantAccess);

const STATE_TIMESTAMP: Record<string, "accruedAt" | "payableAt" | "paidAt" | "clawedBackAt" | null> = {
  accrued: "accruedAt",
  payable: "payableAt",
  paid: "paidAt",
  clawed_back: "clawedBackAt",
  voided: null,
  disputed: null,
};

router.post(
  "/tenants/:tenantId/recompute",
  async (req, res): Promise<void> => {
    const params = RecomputeCommissionsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const result = await recomputeTenant(params.data.tenantId);
    res.json(
      RecomputeCommissionsResponse.parse({
        tenantId: params.data.tenantId,
        ...result,
        ranAt: new Date().toISOString(),
      }),
    );
  },
);

router.get(
  "/tenants/:tenantId/commissions",
  async (req, res): Promise<void> => {
    const params = ListCommissionsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const query = ListCommissionsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const conditions = [
      eq(commissionEntriesTable.tenantId, params.data.tenantId),
    ];
    if (query.data.state)
      conditions.push(eq(commissionEntriesTable.state, query.data.state));
    if (query.data.type)
      conditions.push(eq(commissionEntriesTable.type, query.data.type));
    if (query.data.personId)
      conditions.push(eq(commissionEntriesTable.personId, query.data.personId));
    if (query.data.search) {
      const term = `%${query.data.search}%`;
      const match = or(
        ilike(commissionEntriesTable.personName, term),
        ilike(commissionEntriesTable.sourceLabel, term),
      );
      if (match) conditions.push(match);
    }
    const entries = await db
      .select()
      .from(commissionEntriesTable)
      .where(and(...conditions))
      .orderBy(desc(commissionEntriesTable.createdAt));
    res.json(ListCommissionsResponse.parse(entries.map(serializeEntry)));
  },
);

router.get("/commissions/:entryId", async (req, res): Promise<void> => {
  const params = GetCommissionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [entry] = await db
    .select()
    .from(commissionEntriesTable)
    .where(eq(commissionEntriesTable.id, params.data.entryId));
  if (!entry) {
    res.status(404).json({ error: "Commission entry not found" });
    return;
  }
  if (!hasTenantAccess(req.authContext!, entry.tenantId)) {
    res.status(403).json({ error: "You do not have access to this company" });
    return;
  }
  res.json(GetCommissionResponse.parse(serializeEntry(entry)));
});

router.patch("/commissions/:entryId", async (req, res): Promise<void> => {
  const params = AdjustCommissionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = AdjustCommissionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [entry] = await db
    .select()
    .from(commissionEntriesTable)
    .where(eq(commissionEntriesTable.id, params.data.entryId));
  if (!entry) {
    res.status(404).json({ error: "Commission entry not found" });
    return;
  }
  if (!hasTenantAccess(req.authContext!, entry.tenantId)) {
    res.status(403).json({ error: "You do not have access to this company" });
    return;
  }
  const set: Record<string, unknown> = {};
  if (body.data.amount !== undefined) set["amount"] = body.data.amount;
  if (body.data.notes !== undefined) set["notes"] = body.data.notes;
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(commissionEntriesTable)
      .set(set)
      .where(eq(commissionEntriesTable.id, params.data.entryId))
      .returning();
    await tx.insert(commissionEventsTable).values({
      entryId: entry.id,
      tenantId: entry.tenantId,
      eventKind: "manually_adjusted",
      before: { amount: entry.amount, notes: entry.notes },
      after: { amount: row!.amount, notes: row!.notes },
      actor: "operator",
    });
    return row!;
  });
  res.json(AdjustCommissionResponse.parse(serializeEntry(updated)));
});

router.post(
  "/commissions/:entryId/transition",
  async (req, res): Promise<void> => {
    const params = TransitionCommissionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = TransitionCommissionBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [entry] = await db
      .select()
      .from(commissionEntriesTable)
      .where(eq(commissionEntriesTable.id, params.data.entryId));
    if (!entry) {
      res.status(404).json({ error: "Commission entry not found" });
      return;
    }
    if (!hasTenantAccess(req.authContext!, entry.tenantId)) {
      res.status(403).json({ error: "You do not have access to this company" });
      return;
    }
    const toState = body.data.toState;
    if (toState === entry.state) {
      res
        .status(400)
        .json({ error: `Entry is already in state "${toState}"` });
      return;
    }
    const set: Record<string, unknown> = { state: toState };
    const tsField = STATE_TIMESTAMP[toState];
    if (tsField) set[tsField] = new Date();
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(commissionEntriesTable)
        .set(set)
        .where(eq(commissionEntriesTable.id, params.data.entryId))
        .returning();
      await tx.insert(commissionEventsTable).values({
        entryId: entry.id,
        tenantId: entry.tenantId,
        eventKind: toState === "clawed_back" ? "clawed_back" : "state_change",
        before: { state: entry.state },
        after: { state: toState, notes: body.data.notes ?? null },
        actor: "operator",
      });
      return row!;
    });
    res.json(TransitionCommissionResponse.parse(serializeEntry(updated)));
  },
);

router.get("/commissions/:entryId/events", async (req, res): Promise<void> => {
  const params = GetCommissionEventsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [entry] = await db
    .select({ tenantId: commissionEntriesTable.tenantId })
    .from(commissionEntriesTable)
    .where(eq(commissionEntriesTable.id, params.data.entryId));
  if (!entry) {
    res.status(404).json({ error: "Commission entry not found" });
    return;
  }
  if (!hasTenantAccess(req.authContext!, entry.tenantId)) {
    res.status(403).json({ error: "You do not have access to this company" });
    return;
  }
  const events = await db
    .select()
    .from(commissionEventsTable)
    .where(eq(commissionEventsTable.entryId, params.data.entryId))
    .orderBy(desc(commissionEventsTable.at));
  res.json(GetCommissionEventsResponse.parse(events.map(serializeEvent)));
});

export default router;
