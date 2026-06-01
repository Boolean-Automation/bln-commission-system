import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable, schemaMappingsTable } from "@workspace/db";
import {
  ListAirtableBasesResponse,
  GetAirtableTablesParams,
  GetAirtableTablesResponse,
  SetAirtableBaseParams,
  SetAirtableBaseBody,
  SetAirtableBaseResponse,
  SyncFromAirtableParams,
  SyncFromAirtableResponse,
} from "@workspace/api-zod";
import { listBases, getBaseTables } from "../lib/airtable";
import { syncTenantFromAirtable } from "../lib/airtableSync";
import { serializeTenant, isMappingComplete } from "../lib/serialize";
import { tenantCounts } from "../lib/tenantCounts";

const router: IRouter = Router();

router.get("/airtable/bases", async (req, res): Promise<void> => {
  try {
    const bases = await listBases();
    res.json(ListAirtableBasesResponse.parse(bases));
  } catch (err) {
    req.log.error({ err }, "Failed to list Airtable bases");
    res.status(502).json({
      error: "Could not reach Airtable. Is the connection authorized?",
    });
  }
});

router.get(
  "/airtable/bases/:baseId/tables",
  async (req, res): Promise<void> => {
    const params = GetAirtableTablesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    try {
      const tables = await getBaseTables(params.data.baseId);
      res.json(GetAirtableTablesResponse.parse(tables));
    } catch (err) {
      req.log.error({ err }, "Failed to load Airtable tables");
      res.status(502).json({ error: "Could not load tables from Airtable." });
    }
  },
);

router.put(
  "/tenants/:tenantId/airtable-base",
  async (req, res): Promise<void> => {
    const params = SetAirtableBaseParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = SetAirtableBaseBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [updated] = await db
      .update(tenantsTable)
      .set({ airtableBaseId: body.data.baseId })
      .where(eq(tenantsTable.id, params.data.tenantId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }
    const counts = await tenantCounts(updated.id);
    const [mapping] = await db
      .select()
      .from(schemaMappingsTable)
      .where(eq(schemaMappingsTable.tenantId, updated.id));
    res.json(
      SetAirtableBaseResponse.parse(
        serializeTenant(updated, counts, isMappingComplete(mapping?.entities)),
      ),
    );
  },
);

router.post("/tenants/:tenantId/sync", async (req, res): Promise<void> => {
  const params = SyncFromAirtableParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const result = await syncTenantFromAirtable(params.data.tenantId);
    const ranAt = new Date().toISOString();
    res.json(
      SyncFromAirtableResponse.parse({
        tenantId: params.data.tenantId,
        peopleUpserted: result.peopleUpserted,
        peopleRemoved: result.peopleRemoved,
        jobsUpserted: result.jobsUpserted,
        jobsRemoved: result.jobsRemoved,
        recompute: {
          tenantId: params.data.tenantId,
          ...result.recompute,
          ranAt,
        },
        ranAt,
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Airtable sync failed");
    res.status(400).json({
      error: err instanceof Error ? err.message : "Sync failed",
    });
  }
});

export default router;
