import { pgTable, uuid, varchar, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Links an authenticated user (users.id) to a role in the system.
 *
 * Four tiers:
 * - super_operator: Boolean Super Admin; full platform access PLUS the sole role that can
 *   grant/revoke platform operators (Boolean Admins). `tenantId` is null.
 * - platform_operator: Boolean Admin; Boolean Automation staff that manages ALL tenants.
 *   `tenantId` is null.
 * - admin: company admin (RevOps/Finance) for a single tenant. `tenantId` set, `personId` null.
 * - rep: sales rep, read-only access to their own data within a tenant. `tenantId` set and
 *   `personId` links to the synced people row.
 */
export const membershipsTable = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id").notNull(),
    role: text("role").notNull(),
    tenantId: uuid("tenant_id"),
    personId: uuid("person_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One membership per user per tenant. Platform-operator rows leave tenantId
    // null (NULLs are distinct in a Postgres unique index, so this constrains
    // tenant-scoped rows without blocking the operator row).
    uniqueIndex("memberships_user_tenant_uniq").on(table.userId, table.tenantId),
    // Tenant-scoped (admin/rep) rows have tenantId set, so the index above
    // can't dedupe operator rows (their tenantId is NULL and NULLs are
    // distinct). This partial index enforces at most one platform_operator row
    // per user, so the bootstrap `onConflictDoNothing` actually dedupes under
    // concurrent first-logins.
    uniqueIndex("memberships_operator_user_uniq")
      .on(table.userId)
      .where(sql`${table.role} = 'platform_operator'`),
    // Same rationale as above for the super-operator tier (Boolean Super Admin):
    // at most one super_operator row per user.
    uniqueIndex("memberships_super_operator_user_uniq")
      .on(table.userId)
      .where(sql`${table.role} = 'super_operator'`),
  ],
);

export const insertMembershipSchema = createInsertSchema(membershipsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMembership = z.infer<typeof insertMembershipSchema>;
export type Membership = typeof membershipsTable.$inferSelect;

export const MEMBERSHIP_ROLES = [
  "super_operator",
  "platform_operator",
  "admin",
  "rep",
] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
