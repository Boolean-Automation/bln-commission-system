# Commission System (Boolean Strategies)

Multi-tenant commission calculation and lifecycle platform — an operator dashboard for Boolean Strategies. Launch tenant: Paragon Painting Atlanta. It owns commission calculation and lifecycle in its own Postgres DB and is designed to read job/people data from a per-tenant source (Airtable, deferred for the first build).

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
- **Auth is deferred** (per project scope). The API is currently unauthenticated and the by-ID routes (`/commissions/:id`, `/rule-instances/:id`) are not tenant-scoped — there is no auth/tenant context to scope them against yet. Tenant scoping on these routes must be added together with authentication.

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
