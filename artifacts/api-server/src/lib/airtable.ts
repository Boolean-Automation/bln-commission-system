import { ReplitConnectors } from "@replit/connectors-sdk";

let _connectors: ReplitConnectors | null = null;

function client(): ReplitConnectors {
  if (!_connectors) _connectors = new ReplitConnectors();
  return _connectors;
}

async function airtableGet(path: string): Promise<unknown> {
  const pat = process.env.AIRTABLE_PAT;
  const resp = pat
    ? await fetch(`https://api.airtable.com${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${pat}` },
      })
    : await client().proxy("airtable", path, { method: "GET" });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Airtable API ${resp.status}: ${text}`);
  }
  return resp.json();
}

export type AirtableBase = {
  id: string;
  name: string;
  permissionLevel: string;
};

export async function listBases(): Promise<AirtableBase[]> {
  const data = (await airtableGet("/v0/meta/bases")) as {
    bases?: Array<{ id: string; name: string; permissionLevel: string }>;
  };
  return (data.bases ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    permissionLevel: b.permissionLevel,
  }));
}

export type AirtableField = { id: string; name: string; type: string };
export type AirtableTable = {
  id: string;
  name: string;
  fields: AirtableField[];
};

export async function getBaseTables(baseId: string): Promise<AirtableTable[]> {
  const data = (await airtableGet(
    `/v0/meta/bases/${encodeURIComponent(baseId)}/tables`,
  )) as {
    tables?: Array<{
      id: string;
      name: string;
      fields?: Array<{ id: string; name: string; type: string }>;
    }>;
  };
  return (data.tables ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    fields: (t.fields ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
    })),
  }));
}

export type AirtableRecord = { id: string; fields: Record<string, unknown> };

/**
 * Fetch every record from a table, following Airtable's offset pagination.
 * Uses cellFormat=string so currencies, percents, dates and linked records
 * come back as human-readable display values (requires timeZone + userLocale).
 */
export async function fetchAllRecords(
  baseId: string,
  tableName: string,
): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({
      cellFormat: "string",
      timeZone: "America/New_York",
      userLocale: "en-us",
      pageSize: "100",
    });
    if (offset) params.set("offset", offset);
    const data = (await airtableGet(
      `/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(
        tableName,
      )}?${params.toString()}`,
    )) as {
      records?: Array<{ id: string; fields?: Record<string, unknown> }>;
      offset?: string;
    };
    for (const r of data.records ?? []) {
      records.push({ id: r.id, fields: r.fields ?? {} });
    }
    offset = data.offset;
  } while (offset);
  return records;
}
