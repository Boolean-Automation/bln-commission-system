import React, { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateTenant,
  getListTenantsQueryKey,
  useListAirtableBases,
  getListAirtableBasesQueryKey,
  useSetAirtableBase,
  useSyncFromAirtable,
  getGetTenantQueryKey,
  getGetSchemaMappingQueryKey,
  type Tenant,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Building,
  Database,
  ListChecks,
  Workflow,
} from "lucide-react";
import {
  FieldMappingEditor,
  type FieldMappingEditorHandle,
} from "@/components/mapping/FieldMappingEditor";
import { PlanBuilder } from "@/components/plan/PlanBuilder";

type Step = 0 | 1 | 2 | 3;

const STEPS = [
  { title: "Company", icon: Building },
  { title: "Connect", icon: Database },
  { title: "Map fields", icon: ListChecks },
  { title: "Plan", icon: Workflow },
] as const;

export function OnboardingWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new tenant id as soon as the company is created. */
  onCreated?: (tenantId: string) => void;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [baseId, setBaseId] = useState<string>("");
  const [mappingValid, setMappingValid] = useState(false);

  const mappingRef = useRef<FieldMappingEditorHandle>(null);

  const createTenant = useCreateTenant();
  const { data: bases, isLoading: basesLoading } = useListAirtableBases({
    query: { enabled: open, queryKey: getListAirtableBasesQueryKey() },
  });
  const setBase = useSetAirtableBase();
  const sync = useSyncFromAirtable();

  const reset = () => {
    setStep(0);
    setName("");
    setTenantId(null);
    setBaseId("");
    setMappingValid(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleCreateCompany = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createTenant.mutate(
      { data: { name: trimmed } },
      {
        onSuccess: (tenant) => {
          setTenantId(tenant.id);
          // Patch the list cache synchronously so the new tenant exists before
          // we select it — otherwise TenantContext reverts to tenants[0] while
          // the refetch is still in flight.
          queryClient.setQueryData<Tenant[]>(
            getListTenantsQueryKey(),
            (old) => {
              const list = old ?? [];
              return list.some((t) => t.id === tenant.id)
                ? list
                : [...list, tenant];
            },
          );
          queryClient.invalidateQueries({
            queryKey: getListTenantsQueryKey(),
          });
          onCreated?.(tenant.id);
          setStep(1);
        },
        onError: (err: unknown) => {
          toast({
            title: "Could not create company",
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleConnectBase = () => {
    if (!tenantId || !baseId) return;
    setBase.mutate(
      { tenantId, data: { baseId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetTenantQueryKey(tenantId),
          });
          queryClient.invalidateQueries({
            queryKey: getGetSchemaMappingQueryKey(tenantId),
          });
          setStep(2);
        },
        onError: (err: unknown) => {
          toast({
            title: "Could not connect base",
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleSaveMapping = () => {
    mappingRef.current
      ?.save()
      .then(() => {
        toast({ title: "Field mapping saved" });
        setStep(3);
      })
      .catch((err: unknown) => {
        toast({
          title: "Could not save mapping",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      });
  };

  const handleFinish = () => {
    if (!tenantId) return;
    sync.mutate(
      { tenantId },
      {
        onSuccess: (result) => {
          toast({
            title: "Company is ready",
            description: `Imported ${result.peopleUpserted} people and ${result.jobsUpserted} jobs.`,
          });
          handleOpenChange(false);
          navigate("/");
        },
        onError: (err: unknown) => {
          toast({
            title: "Initial sync failed",
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set up a new company</DialogTitle>
          <DialogDescription>
            Stand up a brand-new company end to end: name it, connect Airtable,
            map your fields, start a plan, and sync.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between px-1 py-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <React.Fragment key={s.title}>
                <div className="flex items-center gap-2">
                  <div
                    className={`flex size-8 items-center justify-center rounded-full border text-sm ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : done
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground"
                    }`}
                  >
                    {done ? (
                      <Check className="size-4" />
                    ) : (
                      <Icon className="size-4" />
                    )}
                  </div>
                  <span
                    className={`text-sm ${active ? "font-medium" : "text-muted-foreground"}`}
                  >
                    {s.title}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="mx-2 h-px flex-1 bg-border" />
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div className="min-h-[280px] py-2">
          {step === 0 && (
            <div className="space-y-4 max-w-md">
              <div className="space-y-2">
                <label className="text-sm font-medium">Company name</label>
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Apex Roofing Co."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateCompany();
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  We'll create the company and a default field-mapping template
                  for it.
                </p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4 max-w-md">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Database className="size-4 text-muted-foreground" />
                  Airtable base
                </label>
                <Select
                  value={baseId}
                  onValueChange={setBaseId}
                  disabled={basesLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        basesLoading
                          ? "Loading bases…"
                          : "Select an Airtable base…"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {bases?.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This base is the source of truth for this company's people and
                  jobs.
                </p>
              </div>
            </div>
          )}

          {step === 2 && tenantId && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Pick the source table for each entity and map every required
                field. You can't continue until all required fields are mapped.
              </p>
              <FieldMappingEditor
                ref={mappingRef}
                tenantId={tenantId}
                baseId={baseId}
                onValidityChange={setMappingValid}
              />
            </div>
          )}

          {step === 3 && tenantId && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Add the rules that calculate commissions. You can refine these
                anytime later from the Plan page.
              </p>
              <PlanBuilder tenantId={tenantId} showHeader={false} />
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1) as Step)}
            disabled={step === 0 || createTenant.isPending}
          >
            <ChevronLeft className="size-4 mr-1" /> Back
          </Button>

          {step === 0 && (
            <Button
              onClick={handleCreateCompany}
              disabled={!name.trim() || createTenant.isPending}
            >
              {createTenant.isPending && (
                <Loader2 className="size-4 mr-1 animate-spin" />
              )}
              Create company <ChevronRight className="size-4 ml-1" />
            </Button>
          )}

          {step === 1 && (
            <Button
              onClick={handleConnectBase}
              disabled={!baseId || setBase.isPending}
            >
              {setBase.isPending && (
                <Loader2 className="size-4 mr-1 animate-spin" />
              )}
              Connect base <ChevronRight className="size-4 ml-1" />
            </Button>
          )}

          {step === 2 && (
            <Button onClick={handleSaveMapping} disabled={!mappingValid}>
              Save &amp; continue <ChevronRight className="size-4 ml-1" />
            </Button>
          )}

          {step === 3 && (
            <Button onClick={handleFinish} disabled={sync.isPending}>
              {sync.isPending && (
                <Loader2 className="size-4 mr-1 animate-spin" />
              )}
              Finish &amp; sync
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
