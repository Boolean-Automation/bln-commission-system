import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable, schemaMappingsTable } from "@workspace/db";
import {
  ListTenantsResponse,
  CreateTenantBody,
  CreateTenantResponse,
  GetTenantParams,
  GetTenantResponse,
} from "@workspace/api-zod";
import { serializeTenant, isMappingComplete } from "../lib/serialize";
import { tenantCounts } from "../lib/tenantCounts";
import { defaultEntityMappings } from "../lib/defaultSchemaMapping";

const router: IRouter = Router();

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

export default router;
