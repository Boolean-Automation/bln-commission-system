import React, { useMemo, useState } from "react";
import {
  useGetLeaderboard,
  type LeaderboardRow,
  type PeriodType,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { currentPeriodKey } from "@/lib/periods";
import { PeriodPicker } from "./PeriodPicker";

type Props = { tenantId: string };

const STATE_BADGE: Record<
  LeaderboardRow["state"],
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  over: { label: "Over", variant: "default" },
  on_track: { label: "On Track", variant: "secondary" },
  under: { label: "Under", variant: "destructive" },
  no_quota: { label: "No Quota", variant: "outline" },
};

export function LeaderboardView({ tenantId }: Props) {
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [periodKey, setPeriodKey] = useState<string>(() =>
    currentPeriodKey("monthly"),
  );

  const { data, isLoading } = useGetLeaderboard(tenantId, {
    periodType,
    periodKey,
  });

  const { ranked, unranked } = useMemo(() => {
    const rows = data ?? [];
    return {
      ranked: rows.filter((r) => r.state !== "no_quota"),
      unranked: rows.filter((r) => r.state === "no_quota"),
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Leaderboard</h2>
          <p className="text-sm text-muted-foreground">
            Reps ranked by attainment vs quota for the chosen period.
            Attainment uses each entry's accrual date.
          </p>
        </div>
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

      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="text-right">Quota</TableHead>
              <TableHead className="text-right">Earned</TableHead>
              <TableHead className="text-right">Attainment</TableHead>
              <TableHead className="text-right">Δ to Quota</TableHead>
              <TableHead>State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : ranked.length + unranked.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="h-32 text-center text-muted-foreground"
                >
                  No active people in this tenant.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {ranked.map((r) => (
                  <LeaderboardRowView key={r.personId} row={r} />
                ))}
                {unranked.length > 0 && (
                  <>
                    <TableRow className="bg-muted/40">
                      <TableCell
                        colSpan={10}
                        className="py-2 text-xs font-medium text-muted-foreground"
                      >
                        Reps without a quota for this period
                      </TableCell>
                    </TableRow>
                    {unranked.map((r) => (
                      <LeaderboardRowView key={r.personId} row={r} />
                    ))}
                  </>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function LeaderboardRowView({ row }: { row: LeaderboardRow }) {
  const badge = STATE_BADGE[row.state];
  return (
    <TableRow>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {row.rank ?? "—"}
      </TableCell>
      <TableCell className="font-medium">{row.personName}</TableCell>
      <TableCell className="text-muted-foreground">
        {row.position ?? "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {row.region ?? "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">{row.team ?? "—"}</TableCell>
      <TableCell className="text-right font-mono">
        {row.quota != null ? formatCurrency(row.quota) : "—"}
      </TableCell>
      <TableCell className="text-right font-mono">
        {formatCurrency(row.earnedInPeriod)}
      </TableCell>
      <TableCell className="text-right font-mono">
        {row.attainmentPct != null ? `${row.attainmentPct.toFixed(1)}%` : "—"}
      </TableCell>
      <TableCell className="text-right font-mono">
        {row.deltaToQuota != null ? formatCurrency(row.deltaToQuota) : "—"}
      </TableCell>
      <TableCell>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </TableCell>
    </TableRow>
  );
}
