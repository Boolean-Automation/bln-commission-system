import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import {
  useGetSchemaMapping,
  getGetSchemaMappingQueryKey,
  useUpdateSchemaMapping,
  useGetAirtableTables,
  getGetAirtableTablesQueryKey,
  type SchemaMappingInput,
  type EntityMapping,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Database } from "lucide-react";

const NONE_VALUE = "__none__";

export type FieldMappingEditorHandle = {
  /** Persist the current mapping. Resolves on success, rejects on error. */
  save: () => Promise<void>;
  isValid: () => boolean;
};

function isEntityValid(entity: EntityMapping): boolean {
  if (!entity.tableName) return false;
  return entity.fields.every((f) => !f.required || f.mapped);
}

function isMappingValid(entities: EntityMapping[]): boolean {
  return entities.length > 0 && entities.every(isEntityValid);
}

export const FieldMappingEditor = forwardRef<
  FieldMappingEditorHandle,
  {
    tenantId: string;
    baseId: string | null;
    onValidityChange?: (valid: boolean) => void;
    onSavingChange?: (saving: boolean) => void;
  }
>(function FieldMappingEditor(
  { tenantId, baseId, onValidityChange, onSavingChange },
  ref,
) {
  const queryClient = useQueryClient();

  const { data: mapping, isLoading } = useGetSchemaMapping(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getGetSchemaMappingQueryKey(tenantId),
    },
  });

  const { data: tables } = useGetAirtableTables(baseId ?? "", {
    query: {
      enabled: !!baseId,
      queryKey: getGetAirtableTablesQueryKey(baseId ?? ""),
    },
  });

  const updateMapping = useUpdateSchemaMapping();

  const [entitiesState, setEntitiesState] = useState<EntityMapping[]>([]);

  useEffect(() => {
    if (mapping) {
      setEntitiesState(JSON.parse(JSON.stringify(mapping.entities)));
    }
  }, [mapping]);

  // If the connected base changes, a previously-chosen table may no longer exist
  // in it. Drop stale table selections (and their field mappings) so validity
  // can't pass against columns from a different base.
  useEffect(() => {
    if (!tables) return;
    setEntitiesState((prev) => {
      let changed = false;
      const draft = JSON.parse(JSON.stringify(prev)) as EntityMapping[];
      for (const entity of draft) {
        if (entity.tableId && !tables.some((t) => t.id === entity.tableId)) {
          entity.tableId = null;
          entity.tableName = null;
          for (const f of entity.fields) {
            f.airtableFieldName = null;
            f.airtableFieldId = null;
            f.mapped = false;
          }
          changed = true;
        }
      }
      return changed ? draft : prev;
    });
  }, [tables]);

  useEffect(() => {
    onValidityChange?.(isMappingValid(entitiesState));
  }, [entitiesState, onValidityChange]);

  useEffect(() => {
    onSavingChange?.(updateMapping.isPending);
  }, [updateMapping.isPending, onSavingChange]);

  useImperativeHandle(
    ref,
    () => ({
      isValid: () => isMappingValid(entitiesState),
      save: () =>
        new Promise<void>((resolve, reject) => {
          const data: SchemaMappingInput = { entities: entitiesState };
          updateMapping.mutate(
            { tenantId, data },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({
                  queryKey: getGetSchemaMappingQueryKey(tenantId),
                });
                resolve();
              },
              onError: (err: unknown) =>
                reject(err instanceof Error ? err : new Error(String(err))),
            },
          );
        }),
    }),
    [entitiesState, tenantId, queryClient, updateMapping],
  );

  const handleTableChange = (entityIdx: number, tableId: string) => {
    setEntitiesState((prev) => {
      if (prev[entityIdx]?.tableId === tableId) return prev;
      const draft = JSON.parse(JSON.stringify(prev)) as EntityMapping[];
      const entity = draft[entityIdx]!;
      const table = tables?.find((t) => t.id === tableId);
      entity.tableId = table?.id ?? null;
      entity.tableName = table?.name ?? null;
      // Columns differ between tables, so any prior field-to-column mappings no
      // longer apply — clear them and force a re-map.
      for (const f of entity.fields) {
        f.airtableFieldName = null;
        f.airtableFieldId = null;
        f.mapped = false;
      }
      return draft;
    });
  };

  const handleFieldChange = (
    entityIdx: number,
    fieldIdx: number,
    columnName: string,
    columnId: string | null,
  ) => {
    setEntitiesState((prev) => {
      const draft = JSON.parse(JSON.stringify(prev)) as EntityMapping[];
      const field = draft[entityIdx]!.fields[fieldIdx]!;
      field.airtableFieldName = columnName || null;
      field.airtableFieldId = columnId;
      field.mapped = !!columnName.trim();
      return draft;
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="h-64 bg-muted animate-pulse p-6" />
      </Card>
    );
  }

  if (entitiesState.length === 0) {
    return (
      <Card className="border-dashed bg-muted/30">
        <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <AlertCircle className="w-8 h-8 mb-4 opacity-20" />
          No schema mapping available for this company.
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs
      defaultValue={entitiesState[0]!.entityKind}
      className="flex flex-col"
    >
      <TabsList className="w-fit">
        {entitiesState.map((e) => (
          <TabsTrigger
            key={e.entityKind}
            value={e.entityKind}
            className="capitalize px-6"
          >
            {e.label}
            {!isEntityValid(e) && (
              <AlertCircle className="w-3.5 h-3.5 ml-2 text-destructive" />
            )}
          </TabsTrigger>
        ))}
      </TabsList>

      {entitiesState.map((entity, eIdx) => {
        const selectedTable = tables?.find((t) => t.id === entity.tableId);
        const columns = selectedTable?.fields ?? [];
        return (
          <TabsContent
            key={entity.entityKind}
            value={entity.entityKind}
            className="mt-6 space-y-4"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Database className="w-4 h-4 text-muted-foreground" />
                  {entity.label} table in Airtable
                </label>
                <Select
                  value={entity.tableId ?? ""}
                  onValueChange={(v) => handleTableChange(eIdx, v)}
                  disabled={!baseId}
                >
                  <SelectTrigger className="w-[320px]">
                    <SelectValue
                      placeholder={
                        baseId
                          ? "Select the source table…"
                          : "Connect a base first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {tables?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!entity.tableName && (
                <p className="text-xs text-destructive flex items-center gap-1.5 pb-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Choose the {entity.label.toLowerCase()} table to enable
                  syncing.
                </p>
              )}
            </div>

            <div className="grid lg:grid-cols-3 gap-6 items-start">
              <Card className="lg:col-span-2 overflow-hidden shadow-sm">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[240px]">
                        Canonical System Field
                      </TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead>Airtable Source Column</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entity.fields.map((field, fIdx) => {
                      const hasColumns = columns.length > 0;
                      const currentMissing =
                        field.airtableFieldName &&
                        !columns.some(
                          (c) => c.name === field.airtableFieldName,
                        );
                      return (
                        <TableRow
                          key={field.canonical}
                          className="group hover:bg-muted/30"
                        >
                          <TableCell>
                            <div className="font-medium text-sm text-foreground">
                              {field.label}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                              {field.canonical}
                            </div>
                          </TableCell>
                          <TableCell>
                            {field.required ? (
                              <Badge
                                variant="secondary"
                                className="text-[10px] bg-secondary/50 text-secondary-foreground/70 border-0"
                              >
                                Required
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider pl-2">
                                Optional
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {hasColumns ? (
                              <Select
                                value={field.airtableFieldName ?? NONE_VALUE}
                                onValueChange={(v) => {
                                  if (v === NONE_VALUE) {
                                    handleFieldChange(eIdx, fIdx, "", null);
                                  } else {
                                    const col = columns.find(
                                      (c) => c.name === v,
                                    );
                                    handleFieldChange(
                                      eIdx,
                                      fIdx,
                                      v,
                                      col?.id ?? null,
                                    );
                                  }
                                }}
                              >
                                <SelectTrigger
                                  className={`font-mono text-sm ${
                                    field.required && !field.mapped
                                      ? "border-destructive bg-destructive/5"
                                      : field.mapped
                                        ? "border-primary/20"
                                        : ""
                                  }`}
                                >
                                  <SelectValue placeholder="Select a column…" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NONE_VALUE}>
                                    — Not mapped —
                                  </SelectItem>
                                  {currentMissing && (
                                    <SelectItem
                                      value={field.airtableFieldName!}
                                    >
                                      {field.airtableFieldName} (missing)
                                    </SelectItem>
                                  )}
                                  {columns.map((c) => (
                                    <SelectItem key={c.id} value={c.name}>
                                      {c.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="relative">
                                <Input
                                  value={field.airtableFieldName || ""}
                                  onChange={(e) =>
                                    handleFieldChange(
                                      eIdx,
                                      fIdx,
                                      e.target.value,
                                      null,
                                    )
                                  }
                                  placeholder="Exact column name…"
                                  className={`font-mono text-sm bg-transparent transition-colors ${
                                    field.required && !field.mapped
                                      ? "border-destructive focus-visible:ring-destructive/20 bg-destructive/5"
                                      : ""
                                  } ${field.mapped ? "border-primary/20" : ""}`}
                                />
                                {field.required && !field.mapped && (
                                  <AlertCircle className="w-4 h-4 text-destructive absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
                    Columns detected in Airtable that do not correspond to any
                    canonical fields.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {entity.unrecognizedFields &&
                  entity.unrecognizedFields.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {entity.unrecognizedFields.map((f) => (
                        <Badge
                          key={f}
                          variant="outline"
                          className="font-mono text-[10px] bg-background text-muted-foreground border-border/50"
                        >
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
        );
      })}
    </Tabs>
  );
});
