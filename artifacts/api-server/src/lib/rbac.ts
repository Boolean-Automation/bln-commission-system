import { type Request, type Response, type NextFunction } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  membershipsTable,
  tenantsTable,
  peopleTable,
} from "@workspace/db";
import type { AuthUser } from "./authTypes";

export interface ResolvedMembership {
  id: string;
  userId: string;
  role: string;
  tenantId: string | null;
  personId: string | null;
  createdAt: Date;
  userEmail: string | null;
  userName: string | null;
  personName: string | null;
}

export interface ResolvedTenant {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface AuthContextResolved {
  user: AuthUser;
  isPlatformOperator: boolean;
  memberships: ResolvedMembership[];
  accessibleTenants: ResolvedTenant[];
}

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContextResolved;
    }
  }
}

/**
 * Provision memberships for a user that has none yet.
 *
 * - Bootstrap: if no platform operator exists anywhere, the first provisioned
 *   user becomes the platform operator. This prevents lockout on a fresh system.
 * - Rep auto-link: otherwise, match the user's email (case-insensitive) to
 *   people rows and grant a `rep` membership for each matching tenant.
 *
 * Inserts are idempotent via the unique (user_id, tenant_id) index.
 */
async function provisionMemberships(user: AuthUser): Promise<void> {
  const [existingOperator] = await db
    .select({ id: membershipsTable.id })
    .from(membershipsTable)
    .where(eq(membershipsTable.role, "platform_operator"))
    .limit(1);

  if (!existingOperator) {
    await db
      .insert(membershipsTable)
      .values({ userId: user.id, role: "platform_operator", tenantId: null })
      .onConflictDoNothing();
    return;
  }

  if (!user.email) return;

  const matches = await db
    .select({ id: peopleTable.id, tenantId: peopleTable.tenantId })
    .from(peopleTable)
    .where(sql`lower(${peopleTable.email}) = ${user.email.toLowerCase()}`);

  for (const person of matches) {
    await db
      .insert(membershipsTable)
      .values({
        userId: user.id,
        role: "rep",
        tenantId: person.tenantId,
        personId: person.id,
      })
      .onConflictDoNothing();
  }
}

async function readMemberships(userId: string): Promise<ResolvedMembership[]> {
  const rows = await db
    .select({
      id: membershipsTable.id,
      userId: membershipsTable.userId,
      role: membershipsTable.role,
      tenantId: membershipsTable.tenantId,
      personId: membershipsTable.personId,
      createdAt: membershipsTable.createdAt,
      personName: peopleTable.name,
    })
    .from(membershipsTable)
    .leftJoin(peopleTable, eq(membershipsTable.personId, peopleTable.id))
    .where(eq(membershipsTable.userId, userId));

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    role: r.role,
    tenantId: r.tenantId,
    personId: r.personId,
    createdAt: r.createdAt,
    userEmail: null,
    userName: null,
    personName: r.personName ?? null,
  }));
}

export async function resolveAuthContext(
  user: AuthUser,
): Promise<AuthContextResolved> {
  let memberships = await readMemberships(user.id);
  if (memberships.length === 0) {
    await provisionMemberships(user);
    memberships = await readMemberships(user.id);
  }

  const userName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null;
  for (const m of memberships) {
    m.userEmail = user.email ?? null;
    m.userName = userName;
  }

  const isPlatformOperator = memberships.some(
    (m) => m.role === "platform_operator",
  );

  let accessibleTenants: ResolvedTenant[];
  if (isPlatformOperator) {
    const tenants = await db
      .select({
        id: tenantsTable.id,
        name: tenantsTable.name,
        slug: tenantsTable.slug,
      })
      .from(tenantsTable)
      .orderBy(tenantsTable.name);
    accessibleTenants = tenants.map((t) => ({
      ...t,
      role: "platform_operator",
    }));
  } else {
    const tenantIds = memberships
      .map((m) => m.tenantId)
      .filter((id): id is string => id !== null);
    const roleByTenant = new Map(
      memberships
        .filter((m) => m.tenantId !== null)
        .map((m) => [m.tenantId as string, m.role]),
    );
    const tenants =
      tenantIds.length === 0
        ? []
        : await db
            .select({
              id: tenantsTable.id,
              name: tenantsTable.name,
              slug: tenantsTable.slug,
            })
            .from(tenantsTable)
            .orderBy(tenantsTable.name);
    accessibleTenants = tenants
      .filter((t) => roleByTenant.has(t.id))
      .map((t) => ({ ...t, role: roleByTenant.get(t.id)! }));
  }

  return { user, isPlatformOperator, memberships, accessibleTenants };
}

export function hasTenantAccess(
  ctx: AuthContextResolved,
  tenantId: string,
): boolean {
  if (ctx.isPlatformOperator) return true;
  return ctx.memberships.some(
    (m) => m.tenantId === tenantId && m.role === "admin",
  );
}

export function isStaff(ctx: AuthContextResolved): boolean {
  return ctx.isPlatformOperator || ctx.memberships.some((m) => m.role === "admin");
}

/**
 * Require an authenticated session and attach the resolved RBAC context to the
 * request. All routes below the global mount point depend on this.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    req.authContext = await resolveAuthContext(req.user);
    next();
  } catch (err) {
    req.log.error({ err }, "Failed to resolve auth context");
    res.status(500).json({ error: "Failed to resolve access" });
  }
}

export function requireOperator(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.authContext?.isPlatformOperator) {
    res.status(403).json({ error: "Platform operator access required" });
    return;
  }
  next();
}

export function requireStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.authContext || !isStaff(req.authContext)) {
    res.status(403).json({ error: "Operation not permitted" });
    return;
  }
  next();
}

/**
 * Require operator access, or admin membership for the `:tenantId` in the path.
 * Reps never pass this guard (they have read-only access to their own data only).
 */
export function requireTenantAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const tenantId = req.params.tenantId;
  if (
    !req.authContext ||
    typeof tenantId !== "string" ||
    !hasTenantAccess(req.authContext, tenantId)
  ) {
    res.status(403).json({ error: "You do not have access to this company" });
    return;
  }
  next();
}
