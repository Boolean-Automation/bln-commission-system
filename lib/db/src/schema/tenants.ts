import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tenantsTable = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"),
  // Which data-source provider this company ingests from. Defaults to "airtable"
  // (the only provider today); the provider registry resolves it to a concrete
  // DataSourceProvider. Future providers (CRMs, HRIS, direct DB) reuse this seam.
  dataSourceProvider: text("data_source_provider").notNull().default("airtable"),
  // Provider-specific connection identifier. For Airtable this is the base id;
  // future providers store their own connection handle here.
  airtableBaseId: text("airtable_base_id"),
  airtableConnected: boolean("airtable_connected").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;
