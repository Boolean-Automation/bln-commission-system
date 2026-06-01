import React from "react";
import { useTenant } from "@/contexts/TenantContext";
import {
  useListPeople,
  getListPeopleQueryKey,
  useGetSchemaMapping,
  getGetSchemaMappingQueryKey,
  useUpdateSchemaMapping,
} from "@workspace/api-client-react";
import type { Person, EntityMapping, SchemaMappingInput } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Settings2, Save, AlertCircle } from "lucide-react";

const BOOLEAN_GROUP = "Boolean Automation";
const BOOLEAN_DOMAIN = "helloboolean.com";

// Boolean membership is determined ONLY by Work Email domain, never by company text.
function isBoolean(person: Person): boolean {
  return person.email?.split("@")[1]?.trim().toLowerCase() === BOOLEAN_DOMAIN;
}

function groupPeople(people: Person[]): Array<{ key: string; label: string; people: Person[] }> {
  const groups = new Map<string, { label: string; isBoolean: boolean; people: Person[] }>();
  for (const person of people) {
    const boolean = isBoolean(person);
    // Prefix the key so a company literally named "Boolean Automation" can't collide with the email-based bucket.
    const label = boolean ? BOOLEAN_GROUP : person.company?.trim() || "Unassigned";
    const key = boolean ? "boolean" : `company:${label}`;
    const bucket = groups.get(key);
    if (bucket) bucket.people.push(person);
    else groups.set(key, { label, isBoolean: boolean, people: [person] });
  }
  // Company groups first (alphabetical by label); Boolean Automation always last.
  return Array.from(groups.entries())
    .map(([key, g]) => ({ key, label: g.label, isBoolean: g.isBoolean, people: g.people }))
    .sort((a, b) => {
      if (a.isBoolean) return 1;
      if (b.isBoolean) return -1;
      return a.label.localeCompare(b.label);
    })
    .map(({ key, label, people }) => ({ key, label, people }));
}

function EditSourceMappingSheet({ activeTenantId }: { activeTenantId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const { data: mapping, isLoading } = useGetSchemaMapping(activeTenantId, {
    query: { enabled: !!activeTenantId, queryKey: getGetSchemaMappingQueryKey(activeTenantId) },
  });

  const updateMapping = useUpdateSchemaMapping();

  const personEntity = mapping?.entities.find((e) => e.entityKind === "person");
  const [fields, setFields] = React.useState<EntityMapping["fields"]>([]);
  const seededRef = React.useRef(false);

  // Seed editable state once per open session (after mapping loads), and reset on
  // close. This prevents a background refetch from clobbering in-progress edits.
  React.useEffect(() => {
    if (!open) {
      seededRef.current = false;
      setFields([]);
      return;
    }
    if (personEntity && !seededRef.current) {
      setFields(JSON.parse(JSON.stringify(personEntity.fields)));
      seededRef.current = true;
    }
  }, [open, personEntity]);

  const handleFieldChange = (idx: number, newName: string) => {
    setFields((prev) => {
      const draft = [...prev];
      draft[idx] = { ...draft[idx], airtableFieldName: newName, mapped: !!newName.trim() };
      return draft;
    });
  };

  const handleSave = () => {
    if (!mapping || !personEntity) return;
    const entities = mapping.entities.map((e) =>
      e.entityKind === "person" ? { ...e, fields } : e
    );
    const data: SchemaMappingInput = { entities };
    updateMapping.mutate(
      { tenantId: activeTenantId, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSchemaMappingQueryKey(activeTenantId) });
          toast({ title: "Source mapping updated", description: "Sync from source data to apply the new mapping." });
          setOpen(false);
        },
        onError: (err: any) => {
          toast({ title: "Update failed", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="w-4 h-4 mr-2" />
          Edit Source Mapping
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-lg overflow-y-auto flex flex-col">
        <SheetHeader>
          <SheetTitle>Edit People Source Mapping</SheetTitle>
          <SheetDescription>
            Map each canonical person field to its exact column name in the source data.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 py-6 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <div className="h-12 bg-muted animate-pulse rounded" />
              <div className="h-12 bg-muted animate-pulse rounded" />
              <div className="h-12 bg-muted animate-pulse rounded" />
            </div>
          ) : !personEntity ? (
            <div className="text-sm text-muted-foreground text-center py-12">
              No person mapping available for this tenant.
            </div>
          ) : (
            fields.map((field, idx) => (
              <div key={field.canonical} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">{field.label}</label>
                  {field.required ? (
                    <Badge variant="secondary" className="text-[10px] border-0">Required</Badge>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Optional</span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">{field.canonical}</div>
                <div className="relative">
                  <Input
                    value={field.airtableFieldName || ""}
                    onChange={(e) => handleFieldChange(idx, e.target.value)}
                    placeholder="Exact source column name..."
                    className={`font-mono text-sm ${field.required && !field.mapped ? "border-destructive bg-destructive/5" : ""}`}
                  />
                  {field.required && !field.mapped && (
                    <AlertCircle className="w-4 h-4 text-destructive absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <SheetFooter>
          <SheetClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SheetClose>
          <Button onClick={handleSave} disabled={updateMapping.isPending || isLoading || !personEntity}>
            <Save className="w-4 h-4 mr-2" />
            {updateMapping.isPending ? "Saving..." : "Save Mapping"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function People() {
  const { activeTenantId } = useTenant();

  const { data: people = [], isLoading } = useListPeople(activeTenantId!, {
    query: {
      enabled: !!activeTenantId,
      queryKey: activeTenantId ? getListPeopleQueryKey(activeTenantId) : ["people", "empty"]
    }
  });

  const groups = React.useMemo(() => groupPeople(people), [people]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">People</h1>
          <p className="text-muted-foreground text-sm">Mirrored personnel records from source data.</p>
        </div>
        {activeTenantId && <EditSourceMappingSheet activeTenantId={activeTenantId} />}
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead className="text-right">YTD Sales</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-20 bg-muted animate-pulse rounded-full" /></TableCell>
                    <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-16 bg-muted animate-pulse rounded-full" /></TableCell>
                    <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : people.length > 0 ? (
                groups.map((group) => (
                  <React.Fragment key={group.key}>
                    <TableRow className="bg-muted/60 hover:bg-muted/60 border-t">
                      <TableCell colSpan={6} className="py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{group.label}</span>
                          <Badge variant="secondary" className="text-xs">{group.people.length}</Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                    {group.people.map((person) => (
                      <TableRow key={person.id}>
                        <TableCell className="font-medium">{person.name}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {person.roles.map(r => (
                              <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{person.position || "-"}</TableCell>
                        <TableCell>
                          {person.active ? (
                            <div className="flex items-center text-sm text-emerald-600 gap-1">
                              <CheckCircle2 className="h-4 w-4" /> Active
                            </div>
                          ) : (
                            <div className="flex items-center text-sm text-muted-foreground gap-1">
                              <XCircle className="h-4 w-4" /> Inactive
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(person.startDate)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(person.ytdSales)}</TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No people records found.
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
