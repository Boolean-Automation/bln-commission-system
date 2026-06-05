import { Router, type IRouter } from "express";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  membershipsTable,
  usersTable,
  peopleTable,
  tenantsTable,
} from "@workspace/db";
import {
  GetAuthContextResponse,
  ListUsersResponse,
  ListTenantMembersParams,
  ListTenantMembersResponse,
  CreateTenantMemberParams,
  CreateTenantMemberBody,
  CreateTenantMemberResponse,
  UpdateTenantMemberParams,
  UpdateTenantMemberBody,
  UpdateTenantMemberResponse,
  DeleteTenantMemberParams,
  DeleteTenantMemberResponse,
  ListOperatorsResponse,
  CreateOperatorBody,
  CreateOperatorResponse,
  DeleteOperatorParams,
  DeleteOperatorResponse,
} from "@workspace/api-zod";
import {
  requireOperator,
  requireSuperOperator,
  requireTenantAccess,
  type ResolvedMembership,
} from "../lib/rbac";

const router: IRouter = Router();

function serializeMembership(m: {
  id: string;
  userId: string;
  role: string;
  tenantId: string | null;
  personId: string | null;
  createdAt: Date;
  userEmail: string | null;
  userName: string | null;
  personName: string | null;
}) {
  return {
    id: m.id,
    userId: m.userId,
    role: m.role,
    tenantId: m.tenantId,
    personId: m.personId,
    createdAt: m.createdAt.toISOString(),
    userEmail: m.userEmail,
    userName: m.userName,
    personName: m.personName,
  };
}

function serializeResolvedMembership(m: ResolvedMembership) {
  return serializeMembership(m);
}

// Current user's RBAC context (any authenticated user).
router.get("/me", (req, res): void => {
  const ctx = req.authContext!;
  res.json(
    GetAuthContextResponse.parse({
      user: ctx.user,
      isPlatformOperator: ctx.isPlatformOperator,
      isSuperOperator: ctx.isSuperOperator,
      memberships: ctx.memberships.map(serializeResolvedMembership),
      accessibleTenants: ctx.accessibleTenants,
    }),
  );
});

// All authenticated users (platform operator only) — for assigning roles.
router.get("/users", requireOperator, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.email);
  res.json(
    ListUsersResponse.parse(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        profileImageUrl: u.profileImageUrl,
      })),
    ),
  );
});

// Memberships scoped to a tenant. Joined to users/people for display fields.
async function loadTenantMembers(tenantId: string) {
  const rows = await db
    .select({
      id: membershipsTable.id,
      userId: membershipsTable.userId,
      role: membershipsTable.role,
      tenantId: membershipsTable.tenantId,
      personId: membershipsTable.personId,
      createdAt: membershipsTable.createdAt,
      userEmail: usersTable.email,
      userFirstName: usersTable.firstName,
      userLastName: usersTable.lastName,
      personName: peopleTable.name,
    })
    .from(membershipsTable)
    .leftJoin(usersTable, eq(membershipsTable.userId, usersTable.id))
    .leftJoin(peopleTable, eq(membershipsTable.personId, peopleTable.id))
    .where(eq(membershipsTable.tenantId, tenantId))
    .orderBy(membershipsTable.createdAt);

  return rows.map((r) =>
    serializeMembership({
      id: r.id,
      userId: r.userId,
      role: r.role,
      tenantId: r.tenantId,
      personId: r.personId,
      createdAt: r.createdAt,
      userEmail: r.userEmail ?? null,
      userName:
        [r.userFirstName, r.userLastName].filter(Boolean).join(" ").trim() ||
        null,
      personName: r.personName ?? null,
    }),
  );
}

router.get(
  "/tenants/:tenantId/members",
  requireTenantAccess,
  async (req, res): Promise<void> => {
    const params = ListTenantMembersParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    res.json(
      ListTenantMembersResponse.parse(
        await loadTenantMembers(params.data.tenantId),
      ),
    );
  },
);

router.post(
  "/tenants/:tenantId/members",
  requireTenantAccess,
  async (req, res): Promise<void> => {
    const params = CreateTenantMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = CreateTenantMemberBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const tenantId = params.data.tenantId;
    const { userId, role, personId } = body.data;

    const [tenant] = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!user) {
      res.status(400).json({ error: "User not found" });
      return;
    }

    if (personId) {
      const [person] = await db
        .select({ id: peopleTable.id })
        .from(peopleTable)
        .where(and(eq(peopleTable.id, personId), eq(peopleTable.tenantId, tenantId)));
      if (!person) {
        res.status(400).json({ error: "Person not found in this company" });
        return;
      }
    }

    const [created] = await db
      .insert(membershipsTable)
      .values({ userId, role, tenantId, personId: personId ?? null })
      .onConflictDoUpdate({
        target: [membershipsTable.userId, membershipsTable.tenantId],
        set: { role, personId: personId ?? null },
      })
      .returning();

    const [serialized] = await loadOneMember(created!.id);
    res.json(CreateTenantMemberResponse.parse(serialized));
  },
);

async function loadOneMember(membershipId: string) {
  const rows = await db
    .select({
      id: membershipsTable.id,
      userId: membershipsTable.userId,
      role: membershipsTable.role,
      tenantId: membershipsTable.tenantId,
      personId: membershipsTable.personId,
      createdAt: membershipsTable.createdAt,
      userEmail: usersTable.email,
      userFirstName: usersTable.firstName,
      userLastName: usersTable.lastName,
      personName: peopleTable.name,
    })
    .from(membershipsTable)
    .leftJoin(usersTable, eq(membershipsTable.userId, usersTable.id))
    .leftJoin(peopleTable, eq(membershipsTable.personId, peopleTable.id))
    .where(eq(membershipsTable.id, membershipId));

  return rows.map((r) =>
    serializeMembership({
      id: r.id,
      userId: r.userId,
      role: r.role,
      tenantId: r.tenantId,
      personId: r.personId,
      createdAt: r.createdAt,
      userEmail: r.userEmail ?? null,
      userName:
        [r.userFirstName, r.userLastName].filter(Boolean).join(" ").trim() ||
        null,
      personName: r.personName ?? null,
    }),
  );
}

router.patch(
  "/tenants/:tenantId/members/:membershipId",
  requireTenantAccess,
  async (req, res): Promise<void> => {
    const params = UpdateTenantMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateTenantMemberBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const { tenantId, membershipId } = params.data;

    const [existing] = await db
      .select()
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.id, membershipId),
          eq(membershipsTable.tenantId, tenantId),
        ),
      );
    if (!existing) {
      res.status(404).json({ error: "Membership not found" });
      return;
    }

    const updates: { role?: string; personId?: string | null } = {};
    if (body.data.role !== undefined) updates.role = body.data.role;
    if (body.data.personId !== undefined) {
      if (body.data.personId) {
        const [person] = await db
          .select({ id: peopleTable.id })
          .from(peopleTable)
          .where(
            and(
              eq(peopleTable.id, body.data.personId),
              eq(peopleTable.tenantId, tenantId),
            ),
          );
        if (!person) {
          res.status(400).json({ error: "Person not found in this company" });
          return;
        }
      }
      updates.personId = body.data.personId;
    }

    await db
      .update(membershipsTable)
      .set(updates)
      .where(eq(membershipsTable.id, membershipId));

    const [serialized] = await loadOneMember(membershipId);
    res.json(UpdateTenantMemberResponse.parse(serialized));
  },
);

router.delete(
  "/tenants/:tenantId/members/:membershipId",
  requireTenantAccess,
  async (req, res): Promise<void> => {
    const params = DeleteTenantMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const { tenantId, membershipId } = params.data;

    const [existing] = await db
      .select()
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.id, membershipId),
          eq(membershipsTable.tenantId, tenantId),
        ),
      );
    if (!existing) {
      res.status(404).json({ error: "Membership not found" });
      return;
    }

    await db.delete(membershipsTable).where(eq(membershipsTable.id, membershipId));
    res.json(
      DeleteTenantMemberResponse.parse({ id: membershipId, deleted: true }),
    );
  },
);

// Platform operators are global (tenantId null). Managed by operators only.
async function loadOperators() {
  const rows = await db
    .select({
      id: membershipsTable.id,
      userId: membershipsTable.userId,
      role: membershipsTable.role,
      tenantId: membershipsTable.tenantId,
      personId: membershipsTable.personId,
      createdAt: membershipsTable.createdAt,
      userEmail: usersTable.email,
      userFirstName: usersTable.firstName,
      userLastName: usersTable.lastName,
    })
    .from(membershipsTable)
    .leftJoin(usersTable, eq(membershipsTable.userId, usersTable.id))
    .where(
      and(
        inArray(membershipsTable.role, ["super_operator", "platform_operator"]),
        isNull(membershipsTable.tenantId),
      ),
    )
    .orderBy(membershipsTable.createdAt);

  return rows.map((r) =>
    serializeMembership({
      id: r.id,
      userId: r.userId,
      role: r.role,
      tenantId: r.tenantId,
      personId: r.personId,
      createdAt: r.createdAt,
      userEmail: r.userEmail ?? null,
      userName:
        [r.userFirstName, r.userLastName].filter(Boolean).join(" ").trim() ||
        null,
      personName: null,
    }),
  );
}

router.get("/operators", requireOperator, async (_req, res): Promise<void> => {
  res.json(ListOperatorsResponse.parse(await loadOperators()));
});

// Only a Boolean Super Admin may grant a Boolean Admin (platform_operator).
router.post(
  "/operators",
  requireSuperOperator,
  async (req, res): Promise<void> => {
    const body = CreateOperatorBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const { userId } = body.data;

    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!user) {
      res.status(400).json({ error: "User not found" });
      return;
    }

    const existingOps = await loadOperators();
    const already = existingOps.find((m) => m.userId === userId);
    if (already) {
      res.json(CreateOperatorResponse.parse(already));
      return;
    }

    const [created] = await db
      .insert(membershipsTable)
      .values({
        userId,
        role: "platform_operator",
        tenantId: null,
        personId: null,
      })
      .returning();

    const [serialized] = await loadOneMember(created!.id);
    res.json(CreateOperatorResponse.parse(serialized));
  },
);

// Only a Boolean Super Admin may revoke a Boolean Admin. Super Admin rows are
// protected and cannot be removed through this endpoint.
router.delete(
  "/operators/:membershipId",
  requireSuperOperator,
  async (req, res): Promise<void> => {
    const params = DeleteOperatorParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const { membershipId } = params.data;

    const [existing] = await db
      .select()
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.id, membershipId),
          isNull(membershipsTable.tenantId),
          inArray(membershipsTable.role, [
            "super_operator",
            "platform_operator",
          ]),
        ),
      );
    if (!existing) {
      res.status(404).json({ error: "Operator not found" });
      return;
    }
    if (existing.role === "super_operator") {
      res.status(400).json({
        error: "A Boolean Super Admin cannot be removed here",
      });
      return;
    }

    await db
      .delete(membershipsTable)
      .where(eq(membershipsTable.id, membershipId));
    res.json(
      DeleteOperatorResponse.parse({ id: membershipId, deleted: true }),
    );
  },
);

export default router;
