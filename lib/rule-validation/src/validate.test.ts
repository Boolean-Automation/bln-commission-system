import { describe, expect, it } from "vitest";
import { validateRuleParams, type RuleModuleLike } from "./index";

const customModule: RuleModuleLike = { builder: "custom", fields: [] };

function validate(params: unknown) {
  return validateRuleParams(customModule, params);
}

function messages(params: unknown): string[] {
  return validate(params).map((e) => e.message);
}

function paths(params: unknown): string[] {
  return validate(params).map((e) => e.path);
}

// A minimal valid custom config that individual tests mutate to trigger one
// specific error at a time.
function baseConfig(): Record<string, unknown> {
  return {
    label: "Test rule",
    recipient: { source: "salesRep" },
    conditions: [],
    calculation: { kind: "flat", amount: 100 },
  };
}

describe("validateCustom — top-level fields", () => {
  it("passes a minimal valid flat rule", () => {
    expect(validate(baseConfig())).toEqual([]);
  });

  it("requires a label", () => {
    const cfg = { ...baseConfig(), label: "  " };
    expect(messages(cfg)).toContain("Rule label is required");
  });

  it("requires a recipient choice", () => {
    const cfg = { ...baseConfig(), recipient: {} };
    expect(messages(cfg)).toContain("Choose who earns this commission");
  });

  it("requires a position or role when recipient source is 'match'", () => {
    const cfg = { ...baseConfig(), recipient: { source: "match" } };
    expect(messages(cfg)).toContain(
      "Specify a position or at least one role to match recipients",
    );
  });

  it("accepts a 'match' recipient with a position", () => {
    const cfg = {
      ...baseConfig(),
      recipient: { source: "match", positionContains: "Manager" },
    };
    expect(validate(cfg)).toEqual([]);
  });
});

describe("validateCustom — calculation kinds", () => {
  it("requires a flat amount", () => {
    const cfg = { ...baseConfig(), calculation: { kind: "flat" } };
    expect(messages(cfg)).toContain("Enter a flat amount");
  });

  it("rejects a negative flat amount", () => {
    const cfg = { ...baseConfig(), calculation: { kind: "flat", amount: -5 } };
    expect(messages(cfg)).toContain("Amount cannot be negative");
  });

  it("requires a valid field and rate for percent", () => {
    const cfg = { ...baseConfig(), calculation: { kind: "percent" } };
    const m = messages(cfg);
    expect(m).toContain("Choose which field the percentage applies to");
    expect(m).toContain("Enter a rate");
  });

  it("requires at least one tier for tiered", () => {
    const cfg = {
      ...baseConfig(),
      calculation: { kind: "tiered", basisField: "totalAmount", tiers: [] },
    };
    expect(messages(cfg)).toContain("Add at least one tier");
  });

  it("requires ascending tier caps", () => {
    const cfg = {
      ...baseConfig(),
      calculation: {
        kind: "tiered",
        basisField: "totalAmount",
        tiers: [
          { upTo: 1000, rate: 0.05 },
          { upTo: 500, rate: 0.06 },
        ],
      },
    };
    expect(messages(cfg)).toContain(
      "Tier 2: cap must be greater than the previous tier",
    );
  });

  it("only allows the last tier to be uncapped", () => {
    const cfg = {
      ...baseConfig(),
      calculation: {
        kind: "tiered",
        basisField: "totalAmount",
        tiers: [
          { upTo: null, rate: 0.05 },
          { upTo: 1000, rate: 0.06 },
        ],
      },
    };
    expect(messages(cfg)).toContain("Tier 1: only the last tier can be uncapped");
  });

  it("requires a non-empty formula expression", () => {
    const cfg = {
      ...baseConfig(),
      calculation: { kind: "formula", expression: "  " },
    };
    expect(messages(cfg)).toContain("Formula: enter a formula");
  });

  it("rejects a formula referencing an unknown variable", () => {
    const cfg = {
      ...baseConfig(),
      calculation: { kind: "formula", expression: "@job.totalAmount + @nope.x" },
    };
    const m = messages(cfg);
    expect(m.some((x) => x.includes("@nope.x"))).toBe(true);
  });

  it("accepts a formula referencing a declared manual variable", () => {
    const cfg = {
      ...baseConfig(),
      manualVars: [{ key: "bonus", value: 10 }],
      calculation: {
        kind: "formula",
        expression: "@job.totalAmount * 0.05 + @manual.bonus",
      },
    };
    expect(validate(cfg)).toEqual([]);
  });

  it("falls back to a generic message for an unknown calculation kind", () => {
    const cfg = { ...baseConfig(), calculation: { kind: "bogus" } };
    expect(messages(cfg)).toContain("Choose how the amount is calculated");
  });
});

describe("validateCustom — conditional calculation", () => {
  it("requires at least one branch", () => {
    const cfg = {
      ...baseConfig(),
      calculation: { kind: "conditional", branches: [] },
    };
    expect(messages(cfg)).toContain("Add at least one if/then branch");
  });

  it("validates a branch's when-condition fields", () => {
    const cfg = {
      ...baseConfig(),
      calculation: {
        kind: "conditional",
        branches: [{ when: {}, result: { kind: "flat", amount: 10 } }],
      },
    };
    const m = messages(cfg);
    expect(m).toContain("Branch 1 condition: choose a field");
    expect(m).toContain("Branch 1 condition: choose an operator");
    expect(m).toContain("Branch 1 condition: enter a value");
  });

  it("requires a numeric value for a comparison operator in a branch", () => {
    const cfg = {
      ...baseConfig(),
      calculation: {
        kind: "conditional",
        branches: [
          {
            when: { field: "job.totalAmount", op: "gt", value: "abc" },
            result: { kind: "flat", amount: 10 },
          },
        ],
      },
    };
    expect(messages(cfg)).toContain(
      "Branch 1 condition: value must be a number for a comparison operator",
    );
  });

  it("validates a branch result calculation", () => {
    const cfg = {
      ...baseConfig(),
      calculation: {
        kind: "conditional",
        branches: [
          {
            when: { field: "job.status", op: "eq", value: "won" },
            result: { kind: "flat" },
          },
        ],
      },
    };
    expect(messages(cfg)).toContain("Branch 1 result: enter a flat amount");
  });

  it("validates the otherwise clause", () => {
    const cfg = {
      ...baseConfig(),
      calculation: {
        kind: "conditional",
        branches: [
          {
            when: { field: "job.status", op: "eq", value: "won" },
            result: { kind: "flat", amount: 10 },
          },
        ],
        otherwise: { kind: "percent" },
      },
    };
    const m = messages(cfg);
    expect(m).toContain("Otherwise: choose a field for the percentage");
    expect(m).toContain("Otherwise: enter a rate");
  });
});

describe("validateCustom — manual variables", () => {
  it("requires a name and a numeric value", () => {
    const cfg = { ...baseConfig(), manualVars: [{ key: "", value: "x" }] };
    const m = messages(cfg);
    expect(m).toContain("Manual input 1: enter a name");
    expect(m).toContain("Manual input 1: enter a number");
  });

  it("rejects an invalid key format", () => {
    const cfg = { ...baseConfig(), manualVars: [{ key: "1bad", value: 1 }] };
    expect(messages(cfg)).toContain(
      "Manual input 1: name must start with a letter and use only letters, numbers, or underscores",
    );
  });

  it("rejects duplicate keys (case-insensitive)", () => {
    const cfg = {
      ...baseConfig(),
      manualVars: [
        { key: "bonus", value: 1 },
        { key: "Bonus", value: 2 },
      ],
    };
    expect(messages(cfg)).toContain('Manual input 2: duplicate name "Bonus"');
  });
});

describe("validateCustom — forecast", () => {
  it("ignores forecast when not enabled", () => {
    const cfg = { ...baseConfig(), forecast: { enabled: false } };
    expect(validate(cfg)).toEqual([]);
  });

  it("requires a non-negative weight when enabled", () => {
    const cfg = {
      ...baseConfig(),
      forecast: { enabled: true, weightPct: -0.1, openStatuses: ["open"] },
    };
    expect(messages(cfg)).toContain(
      "Forecast weight must be a non-negative number",
    );
  });

  it("requires at least one open status when enabled", () => {
    const cfg = {
      ...baseConfig(),
      forecast: { enabled: true, weightPct: 0.5, openStatuses: [] },
    };
    expect(paths(cfg)).toContain("forecast.openStatuses");
  });

  it("accepts a valid enabled forecast", () => {
    const cfg = {
      ...baseConfig(),
      forecast: { enabled: true, weightPct: 0.5, openStatuses: ["open"] },
    };
    expect(validate(cfg)).toEqual([]);
  });
});
