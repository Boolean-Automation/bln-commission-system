import React, { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useGetDashboard, useGetActivity, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRightLeft, DollarSign, Wallet, FileText, Activity, AlertCircle, Database, ListChecks, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { getSetupStep, hasNoSyncedData, setupStepLabel } from "@/lib/setupStatus";

export function Dashboard() {
  const { activeTenantId, activeTenant } = useTenant();
  const [wizardOpen, setWizardOpen] = useState(false);
  
  const { data: dashboard, isLoading: isLoadingDashboard } = useGetDashboard(activeTenantId!, {
    query: {
      enabled: !!activeTenantId,
      queryKey: activeTenantId ? getGetDashboardQueryKey(activeTenantId) : ["dashboard", "empty"]
    }
  });

  const { data: activities, isLoading: isLoadingActivity } = useGetActivity(activeTenantId!, { limit: 10 }, {
    query: {
      enabled: !!activeTenantId,
      queryKey: activeTenantId ? ["activity", activeTenantId] : ["activity", "empty"]
    }
  });

  if (!activeTenantId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>No tenant selected or available.</p>
        </div>
      </div>
    );
  }

  if (isLoadingDashboard) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-96 w-full lg:col-span-2" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="p-8 border rounded bg-card text-card-foreground">
        Failed to load dashboard data.
      </div>
    );
  }

  const setupStep = activeTenant ? getSetupStep(activeTenant) : null;
  const noData = activeTenant ? hasNoSyncedData(activeTenant) : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operator Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Overview for {activeTenant?.name}
        </p>
      </div>

      {(setupStep === "connect" || setupStep === "map") && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-9 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
                {setupStep === "connect" ? (
                  <Database className="size-4" />
                ) : (
                  <ListChecks className="size-4" />
                )}
              </div>
              <div>
                <div className="font-semibold flex items-center gap-2">
                  <AlertCircle className="size-4 text-amber-600" />
                  Setup incomplete
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {setupStep === "connect"
                    ? "This company has no Airtable base connected yet. Connect a base, map your fields, and run an initial sync to start tracking commissions."
                    : "This company's required fields aren't all mapped yet. Finish mapping and run an initial sync to start tracking commissions."}
                </p>
              </div>
            </div>
            <Button
              className="shrink-0"
              onClick={() => setWizardOpen(true)}
            >
              {setupStepLabel(setupStep)}
            </Button>
          </CardContent>
        </Card>
      )}

      {setupStep === "sync" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-9 items-center justify-center rounded-full bg-primary/15 text-primary">
                <RefreshCw className="size-4" />
              </div>
              <div>
                <div className="font-semibold">Ready to sync</div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Setup is complete but no people or jobs have been imported yet.
                  Run your first sync to pull data from Airtable and compute
                  commissions.
                </p>
              </div>
            </div>
            <Button className="shrink-0" onClick={() => setWizardOpen(true)}>
              Run first sync
            </Button>
          </CardContent>
        </Card>
      )}

      {setupStep === null && noData && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Database className="size-8 text-muted-foreground/40" />
            <div className="font-medium">No synced data yet</div>
            <p className="text-sm text-muted-foreground max-w-md">
              This company hasn't imported any people or jobs. Once data is synced
              from Airtable, your summaries and ledger will populate here.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Accrued (Unapproved)</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(dashboard.accruedTotal)}</div>
          </CardContent>
        </Card>
        
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold text-primary">Payable Outstanding</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(dashboard.payableTotal)}</div>
            <p className="text-xs text-primary/70 mt-1">Ready for payroll</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid (YTD)</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(dashboard.paidTotal)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ledger Entries</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.entryCount.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top Earners</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.topEarners && dashboard.topEarners.length > 0 ? (
              <div className="space-y-4">
                {dashboard.topEarners.map((earner, index) => (
                  <div key={earner.personId} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground border">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium">{earner.personName}</div>
                        <div className="text-xs text-muted-foreground">{earner.entryCount} entries</div>
                      </div>
                    </div>
                    <div className="font-mono text-sm">{formatCurrency(earner.amount)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-6 text-muted-foreground text-sm border border-dashed rounded">
                No earner data available.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingActivity ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                ))}
              </div>
            ) : activities && activities.length > 0 ? (
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div key={activity.id} className="text-sm border-l-2 pl-3 py-1 border-muted">
                    <div className="text-foreground">{activity.summary}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDateTime(activity.at)} • {activity.actor}
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="w-full mt-4" asChild>
                  <Link href="/ledger">View Ledger</Link>
                </Button>
              </div>
            ) : (
              <div className="text-center p-6 text-muted-foreground text-sm border border-dashed rounded">
                No recent activity.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <OnboardingWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        resumeTenant={activeTenant}
      />
    </div>
  );
}
