import { pgTable, uuid, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type MappedField = {
  canonical: string;
  label: string;
  required: boolean;
  mapped: boolean;
  // Provider-neutral reference to the source object's field. For Airtable these
  // are the column id/name; other providers populate them with their own field
  // identifier/name. The canonical key on the left stays provider-independent.
  sourceFieldId: string | null;
  sourceFieldName: string | null;
};

export type EntityMapping = {
  entityKind: "person" | "job" | "project" | "addendum";
  label: string;
  tableId: string | null;
  tableName: string | null;
  fields: MappedField[];
  unrecognizedFields: string[];
};

export const schemaMappingsTable = pgTable("schema_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().unique(),
  entities: jsonb("entities").$type<EntityMapping[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSchemaMappingSchema = createInsertSchema(
  schemaMappingsTable,
).omit({ id: true, updatedAt: true });
export type InsertSchemaMapping = z.infer<typeof insertSchemaMappingSchema>;
export type SchemaMappingRow = typeof schemaMappingsTable.$inferSelect;
