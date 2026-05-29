import {
  pgTable,
  uuid,
  text,
  boolean,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jobsTable = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  airtableRecordId: text("airtable_record_id"),
  jobNumber: text("job_number").notNull(),
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
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
