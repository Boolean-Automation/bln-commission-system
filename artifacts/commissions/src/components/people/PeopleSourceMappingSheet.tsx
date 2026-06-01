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
  getListPeopleQueryKey,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Check,
  ChevronsUpDown,
  Database,
  AlertCircle,
  RefreshCw,
  Save,
  Settings2,
  X,
} from "lucide-react";

type ColumnOption = { name: string; type: string };

function Combobox({
  value,
  options,
  placeholder,
  emptyText,
  allowClear,
  disabled,
  onChange,
  invalid,
}: {
  value: string | null;
  options: ColumnOption[];
  placeholder: string;
  emptyText: string;
  allowClear?: boolean;
  disabled?: boolean;
  onChange: (value: string | null) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const known = value ? options.some((o) => o.name === value) : true;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={`w-full justify-between font-mono text-sm font-normal ${
            invalid ? "border-destructive bg-destructive/5" : ""
          } ${!value ? "text-muted-foreground" : ""}`}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search columns..." />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {allowClear && value && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear mapping
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {!known && value && (
                <CommandItem
                  value={value}
                  onSelect={() => setOpen(false)}
                  className="opacity-70"
                >
                  <Check className="mr-2 h-4 w-4 opacity-100" />
                  <span className="truncate font-mono">{value}</span>
                  <Badge
                    variant="outline"
                    className="ml-auto text-[10px] uppercase"
                  >
                    not in table
                  </Badge>
                </CommandItem>
              )}
              {options.map((opt) => (
                <CommandItem
                  key={opt.name}
                  value={opt.name}
                  onSelect={() => {
                    onChange(opt.name);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${
                      value === opt.name ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <span className="truncate font-mono">{opt.name}</span>
                  <Badge
                    variant="outline"
                    className="ml-auto text-[10px] uppercase tracking-wider"
                  >
                    {opt.type}
                  </Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function PeopleSourceMappingSheet({ tenantId }: { tenantId: string }) {
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

  const [person, setPerson] = useState<EntityMapping | null>(null);
  const seededRef = useRef(false);

  // Seed editable state once per open session (after mapping loads), and reset
  // on close. This prevents a background refetch from clobbering in-progress edits.
  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      setPerson(null);
      return;
    }
    if (mapping && !seededRef.current) {
      const personEntity = mapping.entities.find((e) => e.entityKind === "person");
      setPerson(personEntity ? JSON.parse(JSON.stringify(personEntity)) : null);
      seededRef.current = true;
    }
  }, [open, mapping]);

  const tableNames = useMemo(
    () => (tables ?? []).map((t) => ({ name: t.name, type: "table" })),
    [tables],
  );

  const columnOptions = useMemo<ColumnOption[]>(() => {
    if (!person?.tableName || !tables) return [];
    const t = tables.find((x) => x.name === person.tableName);
    return (t?.fields ?? []).map((f) => ({ name: f.name, type: f.type }));
  }, [person?.tableName, tables]);

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
    setPerson((prev) => {
      if (!prev) return prev;
      const fields = prev.fields.map((f) =>
        f.airtableFieldName && cols.has(f.airtableFieldName)
          ? f
          : { ...f, airtableFieldName: null, mapped: false },
      );
      return { ...prev, tableName: name, fields };
    });
  };

  const setFieldColumn = (fieldIdx: number, column: string | null) => {
    setPerson((prev) => {
      if (!prev) return prev;
      const fields = prev.fields.map((f, i) =>
        i === fieldIdx
          ? { ...f, airtableFieldName: column, mapped: !!column }
          : f,
      );
      return { ...prev, fields };
    });
  };

  // A field is invalid if it's required and either unmapped or points at a column
  // not present in the selected table (only enforced once columns have loaded).
  const isFieldInvalid = (f: EntityMapping["fields"][number]) => {
    if (!f.required) return false;
    if (!f.airtableFieldName) return true;
    if (columnOptions.length > 0 && !columnNameSet.has(f.airtableFieldName))
      return true;
    return false;
  };

  const invalidCount = useMemo(
    () => (person?.fields ?? []).filter(isFieldInvalid).length,
    [person, columnOptions, columnNameSet],
  );

  const buildPayload = (): SchemaMappingInput | null => {
    if (!mapping || !person) return null;
    return {
      entities: mapping.entities.map((e) =>
        e.entityKind === "person" ? person : e,
      ),
    };
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({
      queryKey: getGetSchemaMappingQueryKey(tenantId),
    });
    queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(tenantId) });
    queryClient.invalidateQueries({ queryKey: getListPeopleQueryKey(tenantId) });
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
                    description: `Updated ${result.peopleUpserted} people from ${person?.tableName}.`,
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
            People Source Mapping
          </SheetTitle>
          <SheetDescription>
            Choose which Airtable table feeds People, and map each system field to
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
        ) : !person ? (
          <div className="space-y-3 mt-6">
            <div className="h-10 bg-muted animate-pulse rounded" />
            <div className="h-10 bg-muted animate-pulse rounded" />
            <div className="h-10 bg-muted animate-pulse rounded" />
          </div>
        ) : (
          <div className="flex-1 mt-2 space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Source Table</label>
              <Combobox
                value={person.tableName ?? null}
                options={tableNames}
                placeholder={
                  tablesLoading ? "Loading tables..." : "Select a table..."
                }
                emptyText="No tables found."
                disabled={tablesLoading}
                onChange={setTableName}
                invalid={!person.tableName}
              />
              <p className="text-xs text-muted-foreground">
                The Airtable table that mirrors into the People roster.
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
                {person.fields.map((field, idx) => (
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
                    <Combobox
                      value={field.airtableFieldName ?? null}
                      options={columnOptions}
                      placeholder="— Unmapped —"
                      emptyText={
                        person.tableName
                          ? "No matching columns."
                          : "Select a table first."
                      }
                      allowClear={!field.required}
                      disabled={!person.tableName}
                      onChange={(v) => setFieldColumn(idx, v)}
                      invalid={isFieldInvalid(field)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {connected && person && (
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
