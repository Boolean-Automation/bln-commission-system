/**
 * Audit script: row-level diff of our local commission ledger vs. Airtable's
 * Commissions table for one tenant. Emits CSV on stdout so the operator can
 * pipe to a file. Read-only against both sides — never mutates.
 *
 * Cause taxonomy assigned per row:
 *   - "match"                — same recipient, same amount, both Approved
 *   - "status only"          — same shape, Airtable status != Approved
 *   - "rate mismatch"        — same shape, amount differs by > $0.01
 *   - "row missing locally"  — Airtable has the row, our ledger doesn't
 *   - "row missing in source"— our ledger has the row, Airtable doesn't
 *
 * Usage:
 *   pnpm -F @workspace/scripts exec tsx src/auditParagonCommissions.ts \
 *     --tenant=paragon-atlanta --rep="Jason Meredith,Bradley Roberts"
 */
import { parseArgs } from "node:util";
import {
  db,
  pool,
  tenantsTable,
  commissionEntriesTable,
  jobsTable,
  projectsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

type AirtableRow = {
  type: string;
  employee: string;
  amount: number;
  status: string;
  jobNumber: string;
  projectNumber: string;
};

async function airtableGet(baseId: string, query: string): Promise<unknown> {
  const pat = process.env.AIRTABLE_PAT;
  if (!pat) throw new Error("AIRTABLE_PAT not set");
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${query}`, {
    headers: { Authorization: `Bearer ${pat}` },
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchCommissions(baseId: string): Promise<AirtableRow[]> {
  const fields = [
    "Employee",
    "Status",
    "Commission",
    "Type Abbr.",
    "(Job) Job Number",
    "(Project) Project Number",
  ];
  const out: AirtableRow[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({
      cellFormat: "string",
      timeZone: "America/New_York",
      userLocale: "en-us",
      pageSize: "100",
    });
    for (const f of fields) params.append("fields[]", f);
    if (offset) params.set("offset", offset);
    const data = (await airtableGet(
      baseId,
      `Commissions?${params.toString()}`,
    )) as {
      records?: Array<{ fields?: Record<string, unknown> }>;
      offset?: string;
    };
    for (const r of data.records ?? []) {
      const f = r.fields ?? {};
      out.push({
        type: String(f["Type Abbr."] ?? "").trim() || "(blank)",
        employee: String(f["Employee"] ?? "").trim() || "(blank)",
        amount: parseMoney(f["Commission"]),
        status: String(f["Status"] ?? "").trim() || "(blank)",
        jobNumber: String(f["(Job) Job Number"] ?? "").trim(),
        projectNumber: String(f["(Project) Project Number"] ?? "").trim(),
      });
    }
    offset = data.offset;
  } while (offset);
  return out;
}

function parseMoney(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function csvEscape(v: string | number): string {
  const s = typeof v === "number" ? v.toFixed(2) : v;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const { values } = parseArgs({
    options: {
      tenant: { type: "string" },
      rep: { type: "string" },
    },
  });
  const slug = values.tenant ?? "paragon-atlanta";
  const repFilter = (values.rep ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug));
  if (!tenant) throw new Error(`Tenant not found: ${slug}`);
  if (!tenant.airtableBaseId)
    throw new Error("Tenant has no airtable_base_id");

  const [airtable, ourEntries, jobs, projects] = await Promise.all([
    fetchCommissions(tenant.airtableBaseId),
    db
      .select()
      .from(commissionEntriesTable)
      .where(eq(commissionEntriesTable.tenantId, tenant.id)),
    db.select().from(jobsTable).where(eq(jobsTable.tenantId, tenant.id)),
    db.select().from(projectsTable).where(eq(projectsTable.tenantId, tenant.id)),
  ]);

  // Index helpers
  const jobsById = new Map(jobs.map((j) => [j.id, j]));
  const projectsById = new Map(projects.map((p) => [p.id, p]));

  // Key local entries by (type, name, jobNumber)
  type LocalRow = {
    type: string;
    name: string;
    jobNumber: string;
    amount: number;
    state: string;
  };
  const local: LocalRow[] = ourEntries
    .filter((e) => e.state !== "voided" && e.state !== "clawed_back")
    .map((e) => {
      let jobNumber = "";
      if (e.sourceKind === "job") {
        jobNumber = jobsById.get(e.sourceId ?? "")?.jobNumber ?? "";
      } else if (e.sourceKind === "project") {
        const p = projectsById.get(e.sourceId ?? "");
        jobNumber = p?.jobNumber ?? "";
      }
      return {
        type: e.type,
        name: (e.personName ?? "").trim(),
        jobNumber,
        amount: e.amount,
        state: e.state,
      };
    });

  const key = (type: string, name: string, jobNumber: string) =>
    `${type}|${name.toLowerCase()}|${jobNumber}`;

  const airtableByKey = new Map<string, AirtableRow>();
  const airtableMatched = new Set<string>();
  for (const r of airtable) {
    // Skip Payout/Adjustment ledger types — not commission earnings
    if (r.type === "PAY" || r.type === "ADJ") continue;
    airtableByKey.set(key(r.type, r.employee, r.jobNumber), r);
  }

  const rows: Array<{
    type: string;
    recipient: string;
    jobNumber: string;
    projectNumber: string;
    airtableAmount: number;
    airtableStatus: string;
    ourAmount: number;
    ourState: string;
    delta: number;
    cause: string;
  }> = [];

  // Walk local entries
  for (const l of local) {
    const k = key(l.type, l.name, l.jobNumber);
    const at = airtableByKey.get(k);
    if (at) airtableMatched.add(k);
    const airtableAmount = at?.amount ?? 0;
    const airtableStatus = at?.status ?? "(missing)";
    const delta = l.amount - airtableAmount;
    let cause: string;
    if (!at) {
      cause = "row missing in source";
    } else if (Math.abs(delta) > 0.01) {
      cause = "rate mismatch";
    } else if (at.status !== "Approved") {
      cause = "status only";
    } else {
      cause = "match";
    }
    rows.push({
      type: l.type,
      recipient: l.name,
      jobNumber: l.jobNumber,
      projectNumber: at?.projectNumber ?? "",
      airtableAmount,
      airtableStatus,
      ourAmount: l.amount,
      ourState: l.state,
      delta,
      cause,
    });
  }

  // Walk Airtable rows not matched locally
  for (const [k, r] of airtableByKey) {
    if (airtableMatched.has(k)) continue;
    rows.push({
      type: r.type,
      recipient: r.employee,
      jobNumber: r.jobNumber,
      projectNumber: r.projectNumber,
      airtableAmount: r.amount,
      airtableStatus: r.status,
      ourAmount: 0,
      ourState: "(missing)",
      delta: -r.amount,
      cause: "row missing locally",
    });
  }

  // Filter to interesting reps if requested
  const filtered = repFilter.length
    ? rows.filter((r) => repFilter.includes(r.recipient.toLowerCase()))
    : rows;

  // Emit CSV
  const header = [
    "type",
    "recipient",
    "jobNumber",
    "projectNumber",
    "airtableAmount",
    "airtableStatus",
    "ourAmount",
    "ourState",
    "delta",
    "cause",
  ];
  console.log(header.join(","));
  for (const r of filtered.sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta),
  )) {
    console.log(
      [
        r.type,
        r.recipient,
        r.jobNumber,
        r.projectNumber,
        r.airtableAmount,
        r.airtableStatus,
        r.ourAmount,
        r.ourState,
        r.delta,
        r.cause,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  // Summary to stderr
  const byCause = new Map<string, { count: number; net: number }>();
  for (const r of filtered) {
    const v = byCause.get(r.cause) ?? { count: 0, net: 0 };
    v.count += 1;
    v.net += r.delta;
    byCause.set(r.cause, v);
  }
  console.error("\nSummary by cause (recipient filter applied):");
  for (const [cause, v] of [...byCause.entries()].sort(
    (a, b) => Math.abs(b[1].net) - Math.abs(a[1].net),
  )) {
    console.error(
      `  ${cause.padEnd(28)} count=${v.count.toString().padStart(5)} net=${v.net.toFixed(2).padStart(12)}`,
    );
  }
}

await main();
await pool.end();
