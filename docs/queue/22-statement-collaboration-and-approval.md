Statement Collaboration & Approval
What & Why
The spec requires two interactions around statements: (1) a dispute/discussion channel so reps can flag discrepancies or ask questions directly on a statement or line item, with threaded conversation between rep and admin and a retained record of disputes and resolutions; and (2) statement verification/approval, where an admin can request validation and a rep acknowledges or signs off a statement, with an audit trail. Today the only related capability is marking an entry's state as disputed — there is no conversation thread and no sign-off workflow. This task adds both, attached to the statements.

Done looks like
From a statement (and from an individual line item), a rep can open a threaded discussion and post a question or dispute; admins can reply in the same thread.
All disputes and their resolutions are retained and visible, with clear open/resolved status.
An admin can request validation/sign-off on a statement; the rep can acknowledge/sign off, and the acknowledgement is recorded.
Every action (dispute opened, replied, resolved, sign-off requested, acknowledged) writes to the immutable audit log.
Reps only see/act on their own statements; admins/operators can act across the tenant, enforced by existing RBAC.
Out of scope
Email/push notifications for new messages (in-app only for now).
Changing commission calculations as a result of a dispute (admins still adjust via existing entry edit/transition flows).
Steps
Discussion data model — Add threaded comments/disputes attached to a statement and/or commission entry, with status (open/resolved) and authorship, per tenant.
API + access — Endpoints to create/list/resolve threads and post replies, tenant- and role-scoped; regenerate hooks.
Sign-off workflow — Add request-validation and rep acknowledgement/sign-off with recorded state on the statement.
UI on the statement — Surface the discussion thread and sign-off controls within the statement view for both rep and admin.
Audit — Write all collaboration and sign-off actions to the existing audit log.
Relevant files
artifacts/commissions/src/pages/EntryDetail.tsx
artifacts/commissions/src/pages/RepView.tsx
artifacts/api-server/src/routes/commissions.ts
lib/db/src/schema/commissionEvents.ts
lib/db/src/schema/commissionEntries.ts
lib/db/src/schema/index.ts
lib/api-spec/openapi.yaml
Dependencies

Transparent per-period commission statements for reps