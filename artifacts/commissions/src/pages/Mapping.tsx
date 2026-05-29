import React, { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { 
  useGetSchemaMapping, 
  getGetSchemaMappingQueryKey,
  useUpdateSchemaMapping,
  type SchemaMappingInput,
  type EntityMapping
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Save } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-1/4 bg-muted animate-pulse mb-8" />
        <Card><CardContent className="h-64 bg-muted animate-pulse p-6" /></Card>
      </div>
    );
  }

  if (!mapping || entitiesState.length === 0) {
    return <div className="p-8">No schema mapping available.</div>;
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schema Mapping</h1>
          <p className="text-muted-foreground text-sm">Map canonical system fields to Airtable column names.</p>
        </div>
        <Button onClick={handleSave} disabled={updateMapping.isPending}>
          <Save className="w-4 h-4 mr-2" /> Save Mappings
        </Button>
      </div>

      <Tabs defaultValue={entitiesState[0].entityKind} className="flex-1 flex flex-col">
        <TabsList className="w-fit">
          {entitiesState.map(e => (
            <TabsTrigger key={e.entityKind} value={e.entityKind} className="capitalize">
              {e.label}
            </TabsTrigger>
          ))}
        </TabsList>
        
        {entitiesState.map((entity, eIdx) => (
          <TabsContent key={entity.entityKind} value={entity.entityKind} className="flex-1 mt-6">
            <div className="grid lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Field Mappings</CardTitle>
                  <CardDescription>Match standard fields to your Airtable columns.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Canonical Field</TableHead>
                        <TableHead>Required</TableHead>
                        <TableHead>Source Column Name</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entity.fields.map((field, fIdx) => (
                        <TableRow key={field.canonical}>
                          <TableCell className="font-medium">
                            {field.label}
                            <div className="text-xs text-muted-foreground font-mono mt-1">{field.canonical}</div>
                          </TableCell>
                          <TableCell>
                            {field.required && <Badge variant="secondary" className="text-[10px]">Required</Badge>}
                          </TableCell>
                          <TableCell>
                            <Input 
                              value={field.airtableFieldName || ""} 
                              onChange={(e) => handleFieldChange(eIdx, fIdx, e.target.value)}
                              placeholder="Exact column name..."
                              className={`font-mono text-sm ${field.required && !field.mapped ? 'border-destructive' : ''}`}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Unrecognized Fields</CardTitle>
                  <CardDescription>Columns found in Airtable that aren't mapped yet.</CardDescription>
                </CardHeader>
                <CardContent>
                  {entity.unrecognizedFields && entity.unrecognizedFields.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {entity.unrecognizedFields.map(f => (
                        <Badge key={f} variant="outline" className="font-mono font-normal">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground text-center p-4 border border-dashed rounded">
                      All columns are mapped or ignored.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
