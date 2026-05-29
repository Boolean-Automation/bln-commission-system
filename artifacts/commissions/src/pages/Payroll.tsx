import React, { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { 
  useGetPayrollSummary, 
  getGetPayrollSummaryQueryKey,
  useRecomputeCommissions,
  getGetDashboardQueryKey,
  getListCommissionsQueryKey,
  getGetActivityQueryKey
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Calculator, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export function Payroll() {
  const { activeTenantId } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: payroll = [], isLoading } = useGetPayrollSummary(activeTenantId!, {
    query: {
      enabled: !!activeTenantId,
      queryKey: activeTenantId ? getGetPayrollSummaryQueryKey(activeTenantId) : ["payroll", "empty"]
    }
  });

  const recompute = useRecomputeCommissions();

  const handleRecompute = () => {
    if (!activeTenantId) return;
    recompute.mutate(
      { tenantId: activeTenantId },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getGetPayrollSummaryQueryKey(activeTenantId) });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey(activeTenantId) });
          queryClient.invalidateQueries({ queryKey: getListCommissionsQueryKey(activeTenantId) });
          queryClient.invalidateQueries({ queryKey: getGetActivityQueryKey(activeTenantId) });
          
          toast({
            title: "Recompute Complete",
            description: `${result.entriesCreated} created, ${result.entriesUpdated} updated, ${result.adjustmentsCreated} adjustments.`,
          });
        },
        onError: (err: any) => {
          toast({
            title: "Recompute Failed",
            description: err.message || "An error occurred.",
            variant: "destructive",
          });
        }
      }
    );
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payroll Preparation</h1>
          <p className="text-muted-foreground text-sm">Totals grouped per person for payout.</p>
        </div>
        <Button 
          onClick={handleRecompute} 
          disabled={recompute.isPending || !activeTenantId}
          className="bg-primary text-primary-foreground"
        >
          {recompute.isPending ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Calculator className="mr-2 h-4 w-4" />
          )}
          Recompute Commissions
        </Button>
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead>Earner</TableHead>
                <TableHead>Position</TableHead>
                <TableHead className="text-right">Entries</TableHead>
                <TableHead className="text-right">Accrued</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Payable (Ready)</TableHead>
                <TableHead className="text-right font-bold text-primary">Net Owed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-8 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                    <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                    <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                    <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                    <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : payroll.length > 0 ? (
                payroll.map((line) => (
                  <TableRow key={line.personId}>
                    <TableCell className="font-medium">{line.personName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{line.position || "-"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{line.entryCount}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(line.accruedTotal)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(line.paidTotal)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(line.payableTotal)}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-primary">{formatCurrency(line.netOwed)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No payroll data available.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
