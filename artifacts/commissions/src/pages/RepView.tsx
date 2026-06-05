import React, { useState } from "react";
import {
  getGetRepDashboardMeQueryKey,
  useGetRepDashboardMe,
  type PeriodType,
  type RepDashboardSummary,
} from "@workspace/api-client-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PeriodPicker } from "@/components/reports/PeriodPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent } from "@/lib/format";
import { currentPeriodKey, formatPeriodKey } from "@/lib/periods";
import { repKpiCatalog } from "@/lib/repKpiCatalog";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  LogOut,
  Trophy,
  Wallet,
} from "lucide-react";
import logoUrl from "@assets/channels4_profile_1780667990826.jpg";

function KpiCard({
  summary,
  keyName,
}: {
  summary: RepDashboardSummary;
  keyName: keyof typeof repKpiCatalog;
}) {
  const item = repKpiCatalog[keyName];
  const Icon = item.Icon;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {item.label}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">
          {item.value(summary)}
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-52 w-full lg:col-span-2" />
        <Skeleton className="h-52 w-full" />
      </div>
    </div>
  );
}

function EmptyNotice({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex items-start gap-3 p-5">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div>
          <div className="font-medium">{title}</div>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function RepView() {
  const { displayName, accessibleTenants, logout } = useAuthContext();
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [periodKey, setPeriodKey] = useState<string>(() =>
    currentPeriodKey("monthly"),
  );

  const tenant = accessibleTenants[0] ?? null;
  const tenantId = tenant?.id ?? "";
  const params = { periodType, periodKey };

  const {
    data: summary,
    isLoading,
    isError,
  } = useGetRepDashboardMe(tenantId, params, {
    query: {
      enabled: !!tenantId,
      queryKey: tenantId
        ? getGetRepDashboardMeQueryKey(tenantId, params)
        : ["rep-dashboard", "empty"],
    },
  });

  const kpiKeys =
    summary?.enabledKpis.filter((key) => key in repKpiCatalog) ?? [];
  const attainment = summary?.attainmentPct ?? null;
  const progressValue = Math.min(Math.max(attainment ?? 0, 0), 100);
  const pace = summary?.projection.paceVsQuota ?? null;

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="border-b bg-card px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <img
              src={logoUrl}
              alt="Boolean Automation"
              className="size-8 rounded-sm object-cover"
            />
            <div>
              <div className="text-sm font-medium">My Commissions</div>
              <div className="text-xs text-muted-foreground">
                {tenant?.name ?? "No company"}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
            <PeriodPicker
              periodType={periodType}
              periodKey={periodKey}
              onChangeType={(next) => {
                setPeriodType(next);
                setPeriodKey(currentPeriodKey(next));
              }}
              onChangeKey={setPeriodKey}
            />
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-muted-foreground md:inline">
                {displayName}
              </span>
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={logout}>
                <LogOut className="size-4" />
                <span className="sr-only">Sign out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight">
              Hi, {displayName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatPeriodKey(periodType, periodKey)}
            </p>
          </div>

          {!tenantId ? (
            <EmptyNotice
              icon={<AlertCircle className="size-5" />}
              title="No company access"
              body="Your account is not linked to a sales rep record yet."
            />
          ) : isLoading ? (
            <LoadingDashboard />
          ) : isError || !summary ? (
            <Card>
              <CardContent className="p-8 text-sm text-muted-foreground">
                Failed to load your commission dashboard.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {kpiKeys.map((key) => (
                  <KpiCard key={key} summary={summary} keyName={key} />
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Trophy className="size-4 text-muted-foreground" />
                      Attainment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {summary.quota == null ? (
                      <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
                        Your quota for this period isn't set yet. Ask your admin
                        to set it in Manual Inputs.
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-end justify-between gap-3">
                          <div>
                            <div className="text-3xl font-bold">
                              {formatPercent(attainment)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {formatCurrency(summary.earnedInPeriod)} earned
                              against {formatCurrency(summary.quota)}
                            </div>
                          </div>
                          {attainment != null && attainment > 100 && (
                            <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                              Over quota
                            </div>
                          )}
                        </div>
                        <Progress value={progressValue} />
                      </>
                    )}
                  </CardContent>
                </Card>

                {summary.rank != null && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Trophy className="size-4 text-muted-foreground" />
                        Ranking
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">
                        #{summary.rank}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        of {summary.peerCount} active reps
                      </p>
                    </CardContent>
                  </Card>
                )}

                <Card className={summary.rank == null ? "" : "lg:col-span-2"}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CalendarDays className="size-4 text-muted-foreground" />
                      Forecast
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <div className="text-sm text-muted-foreground">
                        Projected
                      </div>
                      <div className="mt-1 text-xl font-bold">
                        {formatCurrency(summary.projection.projectedEarning)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        Pace vs quota
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xl font-bold">
                        {pace != null && pace >= 0 ? (
                          <ArrowUp className="size-4 text-emerald-600" />
                        ) : pace != null ? (
                          <ArrowDown className="size-4 text-destructive" />
                        ) : null}
                        {pace != null ? formatCurrency(pace) : "-"}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        Days remaining
                      </div>
                      <div className="mt-1 text-xl font-bold">
                        {summary.projection.daysRemaining}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {summary.earnedInPeriod === 0 &&
                summary.commissionByState.accrued === 0 && (
                  <EmptyNotice
                    icon={<Wallet className="size-5" />}
                    title="No commission activity in this period yet"
                    body="New activity will appear here once commissions are accrued."
                  />
                )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
