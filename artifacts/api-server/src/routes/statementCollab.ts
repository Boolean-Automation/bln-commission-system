import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  statementsTable,
  statementThreadsTable,
  statementMessagesTable,
  statementEventsTable,
  type StatementRow,
  type StatementThreadRow,
  type StatementMessageRow,
} from "@workspace/db";
import {
  GetStatementThreadsForSelfParams,
  GetStatementThreadsForSelfQueryParams,
  GetStatementThreadsForSelfResponse,
  GetStatementThreadsForPersonParams,
  GetStatementThreadsForPersonQueryParams,
  GetStatementThreadsForPersonResponse,
  OpenStatementThreadForSelfParams,
  OpenStatementThreadForSelfBody,
  OpenStatementThreadForSelfResponse,
  OpenStatementThreadForPersonParams,
  OpenStatementThreadForPersonBody,
  OpenStatementThreadForPersonResponse,
  PostThreadMessageParams,
  PostThreadMessageBody,
  PostThreadMessageResponse,
  ResolveStatementThreadParams,
  ResolveStatementThreadResponse,
  ReopenStatementThreadParams,
  ReopenStatementThreadResponse,
  RequestStatementSignoffParams,
  RequestStatementSignoffBody,
  RequestStatementSignoffResponse,
  AcknowledgeStatementSignoffParams,
  AcknowledgeStatementSignoffBody,
  AcknowledgeStatementSignoffResponse,
  RescindStatementSignoffParams,
  RescindStatementSignoffBody,
  RescindStatementSignoffResponse,
} from "@workspace/api-zod";
import {
  auditActor,
  hasTenantAccess,
  requireTenantAccess,
  requireTenantAccessOrSelfRep,
  type AuthContextResolved,
} from "../lib/rbac";
import {
  findOrCreateStatement,
  loadUserNames,
  type SignoffState,
} from "../lib/statement";
import { isPeriodType, type PeriodType } from "../lib/manualInputs";

const router: IRouter = Router();

// ---------- helpers ----------

export function effectiveRoleFor(
  ctx: AuthContextResolved,
  tenantId: string,
): "super_operator" | "platform_operator" | "admin" | "rep" | "none" {
  if (ctx.isSuperOperator) return "super_operator";
  if (ctx.isPlatformOperator) return "platform_operator";
  const m = ctx.memberships.find((m) => m.tenantId === tenantId);
  if (m?.role === "admin") return "admin";
  if (m?.role === "rep") return "rep";
  return "none";
}

export function repPersonIdFor(
  ctx: AuthContextResolved,
  tenantId: string,
): string | null {
  const m = ctx.memberships.find(
    (m) => m.tenantId === tenantId && m.role === "rep",
  );
  return m?.personId ?? null;
}

// Pure state-machine helpers for sign-off transitions. The router uses these
// to decide whether a request is valid before opening a transaction.
export type SignoffTransition =
  | { ok: true; toState: SignoffState }
  | { ok: false; reason: string };

export function canRequestSignoff(
  currentState: string | null,
): SignoffTransition {
  if (currentState === "acknowledged") {
    return { ok: false, reason: "Statement is already acknowledged" };
  }
  return { ok: true, toState: "requested" };
}

export function canAcknowledgeSignoff(
  currentState: string | null,
): SignoffTransition {
  if (currentState !== "requested") {
    return { ok: false, reason: "Statement is not awaiting acknowledgement" };
  }
  return { ok: true, toState: "acknowledged" };
}

export function canRescindSignoff(
  currentState: string | null,
): SignoffTransition {
  if (currentState !== "requested") {
    return {
      ok: false,
      reason: "Sign-off was not in `requested` state",
    };
  }
  return { ok: true, toState: "none" };
}

async function loadStatement(
  statementId: string,
): Promise<StatementRow | null> {
  const [row] = await db
    .select()
    .from(statementsTable)
    .where(eq(statementsTable.id, statementId))
    .limit(1);
  return row ?? null;
}

async function loadThread(
  threadId: string,
): Promise<StatementThreadRow | null> {
  const [row] = await db
    .select()
    .from(statementThreadsTable)
    .where(eq(statementThreadsTable.id, threadId))
    .limit(1);
  return row ?? null;
}

function serializeThreadSummary(
  thread: StatementThreadRow,
  openedByName: string | null,
) {
  return {
    id: thread.id,
    entryId: thread.entryId ?? null,
    subject: thread.subject ?? null,
    status: thread.status as "open" | "resolved",
    messageCount: thread.messageCount,
    lastMessageAt: thread.lastMessageAt.toISOString(),
    openedByName,
  };
}

function serializeMessage(
  message: StatementMessageRow,
  authorName: string | null,
) {
  return {
    id: message.id,
    threadId: message.threadId,
    authorUserId: message.authorUserId,
    authorName,
    authorRoleAtPost: message.authorRoleAtPost,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

function signoffPayload(row: StatementRow) {
  return {
    state: (row.signoffState as SignoffState) ?? "none",
    requestedAt: row.signoffRequestedAt
      ? row.signoffRequestedAt.toISOString()
      : null,
    // requestedByName needs a user lookup; the caller resolves it.
    requestedByName: null as string | null,
    acknowledgedAt: row.signoffAcknowledgedAt
      ? row.signoffAcknowledgedAt.toISOString()
      : null,
  };
}

async function buildSignoffResponse(row: StatementRow) {
  const ids = [
    row.signoffRequestedByUserId,
    row.signoffAcknowledgedByUserId,
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
  const nameById = await loadUserNames(ids);
  const payload = signoffPayload(row);
  payload.requestedByName = row.signoffRequestedByUserId
    ? (nameById.get(row.signoffRequestedByUserId) ?? null)
    : null;
  return payload;
}

// ---------- thread listing (GET) ----------

async function listThreadsForStatement(
  statementId: string,
): Promise<
  {
    thread: StatementThreadRow;
    messages: StatementMessageRow[];
  }[]
> {
  const threads = await db
    .select()
    .from(statementThreadsTable)
    .where(eq(statementThreadsTable.statementId, statementId))
    .orderBy(sql`${statementThreadsTable.lastMessageAt} DESC`);
  if (threads.length === 0) return [];
  const messages = await db
    .select()
    .from(statementMessagesTable)
    .where(
      sql`${statementMessagesTable.threadId} IN (${sql.join(
        threads.map((t) => sql`${t.id}`),
        sql`, `,
      )})`,
    )
    .orderBy(statementMessagesTable.createdAt);
  const byThread = new Map<string, StatementMessageRow[]>();
  for (const m of messages) {
    const arr = byThread.get(m.threadId) ?? [];
    arr.push(m);
    byThread.set(m.threadId, arr);
  }
  return threads.map((thread) => ({
    thread,
    messages: byThread.get(thread.id) ?? [],
  }));
}

async function respondWithThreads(
  res: Response,
  tenantId: string,
  personId: string,
  periodType: PeriodType,
  periodKey: string,
  encoder: typeof GetStatementThreadsForSelfResponse,
): Promise<void> {
  const [statementRow] = await db
    .select()
    .from(statementsTable)
    .where(
      and(
        eq(statementsTable.tenantId, tenantId),
        eq(statementsTable.personId, personId),
        eq(statementsTable.periodType, periodType),
        eq(statementsTable.periodKey, periodKey),
      ),
    )
    .limit(1);
  if (!statementRow) {
    res.json(encoder.parse({ threads: [] }));
    return;
  }
  const groups = await listThreadsForStatement(statementRow.id);
  const userIds = new Set<string>();
  for (const g of groups) {
    userIds.add(g.thread.openedByUserId);
    for (const m of g.messages) userIds.add(m.authorUserId);
  }
  const nameById = await loadUserNames([...userIds]);
  res.json(
    encoder.parse({
      threads: groups.map((g) => ({
        ...serializeThreadSummary(
          g.thread,
          nameById.get(g.thread.openedByUserId) ?? null,
        ),
        messages: g.messages.map((m) =>
          serializeMessage(m, nameById.get(m.authorUserId) ?? null),
        ),
      })),
    }),
  );
}

router.get(
  "/tenants/:tenantId/statements/me/threads",
  requireTenantAccessOrSelfRep,
  async (req, res): Promise<void> => {
    const params = GetStatementThreadsForSelfParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const query = GetStatementThreadsForSelfQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const { tenantId } = params.data;
    const { periodType, periodKey } = query.data;
    if (!isPeriodType(periodType)) {
      res.status(400).json({ error: "Invalid periodType" });
      return;
    }
    const personId = req.repPersonId;
    if (!personId) {
      res
        .status(400)
        .json({ error: "personId is required for staff users" });
      return;
    }
    await respondWithThreads(
      res,
      tenantId,
      personId,
      periodType as PeriodType,
      periodKey,
      GetStatementThreadsForSelfResponse,
    );
  },
);

router.get(
  "/tenants/:tenantId/statements/:personId/threads",
  requireTenantAccessOrSelfRep,
  async (req, res): Promise<void> => {
    const params = GetStatementThreadsForPersonParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const query = GetStatementThreadsForPersonQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const { tenantId, personId } = params.data;
    const { periodType, periodKey } = query.data;
    if (!isPeriodType(periodType)) {
      res.status(400).json({ error: "Invalid periodType" });
      return;
    }
    await respondWithThreads(
      res,
      tenantId,
      personId,
      periodType as PeriodType,
      periodKey,
      GetStatementThreadsForPersonResponse,
    );
  },
);

// ---------- open thread (POST) ----------

async function openThread(
  req: Request,
  res: Response,
  tenantId: string,
  personId: string,
  body: { periodType: string; periodKey: string; entryId?: string; subject?: string; body: string },
  encoder: typeof OpenStatementThreadForSelfResponse,
): Promise<void> {
  if (!isPeriodType(body.periodType)) {
    res.status(400).json({ error: "Invalid periodType" });
    return;
  }
  const ctx = req.authContext!;
  const role = effectiveRoleFor(ctx, tenantId);
  const userId = ctx.user.id;

  const created = await db.transaction(async (tx) => {
    const statement = await findOrCreateStatement(
      tx,
      tenantId,
      personId,
      body.periodType as PeriodType,
      body.periodKey,
    );
    const [thread] = await tx
      .insert(statementThreadsTable)
      .values({
        tenantId,
        statementId: statement.id,
        entryId: body.entryId,
        subject: body.subject,
        status: "open",
        openedByUserId: userId,
        messageCount: 1,
      })
      .returning();
    const [message] = await tx
      .insert(statementMessagesTable)
      .values({
        tenantId,
        threadId: thread!.id,
        authorUserId: userId,
        authorRoleAtPost: role,
        body: body.body,
      })
      .returning();
    await tx.insert(statementEventsTable).values({
      tenantId,
      statementId: statement.id,
      threadId: thread!.id,
      eventKind: "thread_opened",
      before: null,
      after: { subject: thread!.subject, entryId: thread!.entryId ?? null },
      actor: auditActor(ctx),
      actorUserId: userId,
    });
    return { thread: thread!, message: message! };
  });

  const nameById = await loadUserNames([userId]);
  res.json(
    encoder.parse({
      ...serializeThreadSummary(
        created.thread,
        nameById.get(userId) ?? null,
      ),
      messages: [serializeMessage(created.message, nameById.get(userId) ?? null)],
    }),
  );
}

router.post(
  "/tenants/:tenantId/statements/me/threads",
  requireTenantAccessOrSelfRep,
  async (req, res): Promise<void> => {
    const params = OpenStatementThreadForSelfParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = OpenStatementThreadForSelfBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const personId = req.repPersonId;
    if (!personId) {
      res
        .status(400)
        .json({ error: "personId is required for staff users" });
      return;
    }
    await openThread(
      req,
      res,
      params.data.tenantId,
      personId,
      body.data,
      OpenStatementThreadForSelfResponse,
    );
  },
);

router.post(
  "/tenants/:tenantId/statements/:personId/threads",
  requireTenantAccess,
  async (req, res): Promise<void> => {
    const params = OpenStatementThreadForPersonParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = OpenStatementThreadForPersonBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    await openThread(
      req,
      res,
      params.data.tenantId,
      params.data.personId,
      body.data,
      OpenStatementThreadForPersonResponse,
    );
  },
);

// ---------- post message ----------

router.post(
  "/tenants/:tenantId/threads/:threadId/messages",
  async (req, res): Promise<void> => {
    const params = PostThreadMessageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = PostThreadMessageBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const { tenantId, threadId } = params.data;
    const ctx = req.authContext!;

    const thread = await loadThread(threadId);
    if (!thread || thread.tenantId !== tenantId) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    const statement = await loadStatement(thread.statementId);
    if (!statement) {
      res.status(404).json({ error: "Statement not found" });
      return;
    }
    const isAdmin = hasTenantAccess(ctx, tenantId);
    const repPersonId = repPersonIdFor(ctx, tenantId);
    const isOwningRep =
      repPersonId !== null && repPersonId === statement.personId;
    if (!isAdmin && !isOwningRep) {
      res.status(403).json({ error: "You do not have access" });
      return;
    }
    const role = effectiveRoleFor(ctx, tenantId);
    const userId = ctx.user.id;
    const now = new Date();

    const message = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(statementMessagesTable)
        .values({
          tenantId,
          threadId: thread.id,
          authorUserId: userId,
          authorRoleAtPost: role,
          body: body.data.body,
        })
        .returning();
      await tx
        .update(statementThreadsTable)
        .set({
          lastMessageAt: now,
          messageCount: thread.messageCount + 1,
        })
        .where(eq(statementThreadsTable.id, thread.id));
      await tx.insert(statementEventsTable).values({
        tenantId,
        statementId: statement.id,
        threadId: thread.id,
        eventKind: "thread_replied",
        before: null,
        after: { messageId: created!.id },
        actor: auditActor(ctx),
        actorUserId: userId,
      });
      return created!;
    });

    const nameById = await loadUserNames([userId]);
    res.json(
      PostThreadMessageResponse.parse(
        serializeMessage(message, nameById.get(userId) ?? null),
      ),
    );
  },
);

// ---------- resolve / reopen ----------

async function transitionThreadStatus(
  req: Request,
  res: Response,
  tenantId: string,
  threadId: string,
  toStatus: "open" | "resolved",
): Promise<void> {
  const ctx = req.authContext!;
  if (!hasTenantAccess(ctx, tenantId)) {
    res.status(403).json({ error: "You do not have access to this company" });
    return;
  }
  const thread = await loadThread(threadId);
  if (!thread || thread.tenantId !== tenantId) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  const userId = ctx.user.id;
  const updated = await db.transaction(async (tx) => {
    const set: Record<string, unknown> = { status: toStatus };
    if (toStatus === "resolved") {
      set.resolvedAt = new Date();
      set.resolvedByUserId = userId;
    } else {
      set.resolvedAt = null;
      set.resolvedByUserId = null;
    }
    const [row] = await tx
      .update(statementThreadsTable)
      .set(set)
      .where(eq(statementThreadsTable.id, thread.id))
      .returning();
    await tx.insert(statementEventsTable).values({
      tenantId,
      statementId: thread.statementId,
      threadId: thread.id,
      eventKind:
        toStatus === "resolved" ? "thread_resolved" : "thread_reopened",
      before: { status: thread.status },
      after: { status: toStatus },
      actor: auditActor(ctx),
      actorUserId: userId,
    });
    return row!;
  });

  const nameById = await loadUserNames([updated.openedByUserId]);
  const encoder =
    toStatus === "resolved"
      ? ResolveStatementThreadResponse
      : ReopenStatementThreadResponse;
  res.json(
    encoder.parse(
      serializeThreadSummary(
        updated,
        nameById.get(updated.openedByUserId) ?? null,
      ),
    ),
  );
}

router.post(
  "/tenants/:tenantId/threads/:threadId/resolve",
  async (req, res): Promise<void> => {
    const params = ResolveStatementThreadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    await transitionThreadStatus(
      req,
      res,
      params.data.tenantId,
      params.data.threadId,
      "resolved",
    );
  },
);

router.post(
  "/tenants/:tenantId/threads/:threadId/reopen",
  async (req, res): Promise<void> => {
    const params = ReopenStatementThreadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    await transitionThreadStatus(
      req,
      res,
      params.data.tenantId,
      params.data.threadId,
      "open",
    );
  },
);

// ---------- sign-off lifecycle ----------

router.post(
  "/tenants/:tenantId/statements/:personId/signoff/request",
  requireTenantAccess,
  async (req, res): Promise<void> => {
    const params = RequestStatementSignoffParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = RequestStatementSignoffBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (!isPeriodType(body.data.periodType)) {
      res.status(400).json({ error: "Invalid periodType" });
      return;
    }
    const ctx = req.authContext!;
    const { tenantId, personId } = params.data;
    const { periodType, periodKey } = body.data;
    const userId = ctx.user.id;

    const result = await db.transaction(async (tx) => {
      const statement = await findOrCreateStatement(
        tx,
        tenantId,
        personId,
        periodType as PeriodType,
        periodKey,
      );
      const transition = canRequestSignoff(statement.signoffState);
      if (!transition.ok) {
        return { conflict: true as const, reason: transition.reason };
      }
      const now = new Date();
      const [updated] = await tx
        .update(statementsTable)
        .set({
          signoffState: "requested",
          signoffRequestedAt: now,
          signoffRequestedByUserId: userId,
          signoffAcknowledgedAt: null,
          signoffAcknowledgedByUserId: null,
        })
        .where(eq(statementsTable.id, statement.id))
        .returning();
      await tx.insert(statementEventsTable).values({
        tenantId,
        statementId: statement.id,
        eventKind: "signoff_requested",
        before: { state: statement.signoffState },
        after: { state: "requested" },
        actor: auditActor(ctx),
        actorUserId: userId,
      });
      return { conflict: false as const, row: updated! };
    });

    if (result.conflict) {
      res.status(409).json({ error: result.reason });
      return;
    }
    res.json(
      RequestStatementSignoffResponse.parse(
        await buildSignoffResponse(result.row),
      ),
    );
  },
);

router.post(
  "/tenants/:tenantId/statements/me/signoff/acknowledge",
  requireTenantAccessOrSelfRep,
  async (req, res): Promise<void> => {
    const params = AcknowledgeStatementSignoffParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = AcknowledgeStatementSignoffBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (!isPeriodType(body.data.periodType)) {
      res.status(400).json({ error: "Invalid periodType" });
      return;
    }
    const personId = req.repPersonId;
    if (!personId) {
      res.status(403).json({ error: "Only reps can acknowledge" });
      return;
    }
    const ctx = req.authContext!;
    const { tenantId } = params.data;
    const { periodType, periodKey } = body.data;
    const userId = ctx.user.id;

    const result = await db.transaction(async (tx) => {
      const statement = await findOrCreateStatement(
        tx,
        tenantId,
        personId,
        periodType as PeriodType,
        periodKey,
      );
      const transition = canAcknowledgeSignoff(statement.signoffState);
      if (!transition.ok) {
        return { conflict: true as const, reason: transition.reason };
      }
      const now = new Date();
      const [updated] = await tx
        .update(statementsTable)
        .set({
          signoffState: "acknowledged",
          signoffAcknowledgedAt: now,
          signoffAcknowledgedByUserId: userId,
        })
        .where(eq(statementsTable.id, statement.id))
        .returning();
      await tx.insert(statementEventsTable).values({
        tenantId,
        statementId: statement.id,
        eventKind: "signoff_acknowledged",
        before: { state: "requested" },
        after: { state: "acknowledged" },
        actor: auditActor(ctx),
        actorUserId: userId,
      });
      return { conflict: false as const, row: updated! };
    });

    if (result.conflict) {
      res.status(409).json({ error: result.reason });
      return;
    }
    res.json(
      AcknowledgeStatementSignoffResponse.parse(
        await buildSignoffResponse(result.row),
      ),
    );
  },
);

router.post(
  "/tenants/:tenantId/statements/:personId/signoff/rescind",
  requireTenantAccess,
  async (req, res): Promise<void> => {
    const params = RescindStatementSignoffParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = RescindStatementSignoffBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (!isPeriodType(body.data.periodType)) {
      res.status(400).json({ error: "Invalid periodType" });
      return;
    }
    const ctx = req.authContext!;
    const { tenantId, personId } = params.data;
    const { periodType, periodKey } = body.data;
    const userId = ctx.user.id;

    const result = await db.transaction(async (tx) => {
      const statement = await findOrCreateStatement(
        tx,
        tenantId,
        personId,
        periodType as PeriodType,
        periodKey,
      );
      const transition = canRescindSignoff(statement.signoffState);
      if (!transition.ok) {
        return { conflict: true as const, reason: transition.reason };
      }
      const [updated] = await tx
        .update(statementsTable)
        .set({
          signoffState: "none",
          signoffRequestedAt: null,
          signoffRequestedByUserId: null,
        })
        .where(eq(statementsTable.id, statement.id))
        .returning();
      await tx.insert(statementEventsTable).values({
        tenantId,
        statementId: statement.id,
        eventKind: "signoff_rescinded",
        before: { state: "requested" },
        after: { state: "none" },
        actor: auditActor(ctx),
        actorUserId: userId,
      });
      return { conflict: false as const, row: updated! };
    });

    if (result.conflict) {
      res.status(409).json({ error: result.reason });
      return;
    }
    res.json(
      RescindStatementSignoffResponse.parse(
        await buildSignoffResponse(result.row),
      ),
    );
  },
);

export default router;
