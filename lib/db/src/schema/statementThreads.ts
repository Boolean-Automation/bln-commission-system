import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { statementsTable } from "./statements";
import { commissionEntriesTable } from "./commissionEntries";

// A discussion thread attached to a statement. `entryId` is optional: when null
// the thread is a statement-wide question; when set it scopes a question to a
// specific commission entry. The `messageCount` / `lastMessageAt` columns are
// denormalized counters kept in sync by the router for cheap listing.
export const statementThreadsTable = pgTable("statement_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  statementId: uuid("statement_id")
    .notNull()
    .references(() => statementsTable.id),
  entryId: uuid("entry_id").references(() => commissionEntriesTable.id),
  subject: text("subject"),
  status: text("status").notNull().default("open"),
  openedByUserId: varchar("opened_by_user_id").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedByUserId: varchar("resolved_by_user_id"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  messageCount: integer("message_count").notNull().default(0),
});

export const insertStatementThreadSchema = createInsertSchema(
  statementThreadsTable,
).omit({
  id: true,
  openedAt: true,
  lastMessageAt: true,
  messageCount: true,
});
export type InsertStatementThread = z.infer<
  typeof insertStatementThreadSchema
>;
export type StatementThreadRow = typeof statementThreadsTable.$inferSelect;
