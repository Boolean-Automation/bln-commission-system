import type { EntityMapping } from "@workspace/db";

type FieldSpec = { canonical: string; label: string; required?: boolean };

function fields(specs: FieldSpec[]): EntityMapping["fields"] {
  return specs.map((s) => ({
    canonical: s.canonical,
    label: s.label,
    required: s.required ?? false,
    mapped: false,
    airtableFieldId: null,
    airtableFieldName: null,
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
