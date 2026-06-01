import React, { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import {
  useGetActivePlan,
  getGetActivePlanQueryKey,
  useListRuleModules,
  useUpdateRuleInstance,
  useCreateRuleInstance,
  useDeleteRuleInstance,
  useReorderRuleInstances,
  useRecomputeCommissions,
  getGetDashboardQueryKey,
  getListCommissionsQueryKey,
  getGetActivityQueryKey,
  getGetPayrollSummaryQueryKey,
  type RuleInstance,
  type RuleModule,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowDown, ArrowUp, Plus, Trash2, Loader2 } from "lucide-react";
import { RuleParamsForm } from "@/components/plan/RuleParamsForm";
import { CustomRuleBuilder } from "@/components/plan/CustomRuleBuilder";

function useRefreshAfterChange() {
  const { activeTenantId } = useTenant();
  const queryClient = useQueryClient();
  const recompute = useRecomputeCommissions();

  const refresh = (opts?: { onDone?: () => void }) => {
    if (!activeTenantId) return;
    queryClient.invalidateQueries({
      queryKey: getGetActivePlanQueryKey(activeTenantId),
    });
    recompute.mutate(
      { tenantId: activeTenantId },
      {
        onSettled: () => {
          queryClient.invalidateQueries({
            queryKey: getGetActivePlanQueryKey(activeTenantId),
          });
          queryClient.invalidateQueries({
            queryKey: getGetDashboardQueryKey(activeTenantId),
          });
          queryClient.invalidateQueries({
            queryKey: getListCommissionsQueryKey(activeTenantId),
          });
          queryClient.invalidateQueries({
            queryKey: getGetActivityQueryKey(activeTenantId),
          });
          queryClient.invalidateQueries({
            queryKey: getGetPayrollSummaryQueryKey(activeTenantId),
          });
          opts?.onDone?.();
        },
      },
    );
  };

  return { refresh, isRecomputing: recompute.isPending };
}

function RuleInstanceEditor({
  instance,
  module,
  onSaved,
}: {
  instance: RuleInstance;
  module: RuleModule | undefined;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const updateRule = useUpdateRuleInstance();

  const [enabled, setEnabled] = useState(instance.enabled);
  const [params, setParams] = useState<Record<string, unknown>>(
    instance.params,
  );

  const dirty =
    enabled !== instance.enabled ||
    JSON.stringify(params) !== JSON.stringify(instance.params);

  const handleSave = () => {
    updateRule.mutate(
      { ruleInstanceId: instance.id, data: { enabled, params } },
      {
        onSuccess: () => {
          toast({ title: "Rule saved", description: "Recomputing commissions…" });
          onSaved();
        },
        onError: (err: unknown) => {
          toast({
            title: "Failed to save rule",
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  const isCustom = instance.ruleModuleKey === "custom";

  return (
    <div className="space-y-5 pt-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Enabled</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {isCustom ? (
        <CustomRuleBuilder value={params} onChange={setParams} />
      ) : module && module.fields.length > 0 ? (
        <RuleParamsForm
          fields={module.fields}
          value={params}
          onChange={setParams}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          This rule has no configurable settings.
        </p>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={updateRule.isPending || !dirty}
        >
          {updateRule.isPending && (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          )}
          Save changes
        </Button>
      </div>
    </div>
  );
}

function AddRuleDialog({
  modules,
  onAdd,
  isAdding,
}: {
  modules: RuleModule[];
  onAdd: (key: string, onDone: () => void) => void;
  isAdding: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add rule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a rule to the plan</DialogTitle>
          <DialogDescription>
            Pick a rule module from the library. You can configure it after
            adding.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {modules.map((mod) => (
            <Card key={mod.key}>
              <CardHeader className="py-4">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span>{mod.name}</span>
                  <Badge variant="outline">{mod.category}</Badge>
                </CardTitle>
                <CardDescription>{mod.summary}</CardDescription>
              </CardHeader>
              <CardContent className="pb-4 flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  {mod.description}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isAdding}
                  onClick={() => onAdd(mod.key, () => setOpen(false))}
                >
                  Add
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Plan() {
  const { activeTenantId } = useTenant();
  const { toast } = useToast();
  const { refresh, isRecomputing } = useRefreshAfterChange();

  const { data: plan, isLoading: isLoadingPlan } = useGetActivePlan(
    activeTenantId!,
    {
      query: {
        enabled: !!activeTenantId,
        queryKey: activeTenantId
          ? getGetActivePlanQueryKey(activeTenantId)
          : ["plan", "empty"],
      },
    },
  );

  const { data: modules = [], isLoading: isLoadingModules } =
    useListRuleModules();

  const createRule = useCreateRuleInstance();
  const deleteRule = useDeleteRuleInstance();
  const reorderRules = useReorderRuleInstances();

  const [pendingDelete, setPendingDelete] = useState<RuleInstance | null>(null);

  const moduleByKey = new Map(modules.map((m) => [m.key, m] as const));
  const instances = plan?.ruleInstances ?? [];

  const handleAdd = (key: string, onDone: () => void) => {
    if (!activeTenantId) return;
    createRule.mutate(
      { tenantId: activeTenantId, data: { ruleModuleKey: key } },
      {
        onSuccess: () => {
          toast({ title: "Rule added", description: "Recomputing commissions…" });
          refresh();
          onDone();
        },
        onError: (err: unknown) => {
          toast({
            title: "Failed to add rule",
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleDelete = () => {
    if (!pendingDelete) return;
    deleteRule.mutate(
      { ruleInstanceId: pendingDelete.id },
      {
        onSuccess: () => {
          toast({
            title: "Rule removed",
            description: "Recomputing commissions…",
          });
          refresh();
          setPendingDelete(null);
        },
        onError: (err: unknown) => {
          toast({
            title: "Failed to remove rule",
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          });
          setPendingDelete(null);
        },
      },
    );
  };

  const handleMove = (index: number, dir: -1 | 1) => {
    if (!activeTenantId) return;
    const target = index + dir;
    if (target < 0 || target >= instances.length) return;
    const ids = instances.map((r) => r.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorderRules.mutate(
      { tenantId: activeTenantId, data: { orderedIds: ids } },
      {
        onSuccess: () => refresh(),
        onError: (err: unknown) => {
          toast({
            title: "Failed to reorder",
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  const busy =
    isRecomputing ||
    createRule.isPending ||
    deleteRule.isPending ||
    reorderRules.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Commission Plan</h1>
          <p className="text-muted-foreground text-sm">
            Build and order the rules that calculate commissions. Changes
            recompute the ledger automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {busy && (
            <span className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Recomputing…
            </span>
          )}
          <AddRuleDialog
            modules={modules}
            onAdd={handleAdd}
            isAdding={createRule.isPending}
          />
        </div>
      </div>

      {isLoadingPlan || isLoadingModules ? (
        <Card>
          <CardContent className="p-6">
            <div className="h-8 w-1/2 bg-muted animate-pulse mb-4" />
            <div className="h-32 bg-muted animate-pulse" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{plan?.name ?? "Commission Plan"}</CardTitle>
            {plan && (
              <CardDescription>
                Effective {new Date(plan.effectiveFrom).toLocaleDateString()} ·{" "}
                {instances.length} rule{instances.length === 1 ? "" : "s"}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {instances.length > 0 ? (
              <Accordion type="single" collapsible className="w-full">
                {instances.map((instance, index) => (
                  <AccordionItem value={instance.id} key={instance.id}>
                    <div className="flex items-center gap-1">
                      <div className="flex flex-col">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={index === 0 || busy}
                          onClick={() => handleMove(index, -1)}
                          aria-label="Move up"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={index === instances.length - 1 || busy}
                          onClick={() => handleMove(index, 1)}
                          aria-label="Move down"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <AccordionTrigger className="hover:no-underline flex-1">
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={instance.enabled ? "default" : "secondary"}
                          >
                            {instance.enabled ? "Active" : "Disabled"}
                          </Badge>
                          <span className="font-medium">
                            {instance.ruleModuleName}
                          </span>
                          {moduleByKey.get(instance.ruleModuleKey)
                            ?.category && (
                            <Badge variant="outline">
                              {moduleByKey.get(instance.ruleModuleKey)!.category}
                            </Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={busy}
                        onClick={() => setPendingDelete(instance)}
                        aria-label="Remove rule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <AccordionContent>
                      <p className="text-sm text-muted-foreground mb-4">
                        {instance.description}
                      </p>
                      <RuleInstanceEditor
                        instance={instance}
                        module={moduleByKey.get(instance.ruleModuleKey)}
                        onSaved={() => refresh()}
                      />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="text-muted-foreground text-sm text-center p-8 border border-dashed rounded">
                No rules in this plan yet. Click “Add rule” to get started.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.ruleModuleName}” will be removed from the plan.
              Commissions it produced will be voided (or clawed back if already
              paid) on the next recompute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
