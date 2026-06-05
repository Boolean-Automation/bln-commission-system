import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

vi.mock("@workspace/db", () => ({
  db: {},
  commissionEntriesTable: {},
  membershipsTable: {},
  tenantsTable: {},
  peopleTable: {},
  manualInputsTable: {},
}));

import { requireTenantAccessOrSelfRep } from "./rbac";
import {
  computeProjection,
  normalizeKpiKeys,
  type PeriodRange,
} from "./repMetrics";

function response() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
  };
  return res as unknown as Response & typeof res;
}

function request(memberships: unknown[], tenantId = "tenant-1") {
  return {
    params: { tenantId },
    authContext: {
      user: { id: "user-1" },
      isSuperOperator: false,
      isPlatformOperator: false,
      memberships,
      accessibleTenants: [],
    },
  } as unknown as Request;
}

describe("requireTenantAccessOrSelfRep", () => {
  it("allows a rep for their tenant and stashes personId", () => {
    const req = request([
      { tenantId: "tenant-1", role: "rep", personId: "person-1" },
    ]);
    const res = response();
    const next: NextFunction = vi.fn();

    requireTenantAccessOrSelfRep(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.repPersonId).toBe("person-1");
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects reps for other tenants", () => {
    const req = request([
      { tenantId: "tenant-2", role: "rep", personId: "person-1" },
    ]);
    const res = response();
    const next: NextFunction = vi.fn();

    requireTenantAccessOrSelfRep(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("allows tenant admins without setting rep scope", () => {
    const req = request([{ tenantId: "tenant-1", role: "admin" }]);
    const res = response();
    const next: NextFunction = vi.fn();

    requireTenantAccessOrSelfRep(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.repPersonId).toBeUndefined();
  });
});

describe("rep dashboard KPI helpers", () => {
  it("normalizes valid KPI keys and rejects unknown keys", () => {
    expect(normalizeKpiKeys(["rank", "rank", "paid"])).toEqual([
      "rank",
      "paid",
    ]);
    expect(normalizeKpiKeys(["rank", "bogus"])).toBeNull();
  });

  it("projects earnings from elapsed period days", () => {
    const range: PeriodRange = {
      effectiveFrom: "2026-06-01",
      effectiveTo: "2026-06-30",
    };

    expect(
      computeProjection(1000, 5000, range, new Date("2026-06-10T12:00:00Z")),
    ).toEqual({
      projectedEarning: 3000,
      paceVsQuota: -2000,
      daysElapsed: 10,
      daysRemaining: 20,
    });
  });
});
