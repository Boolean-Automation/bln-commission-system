import React from "react";
import { useTenant } from "@/contexts/TenantContext";
import { PlanBuilder } from "@/components/plan/PlanBuilder";
import { Card, CardContent } from "@/components/ui/card";

export function Plan() {
  const { activeTenantId } = useTenant();

  if (!activeTenantId) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-8 w-1/2 bg-muted animate-pulse mb-4" />
          <div className="h-32 bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return <PlanBuilder tenantId={activeTenantId} />;
}
