import React, { useState } from "react";
import { useParams } from "wouter";
import { 
  useGetCommission, 
  getGetCommissionQueryKey,
  useGetCommissionEvents,
  getGetCommissionEventsQueryKey,
  useTransitionCommission,
  useAdjustCommission,
  CommissionState,
  getGetDashboardQueryKey,
  getListCommissionsQueryKey,
  getGetPayrollSummaryQueryKey,
  getGetActivityQueryKey
} from "@workspace/api-client-react";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, History, Calculator, Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EntryDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: entry, isLoading: isLoadingEntry } = useGetCommission(id!, {
    query: {
      enabled: !!id,
      queryKey: id ? getGetCommissionQueryKey(id) : ["commission", "empty"]
    }
  });

  const { data: events = [], isLoading: isLoadingEvents } = useGetCommissionEvents(id!, {
    query: {
      enabled: !!id,
      queryKey: id ? getGetCommissionEventsQueryKey(id) : ["commissionEvents", "empty"]
    }
  });

  const transition = useTransitionCommission();
  const adjust = useAdjustCommission();

  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);

  const handleTransition = (toState: CommissionState) => {
    transition.mutate({
      entryId: id!,
      data: { toState }
    }, {
      onSuccess: () => {
        invalidateRelated();
        toast({ title: "Status updated", description: `Commission moved to ${toState}` });
      },
      onError: (err: any) => {
        toast({ title: "Failed to update", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(adjustAmount);
    if (isNaN(amount)) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }

    adjust.mutate({
      entryId: id!,
      data: { amount, notes: adjustNotes }
    }, {
      onSuccess: () => {
        invalidateRelated();
        setIsAdjustOpen(false);
        setAdjustAmount("");
        setAdjustNotes("");
        toast({ title: "Adjustment applied" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to adjust", description: err.message, variant: "destructive" });
      }
    });
  };

  const invalidateRelated = () => {
    if (!id || !entry?.tenantId) return;
    queryClient.invalidateQueries({ queryKey: getGetCommissionQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getGetCommissionEventsQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListCommissionsQueryKey(entry.tenantId) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey(entry.tenantId) });
    queryClient.invalidateQueries({ queryKey: getGetPayrollSummaryQueryKey(entry.tenantId) });
    queryClient.invalidateQueries({ queryKey: getGetActivityQueryKey(entry.tenantId) });
  };

  if (isLoadingEntry) {
    return <div className="p-8"><div className="h-8 w-1/4 bg-muted animate-pulse mb-8" /><div className="h-64 bg-muted animate-pulse" /></div>;
  }

  if (!entry) {
    return <div className="p-8">Entry not found</div>;
  }

  const availableTransitions = () => {
    switch (entry.state) {
      case 'accrued': return ['payable', 'voided'];
      case 'payable': return ['paid', 'disputed', 'accrued'];
      case 'disputed': return ['payable', 'voided'];
      case 'paid': return ['clawed_back'];
      default: return [];
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/ledger"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Commission Details</h1>
            <Badge variant="outline" className="capitalize">{entry.state.replace("_", " ")}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">ID: {entry.id}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Summary</span>
                <span className="font-mono text-2xl text-primary">{formatCurrency(entry.amount)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block mb-1">Earner</span>
                  <span className="font-medium">{entry.personName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">Type</span>
                  <Badge variant="secondary">{entry.type}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">Source</span>
                  <span>{entry.sourceLabel || entry.sourceId || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">Created At</span>
                  <span>{formatDateTime(entry.createdAt)}</span>
                </div>
              </div>

              <div className="pt-4 border-t flex flex-wrap gap-2">
                {availableTransitions().map(state => (
                  <Button 
                    key={state} 
                    variant={state === 'paid' ? 'default' : 'outline'} 
                    size="sm"
                    disabled={transition.isPending}
                    onClick={() => handleTransition(state as CommissionState)}
                    className="capitalize"
                  >
                    Mark as {state.replace("_", " ")}
                  </Button>
                ))}
                
                <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
                  <DialogTrigger asChild>
                    <Button variant="secondary" size="sm">
                      <Settings2 className="w-4 h-4 mr-2" /> Adjust Amount
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adjust Commission Amount</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleAdjust} className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label>New Amount ($)</Label>
                        <Input 
                          type="number" 
                          step="0.01"
                          value={adjustAmount} 
                          onChange={e => setAdjustAmount(e.target.value)} 
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Adjustment Notes</Label>
                        <Input 
                          value={adjustNotes} 
                          onChange={e => setAdjustNotes(e.target.value)} 
                          placeholder="Reason for adjustment..."
                        />
                      </div>
                      <div className="flex justify-end pt-4">
                        <Button type="submit" disabled={adjust.isPending}>Apply Adjustment</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calculator className="h-4 w-4" /> Computation Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {entry.computationSnapshot ? (
                <div className="bg-muted p-4 rounded-md overflow-auto font-mono text-xs text-muted-foreground">
                  <pre>{JSON.stringify(entry.computationSnapshot, null, 2)}</pre>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center p-4 border border-dashed rounded">
                  No computation snapshot available.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="h-full max-h-[600px] flex flex-col">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-4 w-4" /> Audit Log
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {isLoadingEvents ? (
                <div className="space-y-4">
                  <div className="h-10 bg-muted animate-pulse rounded" />
                  <div className="h-10 bg-muted animate-pulse rounded" />
                </div>
              ) : events.length > 0 ? (
                <div className="space-y-6 relative before:absolute before:inset-y-0 before:left-[11px] before:w-[2px] before:bg-muted">
                  {events.map((event) => (
                    <div key={event.id} className="relative pl-8">
                      <div className="absolute left-0 top-1.5 h-[24px] w-[24px] rounded-full bg-background border-2 border-primary z-10 flex items-center justify-center">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      </div>
                      <div className="text-sm font-medium capitalize">{event.eventKind.replace("_", " ")}</div>
                      <div className="text-xs text-muted-foreground mb-2">{formatDateTime(event.at)} by {event.actor}</div>
                      
                      {event.eventKind === 'state_change' && event.before && event.after && (
                        <div className="text-xs bg-muted/50 p-2 rounded flex items-center gap-2">
                          <Badge variant="outline" className="opacity-70">{(event.before as any).state}</Badge>
                          <span>→</span>
                          <Badge variant="outline">{(event.after as any).state}</Badge>
                        </div>
                      )}
                      
                      {event.eventKind === 'manually_adjusted' && event.before && event.after && (
                        <div className="text-xs bg-muted/50 p-2 rounded flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="line-through opacity-70">{formatCurrency((event.before as any).amount)}</span>
                            <span>→</span>
                            <span className="font-bold text-primary">{formatCurrency((event.after as any).amount)}</span>
                          </div>
                          {(event.after as any).notes && (
                            <div className="italic">"{(event.after as any).notes}"</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center">No events recorded.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
