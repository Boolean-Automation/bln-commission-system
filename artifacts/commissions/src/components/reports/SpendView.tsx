import React, { useState } from "react";
import {
  useGetSpend,
  type SpendGroupBy,
  type PeriodType,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import {
  PERIOD_TYPE_OPTIONS,
  formatPeriodKey,
} from "@/lib/periods";

type Props = { tenantId: string };

const GROUPBY_OPTIONS: { value: SpendGroupBy; label: string }[] = [
  { value: "period", label: "By Period" },
  { value: "team", label: "By Team" },
  { value: "person", label: "By Person" },
];

export function SpendView({ tenantId }: Props) {
  const [groupBy, setGroupBy] = useState<SpendGroupBy>("period");
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");

  const { data, isLoading } = useGetSpend(tenantId, {
    groupBy,
    periodType,
  });

  const rows = data ?? [];
  const chartData =
    groupBy === "period"
      ? rows.map((r) => ({
          ...r,
          label: formatPeriodKey(periodType, r.bucket),
        }))
      : rows.map((r) => ({ ...r, label: r.bucket }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Commission Spend</h2>
          <p className="text-sm text-muted-foreground">
            Commission liability over time, dated by paid → payable → accrued.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={groupBy}
            onValueChange={(v) => setGroupBy(v as SpendGroupBy)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUPBY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {groupBy === "period" && (
            <Select
              value={periodType}
              onValueChange={(v) => setPeriodType(v as PeriodType)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="h-72">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No commission entries to plot.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip
                  formatter={(v) =>
                    typeof v === "number" ? formatCurrency(v) : v
                  }
                />
                <Area
                  type="monotone"
                  dataKey="accruedAmount"
                  stackId="1"
                  stroke="hsl(var(--chart-1))"
                  fill="hsl(var(--chart-1))"
                  name="Accrued"
                />
                <Area
                  type="monotone"
                  dataKey="payableAmount"
                  stackId="1"
                  stroke="hsl(var(--chart-2))"
                  fill="hsl(var(--chart-2))"
                  name="Payable"
                />
                <Area
                  type="monotone"
                  dataKey="paidAmount"
                  stackId="1"
                  stroke="hsl(var(--chart-3))"
                  fill="hsl(var(--chart-3))"
                  name="Paid"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Bucket</TableHead>
              <TableHead className="text-right">Accrued</TableHead>
              <TableHead className="text-right">Payable</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Clawed Back</TableHead>
              <TableHead className="text-right">Total Liability</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No data.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.bucket}>
                  <TableCell className="font-medium">
                    {groupBy === "period"
                      ? formatPeriodKey(periodType, r.bucket)
                      : r.bucket}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(r.accruedAmount)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(r.payableAmount)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(r.paidAmount)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(r.clawedBackAmount)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(r.totalLiability)}
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
