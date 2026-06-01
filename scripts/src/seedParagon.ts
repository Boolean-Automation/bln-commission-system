import {
  db,
  pool,
  tenantsTable,
  peopleTable,
  jobsTable,
  schemaMappingsTable,
  commissionPlansTable,
  ruleInstancesTable,
  commissionEntriesTable,
  commissionEventsTable,
  type EntityMapping,
} from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Seeding Paragon Painting Atlanta...");

  // Clean slate for the Paragon tenant so the seed is idempotent.
  const existing = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, "paragon-atlanta"));
  if (existing[0]) {
    const tid = existing[0].id;
    await db
      .delete(commissionEventsTable)
      .where(eq(commissionEventsTable.tenantId, tid));
    await db
      .delete(commissionEntriesTable)
      .where(eq(commissionEntriesTable.tenantId, tid));
    const plans = await db
      .select()
      .from(commissionPlansTable)
      .where(eq(commissionPlansTable.tenantId, tid));
    for (const p of plans) {
      await db
        .delete(ruleInstancesTable)
        .where(eq(ruleInstancesTable.planId, p.id));
    }
    await db
      .delete(commissionPlansTable)
      .where(eq(commissionPlansTable.tenantId, tid));
    await db
      .delete(schemaMappingsTable)
      .where(eq(schemaMappingsTable.tenantId, tid));
    await db.delete(jobsTable).where(eq(jobsTable.tenantId, tid));
    await db.delete(peopleTable).where(eq(peopleTable.tenantId, tid));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tid));
  }

  const [tenant] = await db
    .insert(tenantsTable)
    .values({
      name: "Paragon Painting Atlanta",
      slug: "paragon-atlanta",
      status: "active",
      airtableBaseId: "appoMG3V2gfaN2dEo",
      airtableConnected: false,
    })
    .returning();
  const tenantId = tenant!.id;

  // People — sales leads (SL1/SL2), sales manager, project managers.
  const peopleSeed = [
    { name: "Seth Owens", roles: ["SL"], position: "SL2", ytdSales: 2_150_000 },
    { name: "Brad Carter", roles: ["SM", "SL"], position: "SL1", ytdSales: 1_420_000 },
    { name: "Dana Mills", roles: ["SL"], position: "SL2", ytdSales: 1_680_000 },
    { name: "Priya Shah", roles: ["SL"], position: "SL1", ytdSales: 940_000 },
    { name: "Marcus Lee", roles: ["SL"], position: "SL1", ytdSales: 560_000 },
    { name: "Tom Becker", roles: ["PM"], position: "PM", ytdSales: null },
    { name: "Elena Ruiz", roles: ["PM"], position: "PM", ytdSales: null },
    { name: "Greg Hall", roles: ["PMM"], position: "PMM", ytdSales: null },
  ];
  const people = await db
    .insert(peopleTable)
    .values(peopleSeed.map((p) => ({ ...p, tenantId })))
    .returning();
  console.log(`  ${people.length} people`);

  // Jobs — mix of healthy and low-GP (gatekeeper), referral-sourced, cancelled.
  const jobsSeed = [
    { jobNumber: "J-1001", customer: "Maple Ridge HOA", salesRep: "Seth Owens", manager: "Tom Becker", totalAmount: 86_000, gpAmount: 39_560, gpPct: 46, leadSource: "Website", status: "completed" },
    { jobNumber: "J-1002", customer: "Brookhaven Office Park", salesRep: "Dana Mills", manager: "Elena Ruiz", totalAmount: 132_000, gpAmount: 56_760, gpPct: 43, leadSource: "Referral", status: "completed" },
    { jobNumber: "J-1003", customer: "Sandy Springs Retail", salesRep: "Priya Shah", manager: "Tom Becker", totalAmount: 48_500, gpAmount: 17_460, gpPct: 36, leadSource: "Referral", status: "completed" },
    { jobNumber: "J-1004", customer: "Decatur Lofts", salesRep: "Marcus Lee", manager: "Elena Ruiz", totalAmount: 61_200, gpAmount: 27_540, gpPct: 45, leadSource: "Repeat", status: "open" },
    { jobNumber: "J-1005", customer: "Buckhead Tower", salesRep: "Brad Carter", manager: "Greg Hall", totalAmount: 215_000, gpAmount: 96_750, gpPct: 45, leadSource: "Website", status: "completed" },
    { jobNumber: "J-1006", customer: "Vinings Estates", salesRep: "Dana Mills", manager: "Tom Becker", totalAmount: 73_400, gpAmount: 25_690, gpPct: 35, leadSource: "Website", status: "completed" },
    { jobNumber: "J-1007", customer: "Midtown Medical", salesRep: "Seth Owens", manager: "Elena Ruiz", totalAmount: 158_000, gpAmount: 72_680, gpPct: 46, leadSource: "Referral", status: "open" },
    { jobNumber: "J-1008", customer: "Smyrna Self Storage", salesRep: "Priya Shah", manager: "Tom Becker", totalAmount: 39_000, gpAmount: 18_330, gpPct: 47, leadSource: "Website", status: "completed" },
    { jobNumber: "J-1009", customer: "Roswell Daycare", salesRep: "Marcus Lee", manager: "Greg Hall", totalAmount: 52_700, gpAmount: 21_080, gpPct: 40, leadSource: "Referral", status: "open" },
    { jobNumber: "J-1010", customer: "Alpharetta Cancelled Job", salesRep: "Dana Mills", manager: "Tom Becker", totalAmount: 44_000, gpAmount: 19_800, gpPct: 45, leadSource: "Website", status: "cancelled", cancelled: true },
  ];
  const jobs = await db
    .insert(jobsTable)
    .values(jobsSeed.map((j) => ({ ...j, tenantId })))
    .returning();
  console.log(`  ${jobs.length} jobs`);

  // Schema mapping — canonical -> Airtable field names (real Paragon structure).
  const entities: EntityMapping[] = [
    {
      entityKind: "person",
      label: "People",
      tableId: null,
      tableName: "People",
      fields: [
        { canonical: "name", label: "Name", required: true, mapped: true, airtableFieldId: null, airtableFieldName: "Name" },
        { canonical: "roles", label: "Roles", required: false, mapped: true, airtableFieldId: null, airtableFieldName: "Role" },
        { canonical: "position", label: "Position", required: true, mapped: true, airtableFieldId: null, airtableFieldName: "Company Position" },
        { canonical: "ytdSales", label: "YTD Sales", required: false, mapped: false, airtableFieldId: null, airtableFieldName: null },
        { canonical: "startDate", label: "Start Date", required: false, mapped: true, airtableFieldId: null, airtableFieldName: "Hire Date" },
        { canonical: "active", label: "Active", required: false, mapped: true, airtableFieldId: null, airtableFieldName: "Employment Status" },
      ],
      unrecognizedFields: [],
    },
    {
      entityKind: "job",
      label: "Jobs",
      tableId: null,
      tableName: "Jobs",
      fields: [
        { canonical: "jobNumber", label: "Job Number", required: true, mapped: true, airtableFieldId: null, airtableFieldName: "Estimate/Job Number" },
        { canonical: "jobName", label: "Job Name", required: false, mapped: true, airtableFieldId: null, airtableFieldName: "Job Name" },
        { canonical: "customer", label: "Customer", required: false, mapped: true, airtableFieldId: null, airtableFieldName: "Job Contact Name" },
        { canonical: "salesRep", label: "Sales Rep", required: true, mapped: true, airtableFieldId: null, airtableFieldName: "Sales" },
        { canonical: "manager", label: "Project Manager", required: false, mapped: true, airtableFieldId: null, airtableFieldName: "Coordinator" },
        { canonical: "totalAmount", label: "Job Total", required: true, mapped: true, airtableFieldId: null, airtableFieldName: "Total Job Amount" },
        { canonical: "gpAmount", label: "Gross Profit $", required: true, mapped: true, airtableFieldId: null, airtableFieldName: "Gross Profit $" },
        { canonical: "gpPct", label: "Gross Profit %", required: true, mapped: true, airtableFieldId: null, airtableFieldName: "Gross Profit %" },
        { canonical: "leadSource", label: "Lead Source", required: false, mapped: true, airtableFieldId: null, airtableFieldName: "Source" },
        { canonical: "status", label: "Status", required: false, mapped: true, airtableFieldId: null, airtableFieldName: "Job Status" },
        { canonical: "signedDate", label: "Signed Date", required: false, mapped: true, airtableFieldId: null, airtableFieldName: "Won Date" },
        { canonical: "completedDate", label: "Completed Date", required: false, mapped: true, airtableFieldId: null, airtableFieldName: "Job End Date" },
      ],
      unrecognizedFields: [],
    },
  ];
  await db.insert(schemaMappingsTable).values({ tenantId, entities });

  // Commission plan + rule instances (Paragon's real rate card).
  const [plan] = await db
    .insert(commissionPlansTable)
    .values({
      tenantId,
      name: "Paragon 2026 Comp Plan",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
    })
    .returning();
  const planId = plan!.id;

  await db.insert(ruleInstancesTable).values([
    {
      planId,
      ruleModuleKey: "gp_gatekeeper",
      ruleModuleName: "GP Gatekeeper",
      description: "Jobs below 40% gross profit pay no commission.",
      params: { floorPct: 40, gatedTypes: ["SL", "SM", "PM", "PMM"] },
      appliesTo: {},
      enabled: true,
      orderIndex: 0,
    },
    {
      planId,
      ruleModuleKey: "tiered_ytd_rate",
      ruleModuleName: "Sales Lead Tiered Rate",
      description:
        "SL commission as % of job total, stepping up by YTD sales tier; SL2 earns higher rates than SL1.",
      params: {
        basis: "totalAmount",
        positions: [
          {
            position: "SL1",
            tiers: [
              { ytdUpTo: 1_000_000, rate: 0.025 },
              { ytdUpTo: 1_500_000, rate: 0.03 },
              { ytdUpTo: 2_000_000, rate: 0.04 },
              { ytdUpTo: null, rate: 0.045 },
            ],
          },
          {
            position: "SL2",
            tiers: [
              { ytdUpTo: 1_000_000, rate: 0.03 },
              { ytdUpTo: 1_500_000, rate: 0.035 },
              { ytdUpTo: 2_000_000, rate: 0.045 },
              { ytdUpTo: null, rate: 0.05 },
            ],
          },
        ],
      },
      appliesTo: {},
      enabled: true,
      orderIndex: 1,
    },
    {
      planId,
      ruleModuleKey: "sm_cut",
      ruleModuleName: "Sales Manager Override (Brad)",
      description: "Brad earns 0.75% of every job total, excluding Seth-sold jobs.",
      params: {
        managerName: "Brad Carter",
        rate: 0.0075,
        excludeSoldBy: ["Seth Owens"],
      },
      appliesTo: {},
      enabled: true,
      orderIndex: 2,
    },
    {
      planId,
      ruleModuleKey: "pm_gp_rate",
      ruleModuleName: "Project Manager GP Rate",
      description: "PMs earn 2% of project gross-profit dollars.",
      params: { rate: 0.02, type: "PM" },
      appliesTo: {},
      enabled: true,
      orderIndex: 3,
    },
    {
      planId,
      ruleModuleKey: "referral_bonus",
      ruleModuleName: "Referral Bonus",
      description:
        "$50 flat bonus on referral-sourced jobs; roles already paid on the sale (SL/SM) are excluded.",
      params: { amount: 50, excludeRoles: ["SL", "SM"] },
      appliesTo: {},
      enabled: true,
      orderIndex: 4,
    },
    {
      planId,
      ruleModuleKey: "review_bonus",
      ruleModuleName: "Five-Star Review Bonus",
      description: "$50 per linked five-star review (manually awarded).",
      params: { amountPerReview: 50 },
      appliesTo: {},
      enabled: true,
      orderIndex: 5,
    },
  ]);
  console.log("  plan + 6 rule instances");

  // A couple of manually-awarded bonus entries (sourceKind manual, no dedupeKey)
  // to demonstrate that recompute leaves operator-created entries untouched.
  const seth = people.find((p) => p.name === "Seth Owens")!;
  const dana = people.find((p) => p.name === "Dana Mills")!;
  const tom = people.find((p) => p.name === "Tom Becker")!;
  const greg = people.find((p) => p.name === "Greg Hall")!;
  const reviewEntries = await db
    .insert(commissionEntriesTable)
    .values([
      {
        tenantId,
        personId: seth.id,
        personName: seth.name,
        type: "MSC",
        sourceKind: "manual",
        sourceLabel: "5-star review — Maple Ridge HOA",
        amount: 50,
        state: "payable",
        positionAtCosted: seth.position,
        notes: "Awarded for verified 5-star Google review.",
        accruedAt: new Date(),
        payableAt: new Date(),
      },
      {
        tenantId,
        personId: dana.id,
        personName: dana.name,
        type: "MSC",
        sourceKind: "manual",
        sourceLabel: "5-star review — Brookhaven Office Park",
        amount: 50,
        state: "accrued",
        positionAtCosted: dana.position,
        notes: "Awarded for verified 5-star review.",
        accruedAt: new Date(),
      },
      {
        tenantId,
        personId: tom.id,
        personName: tom.name,
        type: "REF",
        sourceKind: "manual",
        sourceLabel: "Referral — Midtown Medical lead",
        amount: 50,
        state: "payable",
        positionAtCosted: tom.position,
        notes: "Referred a new commercial client (non-sales role).",
        accruedAt: new Date(),
        payableAt: new Date(),
      },
      {
        tenantId,
        personId: greg.id,
        personName: greg.name,
        type: "REF",
        sourceKind: "manual",
        sourceLabel: "Referral — Roswell Daycare lead",
        amount: 50,
        state: "accrued",
        positionAtCosted: greg.position,
        notes: "Referred a new client (non-sales role).",
        accruedAt: new Date(),
      },
    ])
    .returning();
  for (const e of reviewEntries) {
    await db.insert(commissionEventsTable).values({
      entryId: e.id,
      tenantId,
      eventKind: "created",
      before: null,
      after: { amount: e.amount, state: e.state },
      actor: "operator",
    });
  }
  console.log("  2 manual review bonuses");

  console.log("Seed complete. Tenant id:", tenantId);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
