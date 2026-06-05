// A small, safe, deterministic arithmetic evaluator for no-code commission
// formulas. It supports number literals, `@variable` references, the binary
// operators + - * / %, unary minus/plus, parentheses, and a fixed set of
// functions (min, max, abs, round, floor, ceil). It deliberately does NOT use
// eval()/Function — expressions are tokenized and walked by a recursive-descent
// parser so admin-authored formulas can never execute arbitrary code.
//
// Shared by the engine (api-server), the web builder (commissions), and the
// shared rule validator so all three agree on what a formula means.

export type FormulaScope = Record<string, number>;

export type FormulaResult =
  | { ok: true; value: number; vars: string[] }
  | { ok: false; error: string; vars: string[] };

export type FormulaAnalysis =
  | { ok: true; vars: string[] }
  | { ok: false; error: string };

const FUNCS: Record<string, (args: number[]) => number> = {
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  abs: (a) => Math.abs(a[0] ?? 0),
  round: (a) => Math.round(a[0] ?? 0),
  floor: (a) => Math.floor(a[0] ?? 0),
  ceil: (a) => Math.ceil(a[0] ?? 0),
};

type Tok =
  | { t: "num"; v: number }
  | { t: "var"; v: string }
  | { t: "func"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "%" }
  | { t: "lp" }
  | { t: "rp" }
  | { t: "comma" };

class FormulaError extends Error {}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}
function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_.]/.test(ch);
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "@") {
      i += 1;
      let path = "";
      while (i < n && isIdentPart(src[i]!)) {
        path += src[i];
        i += 1;
      }
      if (path === "") throw new FormulaError("Empty variable reference after '@'");
      if (path.endsWith("."))
        throw new FormulaError(`Invalid variable reference '@${path}'`);
      toks.push({ t: "var", v: path });
      continue;
    }
    if (isIdentStart(ch)) {
      let word = "";
      while (i < n && /[A-Za-z0-9_]/.test(src[i]!)) {
        word += src[i];
        i += 1;
      }
      const lower = word.toLowerCase();
      if (lower in FUNCS) {
        toks.push({ t: "func", v: lower });
        continue;
      }
      throw new FormulaError(
        `Unknown name '${word}' — reference fields with '@' (e.g. @job.totalAmount)`,
      );
    }
    if (/[0-9.]/.test(ch)) {
      let numStr = "";
      while (i < n && /[0-9.]/.test(src[i]!)) {
        numStr += src[i];
        i += 1;
      }
      const value = Number(numStr);
      if (!Number.isFinite(value))
        throw new FormulaError(`Invalid number '${numStr}'`);
      toks.push({ t: "num", v: value });
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "%") {
      toks.push({ t: "op", v: ch });
      i += 1;
      continue;
    }
    if (ch === "(") {
      toks.push({ t: "lp" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      toks.push({ t: "rp" });
      i += 1;
      continue;
    }
    if (ch === ",") {
      toks.push({ t: "comma" });
      i += 1;
      continue;
    }
    throw new FormulaError(`Unexpected character '${ch}'`);
  }
  return toks;
}

type ResolveVar = (path: string) => number;

class Parser {
  private pos = 0;
  readonly usedVars = new Set<string>();
  constructor(
    private readonly toks: Tok[],
    private readonly resolve: ResolveVar,
  ) {}

  private peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  private next(): Tok | undefined {
    return this.toks[this.pos++];
  }

  parse(): number {
    if (this.toks.length === 0) throw new FormulaError("Formula is empty");
    const value = this.parseExpr();
    if (this.pos < this.toks.length)
      throw new FormulaError("Unexpected trailing input in formula");
    return value;
  }

  private parseExpr(): number {
    let left = this.parseTerm();
    for (;;) {
      const tok = this.peek();
      if (tok && tok.t === "op" && (tok.v === "+" || tok.v === "-")) {
        this.next();
        const right = this.parseTerm();
        left = tok.v === "+" ? left + right : left - right;
      } else break;
    }
    return left;
  }

  private parseTerm(): number {
    let left = this.parseFactor();
    for (;;) {
      const tok = this.peek();
      if (
        tok &&
        tok.t === "op" &&
        (tok.v === "*" || tok.v === "/" || tok.v === "%")
      ) {
        this.next();
        const right = this.parseFactor();
        if (tok.v === "*") left = left * right;
        else if (tok.v === "/") left = right === 0 ? 0 : left / right;
        else left = right === 0 ? 0 : left % right;
      } else break;
    }
    return left;
  }

  private parseFactor(): number {
    const tok = this.peek();
    if (tok && tok.t === "op" && (tok.v === "+" || tok.v === "-")) {
      this.next();
      const value = this.parseFactor();
      return tok.v === "-" ? -value : value;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const tok = this.next();
    if (!tok) throw new FormulaError("Unexpected end of formula");
    if (tok.t === "num") return tok.v;
    if (tok.t === "var") {
      this.usedVars.add(tok.v);
      const v = this.resolve(tok.v);
      if (typeof v !== "number" || !Number.isFinite(v))
        throw new FormulaError(`Unknown variable '@${tok.v}'`);
      return v;
    }
    if (tok.t === "func") {
      const open = this.next();
      if (!open || open.t !== "lp")
        throw new FormulaError(`Expected '(' after ${tok.v}`);
      const args: number[] = [];
      if (this.peek()?.t !== "rp") {
        args.push(this.parseExpr());
        while (this.peek()?.t === "comma") {
          this.next();
          args.push(this.parseExpr());
        }
      }
      const close = this.next();
      if (!close || close.t !== "rp")
        throw new FormulaError(`Expected ')' to close ${tok.v}(`);
      return FUNCS[tok.v]!(args);
    }
    if (tok.t === "lp") {
      const value = this.parseExpr();
      const close = this.next();
      if (!close || close.t !== "rp")
        throw new FormulaError("Missing closing ')'");
      return value;
    }
    throw new FormulaError("Unexpected token in formula");
  }
}

/**
 * Evaluate a formula against a numeric scope. Unknown variables, syntax errors,
 * and malformed input return `{ ok: false }` with a human-readable message —
 * the engine treats a failed formula as $0 but records the error in the
 * computation snapshot so the failure is auditable rather than silent.
 */
export function evaluateFormula(
  expr: string,
  scope: FormulaScope,
): FormulaResult {
  const resolve: ResolveVar = (path) => {
    const v = scope[path];
    return typeof v === "number" ? v : NaN;
  };
  try {
    const parser = new Parser(tokenize(expr), resolve);
    const value = parser.parse();
    const vars = [...parser.usedVars];
    if (!Number.isFinite(value))
      return { ok: false, error: "Formula did not produce a finite number", vars };
    return { ok: true, value, vars };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid formula";
    return { ok: false, error: message, vars: [] };
  }
}

/**
 * Statically check a formula's syntax and that every referenced variable is in
 * the allowed set, without needing concrete values. Used by the shared
 * validator to block saving an invalid or out-of-catalog formula.
 */
export function analyzeFormula(
  expr: string,
  allowed: Set<string>,
): FormulaAnalysis {
  const used = new Set<string>();
  const resolve: ResolveVar = (path) => {
    used.add(path);
    // Resolve to 1 so division/modulo never trip on a placeholder zero during
    // a syntax-only pass; real values are supplied at evaluation time.
    return 1;
  };
  try {
    const parser = new Parser(tokenize(expr), resolve);
    parser.parse();
    const unknown = [...parser.usedVars].filter((v) => !allowed.has(v));
    if (unknown.length > 0)
      return {
        ok: false,
        error: `Unknown variable${unknown.length > 1 ? "s" : ""}: ${unknown
          .map((v) => `@${v}`)
          .join(", ")}`,
      };
    return { ok: true, vars: [...parser.usedVars] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid formula" };
  }
}
