import { describe, expect, it, vi } from "vitest";

// Mock the workspace packages so importing the router doesn't pull in pg /
// drizzle / zod schema validators at test time.
vi.mock("@workspace/db", () => ({
  db: {},
  statementsTable: {},
  statementThreadsTable: {},
  statementMessagesTable: {},
  statementEventsTable: {},
  membershipsTable: {},
  tenantsTable: {},
  peopleTable: {},
  commissionEntriesTable: {},
  usersTable: {},
}));

vi.mock("@workspace/api-zod", () => ({
  GetStatementThreadsForSelfParams: { safeParse: () => ({ success: true }) },
  GetStatementThreadsForSelfQueryParams: {
    safeParse: () => ({ success: true }),
  },
  GetStatementThreadsForSelfResponse: {
    parse: (v: unknown) => v,
  },
  GetStatementThreadsForPersonParams: { safeParse: () => ({ success: true }) },
  GetStatementThreadsForPersonQueryParams: {
    safeParse: () => ({ success: true }),
  },
  GetStatementThreadsForPersonResponse: { parse: (v: unknown) => v },
  OpenStatementThreadForSelfParams: { safeParse: () => ({ success: true }) },
  OpenStatementThreadForSelfBody: { safeParse: () => ({ success: true }) },
  OpenStatementThreadForSelfResponse: { parse: (v: unknown) => v },
  OpenStatementThreadForPersonParams: { safeParse: () => ({ success: true }) },
  OpenStatementThreadForPersonBody: { safeParse: () => ({ success: true }) },
  OpenStatementThreadForPersonResponse: { parse: (v: unknown) => v },
  PostThreadMessageParams: { safeParse: () => ({ success: true }) },
  PostThreadMessageBody: { safeParse: () => ({ success: true }) },
  PostThreadMessageResponse: { parse: (v: unknown) => v },
  ResolveStatementThreadParams: { safeParse: () => ({ success: true }) },
  ResolveStatementThreadResponse: { parse: (v: unknown) => v },
  ReopenStatementThreadParams: { safeParse: () => ({ success: true }) },
  ReopenStatementThreadResponse: { parse: (v: unknown) => v },
  RequestStatementSignoffParams: { safeParse: () => ({ success: true }) },
  RequestStatementSignoffBody: { safeParse: () => ({ success: true }) },
  RequestStatementSignoffResponse: { parse: (v: unknown) => v },
  AcknowledgeStatementSignoffParams: { safeParse: () => ({ success: true }) },
  AcknowledgeStatementSignoffBody: { safeParse: () => ({ success: true }) },
  AcknowledgeStatementSignoffResponse: { parse: (v: unknown) => v },
  RescindStatementSignoffParams: { safeParse: () => ({ success: true }) },
  RescindStatementSignoffBody: { safeParse: () => ({ success: true }) },
  RescindStatementSignoffResponse: { parse: (v: unknown) => v },
}));

import {
  canAcknowledgeSignoff,
  canRequestSignoff,
  canRescindSignoff,
  effectiveRoleFor,
  repPersonIdFor,
} from "./statementCollab";
import type { AuthContextResolved } from "../lib/rbac";

function ctxFor(args: {
  isSuperOperator?: boolean;
  isPlatformOperator?: boolean;
  memberships?: Array<{
    tenantId: string | null;
    role: string;
    personId?: string | null;
  }>;
}): AuthContextResolved {
  return {
    user: { id: "user-1" } as AuthContextResolved["user"],
    isSuperOperator: args.isSuperOperator ?? false,
    isPlatformOperator: args.isPlatformOperator ?? args.isSuperOperator ?? false,
    memberships: (args.memberships ?? []).map((m) => ({
      id: "m",
      userId: "user-1",
      role: m.role,
      tenantId: m.tenantId,
      personId: m.personId ?? null,
      createdAt: new Date(),
      userEmail: null,
      userName: null,
      personName: null,
    })),
    accessibleTenants: [],
  };
}

describe("effectiveRoleFor", () => {
  it("returns super_operator when the user is a super operator", () => {
    expect(
      effectiveRoleFor(ctxFor({ isSuperOperator: true }), "tenant-1"),
    ).toBe("super_operator");
  });

  it("returns platform_operator for non-super platform operators", () => {
    expect(
      effectiveRoleFor(ctxFor({ isPlatformOperator: true }), "tenant-1"),
    ).toBe("platform_operator");
  });

  it("returns admin for the tenant where the user is admin", () => {
    expect(
      effectiveRoleFor(
        ctxFor({
          memberships: [
            { tenantId: "tenant-1", role: "admin" },
            { tenantId: "tenant-2", role: "rep", personId: "p-2" },
          ],
        }),
        "tenant-1",
      ),
    ).toBe("admin");
  });

  it("returns rep when the user is a rep for that tenant", () => {
    expect(
      effectiveRoleFor(
        ctxFor({
          memberships: [{ tenantId: "tenant-1", role: "rep", personId: "p-1" }],
        }),
        "tenant-1",
      ),
    ).toBe("rep");
  });

  it("returns none when there is no membership in the tenant", () => {
    expect(
      effectiveRoleFor(
        ctxFor({
          memberships: [{ tenantId: "tenant-2", role: "admin" }],
        }),
        "tenant-1",
      ),
    ).toBe("none");
  });
});

describe("repPersonIdFor", () => {
  it("returns the rep's personId when present", () => {
    expect(
      repPersonIdFor(
        ctxFor({
          memberships: [{ tenantId: "tenant-1", role: "rep", personId: "p-1" }],
        }),
        "tenant-1",
      ),
    ).toBe("p-1");
  });

  it("returns null when the user is only an admin in the tenant", () => {
    expect(
      repPersonIdFor(
        ctxFor({
          memberships: [{ tenantId: "tenant-1", role: "admin" }],
        }),
        "tenant-1",
      ),
    ).toBeNull();
  });

  it("does not leak a rep personId from another tenant", () => {
    expect(
      repPersonIdFor(
        ctxFor({
          memberships: [{ tenantId: "tenant-2", role: "rep", personId: "p-2" }],
        }),
        "tenant-1",
      ),
    ).toBeNull();
  });
});

describe("sign-off transitions", () => {
  it("allows requesting from `none`", () => {
    expect(canRequestSignoff("none")).toEqual({
      ok: true,
      toState: "requested",
    });
  });

  it("allows re-requesting from `requested` (idempotent in spirit)", () => {
    expect(canRequestSignoff("requested")).toEqual({
      ok: true,
      toState: "requested",
    });
  });

  it("blocks requesting when already acknowledged", () => {
    const result = canRequestSignoff("acknowledged");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/acknowledged/i);
    }
  });

  it("allows acknowledging only from `requested`", () => {
    expect(canAcknowledgeSignoff("requested")).toEqual({
      ok: true,
      toState: "acknowledged",
    });
    expect(canAcknowledgeSignoff("none").ok).toBe(false);
    expect(canAcknowledgeSignoff("acknowledged").ok).toBe(false);
  });

  it("allows rescinding only from `requested`", () => {
    expect(canRescindSignoff("requested")).toEqual({
      ok: true,
      toState: "none",
    });
    expect(canRescindSignoff("acknowledged").ok).toBe(false);
    expect(canRescindSignoff("none").ok).toBe(false);
  });
});
