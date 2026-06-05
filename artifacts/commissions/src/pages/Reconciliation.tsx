import React, { useMemo, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import {
  useGetReconciliation,
  getGetReconciliationQueryKey,
  type ReconciliationLine,
  type ReconciliationReport,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
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
import {
  CheckCircle2,
  AlertTriangle,
  MinusCircle,
  Scale,
} from "lucide-react";

type MetricKey = "netOwed" | "totalEarned" | "paid" | "adjustments";

const METRICS: { key: MetricKey; label: string }[] = [
  { key: "netOwed", label: "Net Owed" },
  { key: "totalEarned", label: "Total Earned" },
  { key: "paid", label: "Paid" },
  { key: "adjustments", label: "Adjustments" },
];

function StatusBadge({ status }: { status: ReconciliationLine["status"] }) {
  if (status === "match") {
    return (
      <Badge
        variant="outline"
        className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"
      >
        <CheckCircle2 className="w-3 h-3" />
        Match
      </Badge>
    );
  }
  if (status === "mismatch") {
    return (
      <Badge
        variant="outline"
        className="bg-red-50 text-red-700 border-red-200 gap-1"
      >
        <AlertTriangle className="w-3 h-3" />
        Mismatch
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="bg-muted text-muted-foreground border-border gap-1"
    >
      <MinusCircle className="w-3 h-3" />
      No benchmark
    </Badge>
  );
}

/** A computed / benchmark / delta cell trio for a single metric. */
function MetricCell({
  computed,
  benchmark,
  delta,
  match,
}: {
  computed: number;
  benchmark: number | null;
  delta: number | null;
  match: boolean | null;
}) {
  return (
    <TableCell className="text-right font-mono text-xs whitespace-nowrap">
      <div className="text-foreground">{formatCurrency(computed)}</div>
      <div className="text-muted-foreground">
        {benchmark === null ? "—" : formatCurrency(benchmark)}
      </div>
      {delta !== null && Math.abs(delta) > 0 ? (
        <div
          className={
            match === false
              ? "text-red-600 font-medium"
              : "text-muted-foreground/70"
          }
        >
          {delta > 0 ? "+" : ""}
          {formatCurrency(delta)}
        </div>
      ) : (
        <div className="text-muted-foreground/40">—</div>
      )}
    </TableCell>
  );
}

function RollupCard({ report }: { report: ReconciliationReport }) {
  const { rollup } = report;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="p-4">
        <div className="text-xs text-muted-foreground">People</div>
        <div className="text-2xl font-bold mt-1">{rollup.peopleCount}</div>
        <div className="flex gap-2 mt-2 text-xs">
          <span className="text-emerald-600">{rollup.matchCount} match</span>
          <span className="text-red-600">{rollup.mismatchCount} differ</span>
          <span className="text-muted-foreground">
            {rollup.noBenchmarkCount} no benchmark
          </span>
        </div>
      </Card>
      {METRICS.map((m) => {
        const ours = rollup.computed[m.key];
        const bench = rollup.benchmark[m.key];
        const delta = Math.round((ours - bench) * 100) / 100;
        return (
          <Card key={m.key} className="p-4">
            <div className="text-xs text-muted-foreground">{m.label}</div>
            <div className="text-lg font-bold font-mono mt-1">
              {formatCurrency(ours)}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              benchmark {formatCurrency(bench)}
            </div>
            <div
              className={
                "text-xs font-mono mt-1 " +
                (Math.abs(delta) > report.tolerance
                  ? "text-red-600"
                  : "text-muted-foreground/60")
              }
            >
              Δ {delta > 0 ? "+" : ""}
              {formatCurrency(delta)}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export function Reconciliation() {
  const { activeTenantId } = useTenant();
  const [mismatchOnly, setMismatchOnly] = useState(false);

  const { data: report, isLoading } = useGetReconciliation(activeTenantId!, {
    query: {
      enabled: !!activeTenantId,
      queryKey: activeTenantId
        ? getGetReconciliationQueryKey(activeTenantId)
        : ["reconciliation", "empty"],
    },
  });

  const lines = useMemo(() => {
    const all = report?.lines ?? [];
    return mismatchOnly ? all.filter((l) => l.status === "mismatch") : all;
  }, [report, mismatchOnly]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Scale className="w-6 h-6 text-primary" />
            Reconciliation
          </h1>
          <p className="text-muted-foreground text-sm">
            Our computed totals vs. the data-source benchmark. Benchmark figures
            are reference-only and never affect the ledger, dashboard, or
            payroll.
          </p>
        </div>
        <Button
          variant={mismatchOnly ? "default" : "outline"}
          onClick={() => setMismatchOnly((v) => !v)}
          disabled={!report}
        >
          <AlertTriangle className="mr-2 h-4 w-4" />
          {mismatchOnly ? "Showing mismatches" : "Show mismatches only"}
        </Button>
      </div>

      {report && <RollupCard report={report} />}

      <Card className="flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead>Earner</TableHead>
                <TableHead>Status</TableHead>
                {METRICS.map((m) => (
                  <TableHead key={m.key} className="text-right">
                    {m.label}
                    <div className="text-[10px] font-normal text-muted-foreground/70 normal-case">
                      ours / benchmark / Δ
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <div className="h-8 bg-muted animate-pulse rounded" />
                    </TableCell>
                  </TableRow>
                ))
              ) : lines.length > 0 ? (
                lines.map((line) => (
                  <TableRow key={line.personId}>
                    <TableCell className="font-medium">
                      <div>{line.personName}</div>
                      <div className="flex gap-1.5 mt-0.5">
                        {!line.inPeople && (
                          <span className="text-[10px] text-amber-600">
                            not in people list
                          </span>
                        )}
                        {!line.hasEntries && (
                          <span className="text-[10px] text-amber-600">
                            no ledger entries
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={line.status} />
                    </TableCell>
                    {METRICS.map((m) => (
                      <MetricCell
                        key={m.key}
                        computed={line.computed[m.key]}
                        benchmark={line.benchmark[m.key]}
                        delta={line.delta[m.key]}
                        match={line.match[m.key]}
                      />
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {mismatchOnly
                      ? "No mismatches — every benchmarked person matches."
                      : "No reconciliation data. Map the benchmark fields and sync to compare."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
