import React from "react";
import { AlertTriangle } from "lucide-react";
import type { FormulaBreakdown as FormulaBreakdownData } from "@workspace/api-client-react";

type Props = { formula: FormulaBreakdownData };

export function FormulaBreakdown({ formula }: Props) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/40 px-3 py-2">
        <code className="text-sm font-mono">{formula.expression}</code>
      </div>

      {formula.inputs.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {formula.inputs.map((input) => (
            <div
              key={input.label}
              className="flex items-baseline justify-between gap-3 border-b border-dashed pb-1 last:border-0"
            >
              <dt className="text-xs font-medium text-muted-foreground">
                {input.label}
              </dt>
              <dd className="text-sm font-medium">{input.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {formula.gated && (
        <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{formula.gateReason ?? "Gated"}</span>
        </div>
      )}
    </div>
  );
}
