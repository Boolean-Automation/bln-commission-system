---
name: Paragon Airtable data semantics
description: Non-obvious facts about the Paragon Painting Airtable base (appoMG3V2gfaN2dEo) that drive commission logic — job cancellation and YTD Sales.
---

# Paragon Airtable semantics

## Job cancellation must come from project statuses, not Job Status
The Jobs table `Job Status` field only has values **New | Open | Closed** — it never
signals cancellation. So any regex on Job Status for "cancelled" can never fire.
Cancellation must be derived from the Jobs table `Project Status(es) Rollup` field,
which concatenates the statuses of all child Projects.

Project Status values: New | On Hold | Scheduled | Ready | In Progress | Work Complete | Job Costed | Cancelled | Closed.

**Rule (per operator):** a job is cancelled when ALL its projects are inactive AND
none are completed/job-costed/closed. Implemented as: cancelled = no project status
in ACTIVE {new, on hold, scheduled, ready, in progress} AND none in COMPLETED
{work complete, completed, job costed, closed}. In practice this means every project
is "Cancelled". A mixed rollup like "Cancelled, Job Costed" is NOT cancelled (it has
real revenue from the job-costed project).

**Why:** the Job-level status carries no cancellation; only the project rollup does.
**How to apply:** lives in `airtableSync.ts deriveCancelled()`, fed by the
`projectStatuses` canonical job-mapping field → "Project Status(es) Rollup". A tenant
mapping missing `projectStatuses` falls back to a job-status regex and will under-detect
cancellations — ensure the field is mapped.

## YTD Sales is computed in-system, not synced from Airtable
YTD Sales = sum of `totalAmount` over non-cancelled jobs the person sold (matched on
`salesRep` == person.name) whose won/signed date is in the current calendar year.
Computed in `engine.ts computeYtdSales()` inside `recomputeTenant` (runs on every sync
and every POST /recompute), persisted to `people.ytdSales`, consumed by the
`tiered_ytd_rate` rule for tier selection.

Year is parsed from `signedDate` (Won Date), falling back to `completedDate` — both are
stored as display-string text (e.g. "5/28/2026 4:09pm"), so year is extracted via
`/\b(20\d{2})\b/`, not Date parsing.

**Why:** operator said YTD is hard to compute in Airtable; engine is now the single
source of truth (the Airtable `ytdSales` sync was removed).

## Position uses the FULL label ("Company Position (No Abbr.)"), not the abbreviation
`position` is mapped to Airtable's **"Company Position (No Abbr.)"** field, giving clean
full labels: "Sales Level 1", "Sales Level 2", "Sales Manager", "Project Manager 1",
"Production Manager 1". The operator confirmed the abbreviation (in the other "Company
Position" field, e.g. "Sales Level 2 (SL2)") was only a convenience for Airtable formulas
and should NOT be used.

Commission rule tier tables (`tiered_ytd_rate.params.positions[].position`) are therefore
keyed by the SAME full label ("Sales Level 1", "Sales Level 2"). Matching is a normalized
(lowercase+trim) compare via `engine.ts normalizePosition()` — NOT abbreviation extraction.

**Why:** an exact match between the rep's position and the tier-table key is required;
a mismatch silently falls back to the first tier table (positions[0]) and mis-pays reps.
**How to apply:** if the rule tier keys and the mapped position field ever diverge in form
(abbr vs full), SL reps get mis-tiered. Keep both on the full no-abbr label. `sm_cut` uses
a case-insensitive substring match (`positionContains: "sales manager"`) which works on
the full label too.
