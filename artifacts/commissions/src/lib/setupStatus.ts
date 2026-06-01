import type { Tenant } from "@workspace/api-client-react";

/**
 * The onboarding step a company still needs to complete. Mirrors the wizard's
 * step order (connect → map → sync). `null` means the company is fully set up
 * with synced data.
 */
export type SetupStep = "connect" | "map" | "sync" | null;

/**
 * Where in the connect → map → plan → sync flow a company currently sits.
 * - `connect`: no Airtable base connected yet
 * - `map`: base connected but required fields not all mapped
 * - `sync`: mapped but no people/jobs imported yet
 * - `null`: fully set up with synced data
 */
export function getSetupStep(tenant: Tenant): SetupStep {
  if (!tenant.airtableConnected) return "connect";
  if (!tenant.requiredFieldsMapped) return "map";
  if (tenant.peopleCount === 0 && tenant.jobsCount === 0) return "sync";
  return null;
}

/**
 * A company has "incomplete setup" when it has no base connected or its required
 * fields aren't all mapped — i.e. it can't sync yet.
 */
export function isSetupIncomplete(tenant: Tenant): boolean {
  const step = getSetupStep(tenant);
  return step === "connect" || step === "map";
}

/**
 * A company is connected and mapped but hasn't imported any people or jobs yet.
 */
export function hasNoSyncedData(tenant: Tenant): boolean {
  return tenant.peopleCount === 0 && tenant.jobsCount === 0;
}

/** Short human label for the current setup step. */
export function setupStepLabel(step: SetupStep): string {
  switch (step) {
    case "connect":
      return "Connect a base";
    case "map":
      return "Map fields";
    case "sync":
      return "Run first sync";
    default:
      return "Set up";
  }
}
