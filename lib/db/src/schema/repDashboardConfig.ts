import { jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const repDashboardConfigTable = pgTable("rep_dashboard_config", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenantsTable.id),
  enabledKpis: jsonb("enabled_kpis").$type<string[]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  updatedByUserId: varchar("updated_by_user_id"),
});

export const insertRepDashboardConfigSchema = createInsertSchema(
  repDashboardConfigTable,
).omit({ updatedAt: true });
export type InsertRepDashboardConfig = z.infer<
  typeof insertRepDashboardConfigSchema
>;
export type RepDashboardConfigRow =
  typeof repDashboardConfigTable.$inferSelect;
