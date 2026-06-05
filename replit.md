# Commission System (Boolean Automation)

Multi-tenant commission calculation and lifecycle platform — an operator dashboard for Boolean Automation. Launch tenant: Paragon Painting Atlanta. It owns commission calculation and lifecycle in its own Postgres DB and is designed to read job/people data from a per-tenant source (Airtable, deferred for the first build).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/commissions run dev` — run the web dashboard (Vite)
- `pnpm --filter @workspace/scripts run seed` — (re)seed the Paragon tenant (idempotent)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks + Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

To recompute commissions for a tenant: `POST /api/tenants/:tenantId/recompute`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Web: React + Vite + React Query (generated hooks)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)

## Where things live

- API contract (source of truth): `lib/api-spec/openapi.yaml`
- Generated Zod schemas / hooks: `lib/api-zod` (import via `@workspace/api-zod`)
- DB schema: `lib/db/src/schema/*.ts` (8 tables; barrel `index.ts`)
- Rule engine: `artifacts/api-server/src/lib/engine.ts`
- Rule module catalog: `artifacts/api-server/src/lib/ruleCatalog.ts`
- Serializers (DB row → API shape): `artifacts/api-server/src/lib/serialize.ts`
- API routes: `artifacts/api-server/src/routes/*.ts`
- Web app: `artifacts/commissions/src`
- Seed: `scripts/src/seedParagon.ts`

## Architecture decisions

- Commission entries are recomputed idempotently. Rule-derived entries carry a `dedupeKey` (`${ruleInstanceId}:${jobId}:${personId}:${type}`); recompute creates/updates only those and never touches manual entries (`sourceKind: "manual"`, no dedupeKey).
- Recompute preserves lifecycle state (e.g. a `paid` entry stays paid); it only updates the amount + computation snapshot, emitting a `recomputed` audit event when the amount changes.
- Every state transition and adjustment writes an immutable `commission_events` row (the audit log).
- The GP Gatekeeper is applied inside the engine: jobs below the GP floor still produce a zero-dollar gated entry (auditable), rather than being silently dropped.
- API timestamp fields are serialized to ISO strings before Zod response parsing (response schemas type timestamps as `string`).
- Recompute reconciles removals: rule-derived entries no longer produced (rule disabled, job cancelled) are voided (or clawed back if already paid); if they become desired again they are reactivated to accrued. A unique index on `(tenant_id, dedupe_key)` enforces idempotency at the DB level.
- **Auth + 4-tier RBAC** (Replit Auth / OIDC). Roles live in a `memberships` table: `super_operator` ("Boolean Super Admin", all tenants + sole role that can grant/revoke `platform_operator`; `tenantId` null), `platform_operator` ("Boolean Admin", Boolean Automation staff, all tenants; `tenantId` null), `admin` ("Company Admin", own tenant), `rep` (own data, read-only placeholder; `personId` links to a `people` row). Both operator tiers set `isPlatformOperator` true (full all-tenant access); only `super_operator` sets `isSuperOperator`. First-ever logged-in user is bootstrapped to `super_operator` (prevents lockout + can seed other operators). On login a user with no memberships is rep-auto-linked by case-insensitive `user.email` → `people.email`. Provisioning **only** ever creates `super_operator` (bootstrap) or `rep` (auto-link); `admin` is granted via the Access API/UI (operator/admin), and `platform_operator` ("Boolean Admin") is granted/revoked **only** by a `super_operator` via `/operators`. Operator memberships are global (`tenantId` null) and managed via the tenant-independent `/operators` routes (not the per-tenant `/members` routes). Guards: `requireAuth` (attaches `req.authContext`), `requireOperator` (either operator tier), `requireSuperOperator`, `requireStaff`, `requireTenantAccess` (operator OR admin of `:tenantId`; reps never pass). A `super_operator` row cannot be removed via `/operators` (protected). Sessions are server-side rows keyed by an opaque `sid`, accepted via the `sid` cookie or `Authorization: Bearer <sid>`.
- `GET /tenants` is auth-only (not operator-only) and filters by accessible tenants (operator → all, admin → own) so the web tenant switcher works for both; reps get an empty list (they use the rep view, not the switcher).
- The commission by-ID routes (`/commissions/:entryId` GET/PATCH, transition, events) enforce access inline via `hasTenantAccess` after loading the entry's `tenantId` (events loads the entry first to know its tenant). These are now tenant-scoped against the resolved auth context.
- Renaming a tenant (`PATCH /tenants/:id`) updates only the display `name`; the `slug` stays stable so existing lookups and the seed's idempotency key keep working.
- Deleting a tenant (`DELETE /tenants/:id`) removes all dependent rows (schema mapping, people, jobs, plans, rule instances, commission entries + events) in one transaction — there are no DB-level FK cascades, so the order is explicit. The `paragon-atlanta` slug is server-side protected (403); the UI additionally requires confirm-by-typing the company name.

## Product

- Operator dashboard: summaries (accrued/payable/paid/clawed-back), top earners, activity feed.
- Commission ledger with states accrued → payable → paid → clawed_back/voided/disputed, filtering, and per-entry detail with computation snapshot + immutable audit log.
- Configurable rule module library; per-tenant commission plan composed of rule instances with editable params.
- Per-tenant schema mapping (canonical fields → source/Airtable field names).
- Payroll summary grouped by earner; one-click recompute.

## User preferences

_Populate as you build._

## Gotchas

- The API server is an esbuild bundle — **restart the `api-server` workflow after editing route/lib files** for changes to take effect.
- Do not re-export the generated types barrel from `lib/api-zod/src/index.ts` (only `export * from "./generated/api"`); re-exporting types causes a TS2308 name collision between path-param and query-param `*Params` schemas.
- Response Zod schemas expect timestamps as strings — call `.toISOString()` in serializers before `.parse()`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
