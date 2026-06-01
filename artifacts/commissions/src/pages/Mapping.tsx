import React, { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { 
  useGetSchemaMapping, 
  getGetSchemaMappingQueryKey,
  useUpdateSchemaMapping,
  useGetTenant,
  getGetTenantQueryKey,
  useListAirtableBases,
  useGetAirtableTables,
  getGetAirtableTablesQueryKey,
  useSetAirtableBase,
  useSyncFromAirtable,
  type SchemaMappingInput,
  type EntityMapping,
  type SyncResult
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Save, RefreshCw, Database, Link as LinkIcon, AlertCircle, CheckCircle2, ChevronRight, Server } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
  const queryClient = useQueryClient();

  const { data: mapping, isLoading } = useGetSchemaMapping(activeTenantId!, {
    query: {
      enabled: !!activeTenantId,
      queryKey: activeTenantId ? getGetSchemaMappingQueryKey(activeTenantId) : ["mapping", "empty"]
    }
  });

  const updateMapping = useUpdateSchemaMapping();

  const [entitiesState, setEntitiesState] = useState<EntityMapping[]>([]);

  useEffect(() => {
    if (mapping) {
      // Deep clone to allow safe editing
      setEntitiesState(JSON.parse(JSON.stringify(mapping.entities)));
    }
  }, [mapping]);

  const handleFieldChange = (entityIdx: number, fieldIdx: number, newName: string) => {
    setEntitiesState(prev => {
      const draft = [...prev];
      draft[entityIdx].fields[fieldIdx].airtableFieldName = newName;
      draft[entityIdx].fields[fieldIdx].mapped = !!newName.trim();
      return draft;
    });
  };

  const handleSave = () => {
    if (!activeTenantId) return;
    const data: SchemaMappingInput = { entities: entitiesState };
    updateMapping.mutate({ tenantId: activeTenantId, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSchemaMappingQueryKey(activeTenantId) });
        toast({ title: "Schema mapping updated successfully" });
      },
      onError: (err: any) => {
        toast({ title: "Update failed", description: err.message, variant: "destructive" });
      }
    });
  };

  if (isLoading || !activeTenantId) {
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

      {!mapping || entitiesState.length === 0 ? (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <LinkIcon className="w-8 h-8 mb-4 opacity-20" />
            No schema mapping available for this tenant.
          </CardContent>
        </Card>
      ) : (
        <div className="flex-1 flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Field Mappings</h2>
            <Button onClick={handleSave} disabled={updateMapping.isPending}>
              <Save className="w-4 h-4 mr-2" /> 
              {updateMapping.isPending ? 'Saving...' : 'Save Mappings'}
            </Button>
          </div>

          <Tabs defaultValue={entitiesState[0].entityKind} className="flex-1 flex flex-col">
            <TabsList className="w-fit">
              {entitiesState.map(e => (
                <TabsTrigger key={e.entityKind} value={e.entityKind} className="capitalize px-6">
                  {e.label}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {entitiesState.map((entity, eIdx) => (
              <TabsContent key={entity.entityKind} value={entity.entityKind} className="flex-1 mt-6">
                <div className="grid lg:grid-cols-3 gap-6 items-start">
                  <Card className="lg:col-span-2 overflow-hidden shadow-sm">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="w-[240px]">Canonical System Field</TableHead>
                          <TableHead className="w-[100px]">Status</TableHead>
                          <TableHead>Airtable Source Column</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entity.fields.map((field, fIdx) => (
                          <TableRow key={field.canonical} className="group hover:bg-muted/30">
                            <TableCell>
                              <div className="font-medium text-sm text-foreground">{field.label}</div>
                              <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{field.canonical}</div>
                            </TableCell>
                            <TableCell>
                              {field.required ? (
                                <Badge variant="secondary" className="text-[10px] bg-secondary/50 text-secondary-foreground/70 border-0">Required</Badge>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider pl-2">Optional</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="relative">
                                <Input 
                                  value={field.airtableFieldName || ""} 
                                  onChange={(e) => handleFieldChange(eIdx, fIdx, e.target.value)}
                                  placeholder="Exact column name..."
                                  className={`font-mono text-sm bg-transparent transition-colors
                                    ${field.required && !field.mapped ? 'border-destructive focus-visible:ring-destructive/20 bg-destructive/5' : ''}
                                    ${field.mapped ? 'border-primary/20' : ''}
                                  `}
                                />
                                {field.required && !field.mapped && (
                                  <AlertCircle className="w-4 h-4 text-destructive absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>

                  <Card className="shadow-sm bg-muted/20 border-border/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-muted-foreground" />
                        Unmapped Airtable Columns
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Columns detected in Airtable that do not correspond to any canonical fields.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {entity.unrecognizedFields && entity.unrecognizedFields.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {entity.unrecognizedFields.map(f => (
                            <Badge key={f} variant="outline" className="font-mono text-[10px] bg-background text-muted-foreground border-border/50">
                              {f}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground/70 text-center py-6 border border-dashed border-border/50 rounded-md bg-background/50">
                          No unmapped columns detected.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}
    </div>
  );
}
