import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  tenantsTable,
  schemaMappingsTable,
  peopleTable,
  jobsTable,
  commissionPlansTable,
  ruleInstancesTable,
  commissionEntriesTable,
  commissionEventsTable,
  positionsTable,
} from "@workspace/db";
import {
  ListTenantsResponse,
  CreateTenantBody,
  CreateTenantResponse,
  GetTenantParams,
  GetTenantResponse,
  UpdateTenantParams,
  UpdateTenantBody,
  UpdateTenantResponse,
  DeleteTenantParams,
  DeleteTenantResponse,
} from "@workspace/api-zod";
import { serializeTenant, isMappingComplete } from "../lib/serialize";
import { tenantCounts } from "../lib/tenantCounts";
import { defaultEntityMappings } from "../lib/defaultSchemaMapping";

const router: IRouter = Router();

// Tenants whose slug is protected from deletion (e.g. the live launch tenant).
const PROTECTED_TENANT_SLUGS = new Set(["paragon-atlanta"]);

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

router.get("/tenants", async (_req, res): Promise<void> => {
  const tenants = await db
    .select()
    .from(tenantsTable)
    .orderBy(tenantsTable.name);
  const mappings = await db.select().from(schemaMappingsTable);
  const mappingByTenant = new Map(mappings.map((m) => [m.tenantId, m]));
  const enriched = await Promise.all(
    tenants.map(async (t) =>
      serializeTenant(
        t,
        await tenantCounts(t.id),
        isMappingComplete(mappingByTenant.get(t.id)?.entities),
      ),
    ),
  );
  res.json(ListTenantsResponse.parse(enriched));
});

router.post("/tenants", async (req, res): Promise<void> => {
  const body = CreateTenantBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const name = body.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Company name is required" });
    return;
  }

  const baseSlug = slugify(name) || "company";

  // Create the tenant and its default mapping skeleton atomically. The slug must
  // be unique, so retry with a numeric suffix on conflict.
  const tenant = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ slug: tenantsTable.slug })
      .from(tenantsTable);
    const taken = new Set(existing.map((t) => t.slug));
    let slug = baseSlug;
    let n = 2;
    while (taken.has(slug)) {
      slug = `${baseSlug}-${n++}`;
    }

    const [created] = await tx
      .insert(tenantsTable)
      .values({
        name,
        slug,
        status: "active",
        airtableBaseId: null,
        airtableConnected: false,
      })
      .returning();

    await tx.insert(schemaMappingsTable).values({
      tenantId: created!.id,
      entities: defaultEntityMappings(),
    });

    return created!;
  });

  // A freshly created tenant has the default skeleton mapping (no table chosen),
  // so required fields are not yet mapped.
  res.json(
    CreateTenantResponse.parse(
      serializeTenant(tenant, await tenantCounts(tenant.id), false),
    ),
  );
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
  const [mapping] = await db
    .select()
    .from(schemaMappingsTable)
    .where(eq(schemaMappingsTable.tenantId, tenant.id));
  res.json(
    GetTenantResponse.parse(
      serializeTenant(
        tenant,
        await tenantCounts(tenant.id),
        isMappingComplete(mapping?.entities),
      ),
    ),
  );
});

router.patch("/tenants/:tenantId", async (req, res): Promise<void> => {
  const params = UpdateTenantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateTenantBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const name = body.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Company name is required" });
    return;
  }

  // Rename only updates the display name; the slug stays stable so existing
  // references (lookups, links, the seed's idempotency key) keep working.
  const [updated] = await db
    .update(tenantsTable)
    .set({ name })
    .where(eq(tenantsTable.id, params.data.tenantId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const [mapping] = await db
    .select()
    .from(schemaMappingsTable)
    .where(eq(schemaMappingsTable.tenantId, updated.id));
  res.json(
    UpdateTenantResponse.parse(
      serializeTenant(
        updated,
        await tenantCounts(updated.id),
        isMappingComplete(mapping?.entities),
      ),
    ),
  );
});

router.delete("/tenants/:tenantId", async (req, res): Promise<void> => {
  const params = DeleteTenantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const tenantId = params.data.tenantId;

  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  if (PROTECTED_TENANT_SLUGS.has(tenant.slug)) {
    res.status(403).json({
      error: "This company is protected and cannot be deleted.",
    });
    return;
  }

  // No DB-level FK cascades exist, so remove all dependent rows explicitly in a
  // single transaction. rule_instances link to the tenant via its plans.
  await db.transaction(async (tx) => {
    const plans = await tx
      .select({ id: commissionPlansTable.id })
      .from(commissionPlansTable)
      .where(eq(commissionPlansTable.tenantId, tenantId));
    const planIds = plans.map((p) => p.id);
    if (planIds.length > 0) {
      await tx
        .delete(ruleInstancesTable)
        .where(inArray(ruleInstancesTable.planId, planIds));
    }
    await tx
      .delete(commissionEventsTable)
      .where(eq(commissionEventsTable.tenantId, tenantId));
    await tx
      .delete(commissionEntriesTable)
      .where(eq(commissionEntriesTable.tenantId, tenantId));
    await tx
      .delete(commissionPlansTable)
      .where(eq(commissionPlansTable.tenantId, tenantId));
    await tx.delete(jobsTable).where(eq(jobsTable.tenantId, tenantId));
    await tx.delete(peopleTable).where(eq(peopleTable.tenantId, tenantId));
    await tx
      .delete(schemaMappingsTable)
      .where(eq(schemaMappingsTable.tenantId, tenantId));
    await tx
      .delete(positionsTable)
      .where(eq(positionsTable.tenantId, tenantId));
    await tx.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  });

  res.json(DeleteTenantResponse.parse({ id: tenantId, deleted: true }));
});

export default router;
