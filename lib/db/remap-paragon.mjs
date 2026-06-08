// One-shot remap for the Paragon tenant:
//   - Map People benchmark fields to their actual Airtable columns
//   - Add the Projects entity mapping (table + fields)
// Safe to re-run; merges idempotently into the existing schema_mappings row.

import pg from "pg";

const TENANT_ID = "2b819ce7-e310-49bc-81d4-936b4d245d0d";

const peopleBenchmarkMap = {
  benchmarkCommissionOwed: "Commission Owed",
  benchmarkTotalEarned: "Total Commission Earned",
  benchmarkTotalPaid: "Total Commission Paid",
  benchmarkTotalAdjustments: "Total Adjustments",
};

const projectFieldMap = {
  projectNumber: "Project Number",
  projectName: "Project Name",
  jobNumber: "Job Number",
  // Paragon-specific: the Airtable "Lead Manager" field is the actual Project
  // Manager (the person who supervises the Lead/crew). The Airtable "Manager"
  // and "Lead" fields point at the subcontractor crew lead, NOT the PM. The
  // Coordinator is the PMM (Production Manager) recipient. With the engine's
  // pm_gp_rate `recipientSource` param, the PM rule pins to `manager` and the
  // PMM rule pins to `leadManager` — neither falls back, so this swap is safe.
  manager: "Lead Manager",
  leadManager: "Coordinator",
  status: "Project Status",
  active: "⚙️ Is Project Status Active?",
  totalAmount: "Total Project Amount",
  gpAmount: "Gross Profit $",
  gpPct: "Gross Profit %",
  jobTotalAmount: "(Job) Total Job Amount",
  jobGpAmount: "(Job) Job Gross Profit $",
  projectToJobRatio: "⚙️ Project Amount to Total Job Amount Ratio ",
  googleReviewStars: "(Job) Google Review Stars",
  startDate: "Project Start Date",
  endDate: "Project End Date",
};

const projectFieldLabels = {
  projectNumber: "Project Number",
  projectName: "Project Name",
  jobNumber: "Job Number",
  manager: "Lead Manager",
  leadManager: "Coordinator",
  status: "Project Status",
  active: "Is Project Status Active?",
  totalAmount: "Total Project Amount",
  gpAmount: "Gross Profit $",
  gpPct: "Gross Profit %",
  jobTotalAmount: "(Job) Total Job Amount",
  jobGpAmount: "(Job) Job Gross Profit $",
  projectToJobRatio: "Project Amount to Total Job Amount Ratio",
  googleReviewStars: "(Job) Google Review Stars",
  startDate: "Project Start Date",
  endDate: "Project End Date",
};

const requiredProjectFields = new Set(["projectNumber", "jobNumber"]);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const { rows } = await pool.query(
  "select entities from schema_mappings where tenant_id = $1",
  [TENANT_ID],
);
if (rows.length === 0) {
  throw new Error("schema_mappings row missing for tenant");
}
const entities = rows[0].entities;

const person = entities.find((e) => e.entityKind === "person");
if (person) {
  for (const f of person.fields) {
    if (peopleBenchmarkMap[f.canonical]) {
      f.sourceFieldName = peopleBenchmarkMap[f.canonical];
      f.mapped = true;
      f.label = peopleBenchmarkMap[f.canonical];
    }
  }
}

let project = entities.find((e) => e.entityKind === "project");
if (!project) {
  project = {
    entityKind: "project",
    label: "Projects",
    tableId: null,
    tableName: "Projects",
    fields: [],
    unrecognizedFields: [],
  };
  entities.push(project);
}
project.tableName = "Projects";
const existing = new Map(project.fields.map((f) => [f.canonical, f]));
const orderedFields = [];
for (const canonical of Object.keys(projectFieldMap)) {
  const sourceFieldName = projectFieldMap[canonical];
  const label = projectFieldLabels[canonical];
  const prior = existing.get(canonical);
  if (prior) {
    prior.sourceFieldName = sourceFieldName;
    prior.label = label;
    prior.mapped = true;
    prior.required = requiredProjectFields.has(canonical);
    prior.sourceFieldId = prior.sourceFieldId ?? null;
    orderedFields.push(prior);
    existing.delete(canonical);
  } else {
    orderedFields.push({
      canonical,
      label,
      required: requiredProjectFields.has(canonical),
      mapped: true,
      sourceFieldId: null,
      sourceFieldName,
    });
  }
}
// Anything that was previously mapped but is NOT in the current map is
// retained as an explicitly UNMAPPED slot. This is how we deliberately retire
// the old leadManager → Coordinator mapping (which mis-paid PM to Coordinator)
// without dropping the field from the UI.
for (const leftover of existing.values()) {
  leftover.mapped = false;
  leftover.sourceFieldName = null;
  leftover.sourceFieldId = null;
  orderedFields.push(leftover);
}
project.fields = orderedFields;

await pool.query(
  "update schema_mappings set entities = $1::jsonb where tenant_id = $2",
  [JSON.stringify(entities), TENANT_ID],
);
console.log("schema mapping updated");
await pool.end();
