import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { peopleTable } from "./people";

// A statements row is materialized lazily on the first write that needs a
// stable FK target — opening a thread, requesting sign-off, etc. Pure reads of
// a period (#21) don't need a row; if none exists, the surface treats sign-off
// as `none` and threads as `[]`.
export const statementsTable = pgTable(
  "statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => peopleTable.id),
    periodType: text("period_type").notNull(),
    periodKey: text("period_key").notNull(),
    signoffState: text("signoff_state").notNull().default("none"),
    signoffRequestedAt: timestamp("signoff_requested_at", {
      withTimezone: true,
    }),
    signoffRequestedByUserId: varchar("signoff_requested_by_user_id"),
    signoffAcknowledgedAt: timestamp("signoff_acknowledged_at", {
      withTimezone: true,
    }),
    signoffAcknowledgedByUserId: varchar("signoff_acknowledged_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("statements_tenant_person_period_uniq").on(
      t.tenantId,
      t.personId,
      t.periodType,
      t.periodKey,
    ),
  ],
);

export const insertStatementSchema = createInsertSchema(statementsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertStatement = z.infer<typeof insertStatementSchema>;
export type StatementRow = typeof statementsTable.$inferSelect;
