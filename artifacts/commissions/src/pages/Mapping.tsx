import React, { useRef, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { 
  getGetSchemaMappingQueryKey,
  useGetTenant,
  getGetTenantQueryKey,
  useListAirtableBases,
  useGetAirtableTables,
  getGetAirtableTablesQueryKey,
  useSetAirtableBase,
  useSyncFromAirtable,
  type SyncResult
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Save, RefreshCw, Database, AlertCircle, CheckCircle2, Server } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  FieldMappingEditor,
  type FieldMappingEditorHandle,
} from "@/components/mapping/FieldMappingEditor";

function AirtableTableExplorer({ baseId }: { baseId: string }) {
  const { data: tables, isLoading } = useGetAirtableTables(baseId, {
    query: { enabled: !!baseId, queryKey: getGetAirtableTablesQueryKey(baseId) }
  });

  if (isLoading) {
    return (
      <div className="space-y-4 mt-6">
        <div className="h-10 bg-muted animate-pulse rounded" />
        <div className="h-10 bg-muted animate-pulse rounded" />
        <div className="h-10 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!tables?.length) {
    return <div className="p-4 text-center text-sm text-muted-foreground mt-6">No tables found.</div>;
  }

  return (
    <div className="mt-6">
      <Accordion type="single" collapsible className="w-full">
        {tables.map(t => (
          <AccordionItem key={t.id} value={t.id}>
            <AccordionTrigger className="text-sm font-medium hover:no-underline hover:text-primary transition-colors">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-muted-foreground" />
                {t.name}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-1 mt-2">
                {t.fields.map(f => (
                  <div key={f.id} className="flex items-center justify-between text-xs py-2 border-b border-border/50 last:border-0">
                    <span className="font-mono text-muted-foreground">{f.name}</span>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{f.type}</Badge>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function AirtableConnectionPanel({ activeTenantId }: { activeTenantId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tenant, isLoading: isTenantLoading } = useGetTenant(activeTenantId, {
    query: { enabled: !!activeTenantId, queryKey: getGetTenantQueryKey(activeTenantId) }
  });

  const { data: bases, isLoading: isBasesLoading } = useListAirtableBases();
  const setBaseMutation = useSetAirtableBase();
  const syncMutation = useSyncFromAirtable();

  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const handleBaseChange = (baseId: string) => {
    setBaseMutation.mutate({ tenantId: activeTenantId, data: { baseId } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(activeTenantId) });
        queryClient.invalidateQueries({ queryKey: getGetSchemaMappingQueryKey(activeTenantId) });
        setSyncResult(null);
        toast({ title: "Airtable connection updated" });
      },
      onError: (err: any) => {
        toast({ title: "Connection failed", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleSync = () => {
    syncMutation.mutate({ tenantId: activeTenantId }, {
      onSuccess: (result) => {
        setSyncResult(result);
        queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(activeTenantId) });
        toast({ title: "Sync completed successfully" });
      },
      onError: (err: any) => {
        toast({ title: "Sync failed", description: err.message, variant: "destructive" });
      }
    });
  };

  if (isTenantLoading || isBasesLoading) {
    return <Card className="animate-pulse h-32 bg-muted border-0" />;
  }

  if (!tenant || !bases) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-4 border-b border-primary/10">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="w-5 h-5 text-primary" />
              Airtable Connection
            </CardTitle>
            <CardDescription className="mt-1">
              Link this tenant to an Airtable base to import real-time data.
            </CardDescription>
          </div>
          {tenant.airtableConnected && (
            <Badge variant="outline" className="bg-background text-primary border-primary/30 flex items-center gap-1.5 py-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="flex items-end gap-6">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-foreground/80">Selected Base</label>
            <div className="flex gap-3">
              <Select value={tenant.airtableBaseId || ""} onValueChange={handleBaseChange} disabled={setBaseMutation.isPending}>
                <SelectTrigger className="w-[300px] bg-background">
                  <SelectValue placeholder="Select an Airtable base..." />
                </SelectTrigger>
                <SelectContent>
                  {bases.map(base => (
                    <SelectItem key={base.id} value={base.id}>{base.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {tenant.airtableBaseId && (
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="bg-background">
                      <Database className="w-4 h-4 mr-2 text-muted-foreground" />
                      Browse Schema
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="sm:max-w-md overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>Base Schema Explorer</SheetTitle>
                      <SheetDescription>
                        Explore tables and columns in the selected base to assist with your field mappings.
                      </SheetDescription>
                    </SheetHeader>
                    <AirtableTableExplorer baseId={tenant.airtableBaseId} />
                  </SheetContent>
                </Sheet>
              )}
            </div>
          </div>
          
          <div className="flex-1">
             {tenant.airtableConnected && (
               <div className="flex items-center justify-end gap-4">
                  <div className="text-right">
                    <div className="text-sm font-medium">{tenant.peopleCount} People &bull; {tenant.jobsCount} Jobs</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Last updated {new Date(tenant.createdAt).toLocaleDateString()}</div>
                  </div>
                  <Button 
                    onClick={handleSync} 
                    disabled={syncMutation.isPending}
                    className="min-w-[140px]"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                    {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
                  </Button>
               </div>
             )}
          </div>
        </div>

        {syncResult && (
          <Alert className="mt-6 bg-background border-primary/20">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <AlertTitle>Sync Complete</AlertTitle>
            <AlertDescription className="text-muted-foreground mt-1">
              Updated {syncResult.peopleUpserted} people and {syncResult.jobsUpserted} jobs. 
              {syncResult.recompute.entriesCreated > 0 && ` Generated ${syncResult.recompute.entriesCreated} new entries.`}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export function Mapping() {
  const { activeTenantId } = useTenant();
  const { toast } = useToast();

  const { data: tenant } = useGetTenant(activeTenantId!, {
    query: {
      enabled: !!activeTenantId,
      queryKey: activeTenantId
        ? getGetTenantQueryKey(activeTenantId)
        : ["tenant", "empty"],
    },
  });

  const editorRef = useRef<FieldMappingEditorHandle>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    editorRef.current
      ?.save()
      .then(() => {
        toast({ title: "Schema mapping updated successfully" });
      })
      .catch((err: unknown) => {
        toast({
          title: "Update failed",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      });
  };

  if (!activeTenantId) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-1/4 bg-muted animate-pulse mb-8 rounded" />
        <Card><CardContent className="h-64 bg-muted animate-pulse p-6" /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 h-full flex flex-col pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Data Integration</h1>
        <p className="text-muted-foreground text-sm mt-1">Connect your Airtable base and map fields to reconcile external data into the commission engine.</p>
      </div>

      <AirtableConnectionPanel activeTenantId={activeTenantId} />

      <div className="flex-1 flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Field Mappings</h2>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Mappings"}
          </Button>
        </div>

        <FieldMappingEditor
          ref={editorRef}
          tenantId={activeTenantId}
          baseId={tenant?.airtableBaseId ?? null}
          onSavingChange={setSaving}
        />
      </div>
    </div>
  );
}
