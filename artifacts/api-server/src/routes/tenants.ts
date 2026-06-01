import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import {
  ListTenantsResponse,
  GetTenantParams,
  GetTenantResponse,
} from "@workspace/api-zod";
import { serializeTenant } from "../lib/serialize";
import { tenantCounts } from "../lib/tenantCounts";

const router: IRouter = Router();

router.get("/tenants", async (_req, res): Promise<void> => {
  const tenants = await db
    .select()
    .from(tenantsTable)
    .orderBy(tenantsTable.name);
  const enriched = await Promise.all(
    tenants.map(async (t) => serializeTenant(t, await tenantCounts(t.id))),
  );
  res.json(ListTenantsResponse.parse(enriched));
});

router.get("/tenants/:tenantId", async (req, res): Promise<void> => {
  const params = GetTenantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, params.data.tenantId));
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  res.json(
    GetTenantResponse.parse(
      serializeTenant(tenant, await tenantCounts(tenant.id)),
    ),
  );
});

export default router;
