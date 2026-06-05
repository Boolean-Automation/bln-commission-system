# Plan — #20 Sales Rep Personal Dashboard

## Context

`RepView.tsx` is currently a placeholder with no data, even though reps land on it directly (`App.tsx:52-69` gates by `effectiveRole === "rep"`). The spec wants reps to land on a motivating, read-only dashboard showing **commission performance by state, quota attainment, peer ranking, and a forecast**, with monthly/quarterly/annual period navigation. Admins should be able to choose which KPIs surface.

Most of the math already exists. The leaderboard route (`artifacts/api-server/src/routes/reports.ts:75-162`, added in task #17) computes `rank`, `attainmentPct`, `quota`, `ote`, `earnedInPeriod`, `deltaToQuota`, and `state` per rep, using `peopleTable` + `manualInputsTable` + `commissionEntriesTable`. The payroll endpoint (`insights.ts:111-165`) has per-person accrued/payable/paid totals. We can compose both and add a simple pace-based projection — no new engine code required.

Two real gaps:

1. **RBAC**: `requireTenantAccess` (`rbac.ts:285-300`) **blocks all reps**. We need a new guard that admits a rep when the path/auth context resolves to their own `personId`.
2. **KPI display config**: no schema exists. Add a small per-tenant table.

## Approach

Add three rep-scoped endpoints (`/me`, `/kpi-config` GET, `/kpi-config` PUT) under a new `rep-dashboard` router, a new RBAC helper, a new tiny config table, and rebuild `RepView.tsx` with KPI cards driven by the config. Reuse the existing `PeriodPicker`, KPI card layout from `Dashboard.tsx`, and the leaderboard computation pattern from `reports.ts`.

### Backend

**1. RBAC helper** — `artifacts/api-server/src/lib/rbac.ts`

Add `requireTenantAccessOrSelfRep`:

```ts
export function requireTenantAccessOrSelfRep(
  req: Request, res: Response, next: NextFunction,
): void {
  const tenantId = req.params.tenantId;
  if (!req.authContext || typeof tenantId !== "string") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (hasTenantAccess(req.authContext, tenantId)) { next(); return; }
  const repMembership = req.authContext.memberships.find(
    (m) => m.tenantId === tenantId && m.role === "rep" && m.personId,
  );
  if (!repMembership) {
    res.status(403).json({ error: "You do not have access" }); return;
  }
  // Stash for handlers to scope by.
  (req as Request & { repPersonId?: string }).repPersonId = repMembership.personId!;
  next();
}
```

The `/me` endpoint resolves `personId` from this context (never from a URL/query param) so reps cannot impersonate one another. Admins can still call it via `?personId=` override; if absent for an admin, return 400.

**2. New table** — `lib/db/src/schema/repDashboardConfig.ts`

```ts
export const repDashboardConfigTable = pgTable("rep_dashboard_config", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenantsTable.id),
  enabledKpis: jsonb("enabled_kpis").$type<string[]>().notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedByUserId: uuid("updated_by_user_id"),
});
```

Export from `lib/db/src/schema/index.ts`. Generate + apply migration via the existing drizzle workflow used by the other schemas in `lib/db/src/schema/`.

**Default KPI set** (used when no row exists): `["earnedInPeriod", "attainmentPct", "rank", "projectedEarning"]`. Other valid keys: `quota`, `ote`, `accrued`, `payable`, `paid`, `deltaToQuota`. Keep the allowed list as a server-side enum (`KPI_KEYS`) so we can validate PUT input.

**3. New router** — `artifacts/api-server/src/routes/repDashboard.ts`

Three endpoints. Mount under `requireAuth` (already global) — per-route guards differ:

- **`GET /tenants/:tenantId/rep-dashboard/me?periodType&periodKey`** — guard `requireTenantAccessOrSelfRep`. Resolves `personId` from `req.repPersonId` (rep) or `req.query.personId` (admin/operator). Returns:
  ```ts
  type RepDashboardSummary = {
    personId: string;
    personName: string;
    period: { type: PeriodType; key: string };
    commissionByState: { accrued: number; payable: number; paid: number; clawedBack: number };
    quota: number | null;
    ote: number | null;
    earnedInPeriod: number;
    attainmentPct: number | null;     // null when quota is unset
    deltaToQuota: number | null;
    rank: number | null;              // null when no quota / unranked
    peerCount: number;                // active reps in the same period
    state: "over" | "on_track" | "under" | "no_quota";
    projection: {
      projectedEarning: number;       // earnedInPeriod * periodLengthDays / daysElapsed
      paceVsQuota: number | null;     // projectedEarning - quota
      daysElapsed: number;
      daysRemaining: number;
    };
    enabledKpis: string[];            // mirrored from config so frontend renders one query
  };
  ```

  Implementation: factor the leaderboard query in `reports.ts:88-153` into a shared helper `computeLeaderboard(tenantId, periodType, periodKey)` in a new `artifacts/api-server/src/lib/repMetrics.ts`. The `/me` handler calls it, picks the row matching `personId`, joins payroll-style accrued/payable/paid totals (reusing the `commissionEntriesTable` aggregation pattern from `insights.ts:127-148` filtered by `personId`), and computes the projection using `lib/periods.ts`-equivalent server logic (or move the period-bounds helper server-side; check whether `artifacts/api-server/src/lib/` already has one — if not, inline a 10-line `periodBounds(type, key)` helper).

- **`GET /tenants/:tenantId/rep-dashboard/kpi-config`** — guard `requireTenantAccessOrSelfRep` (reps need to read it to know what to render). Returns `{ enabledKpis: string[]; updatedAt: string | null }`. Falls back to the default set when no row exists.

- **`PUT /tenants/:tenantId/rep-dashboard/kpi-config`** — guard `requireTenantAccess` (admin/operator only). Body `{ enabledKpis: string[] }`; validate each key against `KPI_KEYS`. Upsert into the table; record `updatedByUserId` from `req.authContext.user.id`.

Register the router in `artifacts/api-server/src/routes/index.ts` next to `reportsRouter` (line ~33).

### API spec + codegen

**4. Update `lib/api-spec/openapi.yaml`**:

- Add tag `rep-dashboard` in the `tags:` block (lines 10-34).
- Add three paths under `/tenants/{tenantId}/rep-dashboard/...` mirroring the structure of `/tenants/{tenantId}/reports/leaderboard` (lines 668-720) for GETs and `/tenants/{tenantId}/schema-mapping` PUT (lines 823-855) for the config PUT.
- Add schemas in `components.schemas`:
  - `RepDashboardSummary` (shape above) — reference `PeriodType` (already defined) and a new `CommissionByState` inline object and `RepProjection` object.
  - `RepDashboardKpiConfig` `{ enabledKpis: KpiKey[]; updatedAt: string | null }`.
  - `RepDashboardKpiConfigInput` `{ enabledKpis: KpiKey[] }`.
  - `KpiKey` enum: `earnedInPeriod | attainmentPct | rank | projectedEarning | quota | ote | accrued | payable | paid | deltaToQuota`.

**5. Codegen**: `cd lib/api-spec && pnpm codegen`. Produces `useGetRepDashboardMe`, `useGetRepDashboardKpiConfig`, `useUpdateRepDashboardKpiConfig` hooks in `lib/api-client-react/src/generated/api.ts` plus zod types in `lib/api-zod/src/generated/types/`.

### Frontend

**6. Rebuild `artifacts/commissions/src/pages/RepView.tsx`**:

- Today, RepView is mounted directly without a `TenantProvider` (`App.tsx:52-69`). It only has access to `accessibleTenants` from `useAuthContext`. For reps, pick the first (and typically only) `accessibleTenants[0].id` as `tenantId` — no provider needed for a single-tenant rep. (Reuse the auth-only shell rather than adding `TenantProvider`, which is admin-shaped.)
- State: `[periodType, setPeriodType]` and `[periodKey, setPeriodKey]`, defaulting to `("monthly", currentPeriodKey("monthly"))` from `lib/periods.ts`.
- Layout (mirror `Dashboard.tsx:147-187`):
  - Header: greeting (`Hi, {displayName}`), `<PeriodPicker>`, logout button.
  - KPI grid: render only the cards listed in `summary.enabledKpis`, in that order. Each KPI has a label/icon/value mapping defined once in a small `repKpiCatalog.ts` lookup. Use `formatCurrency` from `lib/format.ts` and a new `formatPercent` helper.
  - Attainment progress bar (always shown when `quota != null`): full-width Progress component from shadcn, capped visually at 100%+ with an over-quota indicator.
  - Ranking card: "You're #{rank} of {peerCount}". Hide when `rank == null`.
  - Forecast card: projected earning, pace vs quota (positive=ahead, negative=behind), days remaining.
- Empty/unset states:
  - `quota == null` → muted card: "Your quota for this period isn't set yet. Ask your admin to set it in Manual Inputs."
  - `earnedInPeriod === 0 && commissionByState.accrued === 0` → muted card: "No commission activity in this period yet."
  - Hide attainment + ranking when `quota == null` (state will be `no_quota`).
- Hook usage pattern: copy from `Dashboard.tsx:17-22` (enabled guard + `getGetRepDashboardMeQueryKey`).

**7. Admin KPI display config UI**:

Add a small section to `artifacts/commissions/src/pages/Dashboard.tsx` (or a new `Settings.tsx` if one already exists for tenant config — check siblings of `Dashboard.tsx` first; if not, inline in Dashboard.tsx under a collapsible card titled "Rep Dashboard KPIs"). Render a checkbox list against the same `KPI_KEYS` enum, persist via `useUpdateRepDashboardKpiConfig`. Show only to users with `effectiveRole === "admin"` or operators.

### Access + states wrap-up

- `App.tsx` routing already isolates reps to `RepView` — no change.
- The new RBAC guard prevents reps from reading other reps' data.
- Reps reading `kpi-config` is allowed (read-only).
- All empty/unset states handled in step 6.

## Critical files

- `artifacts/api-server/src/lib/rbac.ts` — add `requireTenantAccessOrSelfRep`
- `artifacts/api-server/src/lib/repMetrics.ts` — **new**, extracts leaderboard computation + adds projection helper
- `artifacts/api-server/src/routes/repDashboard.ts` — **new**, three endpoints
- `artifacts/api-server/src/routes/reports.ts` — refactor leaderboard handler to call the shared helper (no behavior change)
- `artifacts/api-server/src/routes/index.ts` — register new router
- `lib/db/src/schema/repDashboardConfig.ts` — **new** table
- `lib/db/src/schema/index.ts` — export new table
- `lib/api-spec/openapi.yaml` — add tag, 3 paths, 4 schemas
- `lib/api-client-react/src/generated/*` + `lib/api-zod/src/generated/*` — regenerated
- `artifacts/commissions/src/pages/RepView.tsx` — rebuild
- `artifacts/commissions/src/lib/repKpiCatalog.ts` — **new**, KPI key → label/icon/formatter mapping
- `artifacts/commissions/src/pages/Dashboard.tsx` (or new `Settings.tsx`) — admin KPI config card

## Reusable pieces (don't rebuild)

- `PeriodPicker` — `artifacts/commissions/src/components/reports/PeriodPicker.tsx:23`
- Period utilities — `artifacts/commissions/src/lib/periods.ts` (`currentPeriodKey`, `periodKeyOptions`, `formatPeriodKey`)
- KPI card layout — `Dashboard.tsx:147-187`
- Loading skeleton + "Failed to load" patterns — `Dashboard.tsx:41-64`
- Empty-state styling (`border-dashed text-muted-foreground`) — `Dashboard.tsx:134-145`
- `formatCurrency` — `artifacts/commissions/src/lib/format.ts`
- Leaderboard SQL — `reports.ts:88-153` (extracted into `repMetrics.ts`)
- Payroll per-person aggregation — `insights.ts:127-148`
- Auth context + `effectiveRole` — `contexts/AuthContext.tsx:84`

## Verification

1. **DB migration**: `cd lib/db && pnpm drizzle-kit generate && pnpm drizzle-kit migrate` (or whatever the existing workflow is — match what `lib/db/src/schema/people.ts` uses). Confirm `rep_dashboard_config` exists with `psql`.
2. **Codegen sanity**: After `pnpm codegen`, grep `useGetRepDashboardMe` in `lib/api-client-react/src/generated/api.ts` — should be present.
3. **Backend unit checks**: Add tests next to existing ones (find via `find artifacts/api-server -name "*.test.ts"`) covering:
   - Rep can call `/me` and gets only their own personId.
   - Rep calling `/me?personId=<other>` is ignored — server uses authContext personId.
   - Rep with no quota → `state: "no_quota"`, `rank: null`, `attainmentPct: null`.
   - Admin PUT kpi-config validates against `KPI_KEYS` and rejects unknown keys with 400.
   - Rep PUT kpi-config → 403.
4. **End-to-end manual smoke**:
   - Start dev stack (`pnpm dev` from repo root, or match the existing run pattern).
   - As admin (existing seeded user), set quota for a rep via Manual Inputs, set KPI config to include `paid` + `projectedEarning`.
   - Sign in as that rep (or impersonate via the existing auth shim if there is one — check `replit-auth-web`). Land on RepView. Verify KPI grid shows the configured set, attainment bar reflects quota math, ranking matches what the admin Leaderboard view shows for the same period, and switching `periodType`/`periodKey` re-fetches.
   - Empty-state checks: a fresh rep with no entries should see the "no activity yet" card; a rep with no quota should see the "quota not set" card and have ranking hidden.
5. **RBAC negative checks** (curl with two session cookies, one admin + one rep):
   - Rep GET `/tenants/<otherTenantId>/rep-dashboard/me` → 403.
   - Rep PUT `/tenants/<ownTenantId>/rep-dashboard/kpi-config` → 403.
   - Admin GET `/tenants/<ownTenantId>/rep-dashboard/me?personId=<rep>` → 200.

## Out of scope (per spec)

- Detailed per-period statement with formula + deal data (task #21).
- Dispute/discussion channel (task #22).
- Pipeline-weighted forecast tuning (plan-design enhancements task).
