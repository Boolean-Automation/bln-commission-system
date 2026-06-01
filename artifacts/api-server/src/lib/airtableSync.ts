import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import {
  db,
  tenantsTable,
  peopleTable,
  jobsTable,
  schemaMappingsTable,
  type EntityMapping,
} from "@workspace/db";
import { fetchAllRecords, type AirtableRecord } from "./airtable";
import { recomputeTenant, type RecomputeResult } from "./engine";

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[^0-9.\-]/g, "");
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseList(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) {
    return v.map((x) => String(x).trim()).filter(Boolean);
  }
  return String(v)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function parseBool(v: unknown, fallback = true): boolean {
  const s = parseStr(v);
  if (s === null) return fallback;
  return !/(inactive|terminated|former|exit|disabled|no|false|0)/i.test(s);
}

type FieldMap = Map<string, string>;

function buildFieldMap(entity: EntityMapping | undefined): FieldMap {
  const m: FieldMap = new Map();
  if (!entity) return m;
  for (const f of entity.fields) {
    if (f.mapped && f.airtableFieldName) {
      m.set(f.canonical, f.airtableFieldName);
    }
  }
  return m;
}

function reader(map: FieldMap, rec: AirtableRecord) {
  return (canonical: string): unknown =>
    map.has(canonical) ? rec.fields[map.get(canonical)!] : undefined;
}

export type SyncResult = {
  peopleUpserted: number;
  peopleRemoved: number;
  jobsUpserted: number;
  jobsRemoved: number;
  recompute: RecomputeResult;
};

export async function syncTenantFromAirtable(
  tenantId: string,
): Promise<SyncResult> {
  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant) throw new Error("Tenant not found");
  if (!tenant.airtableBaseId) {
    throw new Error("Tenant has no Airtable base configured");
  }
  const baseId = tenant.airtableBaseId;

  const [mapping] = await db
    .select()
    .from(schemaMappingsTable)
    .where(eq(schemaMappingsTable.tenantId, tenantId));
  const entities = mapping?.entities ?? [];
  const personEntity = entities.find((e) => e.entityKind === "person");
  const jobEntity = entities.find((e) => e.entityKind === "job");
  if (!personEntity?.tableName) {
    throw new Error("Map the People table before syncing");
  }
  if (!jobEntity?.tableName) {
    throw new Error("Map the Jobs table before syncing");
  }

  const personFields = buildFieldMap(personEntity);
  const jobFields = buildFieldMap(jobEntity);

  // --- People ---
  const personRecords = await fetchAllRecords(baseId, personEntity.tableName);
  const peopleSeen: string[] = [];
  let peopleUpserted = 0;
  for (const rec of personRecords) {
    // The record exists in Airtable, so mark it seen up front. Pruning must be
    // driven by source presence, not by whether we could map the row —
    // otherwise an unmappable (but still-present) record would be deleted.
    peopleSeen.push(rec.id);
    const get = reader(personFields, rec);
    const name = parseStr(get("name"));
    if (!name) continue; // name is required and the engine matches on it
    const values = {
      name,
      roles: parseList(get("roles")),
      position: parseStr(get("position")),
      ytdSales: parseNumber(get("ytdSales")),
      startDate: parseStr(get("startDate")),
      active: parseBool(get("active")),
    };
    await db
      .insert(peopleTable)
      .values({ tenantId, airtableRecordId: rec.id, ...values })
      .onConflictDoUpdate({
        target: [peopleTable.tenantId, peopleTable.airtableRecordId],
        set: values,
      });
    peopleUpserted++;
  }

  // --- Jobs ---
  const jobRecords = await fetchAllRecords(baseId, jobEntity.tableName);
  const jobsSeen: string[] = [];
  let jobsUpserted = 0;
  for (const rec of jobRecords) {
    // Mark seen before validation — see the People loop for the rationale.
    jobsSeen.push(rec.id);
    const get = reader(jobFields, rec);
    const jobNumber = parseStr(get("jobNumber"));
    if (!jobNumber) continue;
    const status = parseStr(get("status")) ?? "open";
    const values = {
      jobNumber,
      jobName: parseStr(get("jobName")),
      customer: parseStr(get("customer")),
      salesRep: parseStr(get("salesRep")),
      manager: parseStr(get("manager")),
      totalAmount: parseNumber(get("totalAmount")),
      gpAmount: parseNumber(get("gpAmount")),
      gpPct: parseNumber(get("gpPct")),
      status,
      cancelled: /cancel|lost|dead|dropped/i.test(status),
      leadSource: parseStr(get("leadSource")),
      signedDate: parseStr(get("signedDate")),
      completedDate: parseStr(get("completedDate")),
    };
    await db
      .insert(jobsTable)
      .values({ tenantId, airtableRecordId: rec.id, ...values })
      .onConflictDoUpdate({
        target: [jobsTable.tenantId, jobsTable.airtableRecordId],
        set: values,
      });
    jobsUpserted++;
  }

  // Prune rows previously synced from Airtable that are now gone from the
  // source. Seed/manual rows (airtableRecordId null) are never touched.
  const peopleRemoved = (
    await db
      .delete(peopleTable)
      .where(
        and(
          eq(peopleTable.tenantId, tenantId),
          isNotNull(peopleTable.airtableRecordId),
          peopleSeen.length > 0
            ? notInArray(peopleTable.airtableRecordId, peopleSeen)
            : undefined,
        ),
      )
      .returning({ id: peopleTable.id })
  ).length;

  const jobsRemoved = (
    await db
      .delete(jobsTable)
      .where(
        and(
          eq(jobsTable.tenantId, tenantId),
          isNotNull(jobsTable.airtableRecordId),
          jobsSeen.length > 0
            ? notInArray(jobsTable.airtableRecordId, jobsSeen)
            : undefined,
        ),
      )
      .returning({ id: jobsTable.id })
  ).length;

  await db
    .update(tenantsTable)
    .set({ airtableConnected: true })
    .where(eq(tenantsTable.id, tenantId));

  const recompute = await recomputeTenant(tenantId);

  return { peopleUpserted, peopleRemoved, jobsUpserted, jobsRemoved, recompute };
}
