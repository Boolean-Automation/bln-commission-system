// Shared, framework-free validation for commission rule params. Used by the API
// server (reject bad params before persisting) and the web builder (block save
// and surface specific, field-level messages). Both render/validate from the
// same rule-module metadata so the two stay in lockstep.

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

  const conditions = Array.isArray(cfg["conditions"])
    ? (cfg["conditions"] as Obj[])
    : [];
  conditions.forEach((cond, i) => {
    const c = (cond ?? {}) as Obj;
    const n = i + 1;
    if (isBlank(c["field"]))
      errors.push({
        path: `conditions[${i}].field`,
        message: `Condition ${n}: choose a field`,
      });
    if (isBlank(c["op"]))
      errors.push({
        path: `conditions[${i}].op`,
        message: `Condition ${n}: choose an operator`,
      });
    if (isBlank(c["value"])) {
      errors.push({
        path: `conditions[${i}].value`,
        message: `Condition ${n}: enter a value`,
      });
    } else if (
      typeof c["op"] === "string" &&
      COMPARISON_OPS.has(c["op"]) &&
      Number.isNaN(Number(c["value"]))
    ) {
      errors.push({
        path: `conditions[${i}].value`,
        message: `Condition ${n}: value must be a number for a comparison operator`,
      });
    }
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
