---
name: Tenant lifecycle (rename / delete)
description: How tenant rename and cascade-delete work, and why deletion is a manual explicit transaction.
---

# Tenant rename & delete

## Rename
Rename updates only the display `name`. The `slug` stays stable.

**Why:** the slug is used as a lookup/idempotency key (e.g. the seed deletes by
`slug = "paragon-atlanta"`); regenerating it would break those references.

## Delete (cascade)
The schema has **no DB-level FK cascades** — dependent tables carry a `tenant_id`
column but no `references(... onDelete: "cascade")`. So deleting a tenant must
remove every dependent row explicitly, inside one transaction.

`rule_instances` is the one table that does NOT have `tenant_id`; it links to the
tenant via `plan_id` → `commission_plans`. Resolve the tenant's plan ids first,
then delete rule instances by `inArray(planId, ...)`.

Tables to clear (in a safe order): rule_instances → commission_events →
commission_entries → commission_plans → jobs → people → schema_mappings → tenants.

## Protection
The live launch tenant (`slug = "paragon-atlanta"`) is protected from deletion
server-side (returns 403). The web UI additionally gates deletion behind
confirm-by-typing the exact company name.

**How to apply:** if you add a new per-tenant table, add it to the delete
transaction or tenant deletes will leave orphan rows.
