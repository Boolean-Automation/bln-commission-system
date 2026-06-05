import { describe, expect, it } from "vitest";
import { formatSnapshot } from "./snapshotFormat";

describe("formatSnapshot", () => {
  it("falls back when snapshot is null", () => {
    const out = formatSnapshot(null, null, 123.45);
    expect(out.inputs).toEqual([]);
    expect(out.gated).toBe(false);
    expect(out.expression).toContain("$123.45");
  });

  it("formats a tiered_ytd_rate snapshot with all inputs", () => {
    const out = formatSnapshot(
      {
        rule: "tiered_ytd_rate",
        position: "Senior Rep",
        ytdSales: 250000,
        jobTotal: 42500,
        rate: 0.055,
        gpPct: 28,
        gated: false,
        formula: "5.50% x 42500",
      },
      null,
      2337.5,
    );
    expect(out.expression).toBe("5.50% × $42,500.00 = $2,337.50");
    expect(out.gated).toBe(false);
    expect(out.gateReason).toBeNull();
    const labels = out.inputs.map((i) => i.label);
    expect(labels).toEqual(["Position", "YTD Sales", "Tier Rate", "Job Total"]);
    expect(out.inputs[0].value).toBe("Senior Rep");
    expect(out.inputs[3].value).toBe("$42,500.00");
  });

  it("surfaces the gate reason when a tiered entry is gated", () => {
    const out = formatSnapshot(
      {
        rule: "tiered_ytd_rate",
        position: "Senior Rep",
        ytdSales: 100000,
        jobTotal: 50000,
        rate: 0.055,
        gpPct: 18,
        gated: true,
        formula: "5.50% x 50000",
      },
      null,
      0,
    );
    expect(out.gated).toBe(true);
    expect(out.gateReason).toContain("Gross-profit gate");
  });

  it("formats an sm_cut snapshot", () => {
    const out = formatSnapshot(
      {
        rule: "sm_cut",
        jobTotal: 100000,
        rate: 0.0075,
        soldBy: "Dana",
        gpPct: 30,
        gated: false,
      },
      null,
      750,
    );
    expect(out.expression).toBe("0.75% × $100,000.00 = $750.00");
    expect(out.inputs.find((i) => i.label === "Sold By")?.value).toBe("Dana");
    expect(out.inputs.find((i) => i.label === "GP %")?.value).toBe("30.0%");
  });

  it("formats a pm_gp_rate snapshot", () => {
    const out = formatSnapshot(
      {
        rule: "pm_gp_rate",
        projectGp: 15000,
        rate: 0.02,
        gpPct: 30,
        gated: false,
      },
      null,
      300,
    );
    expect(out.expression).toBe("2.00% × $15,000.00 = $300.00");
    expect(out.inputs).toEqual([
      { label: "Rate", value: "2.00%" },
      { label: "Project GP", value: "$15,000.00" },
    ]);
  });

  it("formats a referral_bonus snapshot", () => {
    const out = formatSnapshot(
      { rule: "referral_bonus", leadSource: "Referral - Linda", flat: 50 },
      null,
      50,
    );
    expect(out.expression).toBe("Flat $50.00");
    expect(out.inputs[0]).toEqual({
      label: "Lead Source",
      value: "Referral - Linda",
    });
  });

  it("formats a custom formula snapshot with named variables", () => {
    const out = formatSnapshot(
      {
        rule: "custom",
        calculation: "formula",
        expression: "totalAmount * 0.01",
        variables: { totalAmount: 1000, multiplier: 0.01 },
        value: 10,
        gated: false,
      },
      null,
      10,
    );
    expect(out.expression).toBe("totalAmount * 0.01 = $10.00");
    expect(out.inputs.map((i) => i.label)).toEqual([
      "totalAmount",
      "multiplier",
    ]);
  });

  it("formats a custom tiered snapshot", () => {
    const out = formatSnapshot(
      {
        rule: "custom",
        calculation: "tiered",
        basisField: "totalAmount",
        basis: 60000,
        ytdSales: 200000,
        rate: 0.04,
        gated: false,
      },
      null,
      2400,
    );
    expect(out.expression).toBe("4.00% × $60,000.00 = $2,400.00");
    expect(out.inputs.find((i) => i.label === "YTD Sales")?.value).toBe(
      "$200,000.00",
    );
  });

  it("formats a custom percent snapshot", () => {
    const out = formatSnapshot(
      {
        rule: "custom",
        calculation: "percent",
        basisField: "gpAmount",
        basis: 5000,
        rate: 0.1,
        gated: false,
      },
      null,
      500,
    );
    expect(out.expression).toBe(
      "10.00% × $5,000.00 (gpAmount) = $500.00",
    );
  });

  it("formats a custom flat snapshot", () => {
    const out = formatSnapshot(
      { rule: "custom", calculation: "flat", flat: 250, gated: false },
      null,
      250,
    );
    expect(out.expression).toBe("Flat $250.00");
  });

  it("emits a conditions-not-met expression when conditionsPass is false", () => {
    const out = formatSnapshot(
      {
        rule: "custom",
        calculation: "flat",
        conditionsPass: false,
        gated: false,
      },
      null,
      0,
    );
    expect(out.expression).toContain("Conditions not met");
    expect(out.inputs).toEqual([]);
  });
});
