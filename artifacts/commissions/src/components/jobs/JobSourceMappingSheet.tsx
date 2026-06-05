import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetTenant,
  getGetTenantQueryKey,
  useGetSchemaMapping,
  getGetSchemaMappingQueryKey,
  useUpdateSchemaMapping,
  useGetAirtableTables,
  getGetAirtableTablesQueryKey,
  useSyncFromAirtable,
  getListJobsQueryKey,
  type EntityMapping,
  type SchemaMappingInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Database,
  AlertCircle,
  RefreshCw,
  Save,
  Settings2,
} from "lucide-react";
import {
  AirtableColumnCombobox,
  type ColumnOption,
} from "@/components/mapping/AirtableColumnCombobox";

export function JobSourceMappingSheet({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: tenant } = useGetTenant(tenantId, {
    query: { enabled: !!tenantId, queryKey: getGetTenantQueryKey(tenantId) },
  });
  const baseId = tenant?.airtableBaseId ?? null;
  const connected = !!tenant?.airtableConnected;

  const { data: mapping } = useGetSchemaMapping(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getGetSchemaMappingQueryKey(tenantId),
    },
  });

  const { data: tables, isLoading: tablesLoading } = useGetAirtableTables(
    baseId ?? "",
    {
      query: {
        enabled: open && !!baseId,
        queryKey: getGetAirtableTablesQueryKey(baseId ?? ""),
      },
    },
  );

  const updateMapping = useUpdateSchemaMapping();
  const syncMutation = useSyncFromAirtable();

  const [job, setJob] = useState<EntityMapping | null>(null);
  const seededRef = useRef(false);

  // Seed editable state once per open session (after mapping loads), and reset
  // on close. This prevents a background refetch from clobbering in-progress edits.
  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      setJob(null);
      return;
    }
    if (mapping && !seededRef.current) {
      const jobEntity = mapping.entities.find((e) => e.entityKind === "job");
      setJob(jobEntity ? JSON.parse(JSON.stringify(jobEntity)) : null);
      seededRef.current = true;
    }
  }, [open, mapping]);

  const tableNames = useMemo(
    () => (tables ?? []).map((t) => ({ name: t.name, type: "table" })),
    [tables],
  );

  const columnOptions = useMemo<ColumnOption[]>(() => {
    if (!job?.tableName || !tables) return [];
    const t = tables.find((x) => x.name === job.tableName);
    return (t?.fields ?? []).map((f) => ({ name: f.name, type: f.type }));
  }, [job?.tableName, tables]);

  const columnNameSet = useMemo(
    () => new Set(columnOptions.map((c) => c.name)),
    [columnOptions],
  );

  // Switching the source table reconciles existing column mappings: any column
  // that doesn't exist in the newly selected table is cleared so we never persist
  // a mapping that points at a non-existent column (which breaks sync silently).
  const setTableName = (name: string | null) => {
    const cols = new Set(
      (tables?.find((t) => t.name === name)?.fields ?? []).map((f) => f.name),
    );
    setJob((prev) => {
      if (!prev) return prev;
      const fields = prev.fields.map((f) =>
        f.sourceFieldName && cols.has(f.sourceFieldName)
          ? f
          : { ...f, sourceFieldName: null, mapped: false },
      );
      return { ...prev, tableName: name, fields };
    });
  };

  const setFieldColumn = (fieldIdx: number, column: string | null) => {
    setJob((prev) => {
      if (!prev) return prev;
      const fields = prev.fields.map((f, i) =>
        i === fieldIdx
          ? { ...f, sourceFieldName: column, mapped: !!column }
          : f,
      );
      return { ...prev, fields };
    });
  };

  // A field is invalid if it's required and either unmapped or points at a column
  // not present in the selected table (only enforced once columns have loaded).
  const isFieldInvalid = (f: EntityMapping["fields"][number]) => {
    if (!f.required) return false;
    if (!f.sourceFieldName) return true;
    if (columnOptions.length > 0 && !columnNameSet.has(f.sourceFieldName))
      return true;
    return false;
  };

  const invalidCount = useMemo(
    () => (job?.fields ?? []).filter(isFieldInvalid).length,
    [job, columnOptions, columnNameSet],
  );

  const buildPayload = (): SchemaMappingInput | null => {
    if (!mapping || !job) return null;
    return {
      entities: mapping.entities.map((e) =>
        e.entityKind === "job" ? job : e,
      ),
    };
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({
      queryKey: getGetSchemaMappingQueryKey(tenantId),
    });
    queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(tenantId) });
    queryClient.invalidateQueries({ queryKey: getListJobsQueryKey(tenantId) });
  };

  const handleSave = (thenSync: boolean) => {
    const data = buildPayload();
    if (!data) return;
    updateMapping.mutate(
      { tenantId, data },
      {
        onSuccess: () => {
          if (thenSync) {
            syncMutation.mutate(
              { tenantId },
              {
                onSuccess: (result) => {
                  // Sync triggers a recompute that touches ledger/dashboard/
                  // payroll/activity, so refresh all active queries.
                  queryClient.invalidateQueries();
                  toast({
                    title: "Mapping saved & re-synced",
                    description: `Updated ${result.jobsUpserted} jobs from ${job?.tableName}.`,
                  });
                  setOpen(false);
                },
                onError: (err: any) => {
                  queryClient.invalidateQueries();
                  toast({
                    title: "Saved, but sync failed",
                    description: err?.message,
                    variant: "destructive",
                  });
                },
              },
            );
          } else {
            invalidateAll();
            toast({
              title: "Source mapping saved",
              description: "Run a sync to pull data with the new mapping.",
            });
            setOpen(false);
          }
        },
        onError: (err: any) => {
          toast({
            title: "Save failed",
            description: err?.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const busy = updateMapping.isPending || syncMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="w-4 h-4 mr-2" />
          Edit Source Mapping
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-xl w-full overflow-y-auto flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Job Source Mapping
          </SheetTitle>
          <SheetDescription>
            Choose which Airtable table feeds Jobs, and map each system field to
            a source column. Changes apply on the next sync.
          </SheetDescription>
        </SheetHeader>

        {!connected ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center text-muted-foreground gap-3 py-12">
            <AlertCircle className="w-8 h-8 opacity-30" />
            <p className="text-sm max-w-xs">
              This tenant isn't connected to an Airtable base yet. Connect a base
              from Schema Mapping first.
            </p>
          </div>
        ) : !job ? (
          <div className="space-y-3 mt-6">
            <div className="h-10 bg-muted animate-pulse rounded" />
            <div className="h-10 bg-muted animate-pulse rounded" />
            <div className="h-10 bg-muted animate-pulse rounded" />
          </div>
        ) : (
          <div className="flex-1 mt-2 space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Source Table</label>
              <AirtableColumnCombobox
                value={job.tableName ?? null}
                options={tableNames}
                placeholder={
                  tablesLoading ? "Loading tables..." : "Select a table..."
                }
                emptyText="No tables found."
                searchPlaceholder="Search tables..."
                disabled={tablesLoading}
                onChange={setTableName}
                invalid={!job.tableName}
              />
              <p className="text-xs text-muted-foreground">
                The Airtable table that mirrors into the Jobs ledger.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Column Mappings</label>
                {invalidCount > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    {invalidCount} required unmapped
                  </Badge>
                )}
              </div>
              <div className="space-y-3">
                {job.fields.map((field, idx) => (
                  <div
                    key={field.canonical}
                    className="grid grid-cols-[160px_1fr] items-center gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {field.label}
                        {field.required && (
                          <span className="text-destructive ml-1">*</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono truncate">
                        {field.canonical}
                      </div>
                    </div>
                    <AirtableColumnCombobox
                      value={field.sourceFieldName ?? null}
                      options={columnOptions}
                      placeholder="— Unmapped —"
                      emptyText={
                        job.tableName
                          ? "No matching columns."
                          : "Select a table first."
                      }
                      searchPlaceholder="Search columns..."
                      allowClear={!field.required}
                      disabled={!job.tableName}
                      onChange={(v) => setFieldColumn(idx, v)}
                      invalid={isFieldInvalid(field)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {connected && job && (
          <SheetFooter className="mt-6 flex-row gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => handleSave(false)}
              disabled={busy || invalidCount > 0}
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            <Button
              onClick={() => handleSave(true)}
              disabled={busy || invalidCount > 0}
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${
                  syncMutation.isPending ? "animate-spin" : ""
                }`}
              />
              {syncMutation.isPending ? "Syncing..." : "Save & Sync"}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
