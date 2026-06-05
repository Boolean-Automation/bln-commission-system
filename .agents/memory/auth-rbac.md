---
name: Auth + RBAC conventions
description: Durable decisions for the Replit-Auth/OIDC + 3-tier RBAC layer — which architect findings are intentional skill-template patterns vs. real bugs.
---

# Auth + RBAC

3-tier RBAC via a `memberships` table: `platform_operator` (all tenants, `tenantId` null), `admin` (own tenant), `rep` (own data, `personId` → people row). Sessions are server-side rows; the `sid` is accepted via the `sid` cookie OR `Authorization: Bearer <sid>` (handy for scripted e2e — forge a `sessions` row with `sess` jsonb `{user, access_token}` + future `expire`).

## Architect findings that are INTENTIONAL (do not "fix")
- **Header-derived OIDC origin** (`getOrigin` uses `x-forwarded-proto`/`x-forwarded-host`) and **session treated valid when `expires_at` missing** (`refreshIfExpired`) are **verbatim from the sanctioned `replit-auth` skill template**, designed for Replit's trusted proxy.
- **Why:** the real OIDC callback always sets `expires_at` (`tokens.expiresIn()`), and the DB-level `expire` (7-day TTL) is the backstop. Deviating risks breaking the auth flow and exceeds scope.
- **How to apply:** if an architect/review flags these, leave them — they are the official Replit pattern, not a bug in our code.

## Real fix that WAS needed (operator bootstrap idempotency)
- The `(user_id, tenant_id)` unique index does NOT dedupe operator rows because operator `tenantId` is NULL and NULLs are distinct in a Postgres unique index → `onConflictDoNothing` was a no-op for the bootstrap path.
- Fix: a partial unique index on `user_id WHERE role = 'platform_operator'` makes the bootstrap insert actually dedupe under concurrent first-logins.
- **Why:** "first-ever user becomes operator" is a bootstrap invariant; without the partial index, concurrent same-user logins could create duplicate operator rows. Multiple *different* operators are still allowed by design (Boolean Strategies staff), so no global single-operator constraint.

## Provisioning rule
- `provisionMemberships` ONLY ever creates `platform_operator` (bootstrap) or `rep` (email auto-link). `admin` is granted **solely** through the Access management API/UI — never auto-provisioned. If you see an admin membership appear, it came from the Access UI, not login.
