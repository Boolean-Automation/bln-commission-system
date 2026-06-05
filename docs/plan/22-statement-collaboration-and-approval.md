# Plan — #22 Statement Collaboration & Approval

## Context

The spec needs two interactions stitched onto the rep statement from #21:

1. **Discussion threads** — a rep can flag a discrepancy or ask a question on a whole statement or a specific line item; admins can reply in the same thread; threads have an open/resolved status; everything is retained.
2. **Sign-off workflow** — an admin requests validation on a statement; the rep acknowledges; both actions are recorded.

Today the closest mechanic is the `disputed` state on a commission entry (`commissions.ts:33-40`), set via the existing transition button in `EntryDetail.tsx` — but `disputed` is just a label with no conversation thread, no resolution flow, and no statement-level surface. The audit log (`commissionEvents`) is **entry-centric** (`entryId` is the sole subject FK, `commissionEvents.ts:1-23`) and lacks a `userId` — it stores a free-form `actor` string. There is **no existing thread/comment UI** anywhere in the frontend.

Two design problems shape this plan:

- **Statements are virtual** in #21 — computed from entries + period coords. Threads and sign-off need a stable subject FK, so we materialize a thin `statements` row lazily on first write.
- **The audit log doesn't accept non-entry subjects**. Rather than retrofit `commissionEvents`, add a parallel `statement_events` table mirroring its shape and key it on `statementId`. The combined statement audit feed = `commissionEvents` for that period's entries ∪ `statement_events`.

This task **depends on #21** for the `Statement.tsx` page, statement payload shape, and `requireTenantAccessOrSelfRep` middleware (introduced in #20, extended in #21).

## Approach

Three new tables, one new audit table, one extension to the statement payload from #21, a new router for threads + sign-off, and three new frontend components dropped into the existing `Statement.tsx`. Reuse the React Query mutation + `invalidateQueries` pattern from `EntryDetail.tsx`.

### Backend

**1. Schema** — new files under `lib/db/src/schema/`:

- `statements.ts`:

  ```ts
  export const statementsTable = pgTable("statements", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
    personId: uuid("person_id").notNull().references(() => peopleTable.id),
    periodType: text("period_type").notNull(),   // monthly | quarterly | annual
    periodKey: text("period_key").notNull(),     // YYYY-MM | YYYY-Q# | YYYY
    signoffState: text("signoff_state").notNull().default("none"), // none | requested | acknowledged
    signoffRequestedAt: timestamp("signoff_requested_at", { withTimezone: true }),
    signoffRequestedByUserId: uuid("signoff_requested_by_user_id"),
    signoffAcknowledgedAt: timestamp("signoff_acknowledged_at", { withTimezone: true }),
    signoffAcknowledgedByUserId: uuid("signoff_acknowledged_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  }, (t) => ({
    uniqStatementCoord: uniqueIndex("statements_tenant_person_period_uniq")
      .on(t.tenantId, t.personId, t.periodType, t.periodKey),
  }));
  ```

- `statementThreads.ts`:

  ```ts
  export const statementThreadsTable = pgTable("statement_threads", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    statementId: uuid("statement_id").notNull().references(() => statementsTable.id),
    entryId: uuid("entry_id").references(() => commissionEntriesTable.id), // null = statement-level
    subject: text("subject"),
    status: text("status").notNull().default("open"), // open | resolved
    openedByUserId: uuid("opened_by_user_id").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    messageCount: integer("message_count").notNull().default(0),
  });
  ```

- `statementMessages.ts`:

  ```ts
  export const statementMessagesTable = pgTable("statement_messages", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    threadId: uuid("thread_id").notNull().references(() => statementThreadsTable.id),
    authorUserId: uuid("author_user_id").notNull(),
    authorRoleAtPost: text("author_role_at_post").notNull(), // rep | admin | super_operator | platform_operator (snapshot)
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  });
  ```

- `statementEvents.ts` — mirrors `commissionEvents.ts:1-23` but keyed on `statementId`:

  ```ts
  export const statementEventsTable = pgTable("statement_events", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    statementId: uuid("statement_id").notNull().references(() => statementsTable.id),
    threadId: uuid("thread_id"), // optional pointer for thread-related events
    eventKind: text("event_kind").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    actor: text("actor").notNull().default("system"),
    actorUserId: uuid("actor_user_id"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  });
  ```

  Event kinds: `thread_opened`, `thread_replied`, `thread_resolved`, `thread_reopened`, `signoff_requested`, `signoff_acknowledged`, `signoff_rescinded`.

Export the four tables from `lib/db/src/schema/index.ts`. Generate + apply drizzle migration via the existing workflow.

**2. Statement materialization helper** — `artifacts/api-server/src/lib/statement.ts` (extends the file added in #21)

```ts
export async function findOrCreateStatement(
  tx: Tx, tenantId: string, personId: string,
  periodType: PeriodType, periodKey: string,
): Promise<StatementRow> { ... }
```

Used by every write-path in the new router. Pure read-path in #21 (`assembleStatement`) does NOT create — it can still join the existing row if present to read sign-off state and thread counts; if no row exists, fields default to `signoffState: "none"` and `threads: []`.

**3. New router** — `artifacts/api-server/src/routes/statementCollab.ts`

Mounted under `requireAuth`. Endpoints (group both `/me` and `/:personId` forms; share a personId resolver: `req.repPersonId` for reps, `:personId` for admins):

- **`GET /tenants/:tenantId/statements/me/threads?periodType&periodKey`**
  **`GET /tenants/:tenantId/statements/:personId/threads?periodType&periodKey`** — guard `requireTenantAccessOrSelfRep`. Returns `{ threads: ThreadWithMessages[] }`. Inline messages (cheap — threads are short-lived).
- **`POST /tenants/:tenantId/statements/me/threads`**
  **`POST /tenants/:tenantId/statements/:personId/threads`** — body `{ periodType, periodKey, entryId?, subject?, body }`. Calls `findOrCreateStatement`, inserts thread + first message in one transaction, bumps `lastMessageAt`/`messageCount`, writes `thread_opened` event. Returns the new thread with its message.
- **`POST /tenants/:tenantId/threads/:threadId/messages`** — body `{ body }`. Loads thread + statement, checks the actor is the rep who owns the statement OR an admin/operator (otherwise 403). Inserts message, bumps thread, writes `thread_replied` event. Returns the appended message.
- **`POST /tenants/:tenantId/threads/:threadId/resolve`** — admin/operator only (reps can ask to resolve via a message; the act of resolving is admin-side). Sets `status = resolved`, stamps resolver, writes `thread_resolved` event.
- **`POST /tenants/:tenantId/threads/:threadId/reopen`** — admin/operator only. Inverse; writes `thread_reopened` event.
- **`POST /tenants/:tenantId/statements/:personId/signoff/request`** — admin/operator only (guard `requireTenantAccess`). Upserts statement, requires `signoffState in {none, requested}` (idempotent on `requested`), sets `signoffState=requested`, stamps requester, writes `signoff_requested` event.
- **`POST /tenants/:tenantId/statements/me/signoff/acknowledge`** — rep only. Resolves `personId` from `req.repPersonId`, requires `signoffState === "requested"`, sets `acknowledged`, stamps acknowledger, writes `signoff_acknowledged` event.
- **`POST /tenants/:tenantId/statements/:personId/signoff/rescind`** — admin/operator only. Reverts to `none` only if currently `requested` (cannot un-acknowledge — that would require a separate workflow). Writes `signoff_rescinded` event.

For `/me/threads` POST and `/me/signoff/acknowledge`, the personId comes exclusively from `req.repPersonId` — never from request body — so reps cannot act on others' statements.

**4. Extend statement payload from #21** — `artifacts/api-server/src/lib/statement.ts::assembleStatement`

Add to the returned `Statement` shape:

```ts
signoff: {
  state: "none" | "requested" | "acknowledged";
  requestedAt: string | null;
  requestedByName: string | null;
  acknowledgedAt: string | null;
};
threads: ThreadSummary[]; // { id, entryId | null, subject | null, status, messageCount, lastMessageAt, openedByName }
```

Full thread bodies are fetched on-demand from the threads endpoint. The summary is enough to render the discussion section and the per-item "1 open thread" badge.

**5. Audit feed** — leave separate (commissionEvents per-entry + statementEvents per-statement). Combine on the frontend in a unified timeline if/when needed. For #22's scope, the statement audit panel only renders `statementEvents`; per-entry audit stays inside `EntryDetail` (admin view).

### API spec + codegen

**6. Update `lib/api-spec/openapi.yaml`**:

- Add tag `statement-collab` (or extend the `statements` tag from #21 — pick `statements` to keep it grouped).
- Add the 8 endpoints above.
- Add schemas: `ThreadSummary`, `ThreadWithMessages`, `ThreadMessage`, `OpenThreadInput`, `PostMessageInput`, `SignoffState`, `Signoff`, plus extend `Statement` with the two new fields.

**7. Codegen**: `cd lib/api-spec && pnpm codegen`. Emits `useGetStatementThreads*`, `useOpenStatementThread*`, `usePostThreadMessage`, `useResolveThread`, `useReopenThread`, `useRequestStatementSignoff`, `useAcknowledgeStatementSignoff`, `useRescindStatementSignoff`.

### Frontend

All UI lives inside the `Statement.tsx` page from #21. No new top-level routes.

**8. New components** — `artifacts/commissions/src/components/statement/`:

- **`SignoffPanel.tsx`** — banner at the top of the statement, branches on `statement.signoff.state` and `effectiveRole`:
  - `state === "none"` + admin → "Request validation" button (calls `useRequestStatementSignoff`).
  - `state === "requested"` + rep → "Acknowledge this statement" button with a small confirmation dialog (`alert-dialog` from shadcn — already available).
  - `state === "requested"` + admin → muted text "Waiting for {repName} to acknowledge" + a "Rescind request" link.
  - `state === "acknowledged"` → green badge "Acknowledged by {repName} on {date}" — terminal, no controls.

- **`ThreadList.tsx`** — renders `statement.threads`. Each row: subject (or "Discussion on {entry source label}" when `entryId` set), status badge (open / resolved), `messageCount`, `lastMessageAt`. Clicking opens `ThreadView` in a sheet/dialog.

- **`ThreadView.tsx`** — given a `threadId`, calls `useGetThread` (or pulls from the parent's `useGetStatementThreads`), renders messages in chronological order with author + role + timestamp. Bottom: a `<Textarea>` (shadcn) + "Send" button (`usePostThreadMessage`). Admin sees an extra "Mark resolved" button (`useResolveThread`); reopened threads show "Reopen" for admins. Reps see only the reply box on open threads.

- **`NewThreadDialog.tsx`** — invoked from two entry points: a global "Start a discussion" button in the discussion section header (statement-level, `entryId` undefined), and a "Discuss this item" link inside each `StatementItemCard` (passes `entryId`). Form: optional subject (auto-defaulted: "Question on {entry.source.label}" when entryId set), required body, Submit.

**9. Wire-up in `Statement.tsx`**

- Top of page: `<SignoffPanel signoff={statement.signoff} role={effectiveRole} mode={mode} />`.
- Below items: `<section>` titled "Discussion" hosting `<ThreadList />` and the "Start a discussion" button. Hidden when there are no entries AND `mode === "self"` (don't tease an empty rep view).
- Each `StatementItemCard` (built in #21) gets a footer with per-item thread badge (`{openCount} open` or `Discuss`) — opens `NewThreadDialog` pre-filled to that entry, or scrolls/opens the existing thread for that entry if one is already open.

**10. Mutation pattern** — match `EntryDetail.tsx:54-67` exactly: `useMutation` with `onSuccess` toast + `queryClient.invalidateQueries({ queryKey: getGetStatementQueryKey(...) })` and `invalidateQueries({ queryKey: getGetStatementThreadsQueryKey(...) })`. No optimistic updates — threads + sign-off are low-frequency, and a refetch keeps the audit-faithful surface honest.

### Access + audit wrap-up

- Rep-only: `POST /me/signoff/acknowledge`, `POST /me/threads`, `POST /threads/:id/messages` (when they own the thread).
- Admin-only: `signoff/request`, `signoff/rescind`, `threads/:id/resolve`, `threads/:id/reopen`, `POST /:personId/threads`.
- All write paths insert a `statement_events` row inside the same transaction.

## Critical files

- `lib/db/src/schema/statements.ts` — **new**
- `lib/db/src/schema/statementThreads.ts` — **new**
- `lib/db/src/schema/statementMessages.ts` — **new**
- `lib/db/src/schema/statementEvents.ts` — **new**
- `lib/db/src/schema/index.ts` — export the four
- `artifacts/api-server/src/routes/statementCollab.ts` — **new**, 8 endpoints
- `artifacts/api-server/src/lib/statement.ts` — extend with `findOrCreateStatement` + read sign-off/threads into the existing `assembleStatement` from #21
- `artifacts/api-server/src/routes/index.ts` — register router
- `lib/api-spec/openapi.yaml` — extend `statements` tag with 8 paths and ~8 schemas; extend `Statement`
- `lib/api-client-react/src/generated/*` + `lib/api-zod/src/generated/*` — regenerated
- `artifacts/commissions/src/pages/Statement.tsx` — embed SignoffPanel + Discussion section
- `artifacts/commissions/src/components/statement/SignoffPanel.tsx` — **new**
- `artifacts/commissions/src/components/statement/ThreadList.tsx` — **new**
- `artifacts/commissions/src/components/statement/ThreadView.tsx` — **new**
- `artifacts/commissions/src/components/statement/NewThreadDialog.tsx` — **new**
- `artifacts/commissions/src/components/statement/StatementItemCard.tsx` (from #21) — add per-item thread badge + "Discuss" button

## Reusable pieces (don't rebuild)

- React Query mutation pattern + `invalidateQueries` — `EntryDetail.tsx:47-67, 94-102`
- shadcn primitives: `Textarea`, `Dialog`, `AlertDialog`, `Button`, `Card`, `Badge`, `form` — all in `components/ui/`
- Audit insert pattern (transaction + `eventKind/before/after/actor`) — `commissions.ts:207-214`
- `requireTenantAccessOrSelfRep` + `:personId` enforcement — from #20/#21
- `formatDateTime` — `lib/format.ts`
- Auth context (`useAuthContext().effectiveRole`, `displayName`) — `contexts/AuthContext.tsx:84`

## Verification

1. **Schema migration**: generate, apply, then sanity-check with `psql` that the four tables and the unique index on `statements` exist.
2. **Unit tests** (`artifacts/api-server/src/routes/statementCollab.test.ts`):
   - Rep opens own thread → 200; thread has correct `openedByUserId`, message count = 1, event row exists.
   - Rep opens thread on another rep's statement → 403.
   - Rep posts message to admin-opened thread on their statement → 200; rep posts to thread on someone else's statement → 403.
   - Admin resolves open thread → status `resolved`, event row. Reopens → status `open`, event row.
   - Sign-off lifecycle: admin request (state `requested`, event), rep acknowledge (state `acknowledged`, event), idempotent re-request → 409 or no-op (pick one and assert).
   - Rep tries to acknowledge before request → 409.
   - Admin rescind after acknowledgement → 409 (can't un-acknowledge).
3. **End-to-end manual smoke**:
   - As admin, open a rep's statement, click "Request validation" → banner flips to "Waiting for {rep}"; reload — still requested.
   - As rep, open the same statement, banner says "Acknowledge"; click → green banner; admin reload shows "Acknowledged".
   - As rep, click "Discuss this item" on a line → open thread with question.
   - As admin, reply, then mark resolved. Rep refreshes — thread shows resolved badge.
   - As rep, attempt to navigate to another rep's statement URL — 403.
   - As rep on an empty period → discussion section hidden; sign-off panel still rendered with state `none` (admin can't request on empty periods — guard accordingly).
4. **Audit trail check**: query `statement_events` for the test statement and confirm one row per action with correct `actorUserId` and `eventKind`.

## Out of scope (per spec)

- Email/push notifications for new messages (in-app only).
- Adjusting commission amounts in response to a dispute (admins still use the existing `PATCH /commissions/:entryId` flow from `commissions.ts:121-164`).

## Dependencies

- **#21 Transparent Statements** — provides `Statement.tsx`, the statement payload, `assembleStatement`, and the `:personId` extension of `requireTenantAccessOrSelfRep`. This task plugs new fields into the existing payload and new sections into the existing page; if #21 hasn't shipped, this task lands its scaffolding too but is much larger.
