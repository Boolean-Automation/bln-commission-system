---
title: "Roll Call Painting — Commission System Overhaul (Master Plan)"
type: client-plan
client: roll-call-painting
owner: cody
status: phase-1-active
created: 2026-04-30
last_reviewed: 2026-04-30
review_cadence: 14
authors: [cc, marshall, rory, norman, luke]
authority: cody
supersedes:
  - clients/roll-call-painting/christine-bonus-system-plan.md
  - (informal) "FIX IT RIGHT NOW plan" status updates from 2026-04-30 chat
related:
  - audits/2026-04-30-christine-bonus-runlog.md (Phase A + Phase B execution)
  - audits/2026-04-30-brandon-reconciliation.md (Heidi's Brandon discrepancy diagnosed)
  - audits/2026-04-30-context-snapshot.md (Luke's RCL context)
  - audits/2026-04-30-orphaned-commissions-snapshot.json (50-record pre-state)
  - audits/2026-04-30-christine-phantom-cleanup-snapshot.json (6-record pre-state)
roundtable: 2026-04-30 norman+marshall+rory, 3 rounds, converged on schedule-with-clawback architecture
---

# Roll Call Painting — Commission System Overhaul

> **For humans:** start with the Status Snapshot section. For agents picking up context: read top to bottom. Christine's $25-bonus plan is folded in — there is no separate doc.

## Status Snapshot (2026-04-30)

| Component | State |
|---|---|
| Commission rollup wiring (audit) | ✅ Mapped — `Commissions Earned`, `Total Sales Commission Amount`, and `Compensation Adjustments` all read Commissions table; Bonuses table is dangling/unwired |
| Phantom Christine commission cleanup (6 records) | ✅ Status=Declined, audit Notes per record, snapshot saved |
| Orphan Employee-link backfill (50 PM records) | ✅ /verify + canary + 5 batches; rollup deltas exact match per person ($17,207.98 / $5,046.10 / $6,296.40) |
| Brandon $6,599.61 vs $2,101.97 reconciliation | ⏳ Diagnosed (single rollup field, wrong window) — needs Heidi confirmation on her math |
| Brandon-area duplicate commission records ($1,109.07 over 4 jobs) | ⏳ Surfaced — needs Heidi confirmation before cleanup |
| Christine $25 bonus tracking system (Phase 1) | ⏳ Architecture decided; form construction pending (UI-only, Cody) |
| `Commission Total` formula field | ❌ Not yet created (manual UI step — API can't create formula fields) |
| Rollup retargets (Tier 3 schema writes) | ❌ Not yet executed — batched for Cody approval |
| Broken `Total PM Commissions Amount` rollup rebuild | ❌ Not yet executed — Tier 3 |
| Phase 1.5 detector (YCBM-booking gap-finder) | ❌ Not started — gated on YCBM-bookings-in-Airtable schema recon |
| Phase 2 (Prismatic-driven Christine automation via Flow 07) | ❌ Not started — gated on 4 prerequisites |
| 20 low-confidence orphan commissions | ❌ Deferred — needs Heidi review |

## Background

Roll Call Painting's commission system has accumulated three classes of issues:

1. **Wiring drift.** People rollups inherit from a Commissions table whose Employee links were never reliably populated (script bug). 70 of 818 records were orphaned. Heidi's Brandon dashboard read $6,599.61 vs the correct $2,101.97 — the gap was driven by a single mis-windowed rollup field, plus duplicate records, plus orphaned PM records that had never rolled up.

2. **Phantom records.** A script (still unidentified — investigation paused per Cody) created $0 commission records for Christine on the Linda Kromer job (`260225 Linda Kromer_EXTP`), where she shouldn't have appeared at all. Six total. All status=Approved, all $0, all wrong.

3. **No tracking for Christine's appointment-setter compensation.** Heidi has been computing Christine's $25-per-estimate bonus via averages outside any system. Bus-factor liability — if Heidi takes a vacation, Christine's pay breaks.

This plan addresses all three. Ships in phases. Phase 1 is manual + cleanup; Phase 2 is Prismatic-automated and gated.

## Decisions log

| Decision | Owner | Rationale |
|---|---|---|
| Comp model: schedule-with-clawback ($25 on schedule, reverse on cancel) | Norman | Flow 08 already destructively cancels (deleteQuote/deleteProject/updateDeal/reopenCalendar — 10 fires Apr 17–25). Comp policy should match the system's existing "cancelled = undo" semantics. Incentive alignment: pays for booking work + carries weight on lead quality. |
| Use Commissions table with `Adjustment Amount` field — NOT Bonuses table | Norman (R2 pivot from roundtable consensus) | Pre-flight read showed Compensation Adjustments rollup reads `Commissions.Adjustment Amount`, NOT Bonuses. Bonuses table is linked to People but has zero rollups reading from it — using it would require 2+ Tier 3 writes. The Commissions.Adjustment Amount path is already wired. Marshall's "Commissions schema assumes Sales/PM linkage" objection only applies to the `Commission Amount` formula chain, not to `Adjustment Amount` (purpose-built for non-commission comp). |
| Lock-the-period cancellation pattern | All-three convergence | In-period cancellations: `Status=Declined` + `Adjustment Amount=$0` + Notes preserve original. Post-payout cancellations: NEW Commissions row with `Adjustment Amount=-25`, original stays Approved as audit truth. |
| Phantom 6 records: Status=Declined, NOT delete | Marshall (SOUL §"Void over delete") | Already executed — see runlog Phase A |
| Orphan Employee-link backfill: evidence-based via Manager field | Marshall (R3 census discovery) | Manager field on all 50 records IS authoritative — Cody-confirmed. Backfill Employee = Manager. Already executed — see runlog Phase B |
| Christine never acts as Sales rep | Cody (2026-04-30) | All 6 phantom records were wrong regardless of which field she appeared in |
| Phase 2 timeline: gates, not weeks | Norman | RCL is single client, no fleet; Phase 2 ships when 4 gates clear, not on a calendar |
| Phantom-creating script: investigation paused | Cody (2026-04-30) | "Move on from Kromer" — script audit not in scope this run |

## Architecture: how Christine's $25 bonus flows through the system

```
Christine fills 3-question form (Customer, Estimate Date, Notes)
    ↓
Airtable Automation (form trigger)
    ↓
Creates row in Commissions table (tblaAvWKZZxj0I9md):
    - Employee = Christine (recUpFxiSh6ubId8x)
    - Adjustment Amount = $25
    - Status = Approved
    - Commission Ledger Record Type = Earnings
    - Date, Job link, Notes from form
    - Commission Amount = leave blank (skips Sales/PM formula chain)
    ↓
People.Compensation Adjustments rollup (fldgKblEICa88fzF5)
    ↓ (sums Adjustment Amount across linked Commissions records)
People.Total Compensations Earned formula
    ↓
People.Balance Owed = Earned - Paid
    ↓
People.⚙️ Comp. Form: Commission Payout = max(0, Balance Owed - Base Pay Per Period)
    ↓
Heidi reads this on Christine's record at payroll time
```

**Cancellation path:**
- Heidi (Phase 1) or Flow 08 (Phase 2) flags the record as cancelled
- In-period cancel → `Status=Declined` + `Adjustment Amount=$0` + Notes capture original
- Post-payout cancel → new Commissions row with `Adjustment Amount=-25`, links to original via Notes

## Phase 1 — Manual (current week)

### Phase 1A: Cleanup ✅ DONE

- Phantom Christine cleanup (6 records → Status=Declined). Snapshot + per-record audit Notes.
- Orphan Employee-link backfill (50 PM records → Employee = Manager). $28,550.48 in previously-orphaned PM commission now rolls up correctly across Brandon, Miguel, Jefferson.

### Phase 1B: Christine bonus tracking goes live ⏳ (Cody-gated)

**What's needed:**

1. **Airtable Form** on Commissions table (UI-only — no API path)
   - Visible fields: Customer (Job link), Estimate Date (date), Notes (text)
   - Hidden/defaulted: Employee=Christine, Adjustment Amount=$25, Status=Approved, Commission Ledger Record Type=Earnings
   - Share URL with Christine

2. **Airtable Automation** (UI-only) — fires on form submission
   - When form submitted, update record to set the hidden defaults
   - The automation runs after submission because Airtable forms don't support cross-field defaults natively

3. **Heidi briefing**
   - How to handle in-period cancellations (Status=Declined + Adjustment Amount=$0 + Notes "Cancelled {date}")
   - How to handle post-payout cancellations (create new -$25 row)
   - Frame as bus-factor fix, not new bureaucracy

**Optional Phase 1B+ (Tier 3 schema, my recommendation):**

- Add `Appointment Setter Bonus` choice to `Commission Ledger Record Type` singleSelect (currently: Earnings, Payout). Lets Heidi filter Christine's records cleanly without Notes prefix archaeology.

### Phase 1C: Brandon $1,109.07 duplicate-record cleanup ⏳ (Heidi confirms)

Reconciliation dispatch surfaced 4 duplicate commission records inflating Brandon's all-time total:
- Job `recq85r7KEUYevtmh`: $577.12 charged twice (both Mar 5)
- Job `recUB6Iyqfk3Su8tE`: $370.16 on Apr 1 AND Apr 6
- Job `rec1GtEfEIfhWAxPS`: $76.40 on Apr 1 AND Apr 6
- Job `recczVgtK8LpjgsF2`: $85.39 on Feb 8 AND Apr 6

Action: confirm with Heidi which date is the keeper, Status=Declined the duplicate (not delete). Per "Void over delete." Audit Notes capture rationale.

### Phase 1D: 20 low-confidence orphan cleanup ⏳ (Heidi review)

- 17 records have Job link but no Manager (Heidi can lookup PM from the Job record)
- 3 records have no metadata at all (`rec04M98TJM9Q1k0X`, `recKSsvYUJ2hYjt2T`, `recMkUpwUK0DVK4XW`) — likely test rows from system inception, $0 each. Heidi reviews for keep-or-delete.

## Phase 1.5 — YCBM gap detector (gated)

**Goal:** detect YCBM bookings that don't have a corresponding Christine bonus record within the same period — flag to Slack for manual review.

**Gate:** Marshall schema recon → do YCBM bookings land in Airtable as records? If yes — detector is feasible (~2 hour build). If no — either (a) add a Phase 1.7 Prismatic step to mirror bookings into Airtable, or (b) skip detector in favor of Heidi self-policing weekly review.

## Phase 2 — Prismatic-automated (4 gates, no calendar lock)

### Trigger architecture

Modify Flow 07 ("New Appointment") on RCL Marketing Integration v86 directly. Add an additive write step after successful appointment booking that writes to the Commissions table:
- Employee = Christine
- Adjustment Amount = $25
- Status = Approved
- External Trigger ID = YCBM booking ID (idempotency key)
- Notes = structured payload metadata

Conditional on appointment not marked cancelled. Standard four-artifact ICP /ship, canary on RCL only (no fleet rollout — RCL-specific logic).

### Cancellation handler

Modify Flow 08 ("Appointment Cancelled") OR add a parallel flow that on cancellation:
- Find matching Commissions record by External Trigger ID
- If in-period (before any Payout-type record dated same period) → flip Status=Declined, set Adjustment Amount=$0
- If post-payout → create new Commissions record with Adjustment Amount=-25, Notes link to original

### Phase 2 gates (all 4 must clear before /ship)

1. 30+ days clean Phase 1 manual data → comp model behavior validated under real edge cases
2. Rory pulls one live Flow 07 input payload → confirms Christine identifiable from YCBM appointment data alone (booker identity field, not inferred from meeting type)
3. At least one cancellation edge case observed and handled manually under Phase 1 (in-period AND post-payout, ideally both)
4. ICP §1.5 evidence gate: Flow 07 success rate clean, no v86 fleet regressions, paper trail complete

**Idempotency invariant:** Flow 07 write step keyed on YCBM booking ID. Same booking firing twice (retry) must NOT create two bonus records.

**Time falls out of the gates. Do not lock a Phase 2 date.**

## Tier 3 schema writes — batched ask for Cody

These need single-shot Cody approval per Marshall's PERMISSIONS.md. They were originally part of the broader commission overhaul but unbatched in the plan flow:

| # | Action | Reason | Risk |
|---|---|---|---|
| 1 | UI: create `Commission Total` formula field on Commissions table: `{Commission - Original Contract Calculation} + {Commission - Addendum Calculation}` | API blocked from creating formula fields. Combines original + addendum into single per-row total | Low — read-only formula, no existing field affected |
| 2 | Tier 3: retarget `Commissions Earned` rollup (fldwj0MZ9FDl9X5a6) from `Commission Amount` (fld6i91L4IM1oCM7d) to `Commission Total` | Commission Amount is currently the rollup source, but it's not always populated by the script. Commission Total is always-computed via formula, more reliable | Medium — changes rollup math; need pre/post comparison |
| 3 | Tier 3: retarget `Total Sales Commission Amount` rollup (fldjazVSk2Mob7wNL) similarly | Same reason | Medium |
| 4 | Tier 3: rebuild `Total PM Commissions Amount` rollup (fldRbMFV24jZYCm4G) — currently broken with `fieldIdInLinkedTable: null` | Ghost field. Either point at `Commission Total` with role-filter, or delete and re-create | Low — already broken, anything is improvement |
| 5 | (Optional) Tier 3: add `Appointment Setter Bonus` to Commission Ledger Record Type singleSelect | Cleaner filtering for Christine's records | Low — appends to existing select choices |

**My recommendation:** approve #1 first (manual UI step, you do this directly). Then I propose #2-#4 as a single Marshall batch with pre/post rollup comparison. #5 is nice-to-have, can wait.

## Open questions

| # | Question | Owner | Blocks |
|---|---|---|---|
| 1 | Is the phantom-creating script still active? Will new bad rows keep appearing? | Cody (paused per "move on from Kromer") | Whether Phase 1 launch creates ongoing cleanup tax |
| 2 | Does Heidi's $2,101.97 figure match a specific date window? Need her input on which records she included | Cody / Heidi | Reconciling the Brandon dashboard error |
| 3 | Should the 4 duplicate Brandon records be Declined? Need Heidi confirmation on which date is the keeper | Cody / Heidi | Phase 1C cleanup |
| 4 | Do YCBM bookings land in Airtable? | Marshall (schema recon) | Phase 1.5 detector feasibility |
| 5 | Is Christine identifiable from a Flow 07 YCBM payload? | Rory (Phase 2 preflight) | Phase 2 trigger architecture |
| 6 | Approval for Tier 3 schema writes #2-#5 (batched) | Cody | Rollup correctness improvements |

## References

- Roundtable transcript: 2026-04-30 norman+marshall+rory, 3 rounds, converged. v1 evidence gate cleared (Flow 07/08 runtime-confirmed by Rory). v2 inference audit: zero unresolved load-bearing inferences.
- /verify reports: Phase 1 plan (this doc) cleared 8 gates; Phase B backfill cleared 5 inline tests + canary
- Bonuses table (NOT used per architecture pivot): `tbldadToqNdSSOeBZ`
- Commissions table: `tblaAvWKZZxj0I9md` on `appeV4OX4oCFgltX5`
- People table: `tblpbiWFo4ADVgB1I`
- Christine: `recUpFxiSh6ubId8x` | Brandon: `recDr5t4zHFEWnZrU` | Miguel: `recUrstw9Rlaa730b` | Jefferson: `rectXcbWjwqBuKtKB`
- Compensation Adjustments rollup: `fldgKblEICa88fzF5`; reads `fldYbE70d4bECQHgz` via Commissions link `fldrrqYidLw4p5MVU`
- Reconcilation Notes (typo'd field on Commissions, used for audit trail): `fldOfhHebb7dvK3wJ`
- RCL Marketing Integration v86: Flow 07 New Appointment, Flow 08 Appointment Cancelled (both runtime-confirmed)
