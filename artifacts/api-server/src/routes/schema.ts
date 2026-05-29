import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, schemaMappingsTable, type EntityMapping } from "@workspace/db";
import {
  GetSchemaMappingParams,
  GetSchemaMappingResponse,
  UpdateSchemaMappingParams,
  UpdateSchemaMappingBody,
  UpdateSchemaMappingResponse,
} from "@workspace/api-zod";
import { serializeMapping } from "../lib/serialize";

const router: IRouter = Router();

router.get(
  "/tenants/:tenantId/schema-mapping",
  async (req, res): Promise<void> => {
    const params = GetSchemaMappingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [mapping] = await db
      .select()
      .from(schemaMappingsTable)
      .where(eq(schemaMappingsTable.tenantId, params.data.tenantId));
    if (!mapping) {
      res.json(
        GetSchemaMappingResponse.parse({
          tenantId: params.data.tenantId,
          entities: [],
        }),
      );
      return;
    }
    res.json(GetSchemaMappingResponse.parse(serializeMapping(mapping)));
  },
);

router.put(
  "/tenants/:tenantId/schema-mapping",
  async (req, res): Promise<void> => {
    const params = UpdateSchemaMappingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateSchemaMappingBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const entities = body.data.entities as EntityMapping[];
    const [updated] = await db
      .insert(schemaMappingsTable)
      .values({ tenantId: params.data.tenantId, entities })
      .onConflictDoUpdate({
        target: schemaMappingsTable.tenantId,
        set: { entities },
      })
      .returning();
    res.json(UpdateSchemaMappingResponse.parse(serializeMapping(updated!)));
  },
);

export default router;
