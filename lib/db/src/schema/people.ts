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
    email: text("email"),
    company: text("company"),
    ytdSales: doublePrecision("ytd_sales"),
    startDate: text("start_date"),
    active: boolean("active").notNull().default(true),
    // Reference-only commission figures pulled from the tenant's data source
    // (e.g. Airtable's People table) for the correctness benchmark in the
    // Reconciliation view. These are NEVER consumed by the engine, ledger,
    // dashboard, or payroll — they exist solely to compare our computed totals
    // against the trusted source numbers. All nullable: a tenant that does not
    // map them simply has no benchmark.
    benchmarkCommissionOwed: doublePrecision("benchmark_commission_owed"),
    benchmarkTotalEarned: doublePrecision("benchmark_total_earned"),
    benchmarkTotalPaid: doublePrecision("benchmark_total_paid"),
    benchmarkTotalAdjustments: doublePrecision("benchmark_total_adjustments"),
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
