---
name: Re-seed creates a new tenant id
description: Why "Tenant not found" appears after re-running the Paragon seed, and how the frontend must cope.
---

Running `pnpm --filter @workspace/scripts run seed` provisions a **fresh tenant id**
each time (it does not reuse the prior tenant's UUID). The old tenant's synced data
is discarded; the new tenant starts from seed and must be re-synced.

**Why this bites:** the web app caches/holds the previously selected tenant id. After a
re-seed that id no longer exists, so any call scoped to it (e.g. Sync Now) returns
`Tenant not found`.

**How to apply:** TenantContext must re-select a valid tenant whenever the currently
selected id is absent from the live tenants list — never only on first load. Do not
hardcode a tenant id anywhere in the frontend; always resolve from the live list.
