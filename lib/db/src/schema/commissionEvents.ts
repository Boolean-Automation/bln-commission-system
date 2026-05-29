import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commissionEventsTable = pgTable("commission_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryId: uuid("entry_id").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  eventKind: text("event_kind").notNull(),
  before: jsonb("before").$type<Record<string, unknown> | null>(),
  after: jsonb("after").$type<Record<string, unknown> | null>(),
  actor: text("actor").notNull().default("system"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCommissionEventSchema = createInsertSchema(
  commissionEventsTable,
).omit({ id: true, at: true });
export type InsertCommissionEvent = z.infer<
  typeof insertCommissionEventSchema
>;
export type CommissionEventRow = typeof commissionEventsTable.$inferSelect;
