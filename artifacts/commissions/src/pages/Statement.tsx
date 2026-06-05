import React, { useMemo, useState } from "react";
import {
  useGetStatementForSelf,
  useGetStatementForPerson,
  getGetStatementForSelfQueryKey,
  getGetStatementForPersonQueryKey,
  type PeriodType,
  type Statement as StatementData,
  type StatementItem,
} from "@workspace/api-client-react";
import { PeriodPicker } from "@/components/reports/PeriodPicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { currentPeriodKey, formatPeriodKey } from "@/lib/periods";
import { FormulaBreakdown } from "@/components/statement/FormulaBreakdown";
import { DealPanel } from "@/components/statement/DealPanel";

type Mode = "self" | "admin";

type Props = {
  tenantId: string;
  mode: Mode;
  personId?: string;
};

const STATE_VARIANT: Record<
  StatementItem["state"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  accrued: "secondary",
  payable: "default",
  paid: "default",
  clawed_back: "destructive",
  voided: "outline",
  disputed: "outline",
};

function StatementItemCard({ item }: { item: StatementItem }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono">
                {item.type}
              </Badge>
              {item.ruleDescription && (
                <span className="text-sm font-medium text-muted-foreground">
                  {item.ruleDescription}
                </span>
              )}
            </div>
            {item.source.label && (
              <div className="text-xs text-muted-foreground">
                {item.source.label}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">{formatCurrency(item.amount)}</div>
            <Badge variant={STATE_VARIANT[item.state]} className="mt-1">
              {item.state}
            </Badge>
          </div>
        </div>

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start gap-2 px-2 text-xs text-muted-foreground"
            >
              {open ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              {open ? "Hide" : "Show"} calculation
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            <FormulaBreakdown formula={item.formula} />
            {item.deal && <DealPanel deal={item.deal} />}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ statement }: { statement: StatementData }) {
  const { summary, period } = statement;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {formatPeriodKey(period.type, period.key)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-sm text-muted-foreground">Total earned</div>
          <div className="text-3xl font-bold">
            {formatCurrency(summary.totalEarned)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {summary.entryCount} commission item
            {summary.entryCount === 1 ? "" : "s"} across {summary.dealCount} deal
            {summary.dealCount === 1 ? "" : "s"}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border bg-card p-3">
            <div className="text-xs text-muted-foreground">Accrued</div>
            <div className="mt-1 font-semibold">
              {formatCurrency(summary.byState.accrued)}
            </div>
          </div>
          <div className="rounded-md border bg-card p-3">
            <div className="text-xs text-muted-foreground">Payable</div>
            <div className="mt-1 font-semibold">
              {formatCurrency(summary.byState.payable)}
            </div>
          </div>
          <div className="rounded-md border bg-card p-3">
            <div className="text-xs text-muted-foreground">Paid</div>
            <div className="mt-1 font-semibold">
              {formatCurrency(summary.byState.paid)}
            </div>
          </div>
          <div className="rounded-md border bg-card p-3">
            <div className="text-xs text-muted-foreground">Clawed back</div>
            <div className="mt-1 font-semibold">
              {formatCurrency(summary.byState.clawedBack)}
            </div>
          </div>
        </div>

        {summary.byType.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              By type
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {summary.byType.map((row) => (
                <div
                  key={row.type}
                  className="rounded-md border bg-muted/30 px-3 py-1.5 text-xs"
                >
                  <span className="font-mono font-semibold">{row.type}</span>:{" "}
                  {formatCurrency(row.total)}{" "}
                  <span className="text-muted-foreground">
                    ({row.count} item{row.count === 1 ? "" : "s"})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Statement({ tenantId, mode, personId }: Props) {
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [periodKey, setPeriodKey] = useState<string>(() =>
    currentPeriodKey("monthly"),
  );

  const selfQuery = useGetStatementForSelf(
    tenantId,
    { periodType, periodKey },
    {
      query: {
        enabled: mode === "self" && !!tenantId,
        queryKey: getGetStatementForSelfQueryKey(tenantId, {
          periodType,
          periodKey,
        }),
      },
    },
  );

  const personQuery = useGetStatementForPerson(
    tenantId,
    personId ?? "",
    { periodType, periodKey },
    {
      query: {
        enabled: mode === "admin" && !!tenantId && !!personId,
        queryKey: getGetStatementForPersonQueryKey(tenantId, personId ?? "", {
          periodType,
          periodKey,
        }),
      },
    },
  );

  const { data: statement, isLoading, isError } =
    mode === "self" ? selfQuery : personQuery;

  const items = useMemo(() => statement?.items ?? [], [statement]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            {statement?.personName ? `${statement.personName}'s Statement` : "Statement"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Per-period breakdown of every commission item.
          </p>
        </div>
        <PeriodPicker
          periodType={periodType}
          periodKey={periodKey}
          onChangeType={(next) => {
            setPeriodType(next);
            setPeriodKey(currentPeriodKey(next));
          }}
          onChangeKey={setPeriodKey}
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : isError || !statement ? (
        <Card>
          <CardContent className="p-8 text-sm text-muted-foreground">
            Failed to load your statement.
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <>
          <SummaryCard statement={statement} />
          <Card className="border-dashed">
            <CardContent className="flex items-start gap-3 p-5">
              <Wallet className="mt-0.5 size-5 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  No commission activity in this period.
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try switching to a different period above.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <SummaryCard statement={statement} />
          <div className="space-y-3">
            {items.map((item) => (
              <StatementItemCard key={item.entryId} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
