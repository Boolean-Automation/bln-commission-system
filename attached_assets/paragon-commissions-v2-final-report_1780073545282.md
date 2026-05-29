# Paragon Commissions v2 — Final Report, 2026-04-22

**Author:** Cody + Marshall, 2026-04-22 (evening)
**Audience:** Dan Labrador (next session pickup), Cody, anyone debugging commission flow
**Companion docs:**
- [commissions-v2-audit-2026-04-22.md](./commissions-v2-audit-2026-04-22.md) — the morning audit that surfaced everything
- [commissions-v2-rewrite-skeleton.md](./commissions-v2-rewrite-skeleton.md) — the Airtable-script rewrite Dan can adapt further
- [commission-worksheet-seth-2026-01-27.xlsx](./commission-worksheet-seth-2026-01-27.xlsx) — Seth's Jan 27 rate card (source of truth for rates)

---

## TL;DR

The Paragon commission ledger is now living in `Commissions v2` (table `tblkdwfASoizOo42D`) with math that matches Seth's Jan 27 rate worksheet. The legacy `Commissions` (v1) table is frozen — all automated writes point at v2 going forward. Three formula bugs were fixed, 35 records were backfilled to close a 19-day gap, five test-pollution records were deleted, and three pending Google Reviews were linked. Four open questions for Seth/Dan are queued at the bottom.

---

## The one big architectural find

The Airtable automation named **"When PROJECT Status Changes -> Calculate Commission v2"** had misleading metadata: its script was `base.getTable("Commissions")` — writing to v1, not v2. That meant since the 2026-04-03 bulk seed, **every automated commission for 19 days went to v1; v2 received zero automated writes**. The v2 dashboard had been showing a static snapshot masquerading as live.

### Cutover

- **Duplicated** the old automation → renamed the duplicate to `[v2] Calculate Commission v2`.
- **Replaced the script** in the duplicate with a v2-targeting version that:
  - Writes to `Commissions v2`, not `Commissions`.
  - Maps Project roles → v2 `Type` values via each employee's `SL Position Abbr.` / `PM Position Abbr.`:
    - SL1/SL2 → `Sales (SL)`
    - SM1 → `Sales Manager (SM)`
    - PM1 → `Project Manager (PM)`
    - PMM1 → `Production Manager (PMM)`
  - Snapshots `Position at Costed` from the employee's current position.
  - Adds a Sales-Manager "cut" pass so Brad (active SM1) gets 0.75% on every sales job (minus Seth's, which the formula filters out).
  - Has built-in idempotency: skips creating a record if (Employee, Job, Type) already exists.
- **Old automation: OFF. New automation: ON.** Descriptions written on both so next-Dan doesn't have to guess.

Script skeleton: [commissions-v2-rewrite-skeleton.md](./commissions-v2-rewrite-skeleton.md).
Live script: in the `[v2] Calculate Commission v2` Airtable automation.

### Verification

- **Test run** on Project `rec4vw2XvvWzpc0nk` (Job 260040, Mark Kulungowski): created Brad SM ($48.02 = 0.75% × $6,402.41 Total) and Gabe PM ($57.62 = 2% × $2,881.08 Project GP). Penny-match against Seth's worksheet ✓.

---

## Three v2 formula fixes

| Fix | Before | After | Verified |
|---|---|---|---|
| **SM basis** — `Commission [SM]` referenced `(Job) Initial Contract $` | Ignored change orders, underpaid Brad | Now references `{(Job) Total Job Amount}` | Brad's `rec2KpCSphbcdC08K` recalc $79.65 → $89.39 ✓ |
| **REF exclusion** — `Commission [REF]` paid $50 to anyone | Would pay SL1/SL2/SM1 if linked | Wrapped in IF against `{(People) Current SL Position}` | Dan (SL2) → $0; unlinked → $50 preserved ✓ |
| **ARB type + formula** — no Type for the quarterly $500 AR bonus | Couldn't record the bonus | Added `AR Bonus (ARB)` option + `"ARB"` case in `Commission` SWITCH → pulls from `Manual Commission` | Throwaway test: `Manual Commission = 500` → `Commission = 500` ✓ (test deleted) |

---

## 19-day gap backfilled

v2 was missing every commission event between 2026-04-04 and today's cutover. Marshall iterated the 18 v1 records from that window and rebuilt them in v2:

- **17 of 18 projects backfilled.** 1 skipped (Jason's 260267 Mark Rice — project status "Cancelled").
- **35 new v2 records created** using the same role→Type logic the new automation uses:
  - 9 Brad-sold jobs → 9 Brad SM + 9 manager records
  - 3 Jason-sold jobs → 3 Jason SL + 3 manager + 3 Brad SM-cut records
  - 3 Seth-sold jobs → 3 manager + 3 Brad SM-cut records (Seth himself generates no salesperson row because he has no position)
  - 1 Lila-sold job → 1 manager + 1 Brad SM-cut record (Lila has no position — flagged below)
- **All records tagged** with Notes like `"MARSHALL BACKFILL 2026-04-22 — v2 equivalent of v1 {recordId}"` so they're grep-able in the ledger.

### $0 records in the backfill — all intentional

Some backfill records computed to $0. Spot-checked and all correctly gated:

- **Sub-40% GP jobs** — e.g., Jason's Ann Hayes 2215201 (GP = 39.9999%, razor-thin miss), Brad's Burns Burton 260315 (GP = 25%). `GP Qualified` formula returns false → Commission = $0. Per worksheet.
- **Brad SM cuts on Seth-sold jobs** (3 of them) — `Commission [SM]` formula has a Seth-exclusion built in, returns $0. Per worksheet row 13 ("Does Not Include Any Sales By Seth") and call line 249 ("anything I sell is excluded from all commission computation").

Final v2 state after backfill and cleanup: **600 records** (570 baseline + 35 backfill − 5 pollution = 600).

---

## Cleanup

### Dan's test pollution — deleted

Five records left behind from Dan's form testing earlier in the week:

| Record | Problem |
|---|---|
| `rec1l8YcEOq9P4tOz` | `Commission / Job Costed Date` = 2027-01-02 (future) |
| `rec9B6AfCRfVpvCMW` | MSC type, `YTD Sales at Costed` = $999,999.99 |
| `recwi12CIcVWq7SPH` | MSC type, `Manual Commission` = $100 (Dan's 1:1 demo) |
| `recXZZxhjjqWL5LQQ` | PAY type, -$20 self-test |
| `reciSdQMCKbQmf7FI` | ADJ type, -$10 self-test |

All deleted via MCP. Dan's rollup now reflects only real entries.

### Google Review backfill — 6 of 6 resolved

Three linked to matching Jobs so the `5-Star Review Bonus [PM/PMM]` formula can fire; three flagged as `No Assignment` because the reviewer name doesn't match any Paragon Job.

| Review record | Reviewer | Action |
|---|---|---|
| `recTN8Ptmf6niUKfk` | Terri Amador | Linked to Job `recKI6dyiszpavKhu` (DJ2020250) |
| `receW7XaP23BxoV1g` | Phillip Holbrook | Linked to Job `recTQmjlz5Hoy2jE9` (260341) |
| `recojOdvyZtDaLfag` | Deborah Burton | Linked to Job `recEu6a3pWQ0ipyTM` (260315 Deborah Burns Burton) |
| `recOBzv5mgELJG817` | Rebecca Howard | `No Assignment` = true (no Job match) |
| `recGvjddoGGZXq50L` | Randy Canada | `No Assignment` = true (no Job match) |
| `recVk6lfpkDL32vlc` | BigJerm | `No Assignment` = true (handle-only reviewer) |

### v1 ingestion — stopped

Three Airtable automations touched commissions. All handled:

| Automation | Was | Is now |
|---|---|---|
| `When PROJECT Status Changes -> Calculate Commission v2` (despite the name, wrote to v1) | ON | OFF, kept as rollback |
| `[v2] Calculate Commission v2` (the real v2 writer) | didn't exist | ON |
| `(Jobs) Job is Paid → Create Commission, Email Google Review Link` | ON (created v1 rows + sent review email) | Commission-creation action deleted; review-request email preserved |
| `(Jobs) New 5-Star Review → Create Commission` | ON (created v1 $50 rows) | OFF — redundant; v2's `5-Star Review Bonus [PM/PMM]` handles it via lookup |

---

## Math verification against Seth's Jan 27 worksheet

Every tier verified against at least one live record:

| Tier | Basis | Verified record |
|---|---|---|
| SL1 <$1M | 2.5% × Total Job | `rec08AxEGkZIB6yu6` Williams (Seth, SL1 ghost): $34.45 = 2.5% × $1,378.14 ✓ |
| SL1 $1M–$1.5M | 3.0% × Total | Dan's boundary test `recOSbh6MvO6olJT1` @ YTD $1,000,000 → 3.0% tier ✓ |
| SL1 $1.5M–$2M | 4.0% × Total | Dan's boundary test `recsi6ruML4b61aFz` @ YTD $1,500,000 → 4.0% tier ✓ |
| SL1 >$2M | 4.5% × Total | Dan's boundary test `rec2WPSkgZBHDWx2D` @ YTD $2,000,000 → 4.5% tier ✓ |
| SL2 ladder | 3 / 3.5 / 4.5 / 5% × Total | **Not live-tested** — no SL2 employees in current roster |
| SM1 | 0.75% × Total (Topline) | `rec2KpCSphbcdC08K` Roberts: $89.39 = 0.75% × $11,918.75 ✓ (post-fix) |
| PM1 | 2% × Project GP $ | `rec0lTMq599zBHajv` Griffith: $63.32 = 2% × $3,166.07 ✓ |
| PMM1 | 2% × Project GP $ | `rec24UtNEQsmjCwxt` Esterling: $27.25 ✓ |
| REF | $50 flat, SL/SM excluded | Dan (SL2) linked → $0; unlinked ⚠️ REF → $50 ✓ |
| 5-star bonus | $50 per linked 5★ review | `rec2KYgsMjquihNw7` Jones job 260218: bonus $50 ✓ |
| GP 40% floor | Zero if below | `rec0XaId30zLZz4SU` GP 39.099% → $0 ✓; `rec0dzekE21AroxWp` GP 27.49% → $0 ✓ |

---

## Open questions for Seth / Dan

These came out of the Jan 20 transcript but aren't cleanly addressed by the Jan 27 worksheet. Current v2 behaves the way the *formulas* are wired, not necessarily the way Seth said in the call.

### 1. SM-cut scope: "All SM1, SM2, Self" vs "All SL1, SL2, Self"

**Call line 404-405, Seth:** *"I made a typo on C12 that should say SL1, SL2. Sorry, I put SM."* So the Sales Manager row on the worksheet should read "All SL1, SL2, Self" — meaning Brad earns 0.75% only on sales made by SL1/SL2 salespeople or himself. Not on sales made by anyone without an SL position.

**Worksheet as written (Jan 27)** still reads "All SM1, SM2, Self" — Seth didn't apply his own typo correction in the written version.

**Current v2 behavior:** `Commission [SM]` filters out Seth but pays on every other salesperson, including Lila (who has no position). Example — backfill record `reclvNF0WObZgN3xW`: Brad SM cut on Lila's Phillip Holbrook job, $54.38. Under Seth's corrected Jan 20 spec this should be $0.

**What fixing it would require:** add a lookup for the Sales Rep's SL Position on Commissions v2, then gate the SM formula on `salesperson SL Position ∈ {SL1, SL2}` OR `salesperson = self`. And add a matching guard to the v2 automation script's SM-cut loop so future records on non-SL salespeople don't get created.

**Status: left as-is pending Seth's confirmation.** Only one record is currently wrong ($54.38 on Lila's job).

### 2. Seth-sold jobs — narrow or broad exclusion?

**Call line 249, Seth:** *"anything I sell is excluded from all commission computation."*
**Call line 251, Chris:** *"So if Seth is a sales rep, there is no commission paid out."*

Reads like **no commission of any kind** on Seth's sales — not even PM/PMM.

**Current v2 behavior:** only the SM formula excludes Seth. PM and PMM pay normally. The backfill created 3 PM/PMM records for Gabe/Matt/Zach on Seth's three sales (260238 James Groh, 260351 Stephanie Swann, 260518 Kenneth Van Meter).

**Status: left as-is.** If Seth confirms broad exclusion, 6 records need deletion (3 PM/PMM + 3 $0 Brad SM cuts that exist for audit trail).

### 3. People in v1 but not v2 — Lila & Seth

- **Lila Saari** — earned $725.01 in v1 on Phillip Holbrook 260341 under the old "Estimator 10% from GP" plan. She has no SL/PM/PMM position in the People table, so under v2 she earns nothing. Is that intended? If she's supposed to get sales commission, Seth needs to assign her a role. If she's not, her v1 $725 is a one-time tail payment.
- **Seth Williams** — earned $2,540.85 in v1 on three recent jobs. Same pattern: no position, no v2 commission. Consistent with "excluded from all commission computation" — but he has a running v1 balance to reconcile.

### 4. AR threshold — 10 vs 8 days

**Call line 301, Seth:** *"And can you change that to eight days from 10 and that'll be paid out quarterly."*
**Worksheet as written** still says "AR aging less than 10 days avg."

Documented as **8 days** in this report per the transcript (since Cody's rule was "transcript wins unless the sheet specifically updates it, and the sheet just inherited the old 10 without explicit update"). Worth one Seth confirmation before the first quarterly ARB issuance.

### 5. SL2 tier ladder — unverified against live data

No current employee is SL2 (worksheet shows "None" in Current Assignment). The SL2 formula exists and should step 3 → 3.5 → 4.5 → 5% at $1M / $1.5M / $2M thresholds, but it's never fired on a live record. First time someone is promoted to SL2, spot-check the stepping.

### 6. Dual-role stacking — future concern

Worksheet implies stacking (an SL2+SM1 person earns SL2% + 0.75% on their own sale). Current automation creates only one sales-branch record per person, so a dual-roled employee would miss the SM self-cut. Not a today-problem — no one in the current roster is dual-roled. But worth fixing when a promotion creates the first dual-role case.

---

## Files, automations, and where things live

### Airtable (Paragon base `appoMG3V2gfaN2dEo`)

- `Commissions v2` (`tblkdwfASoizOo42D`) — active ledger, 600 records
- `Commissions` (`tblaAvWKZZxj0I9md`) — frozen, 253 records (no new writes)
- `Commission Plans` (`tbl9NF4LKl8J1gw61`) — orphaned from v2; still referenced by v1
- `People` (`tblpbiWFo4ADVgB1I`) — `Company Position`, `SL Position Abbr.`, `PM Position Abbr.` are the role source of truth
- Automations: `[v2] Calculate Commission v2` is the live commission writer. Old automation still exists OFF for rollback.

### Repo

- This file — final consolidated report
- [commissions-v2-audit-2026-04-22.md](./commissions-v2-audit-2026-04-22.md) — morning audit + evening execution addendum
- [commissions-v2-rewrite-skeleton.md](./commissions-v2-rewrite-skeleton.md) — script rewrite reference
- [commission-worksheet-seth-2026-01-27.xlsx](./commission-worksheet-seth-2026-01-27.xlsx) — Seth's source of truth
- `profile.md`, `systems.md`, `stakeholders.md`, `meetings.md` — per-client references (unchanged today)

### Transcripts referenced

- [Fireflies 01KF1DHN2ZCY7TNTXN32RPH7A5](https://app.fireflies.ai/view/01KF1DHN2ZCY7TNTXN32RPH7A5) — Jan 20 session 1 (87 min): commission structure architecture with Chris, Seth, Dan, Cody
- [Fireflies 01KFE3XE9EXRAKAZERP2FAGXWX](https://app.fireflies.ai/view/01KFE3XE9EXRAKAZERP2FAGXWX) — Jan 20 session 2 (56 min): bonus commissions + review-based payments
- [Fireflies 01KPTYR0SN6EGGGJ3YAD16ZKEC](https://app.fireflies.ai/view/01KPTYR0SN6EGGGJ3YAD16ZKEC) — Apr 22 Cody/Dan 1:1 that kicked off this audit

---

## What's deferred

- **REF automation build** — referral bonus $50 trigger (Paint OS link click? lead form submission?) — separate automation, not scoped today
- **ARB quarterly automation** — bonus is manual (Seth creates 3 ARB rows per quarter when AR < 8 days avg). V2 dashboard can wrap this into a button later
- **V2 (web dashboard) refactor** — [commission-dashboard-v2 repo](/Users/cody/builds/commission-dashboard-v2/) needs an updated field-map to reflect v2 schema, plus the "Excluded from Aggregation" boolean on People to stop hardcoding Seth's record ID. Not required for the Airtable-native version to work
- **Fix for SM scope and Seth broad-exclusion** — waiting on Seth's clarification (see open questions 1 & 2)
- **Dual-role stacking** — not urgent, no one is dual-roled today

---

*Last written 2026-04-22 evening by Marshall + Cody during the Apr 22 post-1:1 session.*
