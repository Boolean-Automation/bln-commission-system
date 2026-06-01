import type {
  Tenant,
  Person,
  Job,
  CommissionEntryRow,
  CommissionEventRow,
  RuleInstanceRow,
  CommissionPlanRow,
  SchemaMappingRow,
} from "@workspace/db";

const iso = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;

export function serializeTenant(
  t: Tenant,
  counts: { peopleCount: number; jobsCount: number; entryCount: number },
) {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    status: t.status,
    airtableBaseId: t.airtableBaseId ?? null,
    airtableConnected: t.airtableConnected,
    peopleCount: counts.peopleCount,
    jobsCount: counts.jobsCount,
    entryCount: counts.entryCount,
    createdAt: t.createdAt.toISOString(),
  };
}

export function serializePerson(p: Person) {
  return {
    id: p.id,
    tenantId: p.tenantId,
    airtableRecordId: p.airtableRecordId ?? null,
    name: p.name,
    roles: p.roles,
    position: p.position ?? null,
    ytdSales: p.ytdSales ?? null,
    startDate: p.startDate ?? null,
    active: p.active,
  };
}

export function serializeJob(j: Job) {
  return {
    id: j.id,
    tenantId: j.tenantId,
    airtableRecordId: j.airtableRecordId ?? null,
    jobNumber: j.jobNumber,
    jobName: j.jobName ?? null,
    customer: j.customer ?? null,
    salesRep: j.salesRep ?? null,
    manager: j.manager ?? null,
    totalAmount: j.totalAmount ?? null,
    gpAmount: j.gpAmount ?? null,
    gpPct: j.gpPct ?? null,
    status: j.status,
    cancelled: j.cancelled,
    leadSource: j.leadSource ?? null,
    signedDate: j.signedDate ?? null,
    completedDate: j.completedDate ?? null,
  };
}

export function serializeEntry(e: CommissionEntryRow) {
  return {
    id: e.id,
    tenantId: e.tenantId,
    personId: e.personId,
    personName: e.personName,
    type: e.type,
    sourceKind: e.sourceKind,
    sourceId: e.sourceId ?? null,
    sourceLabel: e.sourceLabel ?? null,
    amount: e.amount,
    currency: e.currency,
    state: e.state,
    positionAtCosted: e.positionAtCosted ?? null,
    ruleInstanceIds: e.ruleInstanceIds,
    computationSnapshot: e.computationSnapshot ?? null,
    notes: e.notes ?? null,
    accruedAt: iso(e.accruedAt),
    payableAt: iso(e.payableAt),
    paidAt: iso(e.paidAt),
    clawedBackAt: iso(e.clawedBackAt),
    createdAt: e.createdAt.toISOString(),
  };
}

export function serializeEvent(ev: CommissionEventRow) {
  return {
    id: ev.id,
    entryId: ev.entryId,
    eventKind: ev.eventKind,
    before: ev.before ?? null,
    after: ev.after ?? null,
    actor: ev.actor,
    at: ev.at.toISOString(),
  };
}

export function serializeRuleInstance(r: RuleInstanceRow) {
  return {
    id: r.id,
    planId: r.planId,
    ruleModuleKey: r.ruleModuleKey,
    ruleModuleName: r.ruleModuleName,
    description: r.description,
    params: r.params,
    appliesTo: r.appliesTo,
    enabled: r.enabled,
    order: r.orderIndex,
  };
}

export function serializePlan(
  plan: CommissionPlanRow,
  instances: RuleInstanceRow[],
) {
  return {
    id: plan.id,
    tenantId: plan.tenantId,
    name: plan.name,
    effectiveFrom: plan.effectiveFrom,
    effectiveTo: plan.effectiveTo ?? null,
    ruleInstances: instances.map(serializeRuleInstance),
  };
}

export function serializeMapping(m: SchemaMappingRow) {
  return {
    tenantId: m.tenantId,
    entities: m.entities,
  };
}
