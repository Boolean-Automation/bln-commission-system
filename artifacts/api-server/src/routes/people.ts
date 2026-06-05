import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, peopleTable, jobsTable } from "@workspace/db";
import {
  ListPeopleParams,
  ListPeopleResponse,
  ListJobsParams,
  ListJobsResponse,
} from "@workspace/api-zod";
import { requireTenantAccess } from "../lib/rbac";
import { serializePerson, serializeJob } from "../lib/serialize";

const router: IRouter = Router();

router.use("/tenants/:tenantId", requireTenantAccess);

router.get("/tenants/:tenantId/people", async (req, res): Promise<void> => {
  const params = ListPeopleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const people = await db
    .select()
    .from(peopleTable)
    .where(eq(peopleTable.tenantId, params.data.tenantId))
    .orderBy(peopleTable.name);
  res.json(ListPeopleResponse.parse(people.map(serializePerson)));
});

router.get("/tenants/:tenantId/jobs", async (req, res): Promise<void> => {
  const params = ListJobsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const jobs = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.tenantId, params.data.tenantId))
    .orderBy(jobsTable.jobNumber);
  res.json(ListJobsResponse.parse(jobs.map(serializeJob)));
});

export default router;
