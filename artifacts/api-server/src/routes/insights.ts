import { Router, type IRouter } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import {
  db,
  commissionEntriesTable,
  commissionEventsTable,
} from "@workspace/db";
import {
  GetDashboardParams,
  GetDashboardResponse,
  GetActivityParams,
  GetActivityQueryParams,
  GetActivityResponse,
  GetPayrollSummaryParams,
  GetPayrollSummaryResponse,
} from "@workspace/api-zod";
import { requireTenantAccess } from "../lib/rbac";

const router: IRouter = Router();

router.use("/tenants/:tenantId", requireTenantAccess);

const round2 = (n: number) => Math.round(n * 100) / 100;

router.get("/tenants/:tenantId/dashboard", async (req, res): Promise<void> => {
  const params = GetDashboardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const entries = await db
    .select()
    .from(commissionEntriesTable)
    .where(eq(commissionEntriesTable.tenantId, params.data.tenantId));

  const byState = new Map<string, { count: number; amount: number }>();
  const byType = new Map<string, { count: number; amount: number }>();
  const byPerson = new Map<
    string,
    { personName: string; amount: number; entryCount: number }
  >();
  let accruedTotal = 0;
  let payableTotal = 0;
  let paidTotal = 0;
  let clawedBackTotal = 0;

  for (const e of entries) {
    const s = byState.get(e.state) ?? { count: 0, amount: 0 };
    s.count += 1;
    s.amount += e.amount;
    byState.set(e.state, s);

    const t = byType.get(e.type) ?? { count: 0, amount: 0 };
    t.count += 1;
    t.amount += e.amount;
    byType.set(e.type, t);

    if (e.state === "accrued") accruedTotal += e.amount;
    if (e.state === "payable") payableTotal += e.amount;
    if (e.state === "paid") paidTotal += e.amount;
    if (e.state === "clawed_back") clawedBackTotal += e.amount;

    if (e.state !== "voided" && e.state !== "clawed_back") {
      const p = byPerson.get(e.personId) ?? {
        personName: e.personName,
        amount: 0,
        entryCount: 0,
      };
      p.amount += e.amount;
      p.entryCount += 1;
      byPerson.set(e.personId, p);
    }
  }

  const topEarners = [...byPerson.entries()]
    .map(([personId, v]) => ({
      personId,
      personName: v.personName,
      amount: round2(v.amount),
      entryCount: v.entryCount,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  res.json(
    GetDashboardResponse.parse({
      tenantId: params.data.tenantId,
      entryCount: entries.length,
      accruedTotal: round2(accruedTotal),
      payableTotal: round2(payableTotal),
      paidTotal: round2(paidTotal),
      clawedBackTotal: round2(clawedBackTotal),
      totalsByState: [...byState.entries()].map(([state, v]) => ({
        state,
        count: v.count,
        amount: round2(v.amount),
      })),
      totalsByType: [...byType.entries()].map(([type, v]) => ({
        type,
        count: v.count,
        amount: round2(v.amount),
      })),
      topEarners,
    }),
  );
});

router.get("/tenants/:tenantId/payroll", async (req, res): Promise<void> => {
  const params = GetPayrollSummaryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const entries = await db
    .select()
    .from(commissionEntriesTable)
    .where(eq(commissionEntriesTable.tenantId, params.data.tenantId));

  const byPerson = new Map<
    string,
    {
      personName: string;
      position: string | null;
      accruedTotal: number;
      payableTotal: number;
      paidTotal: number;
      entryCount: number;
    }
  >();

  for (const e of entries) {
    const p = byPerson.get(e.personId) ?? {
      personName: e.personName,
      position: e.positionAtCosted ?? null,
      accruedTotal: 0,
      payableTotal: 0,
      paidTotal: 0,
      entryCount: 0,
    };
    if (e.state === "accrued") p.accruedTotal += e.amount;
    if (e.state === "payable") p.payableTotal += e.amount;
    if (e.state === "paid") p.paidTotal += e.amount;
    p.entryCount += 1;
    if (!p.position && e.positionAtCosted) p.position = e.positionAtCosted;
    byPerson.set(e.personId, p);
  }

  const lines = [...byPerson.entries()]
    .map(([personId, v]) => ({
      personId,
      personName: v.personName,
      position: v.position,
      accruedTotal: round2(v.accruedTotal),
      payableTotal: round2(v.payableTotal),
      paidTotal: round2(v.paidTotal),
      netOwed: round2(v.accruedTotal + v.payableTotal),
      entryCount: v.entryCount,
    }))
    .sort((a, b) => b.netOwed - a.netOwed);

  res.json(GetPayrollSummaryResponse.parse(lines));
});

router.get("/tenants/:tenantId/activity", async (req, res): Promise<void> => {
  const params = GetActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const query = GetActivityQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const limit = query.data.limit ?? 30;
  const events = await db
    .select()
    .from(commissionEventsTable)
    .where(eq(commissionEventsTable.tenantId, params.data.tenantId))
    .orderBy(desc(commissionEventsTable.at))
    .limit(limit);

  const entryIds = [...new Set(events.map((e) => e.entryId))];
  const entries = entryIds.length
    ? await db
        .select()
        .from(commissionEntriesTable)
        .where(inArray(commissionEntriesTable.id, entryIds))
    : [];
  const entryById = new Map(entries.map((e) => [e.id, e]));

  const items = events.map((ev) => {
    const entry = entryById.get(ev.entryId);
    const after = (ev.after ?? {}) as Record<string, unknown>;
    let summary: string;
    switch (ev.eventKind) {
      case "created":
        summary = `Accrued ${entry?.type ?? ""} commission`;
        break;
      case "recomputed":
        summary = "Recomputed by engine";
        break;
      case "state_change":
        summary = `Moved to ${String(after["state"] ?? "")}`;
        break;
      case "manually_adjusted":
        summary = "Amount adjusted by operator";
        break;
      case "clawed_back":
        summary = "Commission clawed back";
        break;
      default:
        summary = ev.eventKind;
    }
    return {
      id: ev.id,
      entryId: ev.entryId,
      eventKind: ev.eventKind,
      actor: ev.actor,
      at: ev.at.toISOString(),
      summary,
      personName: entry?.personName ?? null,
      amount: entry?.amount ?? null,
    };
  });

  res.json(GetActivityResponse.parse(items));
});

export default router;
