/**
 * One-off data migration: rename the per-field source reference keys in
 * `schema_mappings.entities` from the Airtable-specific `airtableFieldId` /
 * `airtableFieldName` to the provider-neutral `sourceFieldId` / `sourceFieldName`.
 *
 * `drizzle-kit push` only migrates schema, not JSONB contents, so existing rows
 * (e.g. tenants created via onboarding) keep the old keys until this runs.
 * Idempotent: rows already using the new keys are skipped.
 */
import { eq } from "drizzle-orm";
import { db, schemaMappingsTable } from "@workspace/db";

type LegacyField = Record<string, unknown> & {
  airtableFieldId?: unknown;
  airtableFieldName?: unknown;
  sourceFieldId?: unknown;
  sourceFieldName?: unknown;
};

async function main() {
  const rows = await db.select().from(schemaMappingsTable);
  let changed = 0;

  for (const row of rows) {
    let rowChanged = false;
    const entities = (row.entities as any[]).map((entity) => {
      const fields = (entity.fields as LegacyField[]).map((f) => {
        if (!("airtableFieldId" in f) && !("airtableFieldName" in f)) return f;
        rowChanged = true;
        const next: LegacyField = { ...f };
        if ("airtableFieldId" in next) {
          next.sourceFieldId = next.sourceFieldId ?? next.airtableFieldId ?? null;
          delete next.airtableFieldId;
        }
        if ("airtableFieldName" in next) {
          next.sourceFieldName =
            next.sourceFieldName ?? next.airtableFieldName ?? null;
          delete next.airtableFieldName;
        }
        return next;
      });
      return { ...entity, fields };
    });

    if (rowChanged) {
      await db
        .update(schemaMappingsTable)
        .set({ entities })
        .where(eq(schemaMappingsTable.tenantId, row.tenantId));
      changed++;
    }
  }

  console.log(
    `Migrated ${changed} of ${rows.length} schema_mappings row(s) to source* field keys.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
