#20 - Sales Rep Personal Dashboard
What & Why
The sales-rep view (RepView.tsx) is currently a read-only placeholder. The spec makes the rep dashboard the landing experience for reps, focused on clarity and motivation: at-a-glance commission performance, attainment vs quota, ranking relative to peers, a forecast/projection, and clear period navigation. This task builds out that dashboard for the rep role, reusing the existing API/engine outputs and the quota/OTE manual inputs.

Done looks like
A rep signing in lands on a personal dashboard scoped to only their own data (read-only, enforced by existing RBAC).
The dashboard shows a high-level commission summary for the selected period (accrued/payable/paid) with monthly/quarterly/annual period navigation.
It shows attainment % against the rep's quota and a ranking relative to peers, plus a simple forecast/projection (e.g. pace vs quota).
KPI cards/metrics are presented cleanly; which KPIs appear is admin-configurable (admins select the metrics to surface on the rep dashboard, mapping to the spec's KPI display config).
Empty/unset states (no quota set, no entries yet) are handled gracefully.
Out of scope
The detailed per-period statement with full formula + deal data (separate task).
Dispute/discussion channel (separate task).
Advanced pipeline-weighted forecast configuration (handled in the plan-design enhancements task; this dashboard consumes available data).
Steps
Rep dashboard data — Add/extend tenant-scoped, rep-scoped endpoints returning the rep's period summary, attainment vs quota, peer ranking, and projection inputs; regenerate hooks.
Dashboard UI — Replace the placeholder rep view with KPI cards, summary, attainment, ranking, and a forecast/projection, with period navigation.
Admin KPI display config — Let admins choose which KPIs surface on the rep dashboard and have the rep view render that selection (with a sensible default set).
Access + states — Ensure rep-only scoping via existing guards and handle empty/unset states (no quota, no data).
Relevant files
artifacts/commissions/src/pages/RepView.tsx
artifacts/commissions/src/pages/Dashboard.tsx
artifacts/api-server/src/routes/insights.ts
artifacts/api-server/src/lib/rbac.ts
artifacts/api-server/src/lib/engine.ts
lib/api-spec/openapi.yaml