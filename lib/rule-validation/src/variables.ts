// The catalog of variables an admin can reference (via the `@` picker) when
// composing a no-code formula. The `path` is what appears in the stored
// expression after `@` (e.g. `@job.totalAmount`) and is also the key the engine
// uses when building the evaluation scope, so the UI, engine, and validator all
// agree on the available variables.

export type FormulaVariableGroup = "Job" | "Person" | "Manual";

export type FormulaVariable = {
  path: string;
  token: string; // path prefixed with "@"
  label: string;
  group: FormulaVariableGroup;
  description?: string;
};

function v(
  path: string,
  label: string,
  group: FormulaVariableGroup,
  description?: string,
): FormulaVariable {
  return { path, token: `@${path}`, label, group, description };
}

// Built-in variables, always available. Numeric job/person fields the engine
// can resolve for any job/person pair during recompute.
export const FORMULA_VARIABLES: FormulaVariable[] = [
  v("job.totalAmount", "Job total ($)", "Job", "Contract total for the job"),
  v("job.gpAmount", "Job gross profit ($)", "Job", "Gross-profit dollars"),
  v("job.gpPct", "Job gross profit (%)", "Job", "Gross-profit percentage"),
  v(
    "person.ytdSales",
    "Person YTD sales ($)",
    "Person",
    "Year-to-date sales for the earner",
  ),
];

export const BUILTIN_VARIABLE_PATHS: Set<string> = new Set(
  FORMULA_VARIABLES.map((x) => x.path),
);

export type ManualVariable = { key: string; label?: string; value: number };

export const MANUAL_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** Turn a manual-input definition into a referenceable formula variable. */
export function manualVariable(mv: ManualVariable): FormulaVariable {
  return {
    path: `manual.${mv.key}`,
    token: `@manual.${mv.key}`,
    label: mv.label && mv.label.trim() !== "" ? mv.label : mv.key,
    group: "Manual",
  };
}

/**
 * The full set of variables available to a custom rule = the built-in catalog
 * plus any admin-defined manual inputs on that rule.
 */
export function variablesForRule(
  manualVars: ManualVariable[] | undefined,
): FormulaVariable[] {
  const manuals = (manualVars ?? [])
    .filter((m) => m && typeof m.key === "string" && m.key.trim() !== "")
    .map(manualVariable);
  return [...FORMULA_VARIABLES, ...manuals];
}
