---
name: Data-source provider abstraction
description: How tenants connect to external data sources (Airtable today) via a provider seam, and what is intentionally kept Airtable-named.
---

# Data-source provider abstraction

Tenants ingest people/jobs through a provider seam, not hardcoded Airtable.

- `tenants.dataSourceProvider` (text, default `"airtable"`) selects the provider; the registry resolves it to a concrete `DataSourceProvider`.
- The provider interface lives in `artifacts/api-server/src/lib/providers/` (`types.ts` contract, `airtable.ts` impl wrapping the low-level REST client, `index.ts` registry). Adding a provider = implement the interface + register it; engine/ledger/UI stay unchanged.
- Ingestion is provider-agnostic: `lib/sync.ts` `syncTenant(tenantId)` resolves the provider + connection id and delegates `fetchRecords`.

**Why some things stay Airtable-named (intentional, not missed):**
- The tenant's connection id is still stored in `tenants.airtableBaseId`; `tenants.airtableConnected` is the connect flag. `getTenantConnectionId(tenant)` is the resolver to extend when a new provider adds its own connection storage.
- `people/jobs.airtableRecordId` is the internal source-mirror key — kept to avoid a risky live-data column rename; no web impact.
- Airtable connection-discovery endpoints/operationIds (`listAirtableBases`, `getAirtableTables`, `setAirtableBase`, `syncFromAirtable`, path `/tenants/:id/sync`) are kept stable to avoid churning generated web hooks. They are Airtable-provider-specific by design; new providers add their own connection endpoints.

**Provider-neutral field keys:** schema-mapping JSONB fields use `sourceFieldId`/`sourceFieldName` (renamed from `airtableField*`). The canonical key stays provider-independent. `drizzle-kit push` does NOT migrate JSONB — existing rows need the one-off `scripts/src/migrateMappingFieldKeys.ts` (idempotent).

**API surface:** `GET /providers` returns the catalog (`{key,label,available}`); `available:false` = "coming soon" stub. `Tenant.dataSourceProvider` and `SchemaMapping.provider` are exposed in responses (the mapping's provider is resolved from the tenant, not a separate column).
