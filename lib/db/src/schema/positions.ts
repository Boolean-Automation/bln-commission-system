import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const positionsTable = pgTable(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantNameUnique: unique("positions_tenant_name_unique").on(
      t.tenantId,
      t.name,
    ),
  }),
);

export const insertPositionSchema = createInsertSchema(positionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type PositionRow = typeof positionsTable.$inferSelect;
