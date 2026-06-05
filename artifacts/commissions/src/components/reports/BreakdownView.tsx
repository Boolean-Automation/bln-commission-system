import React, { useState } from "react";
import {
  useGetBreakdown,
  type BreakdownDimension,
  type PeriodType,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { currentPeriodKey } from "@/lib/periods";
import { PeriodPicker } from "./PeriodPicker";

type Props = { tenantId: string };

const DIMENSION_OPTIONS: { value: BreakdownDimension; label: string }[] = [
  { value: "region", label: "Region" },
  { value: "cohort", label: "Cohort" },
  { value: "team", label: "Team" },
  { value: "position", label: "Position" },
];

export function BreakdownView({ tenantId }: Props) {
  const [dimension, setDimension] = useState<BreakdownDimension>("region");
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [periodKey, setPeriodKey] = useState<string>(() =>
    currentPeriodKey("monthly"),
  );

  const { data, isLoading } = useGetBreakdown(tenantId, {
    dimension,
    periodType,
    periodKey,
  });

  const rows = data ?? [];
  const allUnassigned =
    rows.length > 0 && rows.every((r) => r.bucket === "Unassigned");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Breakdown</h2>
          <p className="text-sm text-muted-foreground">
            Aggregated attainment and earnings grouped by a people attribute.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={dimension}
            onValueChange={(v) => setDimension(v as BreakdownDimension)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIMENSION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      {allUnassigned && (
        <Card>
          <CardContent className="flex items-start gap-3 py-4">
            <Info className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                No {dimension} data for this tenant
              </p>
              <p className="text-sm text-muted-foreground">
                Every person collapses into "Unassigned". Map the {dimension}{" "}
                field on People in Schema Mapping to break this out.
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/mapping">Open Mapping</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="p-4">
        <div className="h-72">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No data for this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" />
                <YAxis />
                <Tooltip
                  formatter={(v) =>
                    typeof v === "number" ? formatCurrency(v) : v
                  }
                />
                <Bar dataKey="earnedTotal" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Bucket</TableHead>
              <TableHead className="text-right">People</TableHead>
              <TableHead className="text-right">Quota Total</TableHead>
              <TableHead className="text-right">Earned Total</TableHead>
              <TableHead className="text-right">Attainment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  No data.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.bucket}>
                  <TableCell className="font-medium">{r.bucket}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.personCount}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(r.quotaTotal)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(r.earnedTotal)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.attainmentPct != null
                      ? `${r.attainmentPct.toFixed(1)}%`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
