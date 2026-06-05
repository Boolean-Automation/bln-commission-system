import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, positionsTable } from "@workspace/db";
import {
  ListPositionsParams,
  ListPositionsResponse,
  CreatePositionParams,
  CreatePositionBody,
  CreatePositionResponse,
  UpdatePositionParams,
  UpdatePositionBody,
  UpdatePositionResponse,
  DeletePositionParams,
  DeletePositionResponse,
} from "@workspace/api-zod";
import { requireTenantAccess } from "../lib/rbac";
import { serializePosition } from "../lib/serialize";

const router: IRouter = Router();

router.use("/tenants/:tenantId", requireTenantAccess);

router.get("/tenants/:tenantId/positions", async (req, res): Promise<void> => {
  const params = ListPositionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(positionsTable)
    .where(eq(positionsTable.tenantId, params.data.tenantId))
    .orderBy(positionsTable.name);
  res.json(ListPositionsResponse.parse(rows.map(serializePosition)));
});

router.post("/tenants/:tenantId/positions", async (req, res): Promise<void> => {
  const params = CreatePositionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CreatePositionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const name = body.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Position name is required" });
    return;
  }

  const existing = await db
    .select()
    .from(positionsTable)
    .where(
      and(
        eq(positionsTable.tenantId, params.data.tenantId),
        eq(positionsTable.name, name),
      ),
    );
  if (existing.length > 0) {
    res.status(400).json({ error: "A position with that name already exists" });
    return;
  }

  const [created] = await db
    .insert(positionsTable)
    .values({ tenantId: params.data.tenantId, name })
    .returning();
  res.json(CreatePositionResponse.parse(serializePosition(created!)));
});

router.patch(
  "/tenants/:tenantId/positions/:positionId",
  async (req, res): Promise<void> => {
    const params = UpdatePositionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdatePositionBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const name = body.data.name.trim();
    if (!name) {
      res.status(400).json({ error: "Position name is required" });
      return;
    }

    const duplicate = await db
      .select()
      .from(positionsTable)
      .where(
        and(
          eq(positionsTable.tenantId, params.data.tenantId),
          eq(positionsTable.name, name),
        ),
      );
    if (duplicate.some((p) => p.id !== params.data.positionId)) {
      res
        .status(400)
        .json({ error: "A position with that name already exists" });
      return;
    }

    const [updated] = await db
      .update(positionsTable)
      .set({ name })
      .where(
        and(
          eq(positionsTable.id, params.data.positionId),
          eq(positionsTable.tenantId, params.data.tenantId),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Position not found" });
      return;
    }
    res.json(UpdatePositionResponse.parse(serializePosition(updated)));
  },
);

router.delete(
  "/tenants/:tenantId/positions/:positionId",
  async (req, res): Promise<void> => {
    const params = DeletePositionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [deleted] = await db
      .delete(positionsTable)
      .where(
        and(
          eq(positionsTable.id, params.data.positionId),
          eq(positionsTable.tenantId, params.data.tenantId),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Position not found" });
      return;
    }
    res.json(
      DeletePositionResponse.parse({ id: deleted.id, deleted: true }),
    );
  },
);

export default router;
