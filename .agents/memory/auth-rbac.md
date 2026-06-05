---
name: Auth + RBAC conventions
description: Durable decisions for the Replit-Auth/OIDC + 4-tier RBAC layer — operator tier semantics, which architect findings are intentional skill-template patterns, and the response-contract trap.
---

# Auth + RBAC

4-tier RBAC via a `memberships` table: `super_operator` ("Boolean Super Admin"), `platform_operator` ("Boolean Admin"), `admin` ("Company Admin", own tenant), `rep` (own data, `personId` → people row). Both operator tiers have `tenantId` null and full all-tenant access; the auth context exposes `isPlatformOperator` (true for either operator tier) and `isSuperOperator` (super only). Sessions are server-side rows; the `sid` is accepted via the `sid` cookie OR `Authorization: Bearer <sid>` (handy for scripted e2e — forge a `sessions` row with `sess` jsonb `{user, access_token}` + future `expire`).

## Operator-tier privilege boundary
- Only `super_operator` may grant/revoke `platform_operator` ("Boolean Admin") — the `/operators` POST/DELETE routes are guarded by `requireSuperOperator`; `GET /operators` is `requireOperator` (both tiers can view). A `super_operator` row is never deletable via `/operators`.
- `platform_operator` cannot self-escalate: the tenant-member (`/members`) schemas only permit `admin|rep`, and operator grants live on the separate `/operators` routes.
- **Why:** keeps "who can mint all-tenant admins" to a single trusted tier without a global single-operator constraint (multiple Boolean staff still allowed).

## The auth-context response-contract trap (bit us once)
- `AuthContext` in OpenAPI is parsed with `GetAuthContextResponse.parse(...)` in the `/me` handler. Adding a **required** field to the schema (e.g. `isSuperOperator`) WITHOUT also adding it to the `/me` payload makes `/me` throw → 500 → frontend role gating silently breaks.
- **How to apply:** any new required field on `AuthContext` must be added in lockstep to the `/me` handler's `.parse({...})` object, not just to `resolveAuthContext`.

## Architect findings that are INTENTIONAL (do not "fix")
- **Header-derived OIDC origin** (`getOrigin` uses `x-forwarded-proto`/`x-forwarded-host`) and **session treated valid when `expires_at` missing** (`refreshIfExpired`) are **verbatim from the sanctioned `replit-auth` skill template**, designed for Replit's trusted proxy.
- **Why:** the real OIDC callback always sets `expires_at` (`tokens.expiresIn()`), and the DB-level `expire` (7-day TTL) is the backstop. Deviating risks breaking the auth flow and exceeds scope.

## Bootstrap + provisioning rule
- First-ever logged-in user is bootstrapped to `super_operator` (prevents lockout + lets them seed other operators). A partial unique index per operator role on `user_id` makes the bootstrap insert dedupe under concurrent first-logins (operator `tenantId` is NULL and NULLs are distinct in a plain unique index, so `onConflictDoNothing` alone is a no-op for that path).
- `provisionMemberships` ONLY ever creates `super_operator` (bootstrap) or `rep` (email auto-link). `admin` is granted via the Access API/UI; `platform_operator` is granted only by a `super_operator` via `/operators`. Neither is ever auto-provisioned on login.
