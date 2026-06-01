---
name: Onboarding wizard e2e testing playbook
description: How to reliably e2e-test the new-company onboarding wizard (disposable tenant, ledger-populate assertion, cleanup).
---

# Onboarding wizard e2e testing playbook

The only e2e mechanism in this project is the Playwright `runTest` subagent (testing skill); there is no committed test framework. Drive the wizard through the sidebar company switcher → "Add company".

## Reliably populating the ledger
- Add the **Tiered YTD Rate** (`tiered_ytd_rate`) rule with **default params**. Its default `positions[0].position` is `""`, and the engine falls back to `positions[0]` for ANY salesRep matched to a synced person — so it emits one SL entry per non-cancelled job whose `salesRep` matches a person `name`. This is the most robust single rule for a "ledger populates" assertion.
- **Why:** other library rules with default params depend on specific positions/roles/lead-sources in the real Airtable data, which is unknown and may yield zero entries.

## The working schema mapping
- Replicate the exact canonical→Airtable column mapping in `scripts/src/seedParagon.ts` (the `entities` array). Required fields that must be mapped for validity: People = `name`, `position`; Jobs = `jobNumber`, `salesRep`, `totalAmount`, `gpAmount`, `gpPct`. Notable column names: position→"Company Position (No Abbr.)", totalAmount→"Total Job Amount", gpAmount→"Gross Profit $", gpPct→"Gross Profit %", salesRep→"Sales".

## Timing
- "Finish & sync" does a **live Airtable import of the full base (~56 people, ~400 jobs) and takes 20-40s**. Wait for the "Company is ready" toast; do not assume failure early. A single transient sync failure on first call has been observed — a retry succeeds.

## Cleanup (no FK cascade)
Delete child rows before parents, scoped to the disposable tenant (use a unique name like `ZZZ E2E <rand>`), in this order:
`commission_events → commission_entries → rule_instances (via plan id) → commission_plans → schema_mappings → jobs → people → tenants`.

**Never touch the live Paragon tenant** `8ca5be44-60fa-488e-ab3c-23fd84b848dc`.

## Fast pre-flight via API
Before a UI run, you can validate the whole flow headless with curl against `localhost:80/api`: POST `/tenants` → PUT `/tenants/:id/airtable-base` → PUT `/tenants/:id/schema-mapping` → POST `/tenants/:id/rule-instances` → POST `/tenants/:id/sync` → GET `/tenants/:id/commissions`.
