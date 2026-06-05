import type { RuleInstanceRow } from "@workspace/db";

export type FormulaInput = { label: string; value: string };

export type FormulaBreakdown = {
  expression: string;
  inputs: FormulaInput[];
  gated: boolean;
  gateReason: string | null;
};

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function str(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function maybeNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function deriveGateReason(
  snapshot: Record<string, unknown>,
  fallback: string,
): string {
  const gpPct = maybeNum(snapshot["gpPct"]);
  if (gpPct !== null) {
    return `Gross-profit gate below threshold (GP ${gpPct.toFixed(1)}%)`;
  }
  return fallback;
}

function fallback(amount: number): FormulaBreakdown {
  return {
    expression: `Amount: ${formatCurrency(amount)}`,
    inputs: [],
    gated: false,
    gateReason: null,
  };
}

function formatTieredYtd(
  snapshot: Record<string, unknown>,
  amount: number,
): FormulaBreakdown {
  const position = str(snapshot["position"]) ?? "—";
  const ytdSales = num(snapshot["ytdSales"]);
  const jobTotal = num(snapshot["jobTotal"]);
  const rate = num(snapshot["rate"]);
  const gated = snapshot["gated"] === true;

  return {
    expression: `${formatPercent(rate)} × ${formatCurrency(jobTotal)} = ${formatCurrency(amount)}`,
    inputs: [
      { label: "Position", value: position },
      { label: "YTD Sales", value: formatCurrency(ytdSales) },
      { label: "Tier Rate", value: formatPercent(rate) },
      { label: "Job Total", value: formatCurrency(jobTotal) },
    ],
    gated,
    gateReason: gated
      ? deriveGateReason(snapshot, "Gross-profit gate not met")
      : null,
  };
}

function formatSmCut(
  snapshot: Record<string, unknown>,
  amount: number,
): FormulaBreakdown {
  const rate = num(snapshot["rate"]);
  const jobTotal = num(snapshot["jobTotal"]);
  const soldBy = str(snapshot["soldBy"]) ?? "—";
  const gpPct = maybeNum(snapshot["gpPct"]);
  const gated = snapshot["gated"] === true;

  return {
    expression: `${formatPercent(rate)} × ${formatCurrency(jobTotal)} = ${formatCurrency(amount)}`,
    inputs: [
      { label: "Sold By", value: soldBy },
      { label: "Cut Rate", value: formatPercent(rate) },
      { label: "Job Total", value: formatCurrency(jobTotal) },
      { label: "GP %", value: gpPct !== null ? `${gpPct.toFixed(1)}%` : "—" },
    ],
    gated,
    gateReason: gated
      ? deriveGateReason(snapshot, "Gross-profit gate not met")
      : null,
  };
}

function formatPmGpRate(
  snapshot: Record<string, unknown>,
  amount: number,
): FormulaBreakdown {
  const rate = num(snapshot["rate"]);
  const projectGp = num(snapshot["projectGp"]);
  const gated = snapshot["gated"] === true;

  return {
    expression: `${formatPercent(rate)} × ${formatCurrency(projectGp)} = ${formatCurrency(amount)}`,
    inputs: [
      { label: "Rate", value: formatPercent(rate) },
      { label: "Project GP", value: formatCurrency(projectGp) },
    ],
    gated,
    gateReason: gated
      ? deriveGateReason(snapshot, "Gross-profit gate not met")
      : null,
  };
}

function formatReferralBonus(
  snapshot: Record<string, unknown>,
  amount: number,
): FormulaBreakdown {
  const flat = num(snapshot["flat"], amount);
  const leadSource = str(snapshot["leadSource"]) ?? "—";

  return {
    expression: `Flat ${formatCurrency(flat)}`,
    inputs: [
      { label: "Lead Source", value: leadSource },
      { label: "Bonus", value: formatCurrency(flat) },
    ],
    gated: false,
    gateReason: null,
  };
}

function formatCustom(
  snapshot: Record<string, unknown>,
  amount: number,
): FormulaBreakdown {
  const gated = snapshot["gated"] === true;
  const conditionsPass = snapshot["conditionsPass"];
  // The engine omits conditional metadata when conditions fail entirely,
  // but evaluator outcomes can also signal a hard miss via `applies === false`.
  if (conditionsPass === false || snapshot["applies"] === false) {
    return {
      expression: `Conditions not met — ${formatCurrency(0)}`,
      inputs: [],
      gated,
      gateReason: gated
        ? deriveGateReason(snapshot, "Gross-profit gate not met")
        : null,
    };
  }

  const calculation = str(snapshot["calculation"]);

  if (calculation === "flat") {
    return {
      expression: `Flat ${formatCurrency(amount)}`,
      inputs: [{ label: "Flat amount", value: formatCurrency(amount) }],
      gated,
      gateReason: gated
        ? deriveGateReason(snapshot, "Gross-profit gate not met")
        : null,
    };
  }

  if (calculation === "percent") {
    const basis = num(snapshot["basis"]);
    const basisField = str(snapshot["basisField"]) ?? "basis";
    const rate = num(snapshot["rate"]);
    return {
      expression: `${formatPercent(rate)} × ${formatCurrency(basis)} (${basisField}) = ${formatCurrency(amount)}`,
      inputs: [
        { label: "Basis Field", value: basisField },
        { label: "Basis", value: formatCurrency(basis) },
        { label: "Rate", value: formatPercent(rate) },
      ],
      gated,
      gateReason: gated
        ? deriveGateReason(snapshot, "Gross-profit gate not met")
        : null,
    };
  }

  if (calculation === "tiered") {
    const basis = num(snapshot["basis"]);
    const rate = num(snapshot["rate"]);
    const ytdSales = maybeNum(snapshot["ytdSales"]);
    return {
      expression: `${formatPercent(rate)} × ${formatCurrency(basis)} = ${formatCurrency(amount)}`,
      inputs: [
        { label: "Basis", value: formatCurrency(basis) },
        { label: "Tier Rate", value: formatPercent(rate) },
        ...(ytdSales !== null
          ? [{ label: "YTD Sales", value: formatCurrency(ytdSales) }]
          : []),
      ],
      gated,
      gateReason: gated
        ? deriveGateReason(snapshot, "Gross-profit gate not met")
        : null,
    };
  }

  if (calculation === "formula") {
    const expression = str(snapshot["expression"]) ?? "expression";
    const variables = snapshot["variables"];
    const inputs: FormulaInput[] = [];
    if (variables && typeof variables === "object") {
      for (const [key, value] of Object.entries(
        variables as Record<string, unknown>,
      )) {
        const asNumber = maybeNum(value);
        inputs.push({
          label: key,
          value:
            asNumber !== null
              ? Number.isInteger(asNumber)
                ? asNumber.toString()
                : asNumber.toFixed(2)
              : typeof value === "string"
                ? value
                : JSON.stringify(value),
        });
      }
    }
    return {
      expression: `${expression} = ${formatCurrency(amount)}`,
      inputs,
      gated,
      gateReason: gated
        ? deriveGateReason(snapshot, "Gross-profit gate not met")
        : null,
    };
  }

  if (calculation === "conditional") {
    const matched = snapshot["matchedBranch"];
    const branchLabel =
      typeof matched === "number"
        ? `Branch ${matched + 1}`
        : typeof matched === "string"
          ? matched
          : "—";
    return {
      expression: `${branchLabel} → ${formatCurrency(amount)}`,
      inputs: [{ label: "Matched Branch", value: branchLabel }],
      gated,
      gateReason: gated
        ? deriveGateReason(snapshot, "Gross-profit gate not met")
        : null,
    };
  }

  return fallback(amount);
}

export function formatSnapshot(
  snapshot: Record<string, unknown> | null,
  _ruleInstance: RuleInstanceRow | null,
  amount: number,
): FormulaBreakdown {
  if (!snapshot) return fallback(amount);
  const rule = str(snapshot["rule"]);
  switch (rule) {
    case "tiered_ytd_rate":
      return formatTieredYtd(snapshot, amount);
    case "sm_cut":
      return formatSmCut(snapshot, amount);
    case "pm_gp_rate":
      return formatPmGpRate(snapshot, amount);
    case "referral_bonus":
      return formatReferralBonus(snapshot, amount);
    case "custom":
      return formatCustom(snapshot, amount);
    default:
      return fallback(amount);
  }
}
