---
name: Commission System architecture
description: Durable design rules for the multi-tenant commission engine, recompute, and audit log.
---

# Commission System (Boolean Strategies)

Multi-tenant: each tenant owns commission calc + lifecycle in Postgres; job/people data is
meant to come from a per-tenant source (Airtable, deferred). Launch tenant: Paragon Painting Atlanta.

## Recompute idempotency (the core invariant)
Rule-derived commission entries carry a `dedupeKey` = `${ruleInstanceId}:${jobId}:${personId}:${type}`.
**Why:** recompute must be safe to run repeatedly without duplicating or stomping operator work.
**How to apply:**
- Recompute only creates/updates entries that have a dedupeKey. Manual entries (`sourceKind: "manual"`, dedupeKey null) are never touched.
- On update, preserve the lifecycle `state` (a `paid` entry stays paid); only amount + computationSnapshot change, and only then emit a `recomputed` audit event.
- GP Gatekeeper runs inside the engine: jobs below the GP floor still produce a zero-dollar *gated* entry (auditable), not a dropped row.

## Reconciliation (removal + reactivation)
Recompute is a full reconciliation against the *currently desired* rule-derived set, not just an upsert.
**Why:** disabling a rule / cancelling a job must retire stale entries, and re-enabling must bring them back — without duplicating rows or losing audit history.
**How to apply:**
- Desired entry with no prior row → insert as `accrued`.
- Desired entry whose prior row is terminal (`voided`/`clawed_back`) → **reactivate** to `accrued` (restore amount, clear `clawedBackAt`, emit `state_change`). This must run BEFORE the amount-diff check, otherwise gated `$0` entries (amount unchanged) stay stuck voided.
- Desired entry, non-terminal prior, amount changed → update amount only, preserve state, emit `recomputed`.
- Prior rule-derived row no longer desired → void if unpaid, clawback if already paid; leave already-terminal rows alone.
- Enforced by a unique index on `(tenant_id, dedupe_key)`.
- Each ledger mutation + its audit event are wrapped in one `db.transaction` so the log never drifts from state. Route-level adjust/transition do the same.

## referral_bonus excludeRoles
The `referral_bonus` rule must skip any rep whose roles intersect its `excludeRoles` param. Forgetting this pays referrals to roles that should be excluded (e.g. SL/SM).

## Audit log
Every state transition + manual adjustment writes an immutable `commission_events` row. Never mutate/delete events.

## Restart gotcha
The api-server is an **esbuild bundle** — after editing any route/lib file under `artifacts/api-server/src`, restart the `api-server` workflow or changes won't take effect. Typecheck passing is not enough.

## Seed
`pnpm --filter @workspace/scripts run seed` is idempotent (deletes the Paragon tenant by slug `paragon-atlanta` then re-inserts). Recompute is triggered separately via `POST /api/tenants/:id/recompute`, not inside the seed (engine lives in api-server, not a lib, so the seed avoids importing it).
