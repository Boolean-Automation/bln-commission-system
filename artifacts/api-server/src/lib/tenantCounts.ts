import { eq, count } from "drizzle-orm";
import {
  db,
  peopleTable,
  jobsTable,
  commissionEntriesTable,
} from "@workspace/db";

export async function tenantCounts(tenantId: string) {
  const [[p], [j], [e]] = await Promise.all([
    db
      .select({ c: count() })
      .from(peopleTable)
      .where(eq(peopleTable.tenantId, tenantId)),
    db
      .select({ c: count() })
      .from(jobsTable)
      .where(eq(jobsTable.tenantId, tenantId)),
    db
      .select({ c: count() })
      .from(commissionEntriesTable)
      .where(eq(commissionEntriesTable.tenantId, tenantId)),
  ]);
  return {
    peopleCount: p?.c ?? 0,
    jobsCount: j?.c ?? 0,
    entryCount: e?.c ?? 0,
  };
}
