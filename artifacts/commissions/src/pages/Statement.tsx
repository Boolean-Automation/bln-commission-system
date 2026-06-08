import React, { useMemo, useState } from "react";
import {
  useGetStatementForSelf,
  useGetStatementForPerson,
  getGetStatementForSelfQueryKey,
  getGetStatementForPersonQueryKey,
  type PeriodType,
  type Statement as StatementData,
} from "@workspace/api-client-react";
import { PeriodPicker } from "@/components/reports/PeriodPicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquarePlus, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { currentPeriodKey, formatPeriodKey } from "@/lib/periods";
import { useAuthContext } from "@/contexts/AuthContext";
import { SignoffPanel } from "@/components/statement/SignoffPanel";
import { ThreadList } from "@/components/statement/ThreadList";
import { NewThreadDialog } from "@/components/statement/NewThreadDialog";
import { StatementItemCard } from "@/components/statement/StatementItemCard";

type Mode = "self" | "admin";

type Props = {
  tenantId: string;
  mode: Mode;
  personId?: string;
};

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
  const { effectiveRole } = useAuthContext();
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [periodKey, setPeriodKey] = useState<string>(() =>
    currentPeriodKey("monthly"),
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogEntryId, setDialogEntryId] = useState<string | undefined>();
  const [dialogDefaultSubject, setDialogDefaultSubject] = useState<
    string | undefined
  >();

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
  const threads = useMemo(() => statement?.threads ?? [], [statement]);
  const effectivePersonId = statement?.personId ?? personId ?? "";

  const openNewThread = (entryId?: string) => {
    setDialogEntryId(entryId);
    if (entryId) {
      const item = items.find((i) => i.entryId === entryId);
      setDialogDefaultSubject(
        item?.source.label
          ? `Question on ${item.source.label}`
          : "Question on this item",
      );
    } else {
      setDialogDefaultSubject(undefined);
    }
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            {statement?.personName
              ? `${statement.personName}'s Statement`
              : "Statement"}
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
      ) : (
        <>
          {effectivePersonId && (
            <SignoffPanel
              tenantId={tenantId}
              personId={effectivePersonId}
              personName={statement.personName}
              periodType={periodType}
              periodKey={periodKey}
              mode={mode}
              effectiveRole={effectiveRole}
              signoff={statement.signoff}
            />
          )}

          <SummaryCard statement={statement} />

          {items.length === 0 ? (
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
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <StatementItemCard
                  key={item.entryId}
                  item={item}
                  threads={threads}
                  onDiscuss={(entryId) => openNewThread(entryId)}
                />
              ))}
            </div>
          )}

          {(items.length > 0 || mode === "admin" || threads.length > 0) && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold tracking-tight">
                  Discussion
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => openNewThread(undefined)}
                >
                  <MessageSquarePlus className="size-4" />
                  Start a discussion
                </Button>
              </div>
              {effectivePersonId && (
                <ThreadList
                  tenantId={tenantId}
                  personId={effectivePersonId}
                  periodType={periodType}
                  periodKey={periodKey}
                  mode={mode}
                  effectiveRole={effectiveRole}
                />
              )}
            </section>
          )}

          {effectivePersonId && (
            <NewThreadDialog
              tenantId={tenantId}
              personId={effectivePersonId}
              periodType={periodType}
              periodKey={periodKey}
              mode={mode}
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              entryId={dialogEntryId}
              defaultSubject={dialogDefaultSubject}
            />
          )}
        </>
      )}
    </div>
  );
}
