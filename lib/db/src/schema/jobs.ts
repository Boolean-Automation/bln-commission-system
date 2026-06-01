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

export const jobsTable = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    airtableRecordId: text("airtable_record_id"),
    jobNumber: text("job_number").notNull(),
    jobName: text("job_name"),
    customer: text("customer"),
    salesRep: text("sales_rep"),
    manager: text("manager"),
    totalAmount: doublePrecision("total_amount"),
    gpAmount: doublePrecision("gp_amount"),
    gpPct: doublePrecision("gp_pct"),
    status: text("status").notNull().default("open"),
    cancelled: boolean("cancelled").notNull().default(false),
    leadSource: text("lead_source"),
    signedDate: text("signed_date"),
    completedDate: text("completed_date"),
  },
  (table) => [
    // Airtable-sourced rows are unique per tenant by their record id, enabling
    // idempotent upsert on sync. Seed/manual rows leave it null (NULLs are
    // distinct in a Postgres unique index, so many may coexist).
    uniqueIndex("jobs_tenant_airtable_uniq").on(
      table.tenantId,
      table.airtableRecordId,
    ),
  ],
);

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
