import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { statementThreadsTable } from "./statementThreads";

// A single message in a thread. `authorRoleAtPost` is a snapshot of the role
// the author held when the message was posted so the rendered timeline does
// not retroactively change if a role is later granted/revoked.
export const statementMessagesTable = pgTable("statement_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => statementThreadsTable.id),
  authorUserId: varchar("author_user_id").notNull(),
  authorRoleAtPost: text("author_role_at_post").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertStatementMessageSchema = createInsertSchema(
  statementMessagesTable,
).omit({ id: true, createdAt: true });
export type InsertStatementMessage = z.infer<
  typeof insertStatementMessageSchema
>;
export type StatementMessageRow =
  typeof statementMessagesTable.$inferSelect;
