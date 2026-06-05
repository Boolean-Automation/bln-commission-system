import {
  pgTable,
  uuid,
  text,
  doublePrecision,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Manually-entered compensation targets for a rep within a period. These values
// do not come from any data source — an admin types them in. They are the
// foundation for downstream attainment %, rankings, and forecasting.
//
// One row per (tenant, person, periodType, periodKey). `periodKey` is the
// canonical identifier for a period within its type:
//   monthly   -> "YYYY-MM"   (e.g. "2026-06")
//   quarterly -> "YYYY-Qn"   (e.g. "2026-Q2")
//   annual    -> "YYYY"      (e.g. "2026")
// `effectiveFrom`/`effectiveTo` are the derived inclusive date range for the
// period, stored as ISO date strings for downstream date-range queries.
export const manualInputsTable = pgTable(
  "manual_inputs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    personId: uuid("person_id").notNull(),
    periodType: text("period_type").notNull(),
    periodKey: text("period_key").notNull(),
    quota: doublePrecision("quota"),
    ote: doublePrecision("ote"),
    acceleratorThreshold: doublePrecision("accelerator_threshold"),
    acceleratorMultiplier: doublePrecision("accelerator_multiplier"),
    notes: text("notes"),
    effectiveFrom: text("effective_from").notNull(),
    effectiveTo: text("effective_to").notNull(),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("manual_inputs_tenant_person_period_uniq").on(
      t.tenantId,
      t.personId,
      t.periodType,
      t.periodKey,
    ),
  ],
);

export const insertManualInputSchema = createInsertSchema(manualInputsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertManualInput = z.infer<typeof insertManualInputSchema>;
export type ManualInputRow = typeof manualInputsTable.$inferSelect;

// Immutable audit log for manual-input changes (created / updated / deleted),
// mirroring the commission_events pattern: before/after snapshots, actor, time.
export const manualInputEventsTable = pgTable("manual_input_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  manualInputId: uuid("manual_input_id").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  personId: uuid("person_id").notNull(),
  eventKind: text("event_kind").notNull(),
  before: jsonb("before").$type<Record<string, unknown> | null>(),
  after: jsonb("after").$type<Record<string, unknown> | null>(),
  actor: text("actor").notNull().default("system"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertManualInputEventSchema = createInsertSchema(
  manualInputEventsTable,
).omit({ id: true, at: true });
export type InsertManualInputEvent = z.infer<
  typeof insertManualInputEventSchema
>;
export type ManualInputEventRow = typeof manualInputEventsTable.$inferSelect;
