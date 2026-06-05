import type { EntityMapping } from "@workspace/db";

type FieldSpec = { canonical: string; label: string; required?: boolean };

function fields(specs: FieldSpec[]): EntityMapping["fields"] {
  return specs.map((s) => ({
    canonical: s.canonical,
    label: s.label,
    required: s.required ?? false,
    mapped: false,
    sourceFieldId: null,
    sourceFieldName: null,
  }));
}

/**
 * The canonical field skeleton every brand-new tenant starts with. These are the
 * fields the engine and Airtable sync understand; a new company maps them to its
 * own Airtable columns during onboarding. Nothing here is Paragon-specific —
 * every field starts unmapped with no table chosen.
 */
export function defaultEntityMappings(): EntityMapping[] {
  return [
    {
      entityKind: "person",
      label: "People",
      tableId: null,
      tableName: null,
      fields: fields([
        { canonical: "name", label: "Name", required: true },
        { canonical: "roles", label: "Roles" },
        { canonical: "position", label: "Position", required: true },
        { canonical: "email", label: "Work Email" },
        { canonical: "company", label: "Company" },
        { canonical: "ytdSales", label: "YTD Sales" },
        { canonical: "startDate", label: "Start Date" },
        { canonical: "active", label: "Active" },
        // Reference-only "benchmark" fields: the source's own commission figures.
        // All optional. They are pulled in for side-by-side comparison in the
        // Reconciliation view and never feed the engine, ledger, or payroll.
        {
          canonical: "benchmarkCommissionOwed",
          label: "Benchmark · Commission Owed",
        },
        {
          canonical: "benchmarkTotalEarned",
          label: "Benchmark · Total Commission Earned",
        },
        {
          canonical: "benchmarkTotalPaid",
          label: "Benchmark · Total Commission Paid",
        },
        {
          canonical: "benchmarkTotalAdjustments",
          label: "Benchmark · Total Adjustments",
        },
      ]),
      unrecognizedFields: [],
    },
    {
      entityKind: "job",
      label: "Jobs",
      tableId: null,
      tableName: null,
      fields: fields([
        { canonical: "jobNumber", label: "Estimate/Job Number", required: true },
        { canonical: "jobName", label: "Job Name" },
        { canonical: "customer", label: "Job Contact Name" },
        { canonical: "salesRep", label: "Sales", required: true },
        { canonical: "manager", label: "Manager" },
        { canonical: "totalAmount", label: "Total Job Amount", required: true },
        { canonical: "gpAmount", label: "Gross Profit $", required: true },
        { canonical: "gpPct", label: "Gross Profit %", required: true },
        { canonical: "leadSource", label: "Source" },
        { canonical: "status", label: "Job Status" },
        { canonical: "projectStatuses", label: "Project Status(es)" },
        { canonical: "signedDate", label: "Won Date" },
        { canonical: "completedDate", label: "Job End Date" },
      ]),
      unrecognizedFields: [],
    },
  ];
}

/**
 * Forward-fills a tenant's persisted mapping with any canonical fields that were
 * introduced after the mapping was first saved. New optional fields (e.g. the
 * reference-only benchmark fields) are appended as unmapped so existing tenants
 * can map them in the UI without a one-off migration. Existing fields keep their
 * mapped state, order, and labels; a whole missing entity is appended verbatim.
 */
export function mergeCanonicalDefaults(
  entities: EntityMapping[],
): EntityMapping[] {
  const defaults = defaultEntityMappings();
  const byKind = new Map(entities.map((e) => [e.entityKind, e]));
  const result: EntityMapping[] = [];
  for (const def of defaults) {
    const existing = byKind.get(def.entityKind);
    if (!existing) {
      result.push(def);
      continue;
    }
    const present = new Set(existing.fields.map((f) => f.canonical));
    const missing = def.fields.filter((f) => !present.has(f.canonical));
    result.push(
      missing.length === 0
        ? existing
        : { ...existing, fields: [...existing.fields, ...missing] },
    );
  }
  // Preserve any persisted entities that aren't in the current defaults.
  for (const e of entities) {
    if (!defaults.some((d) => d.entityKind === e.entityKind)) result.push(e);
  }
  return result;
}
