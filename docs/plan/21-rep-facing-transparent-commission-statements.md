# Plan — #21 Rep-Facing Transparent Commission Statements

## Context

Today the only per-entry view is `EntryDetail.tsx`, which dumps the raw `computationSnapshot` JSON inside a `<pre>` block (`EntryDetail.tsx:226-229`) — useful for debugging, hostile to a rep trying to understand how a check was calculated. The spec wants a per-period **statement**: a summary at the top, every commission item the rep earned in the period, a human-readable formula breakdown per item, and the underlying deal/job that fed each calculation, all read-only and scoped to the rep's own data (admins can open anyone's).

The data is already there. Snapshots are recorded by the engine (`engine.ts:238-414`) with discriminated shapes per rule module (`tiered_ytd_rate`, `sm_cut`, `pm_gp_rate`, `referral_bonus`, `custom`). Each contains the inputs (e.g. `position`, `ytdSales`, `jobTotal`, `rate`, `gpPct`, `gated`) and the engine's own `formula` string. Jobs are reachable via `commissionEntries.sourceId` (no FK; batch query). What we lack is:

1. A statement assembly endpoint that groups by period and serializes snapshots for humans.
2. A snapshot-formatter that turns each rule's snapshot into labelled inputs + an expression.
3. The statement UI.

This task **depends on #20** for two pieces it will reuse: the `requireTenantAccessOrSelfRep` middleware and the `periodBounds(type, key)` server-side helper. If #20 lands first, this task imports them; if they slip, this task adds them.

## Approach

One new endpoint, one new snapshot-formatter library, one new statement page, two small components. Reuse existing serializers, `PeriodPicker`, `format.ts`, and the new RBAC helper from #20.

### Backend

**1. Statement endpoint** — new file `artifacts/api-server/src/routes/statements.ts`

Two paths (mounted under existing `requireAuth`):

- **`GET /tenants/:tenantId/statements/me?periodType=&periodKey=`** — guard `requireTenantAccessOrSelfRep` (from #20). Resolves `personId` from `req.repPersonId` for reps; for admin/operator callers, requires an additional `?personId=` query (otherwise 400).
- **`GET /tenants/:tenantId/statements/:personId?periodType=&periodKey=`** — guard `requireTenantAccessOrSelfRep`. Same body — admin can specify any personId in the tenant; rep can only call this with their own personId (the helper enforces that — extend it to read `:personId` route param when present and compare against `repMembership.personId`).

Both return the `Statement` shape (below). Both use the same assembler.

**Assembly steps** (in `artifacts/api-server/src/lib/statement.ts` — new):

```ts
async function assembleStatement(
  tenantId: string,
  personId: string,
  periodType: PeriodType,
  periodKey: string,
): Promise<Statement> {
  const { startDate, endDate } = periodBounds(periodType, periodKey); // from #20
  // Query commission_entries where person_id = ? and accrued_at between ?..?
  // (entries lacking accrued_at — i.e. voided pre-accrual — are excluded.)
  const entries = await db.select(...).from(commissionEntriesTable)
    .where(and(
      eq(personId), eq(tenantId),
      gte(accruedAt, startDate), lte(accruedAt, endDate),
    ));
  // Batch-fetch jobs for entries where sourceKind = "job"
  const jobIds = entries.filter(e => e.sourceKind === "job").map(e => e.sourceId);
  const jobs = jobIds.length ? await db.select().from(jobsTable).where(inArray(id, jobIds)) : [];
  const jobsById = new Map(jobs.map(j => [j.id, j]));
  // Batch-fetch rule instances for human labels
  const ruleInstanceIds = uniq(entries.flatMap(e => e.ruleInstanceIds ?? []));
  const ruleInstances = ruleInstanceIds.length
    ? await db.select().from(ruleInstancesTable).where(inArray(id, ruleInstanceIds))
    : [];
  const ruleById = new Map(ruleInstances.map(r => [r.id, r]));
  // Fetch person for display name
  const [person] = await db.select().from(peopleTable).where(eq(id, personId));
  // Compose items via formatSnapshot()
  const items = entries.map(e => composeItem(e, jobsById, ruleById));
  // Summary aggregations
  const summary = computeSummary(items);
  return { personId, personName: person.name, period: {...}, summary, items };
}
```

Period filtering note: entries don't carry a `periodKey`. Group by `accruedAt`. Voided-pre-accrual entries (no `accruedAt`) are intentionally excluded from statements — they didn't accrue in this period or any other.

**2. Snapshot formatter** — new file `artifacts/api-server/src/lib/snapshotFormat.ts`

```ts
type FormulaBreakdown = {
  expression: string;                      // "5.50% × $42,500 = $2,337.50"
  inputs: { label: string; value: string }[];
  gated: boolean;
  gateReason: string | null;
};

export function formatSnapshot(
  snapshot: Record<string, unknown> | null,
  ruleInstance: RuleInstanceRow | null,
  amount: number,
): FormulaBreakdown {
  if (!snapshot) return fallback(amount);
  switch (snapshot.rule) {
    case "tiered_ytd_rate": return formatTieredYtd(snapshot, amount);
    case "sm_cut":          return formatSmCut(snapshot, amount);
    case "pm_gp_rate":      return formatPmGpRate(snapshot, amount);
    case "referral_bonus":  return formatReferralBonus(snapshot, amount);
    case "custom":          return formatCustom(snapshot, amount);
    default:                return fallback(amount);
  }
}
```

Per-rule outputs (concrete examples to mirror in the implementation):

- **tiered_ytd_rate**: expression `"{position} • YTD ${ytdSales} → {rate*100}% × ${jobTotal} = ${amount}"`; inputs `[Position, YTD Sales, Tier Rate, Job Total]`; gated when `gated === true` (reason from `gpPct` if known: `"Gross-profit gate below threshold (GP {gpPct}%)"`).
- **sm_cut**: expression `"{rate*100}% × ${jobTotal} = ${amount}"`; inputs `[Sold By (or "—"), Cut Rate, Job Total, GP %]`; gating same shape.
- **pm_gp_rate**: expression `"{rate*100}% × ${projectGp} = ${amount}"`; inputs `[Rate, Project GP]`.
- **referral_bonus**: expression `"Flat ${flat}"`; inputs `[Lead Source, Bonus]`.
- **custom**: switch on `snapshot.result.kind`:
  - `formula` → expression from `result.expression`; inputs from `result.variables` (one entry per variable name/value).
  - `tiered` → expression `"Tier {tierIndex+1}: {rate*100}% × ${basis} = ${amount}"`; inputs basis + rate + tier index.
  - `percent` → expression `"{rate*100}% × ${basis} (${basisField}) = ${amount}"`; inputs basis field + value + rate.
  - `flat` → expression `"Flat ${amount}"`.
  - When `applies === false` or `conditionsPass === false` → expression `"Conditions not met — $0"`.

Currency/percent formatting on the server uses a tiny helper (`$1,234.56`, `5.50%`) so the wire payload is already display-ready. Keep formatting locale-independent (USD), matching the existing engine's `currency: "USD"` assumption.

Treat formatter as pure (snapshot in, breakdown out) so it's unit-testable without DB access.

**3. RBAC enforcement on `:personId` path**

Extend `requireTenantAccessOrSelfRep` (added in #20) to also honor a `:personId` route param: if present, a rep is admitted only when `req.params.personId === repMembership.personId`. Admins/operators are unchanged.

**4. Register router** in `artifacts/api-server/src/routes/index.ts` next to the new repDashboard router from #20.

### Statement payload shape

```ts
type Statement = {
  personId: string;
  personName: string;
  period: { type: PeriodType; key: string; startDate: string; endDate: string };
  summary: {
    totalEarned: number;
    byType: { type: CommissionType; total: number; count: number }[];
    byState: { accrued: number; payable: number; paid: number; clawedBack: number };
    entryCount: number;
    dealCount: number;
  };
  items: StatementItem[];
};

type StatementItem = {
  entryId: string;
  type: CommissionType;          // SL/SM/PM/PMM/REF/MSC/ADJ/PAY/ARB
  amount: number;
  state: CommissionState;
  ruleModuleKey: string | null;
  ruleDescription: string | null; // ruleInstance.description
  source: { kind: string; id: string | null; label: string | null };
  formula: FormulaBreakdown;
  deal: StatementDeal | null;
  accruedAt: string | null;
  payableAt: string | null;
  paidAt: string | null;
  notes: string | null;
};

type StatementDeal = {
  jobId: string;
  jobNumber: string;
  jobName: string | null;
  customer: string | null;
  totalAmount: number | null;
  gpAmount: number | null;
  gpPct: number | null;
  status: string;
  signedDate: string | null;
  completedDate: string | null;
};
```

### API spec + codegen

**5. Update `lib/api-spec/openapi.yaml`**:

- Add tag `statements` to the `tags:` block.
- Add the two paths above with shared `getStatementForSelf` / `getStatementForPerson` operations.
- Add schemas `Statement`, `StatementSummary`, `StatementByTypeRow`, `StatementByStateTotals`, `StatementItem`, `FormulaBreakdown`, `FormulaInput`, `StatementDeal`.

**6. Codegen**: `cd lib/api-spec && pnpm codegen`. Yields `useGetStatementForSelf`, `useGetStatementForPerson`.

### Frontend

**7. New page** — `artifacts/commissions/src/pages/Statement.tsx`

- Read tenantId and (optionally) `personId` from props or wouter route params.
- Period state with `PeriodPicker`; default `currentPeriodKey("monthly")`.
- Calls `useGetStatementForSelf` or `useGetStatementForPerson` based on mode.
- Sections (top → bottom):
  1. **Header**: rep name, period picker.
  2. **Summary card**: total earned (large), state chips (accrued/payable/paid/clawed-back), entry + deal counts, mini by-type list (`SL: $4,210 (3 items)`).
  3. **Items**: vertical list of `<StatementItemCard>`. Each card shows type badge, source label, amount + state badge, then `<FormulaBreakdown>` (collapsed by default; click to expand), then `<DealPanel>` when `item.deal` is present.
  4. **Empty state**: when `items.length === 0`, muted card "No commission activity in this period." Suggest switching periods.
- Skeleton + "Failed to load" patterns from `Dashboard.tsx:41-64`.

**8. New components** — `artifacts/commissions/src/components/statement/`

- **`FormulaBreakdown.tsx`** — takes `{ formula: FormulaBreakdown }`:
  - Top line: the `expression` rendered in a monospace `<code>` block.
  - Below: two-column list of `inputs` (label → value).
  - When `gated`, show an amber callout with `gateReason || "Gated"`.

- **`DealPanel.tsx`** — takes `{ deal: StatementDeal }`:
  - Inline panel inside the item card: job number + name + customer header.
  - Two-column field list: Total Amount, GP Amount, GP %, Status, Signed Date, Completed Date.
  - Use `formatCurrency` and `formatDate` from `lib/format.ts`.

Keep both components stateless and presentational — easy to unit-test, easy to reuse.

**9. Routing**

- In `artifacts/commissions/src/App.tsx`, inside `StaffRouter`, add route `/statements/:personId` mounting `<Statement personId={...} mode="admin" />`. Also add a deep-link from the leaderboard rows (`LeaderboardView.tsx` rep row → "View statement").
- For reps, add a "View statement" link inside the rebuilt RepView (from #20) that toggles or navigates to `<Statement mode="self" />`. Since RepView currently lives outside `WouterRouter`, the simplest move is to make Statement embeddable as a child component of RepView (controlled by local state) rather than introducing a rep-only router. Keep rep-mode statement as a section that opens below the dashboard (or as a tab) — no new top-level rep routes.

**10. Optional cleanup** (not required by spec; do only if cheap): replace the raw JSON `<pre>` in `EntryDetail.tsx:226-229` with `<FormulaBreakdown>` so admins benefit from the same human view. Out-of-spec; flag as a follow-up if time-boxed.

## Critical files

- `artifacts/api-server/src/routes/statements.ts` — **new**, two endpoints
- `artifacts/api-server/src/lib/statement.ts` — **new**, assembler
- `artifacts/api-server/src/lib/snapshotFormat.ts` — **new**, snapshot → breakdown
- `artifacts/api-server/src/lib/rbac.ts` — extend `requireTenantAccessOrSelfRep` (from #20) to honor `:personId` route param
- `artifacts/api-server/src/routes/index.ts` — register statements router
- `lib/api-spec/openapi.yaml` — add `statements` tag, 2 paths, 8 schemas
- `lib/api-client-react/src/generated/*` + `lib/api-zod/src/generated/*` — regenerated
- `artifacts/commissions/src/pages/Statement.tsx` — **new**
- `artifacts/commissions/src/components/statement/FormulaBreakdown.tsx` — **new**
- `artifacts/commissions/src/components/statement/DealPanel.tsx` — **new**
- `artifacts/commissions/src/pages/RepView.tsx` — add Statement entry point (built atop #20)
- `artifacts/commissions/src/components/reports/LeaderboardView.tsx` — add "View statement" link on rep rows
- `artifacts/commissions/src/App.tsx` — add `/statements/:personId` route under StaffRouter

## Reusable pieces (don't rebuild)

- `serializeEntry`, `serializeJob`, `serializePerson` — `artifacts/api-server/src/lib/serialize.ts`
- Snapshot shape source-of-truth — `artifacts/api-server/src/lib/engine.ts:238-414`
- `requireTenantAccessOrSelfRep` + `periodBounds` — from #20
- `PeriodPicker` — `artifacts/commissions/src/components/reports/PeriodPicker.tsx`
- `formatCurrency`, `formatDate`, `formatDateTime` — `artifacts/commissions/src/lib/format.ts`
- Period helpers — `artifacts/commissions/src/lib/periods.ts`
- Skeleton + failure card patterns — `artifacts/commissions/src/pages/Dashboard.tsx:41-64`

## Verification

1. **Unit tests** on `formatSnapshot` (pure function, easy):
   - One test per rule module with a representative snapshot — assert expression string, input labels/values, gated handling.
   - `null` snapshot → fallback breakdown with no inputs and a generic expression.
   - Custom rule covering `formula`, `tiered`, `percent`, `flat`, and `conditionsPass === false`.
2. **Endpoint tests**:
   - Rep `/statements/me` returns own data; `personId` injection ignored.
   - Rep `/statements/:otherPersonId` → 403.
   - Admin `/statements/:personId` → 200 for any rep in tenant.
   - Period boundary: an entry with `accruedAt` on the period's last second appears; the next second is excluded.
   - Voided-pre-accrual entries are excluded.
   - Summary `totalEarned` equals sum of `items[].amount`.
   - `dealCount` is distinct jobs across items (one job feeding two entries counts once).
3. **Manual smoke**:
   - Seed a tenant with one rep, one quarter of mixed entries (SL tiered, SM, PM, referral, one custom). Open the rep statement for that quarter. Verify:
     - Summary totals match the ledger filtered to that period.
     - Each formula renders human-readably; gated entries show a callout.
     - Each item with a job source shows the deal panel with the correct customer/amount/GP/dates.
   - Switch period to one with no entries — empty-state card appears.
   - As admin, open `/statements/<rep>` from the Leaderboard link; same view appears.
   - As rep, attempt to navigate to another rep's `/statements/:id` URL — 403 from the server, UI shows the failure card.
4. **Codegen + type checks**: `cd lib/api-spec && pnpm codegen`, then `pnpm -w run typecheck` to confirm no drift.

## Out of scope (per spec)

- Dispute / discussion threads on the statement (task #22).
- Rep sign-off / admin approval workflow (separate task).
- Changes to how commissions are computed (engine is read-only here).

## Dependencies

- **#20 Sales Rep Personal Dashboard** — provides `requireTenantAccessOrSelfRep` middleware, `periodBounds` server helper, and the rep landing surface where the statement entry point lives. If #20 lands first, this task imports them. If not, this task introduces minimal versions and #20 picks them up.
