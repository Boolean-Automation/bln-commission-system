import { describe, expect, it } from "vitest";
import {
  evaluateCustomRule,
  type CustomCalculation,
  type CustomConfig,
  type CustomRuleJob,
  type CustomRulePerson,
} from "./customRule";

function makeJob(overrides: Partial<CustomRuleJob> = {}): CustomRuleJob {
  return {
    totalAmount: 1000,
    gpAmount: 400,
    gpPct: 0.4,
    status: "won",
    ...overrides,
  };
}

function makePerson(overrides: Partial<CustomRulePerson> = {}): CustomRulePerson {
  return {
    position: "Sales",
    roles: [],
    ytdSales: 0,
    ...overrides,
  };
}

function makeConfig(
  calculation: CustomCalculation,
  overrides: Partial<CustomConfig> = {},
): CustomConfig {
  return {
    label: "Test rule",
    recipient: { source: "salesRep" },
    conditions: [],
    calculation,
    ...overrides,
  };
}

describe("evaluateCustomRule — basic kinds", () => {
  it("computes a flat amount", () => {
    const out = evaluateCustomRule(
      makeConfig({ kind: "flat", amount: 250 }),
      makeJob(),
      makePerson(),
    );
    expect(out.applies).toBe(true);
    expect(out.amount).toBe(250);
  });

  it("computes a percent of total", () => {
    const out = evaluateCustomRule(
      makeConfig({ kind: "percent", field: "totalAmount", rate: 0.05 }),
      makeJob(),
      makePerson(),
    );
    expect(out.amount).toBe(50);
    expect(out.snapshot["basis"]).toBe(1000);
  });

  it("computes a percent of gross profit", () => {
    const out = evaluateCustomRule(
      makeConfig({ kind: "percent", field: "gpAmount", rate: 0.1 }),
      makeJob(),
      makePerson(),
    );
    expect(out.amount).toBe(40);
  });

  it("does not apply when a tiered calc has no tiers", () => {
    const out = evaluateCustomRule(
      makeConfig({ kind: "tiered", basisField: "totalAmount", tiers: [] }),
      makeJob(),
      makePerson(),
    );
    expect(out.applies).toBe(false);
  });

  it("does not apply for an unrecognized calculation kind", () => {
    const out = evaluateCustomRule(
      makeConfig({ kind: "bogus" } as unknown as CustomCalculation),
      makeJob(),
      makePerson(),
    );
    expect(out.applies).toBe(false);
  });

  it("does not apply when top-level conditions fail", () => {
    const out = evaluateCustomRule(
      makeConfig(
        { kind: "flat", amount: 100 },
        { conditions: [{ field: "job.status", op: "eq", value: "lost" }] },
      ),
      makeJob({ status: "won" }),
      makePerson(),
    );
    expect(out.applies).toBe(false);
    expect(out.conditionsPass).toBe(false);
  });
});

describe("evaluateCustomRule — conditional branch selection", () => {
  const conditional: CustomCalculation = {
    kind: "conditional",
    branches: [
      {
        when: { field: "job.totalAmount", op: "gte", value: 5000 },
        result: { kind: "flat", amount: 500 },
      },
      {
        when: { field: "job.totalAmount", op: "gte", value: 1000 },
        result: { kind: "flat", amount: 100 },
      },
    ],
    otherwise: { kind: "flat", amount: 10 },
  };

  it("selects the first matching branch", () => {
    const out = evaluateCustomRule(
      makeConfig(conditional),
      makeJob({ totalAmount: 6000 }),
      makePerson(),
    );
    expect(out.amount).toBe(500);
    expect(out.matchedBranch).toBe(0);
    expect(out.snapshot["matchedBranch"]).toBe(0);
  });

  it("falls through to a later branch when the first does not match", () => {
    const out = evaluateCustomRule(
      makeConfig(conditional),
      makeJob({ totalAmount: 2000 }),
      makePerson(),
    );
    expect(out.amount).toBe(100);
    expect(out.matchedBranch).toBe(1);
  });

  it("uses the otherwise clause when no branch matches", () => {
    const out = evaluateCustomRule(
      makeConfig(conditional),
      makeJob({ totalAmount: 500 }),
      makePerson(),
    );
    expect(out.amount).toBe(10);
    expect(out.matchedBranch).toBe("otherwise");
  });

  it("produces 0 when no branch matches and there is no otherwise clause", () => {
    const noOtherwise: CustomCalculation = {
      kind: "conditional",
      branches: [
        {
          when: { field: "job.status", op: "eq", value: "lost" },
          result: { kind: "flat", amount: 999 },
        },
      ],
    };
    const out = evaluateCustomRule(
      makeConfig(noOtherwise),
      makeJob(),
      makePerson(),
    );
    expect(out.amount).toBe(0);
    expect(out.matchedBranch).toBe("otherwise");
  });

  it("respects the first-match order even when a later branch also matches", () => {
    // Both branches match a 6000 job; the first one (500) must win.
    const out = evaluateCustomRule(
      makeConfig(conditional),
      makeJob({ totalAmount: 6000 }),
      makePerson(),
    );
    expect(out.amount).toBe(500);
  });
});

describe("evaluateCustomRule — forecast weighting before the GP gate", () => {
  const percent: CustomCalculation = {
    kind: "percent",
    field: "totalAmount",
    rate: 0.1,
  };

  it("weights the raw amount when the forecast applies", () => {
    const out = evaluateCustomRule(
      makeConfig(percent, {
        forecast: { enabled: true, weightPct: 0.5, openStatuses: ["pipeline"] },
      }),
      makeJob({ status: "pipeline" }),
      makePerson(),
    );
    expect(out.amount).toBe(50); // 1000 * 0.1 * 0.5
    expect(out.fullAmount).toBe(100);
    const forecast = out.snapshot["forecast"] as Record<string, unknown>;
    expect(forecast["applied"]).toBe(true);
    expect(forecast["fullAmount"]).toBe(100);
    expect(forecast["weightedAmount"]).toBe(50);
  });

  it("does not weight when forecast is enabled but does not apply to this job", () => {
    const out = evaluateCustomRule(
      makeConfig(percent, {
        forecast: { enabled: true, weightPct: 0.5, openStatuses: ["pipeline"] },
      }),
      makeJob({ status: "won" }),
      makePerson(),
    );
    expect(out.amount).toBe(100);
    const forecast = out.snapshot["forecast"] as Record<string, unknown>;
    expect(forecast["applied"]).toBe(false);
  });

  it("records no forecast snapshot when forecasting is disabled", () => {
    const out = evaluateCustomRule(
      makeConfig(percent),
      makeJob(),
      makePerson(),
    );
    expect(out.snapshot["forecast"]).toBeUndefined();
  });

  it("forces the final amount to 0 when gated, even though weighting ran first", () => {
    const out = evaluateCustomRule(
      makeConfig(percent, {
        respectGate: true,
        forecast: { enabled: true, weightPct: 0.5, openStatuses: ["pipeline"] },
      }),
      makeJob({ status: "pipeline", gpPct: 0.1 }),
      makePerson(),
      { gateFloor: 0.35 },
    );
    expect(out.gated).toBe(true);
    expect(out.amount).toBe(0);
    expect(out.snapshot["gated"]).toBe(true);
    // The weighting still ran and is recorded before the gate zeroed it.
    const forecast = out.snapshot["forecast"] as Record<string, unknown>;
    expect(forecast["applied"]).toBe(true);
    expect(forecast["weightedAmount"]).toBe(50);
  });

  it("gates a non-forecast amount to 0", () => {
    const out = evaluateCustomRule(
      makeConfig(percent, { respectGate: true }),
      makeJob({ gpPct: 0.1 }),
      makePerson(),
      { gateFloor: 0.35 },
    );
    expect(out.gated).toBe(true);
    expect(out.amount).toBe(0);
  });

  it("does not gate when gpPct meets the floor", () => {
    const out = evaluateCustomRule(
      makeConfig(percent, { respectGate: true }),
      makeJob({ gpPct: 0.4 }),
      makePerson(),
      { gateFloor: 0.35 },
    );
    expect(out.gated).toBe(false);
    expect(out.amount).toBe(100);
  });
});

describe("evaluateCustomRule — formula calc with manual vars", () => {
  it("evaluates a formula against job + manual scope", () => {
    const out = evaluateCustomRule(
      makeConfig(
        { kind: "formula", expression: "@job.totalAmount * 0.05 + @manual.bonus" },
        { manualVars: [{ key: "bonus", value: 25 }] },
      ),
      makeJob(),
      makePerson(),
    );
    expect(out.amount).toBe(75); // 1000*0.05 + 25
  });

  it("records the error and yields 0 for an invalid formula", () => {
    const out = evaluateCustomRule(
      makeConfig({ kind: "formula", expression: "@job.unknown + 1" }),
      makeJob(),
      makePerson(),
    );
    expect(out.amount).toBe(0);
    expect(out.snapshot["error"]).toBeTruthy();
  });
});
