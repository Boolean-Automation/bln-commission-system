import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ruleInstancesTable = pgTable("rule_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  planId: uuid("plan_id").notNull(),
  ruleModuleKey: text("rule_module_key").notNull(),
  ruleModuleName: text("rule_module_name").notNull(),
  description: text("description").notNull().default(""),
  params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
  appliesTo: jsonb("applies_to")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  enabled: boolean("enabled").notNull().default(true),
  orderIndex: integer("order_index").notNull().default(0),
});

export const insertRuleInstanceSchema = createInsertSchema(
  ruleInstancesTable,
).omit({ id: true });
export type InsertRuleInstance = z.infer<typeof insertRuleInstanceSchema>;
export type RuleInstanceRow = typeof ruleInstancesTable.$inferSelect;
