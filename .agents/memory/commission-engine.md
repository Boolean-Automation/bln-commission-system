---
name: Commission engine conventions
description: Non-obvious constraints when extending the commission rule engine / catalog (custom rules, percent storage).
---

# Commission engine conventions

## Custom-rule entries reuse the "MSC" CommissionType
Custom (UI-built-from-scratch) rules emit ledger entries with `type: "MSC"`.

**Why:** The ledger response Zod schema validates `type` against the fixed `CommissionType`
enum. There is no dedicated "custom" type, so MSC (miscellaneous) is the only existing value
that fits. Inventing a new type would require an enum + schema + DB migration change.
**How to apply:** When adding more from-scratch / catch-all rule kinds, reuse MSC (or add a
new enum value across openapi + drizzle schema + serializers in lockstep) — do not emit a raw
string, or the response `.parse()` will throw.

## Percent params are stored as decimals, displayed ×100
Rate-style params (e.g. `0.0075`) are persisted as decimals; the form layer multiplies by 100
for display and divides on store (with rounding to kill float noise).
**Why:** The engine math expects decimals; showing `0.75%` to operators is friendlier.
**How to apply:** Any new percent field must use the `percent` FieldDef type (handled by the
generic renderer) rather than a plain number, so the ×100/÷100 conversion stays consistent.

## Form-driven rule catalog
Rule modules expose `builder` ("fields" | "custom"), typed `fields: FieldDef[]`, and
`defaultParams`. The web Plan builder renders entirely from this metadata — no raw JSON editor.
**How to apply:** To add a new built-in rule, add a module with field metadata + defaultParams
and an engine branch keyed by module key; the UI needs no per-rule code. The `custom` module
is special-cased to the `CustomRuleBuilder` component.

## Rule param validation is shared (`@workspace/rule-validation`)
One metadata-driven `validateRuleParams(module, params)` is the single source of truth, called
by both the API (reject on create/update) and the web builder (block save, list messages).
**Why:** api-server and the commissions web app can't import each other (leaf packages), so the
validator lives in a lib to avoid drift between client and server checks.
**How to apply:** Add new field-level or custom-rule rules to that lib only; both sides pick it
up. Built-in fields validate from `FieldDef` metadata; custom rules have bespoke structural
checks (recipient/conditions/calculation/tier ordering).

## Engine must read rule instances ordered by orderIndex
`recomputeTenant()` loads instances with `.orderBy(ruleInstancesTable.orderIndex)`.
**Why:** Rule order is user-controllable (reorder endpoint) and matters for order-sensitive
selection (e.g. gatekeeper / `enabled.find(...)`); an unordered query makes results
nondeterministic and silently ignores reordering.
