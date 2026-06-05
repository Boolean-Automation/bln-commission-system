// Shared, framework-free validation for commission rule params. Used by the API
// server (reject bad params before persisting) and the web builder (block save
// and surface specific, field-level messages). Both render/validate from the
// same rule-module metadata so the two stay in lockstep.

import { analyzeFormula } from "./formula";
import {
  BUILTIN_VARIABLE_PATHS,
  MANUAL_KEY_PATTERN,
  type ManualVariable,
} from "./variables";

export * from "./formula";
export * from "./variables";
export * from "./customRule";

export type FieldDefLike = {
  key: string;
  label: string;
  type:
    | "number"
    | "percent"
    | "currency"
    | "text"
    | "select"
    | "multiselect"
    | "stringlist"
    | "list"
    | "position";
  min?: number | null;
  max?: number | null;
  nullable?: boolean | null;
  options?: { value: string; label: string }[] | null;
  itemFields?: FieldDefLike[] | null;
};

export type RuleModuleLike = {
  builder: "fields" | "custom";
  fields: FieldDefLike[];
};

export type ValidationError = { path: string; message: string };

type Obj = Record<string, unknown>;

function isBlank(v: unknown): boolean {
  return (
    v === null ||
    v === undefined ||
    (typeof v === "string" && v.trim() === "")
  );
}

function validateFields(
  fields: FieldDefLike[],
  value: unknown,
  prefix: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const obj = (value ?? {}) as Obj;
  for (const f of fields) {
    const v = obj[f.key];
    const path = prefix ? `${prefix} › ${f.label}` : f.label;
    switch (f.type) {
      case "number":
      case "currency": {
        if (isBlank(v)) {
          if (!f.nullable) errors.push({ path, message: `${path} is required` });
          break;
        }
        if (typeof v !== "number" || !Number.isFinite(v)) {
          errors.push({ path, message: `${path} must be a number` });
          break;
        }
        if (f.min != null && v < f.min)
          errors.push({ path, message: `${path} must be at least ${f.min}` });
        if (f.max != null && v > f.max)
          errors.push({ path, message: `${path} must be at most ${f.max}` });
        break;
      }
      case "percent": {
        if (isBlank(v)) {
          errors.push({ path, message: `${path} is required` });
          break;
        }
        if (typeof v !== "number" || !Number.isFinite(v)) {
          errors.push({ path, message: `${path} must be a number` });
          break;
        }
        if (v < 0) errors.push({ path, message: `${path} cannot be negative` });
        if (f.max != null && v > f.max)
          errors.push({
            path,
            message: `${path} must be at most ${f.max * 100}%`,
          });
        break;
      }
      case "text":
      case "position": {
        if (v != null && typeof v !== "string")
          errors.push({ path, message: `${path} must be text` });
        break;
      }
      case "select": {
        if (isBlank(v)) {
          errors.push({ path, message: `${path} is required` });
          break;
        }
        if (f.options && !f.options.some((o) => o.value === v))
          errors.push({ path, message: `${path} has an invalid selection` });
        break;
      }
      case "multiselect": {
        if (!Array.isArray(v)) {
          errors.push({ path, message: `${path} must be a list` });
          break;
        }
        for (const item of v)
          if (f.options && !f.options.some((o) => o.value === item))
            errors.push({ path, message: `${path} contains an invalid option` });
        break;
      }
      case "stringlist": {
        if (!Array.isArray(v)) {
          errors.push({ path, message: `${path} must be a list` });
          break;
        }
        v.forEach((item, i) => {
          if (typeof item !== "string" || item.trim() === "")
            errors.push({
              path: `${path}[${i + 1}]`,
              message: `${path}: entry ${i + 1} cannot be empty`,
            });
        });
        break;
      }
      case "list": {
        if (!Array.isArray(v)) {
          errors.push({ path, message: `${path} must be a list` });
          break;
        }
        v.forEach((item, i) => {
          errors.push(
            ...validateFields(f.itemFields ?? [], item, `${path} #${i + 1}`),
          );
        });
        break;
      }
    }
  }
  return errors;
}

const COMPARISON_OPS = new Set(["gt", "gte", "lt", "lte"]);
const CALC_FIELDS = new Set(["totalAmount", "gpAmount"]);

// Validate a single field/op/value condition (used by the top-level AND filter
// and by each conditional-calculation branch's "when").
function validateConditionObj(
  cond: unknown,
  pathPrefix: string,
  label: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const c = (cond ?? {}) as Obj;
  if (isBlank(c["field"]))
    errors.push({ path: `${pathPrefix}.field`, message: `${label}: choose a field` });
  if (isBlank(c["op"]))
    errors.push({ path: `${pathPrefix}.op`, message: `${label}: choose an operator` });
  if (isBlank(c["value"])) {
    errors.push({ path: `${pathPrefix}.value`, message: `${label}: enter a value` });
  } else if (
    typeof c["op"] === "string" &&
    COMPARISON_OPS.has(c["op"]) &&
    Number.isNaN(Number(c["value"]))
  ) {
    errors.push({
      path: `${pathPrefix}.value`,
      message: `${label}: value must be a number for a comparison operator`,
    });
  }
  return errors;
}

// Validate a "result" calculation — the leaf amount produced by a conditional
// branch or otherwise-clause: flat, percent of a field, or a formula.
function validateResultCalc(
  calc: unknown,
  pathPrefix: string,
  label: string,
  allowedVars: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const c = (calc ?? {}) as Obj;
  const kind = c["kind"];
  if (kind === "flat") {
    const a = c["amount"];
    if (typeof a !== "number" || !Number.isFinite(a))
      errors.push({ path: `${pathPrefix}.amount`, message: `${label}: enter a flat amount` });
    else if (a < 0)
      errors.push({ path: `${pathPrefix}.amount`, message: `${label}: amount cannot be negative` });
  } else if (kind === "percent") {
    if (typeof c["field"] !== "string" || !CALC_FIELDS.has(c["field"]))
      errors.push({ path: `${pathPrefix}.field`, message: `${label}: choose a field for the percentage` });
    const r = c["rate"];
    if (typeof r !== "number" || !Number.isFinite(r))
      errors.push({ path: `${pathPrefix}.rate`, message: `${label}: enter a rate` });
    else if (r < 0)
      errors.push({ path: `${pathPrefix}.rate`, message: `${label}: rate cannot be negative` });
  } else if (kind === "formula") {
    const expr = c["expression"];
    if (typeof expr !== "string" || expr.trim() === "") {
      errors.push({ path: `${pathPrefix}.expression`, message: `${label}: enter a formula` });
    } else {
      const res = analyzeFormula(expr, allowedVars);
      if (!res.ok)
        errors.push({ path: `${pathPrefix}.expression`, message: `${label}: ${res.error}` });
    }
  } else {
    errors.push({ path: pathPrefix, message: `${label}: choose how the amount is calculated` });
  }
  return errors;
}

// Build the set of variable paths a formula on this rule may reference: the
// built-in catalog plus any well-formed manual inputs defined on the rule.
function allowedVarsFor(cfg: Obj): Set<string> {
  const allowed = new Set(BUILTIN_VARIABLE_PATHS);
  const manualVars = Array.isArray(cfg["manualVars"])
    ? (cfg["manualVars"] as Obj[])
    : [];
  for (const mv of manualVars) {
    const key = mv?.["key"];
    if (typeof key === "string" && MANUAL_KEY_PATTERN.test(key))
      allowed.add(`manual.${key}`);
  }
  return allowed;
}

function validateManualVars(cfg: Obj): ValidationError[] {
  const errors: ValidationError[] = [];
  const manualVars = Array.isArray(cfg["manualVars"])
    ? (cfg["manualVars"] as Obj[])
    : [];
  const seen = new Set<string>();
  manualVars.forEach((mv, i) => {
    const m = (mv ?? {}) as Obj;
    const n = i + 1;
    const key = m["key"];
    if (typeof key !== "string" || key.trim() === "") {
      errors.push({ path: `manualVars[${i}].key`, message: `Manual input ${n}: enter a name` });
    } else if (!MANUAL_KEY_PATTERN.test(key)) {
      errors.push({
        path: `manualVars[${i}].key`,
        message: `Manual input ${n}: name must start with a letter and use only letters, numbers, or underscores`,
      });
    } else if (seen.has(key.toLowerCase())) {
      errors.push({ path: `manualVars[${i}].key`, message: `Manual input ${n}: duplicate name "${key}"` });
    } else {
      seen.add(key.toLowerCase());
    }
    const val = m["value"];
    if (typeof val !== "number" || !Number.isFinite(val))
      errors.push({ path: `manualVars[${i}].value`, message: `Manual input ${n}: enter a number` });
  });
  return errors;
}

function validateForecast(cfg: Obj): ValidationError[] {
  const errors: ValidationError[] = [];
  const forecast = cfg["forecast"];
  if (!forecast || typeof forecast !== "object") return errors;
  const f = forecast as Obj;
  if (f["enabled"] !== true) return errors;
  const weight = f["weightPct"];
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0)
    errors.push({ path: "forecast.weightPct", message: "Forecast weight must be a non-negative number" });
  const statuses = Array.isArray(f["openStatuses"]) ? (f["openStatuses"] as unknown[]) : [];
  const valid = statuses.filter((s) => typeof s === "string" && s.trim() !== "");
  if (valid.length === 0)
    errors.push({ path: "forecast.openStatuses", message: "List at least one pipeline/open job status to weight" });
  return errors;
}

function validateCustom(value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const cfg = (value ?? {}) as Obj;

  if (typeof cfg["label"] !== "string" || cfg["label"].trim() === "")
    errors.push({ path: "label", message: "Rule label is required" });

  const recipient = (cfg["recipient"] ?? {}) as Obj;
  const source = recipient["source"];
  if (source !== "salesRep" && source !== "manager" && source !== "match") {
    errors.push({
      path: "recipient",
      message: "Choose who earns this commission",
    });
  } else if (source === "match") {
    const pos = recipient["positionContains"];
    const roles = recipient["rolesInclude"];
    const hasPos = typeof pos === "string" && pos.trim() !== "";
    const hasRoles =
      Array.isArray(roles) &&
      roles.some((r) => typeof r === "string" && r.trim() !== "");
    if (!hasPos && !hasRoles)
      errors.push({
        path: "recipient",
        message:
          "Specify a position or at least one role to match recipients",
      });
  }

  errors.push(...validateManualVars(cfg));
  errors.push(...validateForecast(cfg));
  const allowedVars = allowedVarsFor(cfg);

  const conditions = Array.isArray(cfg["conditions"])
    ? (cfg["conditions"] as Obj[])
    : [];
  conditions.forEach((cond, i) => {
    errors.push(
      ...validateConditionObj(cond, `conditions[${i}]`, `Condition ${i + 1}`),
    );
  });

  const calc = (cfg["calculation"] ?? {}) as Obj;
  const kind = calc["kind"];
  if (kind === "flat") {
    const a = calc["amount"];
    if (typeof a !== "number" || !Number.isFinite(a))
      errors.push({ path: "calculation.amount", message: "Enter a flat amount" });
    else if (a < 0)
      errors.push({
        path: "calculation.amount",
        message: "Amount cannot be negative",
      });
  } else if (kind === "percent") {
    if (typeof calc["field"] !== "string" || !CALC_FIELDS.has(calc["field"]))
      errors.push({
        path: "calculation.field",
        message: "Choose which field the percentage applies to",
      });
    const r = calc["rate"];
    if (typeof r !== "number" || !Number.isFinite(r))
      errors.push({ path: "calculation.rate", message: "Enter a rate" });
    else if (r < 0)
      errors.push({
        path: "calculation.rate",
        message: "Rate cannot be negative",
      });
  } else if (kind === "tiered") {
    if (
      typeof calc["basisField"] !== "string" ||
      !CALC_FIELDS.has(calc["basisField"])
    )
      errors.push({ path: "calculation.basisField", message: "Choose a basis" });
    const tiers = Array.isArray(calc["tiers"]) ? (calc["tiers"] as Obj[]) : [];
    if (tiers.length === 0)
      errors.push({
        path: "calculation.tiers",
        message: "Add at least one tier",
      });
    let prevUpTo = -Infinity;
    tiers.forEach((tier, i) => {
      const t = (tier ?? {}) as Obj;
      const n = i + 1;
      const isLast = i === tiers.length - 1;
      const rate = t["rate"];
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0)
        errors.push({
          path: `calculation.tiers[${i}].rate`,
          message: `Tier ${n}: enter a valid rate`,
        });
      const upTo = t["upTo"];
      if (upTo === null || upTo === undefined) {
        if (!isLast)
          errors.push({
            path: `calculation.tiers[${i}].upTo`,
            message: `Tier ${n}: only the last tier can be uncapped`,
          });
      } else if (typeof upTo !== "number" || !Number.isFinite(upTo)) {
        errors.push({
          path: `calculation.tiers[${i}].upTo`,
          message: `Tier ${n}: cap must be a number`,
        });
      } else {
        if (upTo <= prevUpTo)
          errors.push({
            path: `calculation.tiers[${i}].upTo`,
            message: `Tier ${n}: cap must be greater than the previous tier`,
          });
        prevUpTo = upTo;
      }
    });
  } else if (kind === "formula") {
    errors.push(
      ...validateResultCalc(calc, "calculation", "Formula", allowedVars),
    );
  } else if (kind === "conditional") {
    const branches = Array.isArray(calc["branches"])
      ? (calc["branches"] as Obj[])
      : [];
    if (branches.length === 0)
      errors.push({
        path: "calculation.branches",
        message: "Add at least one if/then branch",
      });
    branches.forEach((branch, i) => {
      const b = (branch ?? {}) as Obj;
      const n = i + 1;
      errors.push(
        ...validateConditionObj(
          b["when"],
          `calculation.branches[${i}].when`,
          `Branch ${n} condition`,
        ),
      );
      errors.push(
        ...validateResultCalc(
          b["result"],
          `calculation.branches[${i}].result`,
          `Branch ${n} result`,
          allowedVars,
        ),
      );
    });
    if (calc["otherwise"] !== undefined && calc["otherwise"] !== null)
      errors.push(
        ...validateResultCalc(
          calc["otherwise"],
          "calculation.otherwise",
          "Otherwise",
          allowedVars,
        ),
      );
  } else {
    errors.push({
      path: "calculation",
      message: "Choose how the amount is calculated",
    });
  }

  return errors;
}

export function validateRuleParams(
  module: RuleModuleLike,
  params: unknown,
): ValidationError[] {
  if (module.builder === "custom") return validateCustom(params);
  return validateFields(module.fields, params, "");
}
