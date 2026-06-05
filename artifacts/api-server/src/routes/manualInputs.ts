import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import {
  db,
  manualInputsTable,
  manualInputEventsTable,
  peopleTable,
} from "@workspace/db";
import {
  ListManualInputsParams,
  ListManualInputsQueryParams,
  ListManualInputsResponse,
  UpsertManualInputParams,
  UpsertManualInputBody,
  UpsertManualInputResponse,
  DeleteManualInputParams,
  DeleteManualInputResponse,
  GetManualInputEventsParams,
  GetManualInputEventsResponse,
  GetManualInputVariablesParams,
  GetManualInputVariablesQueryParams,
  GetManualInputVariablesResponse,
} from "@workspace/api-zod";
import { requireTenantAccess, auditActor } from "../lib/rbac";
import {
  serializeManualInput,
  serializeManualInputEvent,
} from "../lib/serialize";
import {
  derivePeriodRange,
  isPeriodType,
  resolveManualInputVariables,
} from "../lib/manualInputs";

const router: IRouter = Router();

router.use("/tenants/:tenantId", requireTenantAccess);

router.get(
  "/tenants/:tenantId/manual-inputs",
  async (req, res): Promise<void> => {
    const params = ListManualInputsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const query = ListManualInputsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    if (!isPeriodType(query.data.periodType)) {
      res.status(400).json({ error: "Invalid periodType" });
      return;
    }
    const rows = await db
      .select()
      .from(manualInputsTable)
      .where(
        and(
          eq(manualInputsTable.tenantId, params.data.tenantId),
          eq(manualInputsTable.periodType, query.data.periodType),
          eq(manualInputsTable.periodKey, query.data.periodKey),
        ),
      );
    res.json(ListManualInputsResponse.parse(rows.map(serializeManualInput)));
  },
);

router.post(
  "/tenants/:tenantId/manual-inputs",
  async (req, res): Promise<void> => {
    const params = UpsertManualInputParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpsertManualInputBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const tenantId = params.data.tenantId;
    const {
      personId,
      periodType,
      periodKey,
      quota,
      ote,
      acceleratorThreshold,
      acceleratorMultiplier,
      notes,
    } = body.data;

    if (!isPeriodType(periodType)) {
      res.status(400).json({ error: "Invalid periodType" });
      return;
    }
    const range = derivePeriodRange(periodType, periodKey);
    if (!range) {
      res
        .status(400)
        .json({ error: `periodKey "${periodKey}" is invalid for ${periodType}` });
      return;
    }

    // The person must belong to this tenant.
    const [person] = await db
      .select({ id: peopleTable.id })
      .from(peopleTable)
      .where(
        and(eq(peopleTable.id, personId), eq(peopleTable.tenantId, tenantId)),
      );
    if (!person) {
      res.status(400).json({ error: "Person not found for this company" });
      return;
    }

    const actor = auditActor(req.authContext!);
    const values = {
      quota: quota ?? null,
      ote: ote ?? null,
      acceleratorThreshold: acceleratorThreshold ?? null,
      acceleratorMultiplier: acceleratorMultiplier ?? null,
      notes: notes ?? null,
    };

    const saved = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(manualInputsTable)
        .where(
          and(
            eq(manualInputsTable.tenantId, tenantId),
            eq(manualInputsTable.personId, personId),
            eq(manualInputsTable.periodType, periodType),
            eq(manualInputsTable.periodKey, periodKey),
          ),
        );

      if (existing) {
        const [row] = await tx
          .update(manualInputsTable)
          .set({
            ...values,
            effectiveFrom: range.effectiveFrom,
            effectiveTo: range.effectiveTo,
            updatedBy: actor,
            updatedAt: new Date(),
          })
          .where(eq(manualInputsTable.id, existing.id))
          .returning();
        await tx.insert(manualInputEventsTable).values({
          manualInputId: existing.id,
          tenantId,
          personId,
          eventKind: "updated",
          before: {
            quota: existing.quota,
            ote: existing.ote,
            acceleratorThreshold: existing.acceleratorThreshold,
            acceleratorMultiplier: existing.acceleratorMultiplier,
            notes: existing.notes,
          },
          after: { ...values },
          actor,
        });
        return row!;
      }

      const [row] = await tx
        .insert(manualInputsTable)
        .values({
          tenantId,
          personId,
          periodType,
          periodKey,
          ...values,
          effectiveFrom: range.effectiveFrom,
          effectiveTo: range.effectiveTo,
          updatedBy: actor,
        })
        .returning();
      await tx.insert(manualInputEventsTable).values({
        manualInputId: row!.id,
        tenantId,
        personId,
        eventKind: "created",
        before: null,
        after: { ...values },
        actor,
      });
      return row!;
    });

    res.json(UpsertManualInputResponse.parse(serializeManualInput(saved)));
  },
);

router.delete(
  "/tenants/:tenantId/manual-inputs/:manualInputId",
  async (req, res): Promise<void> => {
    const params = DeleteManualInputParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const actor = auditActor(req.authContext!);
    const deleted = await db.transaction(async (tx) => {
      const [row] = await tx
        .delete(manualInputsTable)
        .where(
          and(
            eq(manualInputsTable.id, params.data.manualInputId),
            eq(manualInputsTable.tenantId, params.data.tenantId),
          ),
        )
        .returning();
      if (!row) return null;
      await tx.insert(manualInputEventsTable).values({
        manualInputId: row.id,
        tenantId: row.tenantId,
        personId: row.personId,
        eventKind: "deleted",
        before: {
          quota: row.quota,
          ote: row.ote,
          acceleratorThreshold: row.acceleratorThreshold,
          acceleratorMultiplier: row.acceleratorMultiplier,
          notes: row.notes,
        },
        after: null,
        actor,
      });
      return row;
    });
    if (!deleted) {
      res.status(404).json({ error: "Manual input not found" });
      return;
    }
    res.json(
      DeleteManualInputResponse.parse({ id: deleted.id, deleted: true }),
    );
  },
);

router.get(
  "/tenants/:tenantId/manual-inputs/:manualInputId/events",
  async (req, res): Promise<void> => {
    const params = GetManualInputEventsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const events = await db
      .select()
      .from(manualInputEventsTable)
      .where(
        and(
          eq(manualInputEventsTable.manualInputId, params.data.manualInputId),
          eq(manualInputEventsTable.tenantId, params.data.tenantId),
        ),
      )
      .orderBy(desc(manualInputEventsTable.at));
    res.json(
      GetManualInputEventsResponse.parse(events.map(serializeManualInputEvent)),
    );
  },
);

router.get(
  "/tenants/:tenantId/manual-input-variables",
  async (req, res): Promise<void> => {
    const params = GetManualInputVariablesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const query = GetManualInputVariablesQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    if (!isPeriodType(query.data.periodType)) {
      res.status(400).json({ error: "Invalid periodType" });
      return;
    }
    const variables = await resolveManualInputVariables(
      params.data.tenantId,
      query.data.periodType,
      query.data.periodKey,
    );
    res.json(GetManualInputVariablesResponse.parse(variables));
  },
);

export default router;
