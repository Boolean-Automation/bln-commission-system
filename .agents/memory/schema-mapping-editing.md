---
name: Schema mapping editing
description: Data-integrity rule when editing a tenant's source (Airtable) schema mapping from any UI.
---

# Editing source schema mappings

When a UI lets the user change the **source table** for an entity (job/person/etc.),
it MUST reconcile the per-field column mappings against the newly selected table's
columns — clear any `airtableFieldName` that doesn't exist in the new table.

**Why:** the schema-mapping PUT replaces the whole `entities` array, and the backend
sync (`airtableSync.ts` `buildFieldMap`) trusts `mapped && airtableFieldName`. If a
required canonical field (e.g. `jobNumber`) points at a column that doesn't exist in
the chosen table, sync silently reads `undefined`, upserts 0 rows, and the prune step
can delete previously mirrored rows. Validation that only checks "required && empty"
is not enough — it must also check the mapped column is present in the selected table.

**How to apply:** on table change, intersect existing field column names with the new
table's columns and null out the rest; block Save until every required field maps to a
column that exists in the selected table. After a Save&Sync, invalidate broadly
(recompute touches dashboard/ledger/payroll/activity, not just jobs).
