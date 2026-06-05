import {
  listBases,
  getBaseTables,
  fetchAllRecords,
} from "../airtable";
import type {
  DataSourceProvider,
  SourceConnection,
  SourceRecord,
  SourceTable,
} from "./types";

/**
 * Airtable concrete implementation of the data-source contract. It is a thin
 * adapter over the low-level Airtable REST client (`lib/airtable.ts`): bases map
 * to connections, base tables to source tables, and rows to source records.
 */
export const airtableProvider: DataSourceProvider = {
  key: "airtable",
  label: "Airtable",

  async listConnections(): Promise<SourceConnection[]> {
    const bases = await listBases();
    return bases.map((b) => ({
      id: b.id,
      name: b.name,
      permissionLevel: b.permissionLevel,
    }));
  },

  async listTables(connectionId: string): Promise<SourceTable[]> {
    return getBaseTables(connectionId);
  },

  async fetchRecords(
    connectionId: string,
    tableName: string,
  ): Promise<SourceRecord[]> {
    return fetchAllRecords(connectionId, tableName);
  },
};
