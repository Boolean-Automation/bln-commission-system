// Shared, framework-free evaluator for a no-code "custom" commission rule.
// This is the single source of truth for what a custom rule pays: it is used by
// the API server's recompute engine (one entry per job/person pair) AND by the
// web builder's live preview, so the two can never disagree. It performs no I/O
// and depends only on plain job/person values plus the rule config.

import { evaluateFormula, type FormulaScope } from "./formula";

// ---- Custom (declarative) rule config ----
export type CustomOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "notContains";
export type CustomCondition = {
  field: string;
  op: CustomOp;
  value: string | number;
};
export type CustomRecipient = {
  source: "salesRep" | "manager" | "match";
  positionContains?: string;
  rolesInclude?: string[];
};
export type CustomTier = { upTo: number | null; rate: number };
// A "result" is the leaf amount a branch (or the whole rule) produces. It is a
// subset of the calculation kinds — flat, percent, or formula — and is reused by
// conditional branches and the otherwise-clause.
export type ResultCalc =
  | { kind: "flat"; amount: number }
  | { kind: "percent"; field: "totalAmount" | "gpAmount"; rate: number }
  | { kind: "formula"; expression: string };
export type ConditionalBranch = { when: CustomCondition; result: ResultCalc };
export type CustomCalculation =
  | { kind: "flat"; amount: number }
  | { kind: "percent"; field: "totalAmount" | "gpAmount"; rate: number }
  | {
      kind: "tiered";
      basisField: "totalAmount" | "gpAmount";
      tiers: CustomTier[];
    }
  | { kind: "formula"; expression: string }
  | {
      kind: "conditional";
      branches: ConditionalBranch[];
      otherwise?: ResultCalc;
    };
export type ManualVar = { key: string; label?: string; value: number };
export type ForecastConfig = {
  enabled: boolean;
  weightPct: number;
  openStatuses: string[];
};
export type CustomConfig = {
  label?: string;
  recipient: CustomRecipient;
  conditions: CustomCondition[];
  calculation: CustomCalculation;
  respectGate?: boolean;
  manualVars?: ManualVar[];
  forecast?: ForecastConfig;
};

// Minimal job/person shapes the evaluator reads. The DB `Job`/`Person` rows are
// structurally assignable to these, and the web preview builds plain objects.
export type CustomRuleJob = {
  totalAmount: number | null;
  gpAmount: number | null;
  gpPct: number | null;
  leadSource?: string | null;
  status?: string | null;
  customer?: string | null;
};
export type CustomRulePerson = {
  position?: string | null;
  ytdSales?: number | null;
  roles?: string[] | null;
};

export function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function pickCustomTier(
  tiers: CustomTier[],
  ytd: number,
): CustomTier | undefined {
  for (const t of tiers) {
    if (t.upTo === null || ytd < t.upTo) return t;
  }
  return tiers[tiers.length - 1];
}

// Build the numeric scope a formula evaluates against for one job/person pair:
// the built-in job/person variables plus any manual inputs defined on the rule.
// Keys are the variable paths (without the leading "@") so they line up with the
// shared variable catalog.
export function buildFormulaScope(
  job: CustomRuleJob,
  person: CustomRulePerson,
  manualVars: ManualVar[],
): FormulaScope {
  const scope: FormulaScope = {
    "job.totalAmount": num(job.totalAmount, 0),
    "job.gpAmount": num(job.gpAmount, 0),
    "job.gpPct": num(job.gpPct, 0),
    "person.ytdSales": num(person.ytdSales ?? 0, 0),
  };
  for (const mv of manualVars) {
    if (mv && typeof mv.key === "string" && mv.key.trim() !== "")
      scope[`manual.${mv.key}`] = num(mv.value, 0);
  }
  return scope;
}

// Evaluate a leaf "result" (flat / percent / formula) into a raw amount plus a
// transparent snapshot detail. Used by formula and conditional calculations.
export function evalResultCalc(
  result: ResultCalc | undefined,
  job: CustomRuleJob,
  total: number,
  scope: FormulaScope,
): { amount: number; detail: Record<string, unknown> } {
  if (!result) return { amount: 0, detail: { kind: "none" } };
  if (result.kind === "flat") {
    const amount = num(result.amount, 0);
    return { amount, detail: { kind: "flat", amount } };
  }
  if (result.kind === "percent") {
    const basis = result.field === "gpAmount" ? num(job.gpAmount, 0) : total;
    const rate = num(result.rate, 0);
    return {
      amount: basis * rate,
      detail: {
        kind: "percent",
        basisField: result.field,
        basis,
        rate,
        formula: `${(rate * 100).toFixed(2)}% x ${basis}`,
      },
    };
  }
  if (result.kind === "formula") {
    const expr = result.expression ?? "";
    const res = evaluateFormula(expr, scope);
    return {
      amount: res.ok ? res.value : 0,
      detail: {
        kind: "formula",
        expression: expr,
        value: res.ok ? res.value : 0,
        variables: res.vars,
        ...(res.ok ? {} : { error: res.error }),
      },
    };
  }
  return { amount: 0, detail: { kind: "unknown" } };
}

// Resolve the value of a custom-condition field from a job/person pair.
function customFieldValue(
  field: string,
  job: CustomRuleJob,
  person: CustomRulePerson,
): string | number | null {
  switch (field) {
    case "job.totalAmount":
      return job.totalAmount ?? null;
    case "job.gpAmount":
      return job.gpAmount ?? null;
    case "job.gpPct":
      return job.gpPct ?? null;
    case "job.leadSource":
      return job.leadSource ?? null;
    case "job.status":
      return job.status ?? null;
    case "job.customer":
      return job.customer ?? null;
    case "person.position":
      return person.position ?? null;
    case "person.ytdSales":
      return person.ytdSales ?? null;
    case "person.roles":
      return (person.roles ?? []).join(", ");
    default:
      return null;
  }
}

export function evalCustomCondition(
  cond: CustomCondition,
  job: CustomRuleJob,
  person: CustomRulePerson,
): boolean {
  const actual = customFieldValue(cond.field, job, person);
  const expected = cond.value;
  switch (cond.op) {
    case "eq":
    case "neq": {
      const eq =
        String(actual ?? "")
          .trim()
          .toLowerCase() ===
        String(expected ?? "")
          .trim()
          .toLowerCase();
      return cond.op === "eq" ? eq : !eq;
    }
    case "contains":
    case "notContains": {
      const has = String(actual ?? "")
        .toLowerCase()
        .includes(String(expected ?? "").toLowerCase());
      return cond.op === "contains" ? has : !has;
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = typeof actual === "number" ? actual : Number(actual);
      const b = typeof expected === "number" ? expected : Number(expected);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      if (cond.op === "gt") return a > b;
      if (cond.op === "gte") return a >= b;
      if (cond.op === "lt") return a < b;
      return a <= b;
    }
    default:
      return false;
  }
}

// The outcome of evaluating a custom rule for a single job/person pair. The
// engine pushes a ledger entry only when `applies` is true; the web preview uses
// the full breakdown to show the operator what (and why) the rule would pay.
export type CustomRuleOutcome = {
  // Whether this pair produces a commission entry at all. False means the
  // top-level conditions didn't match, a tiered table had no tier, or the
  // calculation kind was unrecognized.
  applies: boolean;
  reason: string | null;
  conditionsPass: boolean;
  amount: number; // final amount after weighting + gate, rounded
  fullAmount: number; // pre-weight amount, rounded
  raw: number; // pre-round raw amount
  matchedBranch: number | "otherwise" | null; // conditional only
  forecastApplies: boolean;
  forecastEnabled: boolean;
  weight: number;
  gated: boolean;
  snapshot: Record<string, unknown>;
};

/**
 * Evaluate a custom rule for one job/person pair. This is the shared math behind
 * both the recompute engine and the builder's live preview: identical inputs
 * always yield an identical amount and computation snapshot.
 */
export function evaluateCustomRule(
  cfg: CustomConfig,
  job: CustomRuleJob,
  person: CustomRulePerson,
  opts?: { gateFloor?: number | null },
): CustomRuleOutcome {
  const total = job.totalAmount ?? 0;
  const conditions = Array.isArray(cfg.conditions) ? cfg.conditions : [];
  const manualVars = Array.isArray(cfg.manualVars) ? cfg.manualVars : [];
  const respectGate = cfg.respectGate === true;
  const gateFloor = opts?.gateFloor ?? null;
  const gated =
    respectGate &&
    gateFloor !== null &&
    job.gpPct !== null &&
    job.gpPct !== undefined &&
    job.gpPct < gateFloor;

  // Forecast/weighting: pipeline (open) jobs can be booked at a weighted
  // fraction of their full commission. Opt-in and additive — when disabled
  // (the default) every job is weighted 1.0.
  const forecast = cfg.forecast;
  const forecastEnabled = forecast?.enabled === true;
  const openStatuses = (
    forecastEnabled && Array.isArray(forecast?.openStatuses)
      ? forecast.openStatuses
      : []
  )
    .map((s) => String(s).trim().toLowerCase())
    .filter((s) => s.length > 0);
  const jobStatus = (job.status ?? "").trim().toLowerCase();
  const forecastApplies = forecastEnabled && openStatuses.includes(jobStatus);
  const weight = forecastApplies ? num(forecast?.weightPct, 0) : 1;

  const snapshot: Record<string, unknown> = {
    rule: "custom",
    label: cfg.label ?? "Custom rule",
    recipient: cfg.recipient?.source,
  };

  const conditionsPass = conditions.every((c) =>
    evalCustomCondition(c, job, person),
  );
  if (!conditionsPass) {
    return {
      applies: false,
      reason: "Conditions not met",
      conditionsPass: false,
      amount: 0,
      fullAmount: 0,
      raw: 0,
      matchedBranch: null,
      forecastApplies,
      forecastEnabled,
      weight,
      gated,
      snapshot,
    };
  }

  const calc = cfg.calculation;
  const scope = buildFormulaScope(job, person, manualVars);
  let raw = 0;
  let matchedBranch: number | "otherwise" | null = null;

  if (calc.kind === "flat") {
    raw = num(calc.amount, 0);
    snapshot["calculation"] = "flat";
    snapshot["flat"] = raw;
  } else if (calc.kind === "percent") {
    const basis = calc.field === "gpAmount" ? (job.gpAmount ?? 0) : total;
    const rate = num(calc.rate, 0);
    raw = basis * rate;
    snapshot["calculation"] = "percent";
    snapshot["basisField"] = calc.field;
    snapshot["basis"] = basis;
    snapshot["rate"] = rate;
    snapshot["formula"] = `${(rate * 100).toFixed(2)}% x ${basis}`;
  } else if (calc.kind === "tiered") {
    const ytd = person.ytdSales ?? 0;
    const tier = pickCustomTier(Array.isArray(calc.tiers) ? calc.tiers : [], ytd);
    if (!tier) {
      return {
        applies: false,
        reason: "No matching tier for this YTD sales value",
        conditionsPass: true,
        amount: 0,
        fullAmount: 0,
        raw: 0,
        matchedBranch: null,
        forecastApplies,
        forecastEnabled,
        weight,
        gated,
        snapshot,
      };
    }
    const basis = calc.basisField === "gpAmount" ? (job.gpAmount ?? 0) : total;
    raw = basis * tier.rate;
    snapshot["calculation"] = "tiered";
    snapshot["basisField"] = calc.basisField;
    snapshot["basis"] = basis;
    snapshot["ytdSales"] = ytd;
    snapshot["rate"] = tier.rate;
    snapshot["formula"] = `${(tier.rate * 100).toFixed(2)}% x ${basis}`;
  } else if (calc.kind === "formula") {
    const r = evalResultCalc(
      { kind: "formula", expression: calc.expression },
      job,
      total,
      scope,
    );
    raw = r.amount;
    snapshot["calculation"] = "formula";
    snapshot["expression"] = calc.expression;
    snapshot["variables"] = scope;
    snapshot["value"] = r.amount;
    if (r.detail["error"]) snapshot["error"] = r.detail["error"];
  } else if (calc.kind === "conditional") {
    const branches = Array.isArray(calc.branches) ? calc.branches : [];
    let matched: number | "otherwise" = "otherwise";
    let chosen: ResultCalc | undefined = calc.otherwise;
    for (let bi = 0; bi < branches.length; bi++) {
      const branch = branches[bi]!;
      if (branch.when && evalCustomCondition(branch.when, job, person)) {
        matched = bi;
        chosen = branch.result;
        break;
      }
    }
    const r = evalResultCalc(chosen, job, total, scope);
    raw = r.amount;
    matchedBranch = matched;
    snapshot["calculation"] = "conditional";
    snapshot["matchedBranch"] = matched;
    snapshot["branchResult"] = r.detail;
    snapshot["variables"] = scope;
  } else {
    return {
      applies: false,
      reason: "Unrecognized calculation type",
      conditionsPass: true,
      amount: 0,
      fullAmount: 0,
      raw: 0,
      matchedBranch: null,
      forecastApplies,
      forecastEnabled,
      weight,
      gated,
      snapshot,
    };
  }

  // Apply forecast weighting after the raw amount, before the gate (the gate
  // always forces 0).
  const fullAmount = round2(raw);
  if (forecastApplies) {
    raw = raw * weight;
    snapshot["forecast"] = {
      applied: true,
      status: jobStatus,
      weight,
      fullAmount,
      weightedAmount: round2(raw),
    };
  } else if (forecastEnabled) {
    snapshot["forecast"] = { applied: false, status: jobStatus, weight: 1 };
  }

  const amount = gated ? 0 : round2(raw);
  snapshot["gpPct"] = job.gpPct;
  snapshot["gated"] = gated;

  return {
    applies: true,
    reason: null,
    conditionsPass: true,
    amount,
    fullAmount,
    raw,
    matchedBranch,
    forecastApplies,
    forecastEnabled,
    weight,
    gated,
    snapshot,
  };
}
