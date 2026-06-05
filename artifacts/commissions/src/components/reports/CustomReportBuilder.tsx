import React, { useState } from "react";
import {
  useRunCustomReport,
  type CustomReportResult,
  type PeriodType,
  type ReportDimension,
  type ReportMetric,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Loader2, Play, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { currentPeriodKey } from "@/lib/periods";
import { PeriodPicker } from "./PeriodPicker";

type Props = { tenantId: string };

const ALL_DIMENSIONS: { value: ReportDimension; label: string }[] = [
  { value: "person", label: "Person" },
  { value: "region", label: "Region" },
  { value: "cohort", label: "Cohort" },
  { value: "team", label: "Team" },
  { value: "position", label: "Position" },
  { value: "period", label: "Period" },
  { value: "entryType", label: "Entry Type" },
  { value: "state", label: "State" },
];

const ALL_METRICS: { value: ReportMetric; label: string; isCurrency: boolean }[] = [
  { value: "commissionTotal", label: "Commission Total", isCurrency: true },
  { value: "entryCount", label: "Entry Count", isCurrency: false },
  { value: "quotaAttainmentPct", label: "Attainment %", isCurrency: false },
  { value: "paidAmount", label: "Paid", isCurrency: true },
  { value: "accruedAmount", label: "Accrued", isCurrency: true },
  { value: "payableAmount", label: "Payable", isCurrency: true },
  { value: "clawedBackAmount", label: "Clawed Back", isCurrency: true },
  { value: "spendAmount", label: "Spend", isCurrency: true },
];

export function CustomReportBuilder({ tenantId }: Props) {
  const [dimensions, setDimensions] = useState<ReportDimension[]>(["position"]);
  const [metrics, setMetrics] = useState<ReportMetric[]>(["commissionTotal"]);
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [periodKey, setPeriodKey] = useState<string>(() =>
    currentPeriodKey("monthly"),
  );
  const [result, setResult] = useState<CustomReportResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useRunCustomReport({
    mutation: {
      onSuccess: (data) => {
        setResult(data);
        setServerError(null);
      },
      onError: (err) => {
        setServerError(err.message || "Report failed");
        setResult(null);
      },
    },
  });

  const needsPeriod =
    metrics.includes("quotaAttainmentPct") || dimensions.includes("period");

  const toggle = <T,>(arr: T[], v: T) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const handleRun = () => {
    mutation.mutate({
      tenantId,
      data: {
        dimensions,
        metrics,
        periodType: needsPeriod ? periodType : undefined,
        periodKey: needsPeriod ? periodKey : null,
      },
    });
  };

  const isCurrencyMetric = (key: string) =>
    ALL_METRICS.find((m) => m.value === key)?.isCurrency ?? false;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Custom Report</h2>
        <p className="text-sm text-muted-foreground">
          Pick dimensions and metrics; results render below. Capped at 5,000
          rows.
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div>
          <Label className="text-sm font-medium">Dimensions</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {ALL_DIMENSIONS.map((d) => (
              <Badge
                key={d.value}
                variant={dimensions.includes(d.value) ? "default" : "outline"}
                onClick={() => setDimensions((p) => toggle(p, d.value))}
                className="cursor-pointer select-none"
              >
                {d.label}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium">Metrics</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {ALL_METRICS.map((m) => {
              const disabled =
                m.value === "quotaAttainmentPct" &&
                !dimensions.includes("person");
              return (
                <Badge
                  key={m.value}
                  variant={metrics.includes(m.value) ? "default" : "outline"}
                  onClick={() =>
                    !disabled && setMetrics((p) => toggle(p, m.value))
                  }
                  className={
                    disabled
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer select-none"
                  }
                  title={
                    disabled
                      ? "Attainment % requires 'person' in the dimensions"
                      : undefined
                  }
                >
                  {m.label}
                </Badge>
              );
            })}
          </div>
        </div>

        {needsPeriod && (
          <div>
            <Label className="text-sm font-medium">Period</Label>
            <div className="mt-2">
              <PeriodPicker
                periodType={periodType}
                periodKey={periodKey}
                onChangeType={(t) => {
                  setPeriodType(t);
                  setPeriodKey(currentPeriodKey(t));
                }}
                onChangeKey={setPeriodKey}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={handleRun}
            disabled={
              dimensions.length === 0 ||
              metrics.length === 0 ||
              mutation.isPending
            }
          >
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Run report
          </Button>
          {serverError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {serverError}
            </div>
          )}
          {result && (
            <span className="text-sm text-muted-foreground">
              {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
              {result.truncated && " (truncated at 5,000)"}
            </span>
          )}
        </div>
      </Card>

      {result && result.rows.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                {result.columns.map((c) => (
                  <TableHead
                    key={c.key}
                    className={c.kind === "metric" ? "text-right" : ""}
                  >
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row, i) => (
                <TableRow key={i}>
                  {result.columns.map((c) => {
                    const v = (row as Record<string, unknown>)[c.key];
                    if (v == null) {
                      return (
                        <TableCell
                          key={c.key}
                          className={
                            c.kind === "metric"
                              ? "text-right text-muted-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          —
                        </TableCell>
                      );
                    }
                    if (c.kind === "metric") {
                      const num = Number(v);
                      const display = isCurrencyMetric(c.key)
                        ? formatCurrency(num)
                        : c.key === "quotaAttainmentPct"
                          ? `${num.toFixed(1)}%`
                          : num.toLocaleString();
                      return (
                        <TableCell
                          key={c.key}
                          className="text-right font-mono"
                        >
                          {display}
                        </TableCell>
                      );
                    }
                    return <TableCell key={c.key}>{String(v)}</TableCell>;
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
