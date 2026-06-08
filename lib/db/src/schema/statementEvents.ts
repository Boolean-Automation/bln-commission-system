import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { statementsTable } from "./statements";

// Mirror of commission_events but keyed on statementId, since the audit log
// for thread + sign-off events has a statement (not an entry) as its subject.
// Event kinds: thread_opened, thread_replied, thread_resolved, thread_reopened,
// signoff_requested, signoff_acknowledged, signoff_rescinded.
export const statementEventsTable = pgTable("statement_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  statementId: uuid("statement_id")
    .notNull()
    .references(() => statementsTable.id),
  threadId: uuid("thread_id"),
  eventKind: text("event_kind").notNull(),
  before: jsonb("before").$type<Record<string, unknown> | null>(),
  after: jsonb("after").$type<Record<string, unknown> | null>(),
  actor: text("actor").notNull().default("system"),
  actorUserId: varchar("actor_user_id"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStatementEventSchema = createInsertSchema(
  statementEventsTable,
).omit({ id: true, at: true });
export type InsertStatementEvent = z.infer<typeof insertStatementEventSchema>;
export type StatementEventRow = typeof statementEventsTable.$inferSelect;
