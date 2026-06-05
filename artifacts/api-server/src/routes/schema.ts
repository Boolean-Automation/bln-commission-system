import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  schemaMappingsTable,
  tenantsTable,
  type EntityMapping,
} from "@workspace/db";
import {
  GetSchemaMappingParams,
  GetSchemaMappingResponse,
  UpdateSchemaMappingParams,
  UpdateSchemaMappingBody,
  UpdateSchemaMappingResponse,
} from "@workspace/api-zod";
import { requireTenantAccess } from "../lib/rbac";
import { serializeMapping } from "../lib/serialize";
import { DEFAULT_PROVIDER_KEY } from "../lib/providers";

const router: IRouter = Router();

router.use("/tenants/:tenantId", requireTenantAccess);

async function tenantProviderKey(tenantId: string): Promise<string> {
  const [tenant] = await db
    .select({ dataSourceProvider: tenantsTable.dataSourceProvider })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  return tenant?.dataSourceProvider || DEFAULT_PROVIDER_KEY;
}

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
    const provider = await tenantProviderKey(params.data.tenantId);
    if (!mapping) {
      res.json(
        GetSchemaMappingResponse.parse({
          tenantId: params.data.tenantId,
          provider,
          entities: [],
        }),
      );
      return;
    }
    res.json(GetSchemaMappingResponse.parse(serializeMapping(mapping, provider)));
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
    const provider = await tenantProviderKey(params.data.tenantId);
    res.json(
      UpdateSchemaMappingResponse.parse(serializeMapping(updated!, provider)),
    );
  },
);

export default router;
