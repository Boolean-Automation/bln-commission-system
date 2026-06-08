import {
  boolean,
  doublePrecision,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    airtableRecordId: text("airtable_record_id"),
    projectNumber: text("project_number").notNull(),
    projectName: text("project_name"),
    jobNumber: text("job_number"),
    manager: text("manager"),
    leadManager: text("lead_manager"),
    status: text("status"),
    active: boolean("active").notNull().default(false),
    totalAmount: doublePrecision("total_amount"),
    gpAmount: doublePrecision("gp_amount"),
    gpPct: doublePrecision("gp_pct"),
    jobTotalAmount: doublePrecision("job_total_amount"),
    jobGpAmount: doublePrecision("job_gp_amount"),
    projectToJobRatio: doublePrecision("project_to_job_ratio"),
    googleReviewStars: doublePrecision("google_review_stars"),
    startDate: text("start_date"),
    endDate: text("end_date"),
  },
  (table) => [
    uniqueIndex("projects_tenant_airtable_uniq").on(
      table.tenantId,
      table.airtableRecordId,
    ),
  ],
);

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
