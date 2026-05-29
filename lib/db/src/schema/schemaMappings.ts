import { pgTable, uuid, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type MappedField = {
  canonical: string;
  label: string;
  required: boolean;
  mapped: boolean;
  airtableFieldId: string | null;
  airtableFieldName: string | null;
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
