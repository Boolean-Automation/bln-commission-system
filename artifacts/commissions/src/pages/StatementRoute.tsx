import React from "react";
import { useParams } from "wouter";
import { useTenant } from "@/contexts/TenantContext";
import { Statement } from "@/pages/Statement";
import { Card, CardContent } from "@/components/ui/card";

export function StatementRoute() {
  const { personId } = useParams<{ personId: string }>();
  const { activeTenantId } = useTenant();

  if (!activeTenantId) {
    return (
      <Card>
        <CardContent className="p-8 text-sm text-muted-foreground">
          Select a tenant to view this statement.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Statement tenantId={activeTenantId} mode="admin" personId={personId} />
    </div>
  );
}
