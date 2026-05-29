import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commissionPlansTable = pgTable("commission_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  effectiveFrom: text("effective_from").notNull(),
  effectiveTo: text("effective_to"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCommissionPlanSchema = createInsertSchema(
  commissionPlansTable,
).omit({ id: true, createdAt: true });
export type InsertCommissionPlan = z.infer<typeof insertCommissionPlanSchema>;
export type CommissionPlanRow = typeof commissionPlansTable.$inferSelect;
