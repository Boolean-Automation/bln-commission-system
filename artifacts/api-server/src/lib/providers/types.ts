/**
 * Provider-agnostic data-source contract.
 *
 * Every concrete data source (Airtable today; CRMs/HRIS/direct-DB later) is
 * surfaced to the rest of the app through this interface. The ingestion
 * orchestrator (`lib/sync.ts`) and the connection routes only ever talk to a
 * `DataSourceProvider`, so adding a new provider means implementing this
 * contract and registering it — the engine, ledger, and UI stay unchanged.
 */

/** A connectable container within a provider (an Airtable base, a CRM org…). */
export type SourceConnection = {
  id: string;
  name: string;
  permissionLevel?: string | null;
};

/** A field/column on a source object. */
export type SourceField = { id: string; name: string; type: string };

/** A source object (table/entity) and its discoverable fields. */
export type SourceTable = { id: string; name: string; fields: SourceField[] };

/** One raw record from a source object, keyed by source field name. */
export type SourceRecord = { id: string; fields: Record<string, unknown> };

/** Lightweight catalog entry describing a provider to the UI. */
export type ProviderInfo = {
  key: string;
  label: string;
  /** False while a provider is only a stub (no concrete implementation yet). */
  available: boolean;
};

export interface DataSourceProvider {
  /** Stable identifier persisted on `tenants.dataSourceProvider`. */
  readonly key: string;
  /** Human-facing name shown in the integration UI. */
  readonly label: string;
  /** List the connectable containers the org can choose from. */
  listConnections(): Promise<SourceConnection[]>;
  /** List the source objects (and their fields) inside a connection. */
  listTables(connectionId: string): Promise<SourceTable[]>;
  /** Fetch every record from a source object inside a connection. */
  fetchRecords(connectionId: string, tableName: string): Promise<SourceRecord[]>;
}
