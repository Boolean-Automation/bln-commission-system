import React from "react";
import { useTenant } from "@/contexts/TenantContext";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { LeaderboardView } from "@/components/reports/LeaderboardView";
import { BreakdownView } from "@/components/reports/BreakdownView";
import { SpendView } from "@/components/reports/SpendView";
import { CustomReportBuilder } from "@/components/reports/CustomReportBuilder";

export function Reports() {
  const { activeTenantId } = useTenant();

  if (!activeTenantId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">
          No tenant selected or available.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Performance, breakdowns, spend, and ad-hoc reporting.
        </p>
      </div>

      <Tabs defaultValue="leaderboard">
        <TabsList>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          <TabsTrigger value="spend">Spend</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>
        <TabsContent value="leaderboard" className="mt-4">
          <LeaderboardView tenantId={activeTenantId} />
        </TabsContent>
        <TabsContent value="breakdown" className="mt-4">
          <BreakdownView tenantId={activeTenantId} />
        </TabsContent>
        <TabsContent value="spend" className="mt-4">
          <SpendView tenantId={activeTenantId} />
        </TabsContent>
        <TabsContent value="custom" className="mt-4">
          <CustomReportBuilder tenantId={activeTenantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
