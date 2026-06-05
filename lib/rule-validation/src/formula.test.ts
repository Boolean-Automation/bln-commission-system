import { describe, expect, it } from "vitest";
import { analyzeFormula, evaluateFormula } from "./formula";

const scope = {
  "job.totalAmount": 1000,
  "job.gpAmount": 400,
  "job.gpPct": 0.4,
  "person.ytdSales": 50000,
  "manual.bonus": 25,
};

function val(expr: string, s: Record<string, number> = scope): number {
  const res = evaluateFormula(expr, s);
  if (!res.ok) throw new Error(`expected ok, got error: ${res.error}`);
  return res.value;
}

describe("evaluateFormula", () => {
  it("evaluates number literals and decimals", () => {
    expect(val("42")).toBe(42);
    expect(val("3.5")).toBe(3.5);
  });

  it("honors operator precedence (* and % before + and -)", () => {
    expect(val("2 + 3 * 4")).toBe(14);
    expect(val("10 - 2 * 3")).toBe(4);
    expect(val("2 + 10 % 3")).toBe(3);
  });

  it("respects parentheses over precedence", () => {
    expect(val("(2 + 3) * 4")).toBe(20);
    expect(val("2 * (3 + 4)")).toBe(14);
  });

  it("supports unary minus and unary plus", () => {
    expect(val("-5")).toBe(-5);
    expect(val("-(2 + 3)")).toBe(-5);
    expect(val("3 - -2")).toBe(5);
    expect(val("+7")).toBe(7);
    expect(val("2 * -3")).toBe(-6);
  });

  it("evaluates built-in functions", () => {
    expect(val("min(3, 7)")).toBe(3);
    expect(val("max(3, 7, 5)")).toBe(7);
    expect(val("abs(-4)")).toBe(4);
    expect(val("round(2.6)")).toBe(3);
    expect(val("floor(2.9)")).toBe(2);
    expect(val("ceil(2.1)")).toBe(3);
  });

  it("function names are case-insensitive", () => {
    expect(val("MAX(1, 9)")).toBe(9);
    expect(val("Min(4, 2)")).toBe(2);
  });

  it("resolves @variable references from the scope", () => {
    expect(val("@job.totalAmount * 0.05")).toBe(50);
    expect(val("@job.gpAmount + @manual.bonus")).toBe(425);
  });

  it("reports the variables it used", () => {
    const res = evaluateFormula("@job.totalAmount + @job.gpAmount", scope);
    expect(res.ok).toBe(true);
    if (res.ok) expect([...res.vars].sort()).toEqual([
      "job.gpAmount",
      "job.totalAmount",
    ]);
  });

  it("returns 0 for division by zero rather than Infinity/NaN", () => {
    expect(val("10 / 0")).toBe(0);
    expect(val("@job.totalAmount / 0")).toBe(0);
  });

  it("returns 0 for modulo by zero", () => {
    expect(val("10 % 0")).toBe(0);
  });

  it("errors on an unknown variable not present in scope", () => {
    const res = evaluateFormula("@job.missing + 1", scope);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Unknown variable");
  });

  it("errors on an unknown bare name (not @-prefixed)", () => {
    const res = evaluateFormula("foo + 1", scope);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Unknown name");
  });

  it("errors on a syntax error (trailing operator)", () => {
    const res = evaluateFormula("2 +", scope);
    expect(res.ok).toBe(false);
  });

  it("errors on unbalanced parentheses", () => {
    expect(evaluateFormula("(2 + 3", scope).ok).toBe(false);
    expect(evaluateFormula("2 + 3)", scope).ok).toBe(false);
  });

  it("errors on an empty formula", () => {
    const res = evaluateFormula("   ", scope);
    expect(res.ok).toBe(false);
  });

  it("errors on an unexpected character", () => {
    const res = evaluateFormula("2 & 3", scope);
    expect(res.ok).toBe(false);
  });

  it("errors on a dangling '@'", () => {
    const res = evaluateFormula("@ + 1", scope);
    expect(res.ok).toBe(false);
  });
});

describe("analyzeFormula", () => {
  const allowed = new Set([
    "job.totalAmount",
    "job.gpAmount",
    "manual.bonus",
  ]);

  it("accepts a syntactically valid formula using allowed variables", () => {
    const res = analyzeFormula("@job.totalAmount * 0.1 + @manual.bonus", allowed);
    expect(res.ok).toBe(true);
    if (res.ok)
      expect([...res.vars].sort()).toEqual(["job.totalAmount", "manual.bonus"]);
  });

  it("does not trip on division/modulo by a literal zero in the static pass", () => {
    // analyze resolves variables to 1, so this is purely a syntax/var check.
    const res = analyzeFormula("@job.totalAmount / @job.gpAmount", allowed);
    expect(res.ok).toBe(true);
  });

  it("rejects a formula referencing a variable outside the allowed set", () => {
    const res = analyzeFormula("@job.totalAmount + @person.ytdSales", allowed);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("@person.ytdSales");
  });

  it("lists multiple unknown variables", () => {
    const res = analyzeFormula("@a.x + @b.y", allowed);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Unknown variables");
      expect(res.error).toContain("@a.x");
      expect(res.error).toContain("@b.y");
    }
  });

  it("rejects a syntactically invalid formula", () => {
    const res = analyzeFormula("@job.totalAmount *", allowed);
    expect(res.ok).toBe(false);
  });
});
