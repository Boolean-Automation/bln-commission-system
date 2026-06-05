Rep-Facing Transparent Commission Statements
What & Why
The spec's core transparency requirement is the commission statement: a per-period document for a rep that shows, top-to-bottom, each commission item, the transparent formula breakdown for each, and all the underlying deal/activity data used (ARR/total, stage/status, close date, per-deal commission with the formula applied inline), with a clean summary synthesis above the detail. Today there is only a single-entry detail view (EntryDetail.tsx) with a raw computation snapshot — there is no period-grouped, human-readable statement. This task builds the statement experience.

Done looks like
A rep can view a statement for a selected period containing: a summary total at the top, each commission item listed individually, the formula breakdown per item, and the underlying deal/job records that fed the calculation.
Each underlying deal shows its relevant fields (amount, status/stage, date) and its per-deal commission with the applied formula shown inline.
The statement reads cleanly for a non-technical rep (no raw JSON), reusing the engine's computation snapshots rendered in a friendly format.
Statements are read-only for reps and scoped to their own data; admins can view any rep's statement (feeds the verification task).
Period navigation lets the rep move across monthly/quarterly/annual statements.
Out of scope
Dispute/discussion threads on the statement (separate task, builds on this).
Rep sign-off / admin approval workflow (separate task, builds on this).
Changing how commissions are computed.
Steps
Statement data shape — Add a tenant-scoped endpoint that assembles a period statement for a rep: summary, per-item breakdown, and the underlying deals with per-deal amounts/formulas; regenerate hooks.
Statement UI — Build the statement view (summary → items → formula → underlying deals) rendering snapshots in human-readable form, integrated into the rep area.
Admin access to statements — Allow admins/operators to open any rep's statement (read path shared with the verification task).
Period navigation + states — Add period switching and graceful empty states.
Relevant files
artifacts/commissions/src/pages/EntryDetail.tsx
artifacts/commissions/src/pages/Ledger.tsx
artifacts/commissions/src/pages/RepView.tsx
artifacts/api-server/src/routes/commissions.ts
artifacts/api-server/src/lib/engine.ts
artifacts/api-server/src/lib/serialize.ts
lib/api-spec/openapi.yaml
Dependencies

Build the sales rep personal dashboard