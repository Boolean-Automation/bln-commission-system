import { Router, type IRouter } from "express";
import { eq, count } from "drizzle-orm";
import {
  db,
  tenantsTable,
  peopleTable,
  jobsTable,
  commissionEntriesTable,
} from "@workspace/db";
import {
  ListTenantsResponse,
  GetTenantParams,
  GetTenantResponse,
} from "@workspace/api-zod";
import { serializeTenant } from "../lib/serialize";

const router: IRouter = Router();

async function tenantCounts(tenantId: string) {
  const [[p], [j], [e]] = await Promise.all([
    db
      .select({ c: count() })
      .from(peopleTable)
      .where(eq(peopleTable.tenantId, tenantId)),
    db
      .select({ c: count() })
      .from(jobsTable)
      .where(eq(jobsTable.tenantId, tenantId)),
    db
      .select({ c: count() })
      .from(commissionEntriesTable)
      .where(eq(commissionEntriesTable.tenantId, tenantId)),
  ]);
  return {
    peopleCount: p?.c ?? 0,
    jobsCount: j?.c ?? 0,
    entryCount: e?.c ?? 0,
  };
}

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
