---
name: Manual inputs (Quotas & Targets) module
description: Admin-set per-rep quota/OTE/accelerator targets per period; storage, period keys, and the named-variable contract for downstream features.
---

# Manual inputs (Quotas & Targets)

Admins set, by hand, each rep's **quota, OTE, accelerator threshold, accelerator multiplier** (+ optional notes) for a period. Stored durably per tenant, editable inline (upsert), auditable, and exposed as named variables for downstream attainment/forecast/leaderboard work.

## Period keys (the contract that ties everything together)
- `monthly` → `"YYYY-MM"`, `quarterly` → `"YYYY-Qn"`, `annual` → `"YYYY"`.
- The **server derives** `effectiveFrom`/`effectiveTo` from the key (inclusive range covering the period); clients send only `periodType` + `periodKey`. Validation rejects keys that don't match their type.
- The web period dropdown intentionally only offers a window of periods around today (~12 months / 8 quarters / a few years), so far-future/far-past keys aren't selectable in the UI even though the API accepts any valid key. **When e2e-testing, pick an in-window period**, not a far-future one.

## Storage & audit
- Uniqueness is per `(tenant, person, periodType, periodKey)` — saving the same cell again is an **upsert**, never a duplicate row.
- Money values are plain dollar numbers (doublePrecision), unlike rule percent params which are decimals.
- Every create/update/delete writes an audit row mirroring the commission_events pattern (before/after/actor). `manual_input_events` has **no `period_key` column** — filter/clean it by `manual_input_id`.

## Named-variable contract
- `GET /tenants/:id/manual-input-variables?periodType=&periodKey=` returns **one entry per active person** (null values when unset), so downstream consumers get a complete, stable shape rather than a sparse map.

## Audit actor identity
- This module introduced `auditActor(ctx)` (rbac.ts): real user email > name > "operator". New audit-writing routes should use it instead of hardcoding "operator".
