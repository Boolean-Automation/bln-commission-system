---
name: Per-rule job exclusions
description: How per-rule "exclude by person/role" works and why the role UI source differs from engine matching.
---

# Per-rule job exclusions

Exclusions live on `rule_instances.appliesTo` (jsonb) as
`{ excludePeople: string[], excludeRoles: string[] }`. No migration was needed —
`appliesTo` already existed, was serialized, and is in the OpenAPI contract.

**Rule:** Enforcement is ONE cross-cutting check per rule instance
(`isJobExcluded`) at the top of the per-instance loop in the engine, so it
applies uniformly to every rule module (no per-module duplication). Matching is
case/whitespace-insensitive: `excludePeople` matches `job.salesRep` and
`job.manager`; `excludeRoles` resolves those people and checks their `roles[]`
**and** `position`.

**Why the UI role source differs from the engine:** the "Exclude roles"
multi-select is sourced from configured Positions (`usePositionNames`), but the
engine also matches raw `people.roles[]` codes. This is intentional — Positions
are the operator-facing "role" concept in this product. The engine stays more
permissive (honors role codes too) so saved exclusions keep working even if a
code isn't a configured position.

**How to apply:** Recompute interaction is automatic — an excluded job stops
producing desired entries for that instance, so existing reconciliation
voids/claws-back; clearing exclusions reactivates to accrued (dedupe keys
unchanged). Verified end-to-end on a throwaway tenant.
