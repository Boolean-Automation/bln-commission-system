import {
  pgTable,
  uuid,
  text,
  doublePrecision,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commissionEntriesTable = pgTable(
  "commission_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    personId: uuid("person_id").notNull(),
    personName: text("person_name").notNull(),
    type: text("type").notNull(),
    sourceKind: text("source_kind").notNull().default("job"),
    sourceId: text("source_id"),
    sourceLabel: text("source_label"),
    dedupeKey: text("dedupe_key"),
    amount: doublePrecision("amount").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    state: text("state").notNull().default("accrued"),
    positionAtCosted: text("position_at_costed"),
    ruleInstanceIds: text("rule_instance_ids").array().notNull().default([]),
    computationSnapshot: jsonb("computation_snapshot").$type<Record<
      string,
      unknown
    > | null>(),
    notes: text("notes"),
    accruedAt: timestamp("accrued_at", { withTimezone: true }),
    payableAt: timestamp("payable_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    clawedBackAt: timestamp("clawed_back_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Rule-derived entries are unique per tenant by their dedupeKey; manual
    // entries leave dedupeKey null (Postgres allows many NULLs in a unique idx).
    uniqueIndex("commission_entries_tenant_dedupe_uniq").on(
      table.tenantId,
      table.dedupeKey,
    ),
  ],
);

export const insertCommissionEntrySchema = createInsertSchema(
  commissionEntriesTable,
).omit({ id: true, createdAt: true });
export type InsertCommissionEntry = z.infer<
  typeof insertCommissionEntrySchema
>;
export type CommissionEntryRow = typeof commissionEntriesTable.$inferSelect;
