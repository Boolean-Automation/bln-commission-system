import {
  pgTable,
  uuid,
  text,
  boolean,
  doublePrecision,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const peopleTable = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    airtableRecordId: text("airtable_record_id"),
    name: text("name").notNull(),
    roles: text("roles").array().notNull().default([]),
    position: text("position"),
    ytdSales: doublePrecision("ytd_sales"),
    startDate: text("start_date"),
    active: boolean("active").notNull().default(true),
  },
  (table) => [
    // Airtable-sourced rows are unique per tenant by their record id, enabling
    // idempotent upsert on sync. Seed/manual rows leave it null (NULLs are
    // distinct in a Postgres unique index, so many may coexist).
    uniqueIndex("people_tenant_airtable_uniq").on(
      table.tenantId,
      table.airtableRecordId,
    ),
  ],
);

export const insertPersonSchema = createInsertSchema(peopleTable).omit({
  id: true,
});
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof peopleTable.$inferSelect;
