---
name: Benchmark reconciliation
description: The reference-only invariant for source-provided commission benchmark figures and how computed-side totals must mirror payroll.
---

# Benchmark reconciliation (source figures vs computed)

The tenant data source (e.g. Airtable People) carries its own commission figures —
Commission Owed, Total Earned, Total Paid, Total Adjustments. We read them purely to
show a side-by-side sanity comparison against our engine-computed per-person totals.

**Invariant — these benchmark values are REFERENCE-ONLY.** They must NEVER feed the
engine, ledger, dashboard, or payroll. They are stored on `people` in their own columns
and read only by the reconciliation endpoint.

**Why:** the benchmark is a migration-time cross-check against the source-of-truth
spreadsheet; letting it influence computed math would defeat the purpose and corrupt
the ledger. **How to apply:** any new consumer of these columns must be display-only.

## Two durable design points
- **Computed-side definitions must mirror payroll/ledger, not be reinvented:** netOwed =
  accrued+payable; totalEarned = non-terminal (not voided/clawed_back) sum; paid = paid
  sum; adjustments = current amount of manual entries + net of `manually_adjusted` edits
  on rule-derived entries (manual entries excluded from the second term to avoid
  double-counting).
- **New optional canonical mapping fields need a forward-fill, not just a default:**
  brand-new tenants get fields from the defaults at creation, but existing tenants have a
  persisted mapping. Merge missing canonical fields from current defaults when *returning*
  the mapping so operators can map newly added fields without a migration; they persist on
  next save. Applies to any future canonical-field addition, not just benchmark.
