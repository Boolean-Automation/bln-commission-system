import type { Tenant } from "@workspace/db";
import { airtableProvider } from "./airtable";
import type { DataSourceProvider, ProviderInfo } from "./types";

export * from "./types";

/** The provider every new tenant defaults to. */
export const DEFAULT_PROVIDER_KEY = "airtable";

/**
 * Registry of concrete providers. Adding a new data source = implement
 * `DataSourceProvider` and register it here; nothing else needs to know the key.
 */
const PROVIDERS: Record<string, DataSourceProvider> = {
  [airtableProvider.key]: airtableProvider,
};

/**
 * Catalog surfaced to the integration UI. Providers without a concrete
 * implementation can be listed here as `available: false` so they appear as
 * "coming soon" without being selectable.
 */
const CATALOG: ProviderInfo[] = [
  { key: airtableProvider.key, label: airtableProvider.label, available: true },
];

export function getProvider(key: string): DataSourceProvider {
  const provider = PROVIDERS[key];
  if (!provider) {
    throw new Error(`Unknown data-source provider: ${key}`);
  }
  return provider;
}

export function listProviderInfo(): ProviderInfo[] {
  return CATALOG;
}

/**
 * Resolve the provider a tenant ingests from, falling back to the default when
 * the column is unset (e.g. rows created before the provider seam existed).
 */
export function getTenantProvider(tenant: Tenant): DataSourceProvider {
  return getProvider(tenant.dataSourceProvider || DEFAULT_PROVIDER_KEY);
}

/**
 * The provider-specific connection identifier stored on a tenant. Airtable keeps
 * it in `airtableBaseId`; future providers extend this resolver as they add
 * their own connection storage.
 */
export function getTenantConnectionId(tenant: Tenant): string | null {
  return tenant.airtableBaseId ?? null;
}
