import React, { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { 
  useGetActivePlan, 
  getGetActivePlanQueryKey,
  useListRuleModules,
  useUpdateRuleInstance,
  type RuleInstance
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

function RuleInstanceEditor({ instance }: { instance: RuleInstance }) {
  const { activeTenantId } = useTenant();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateRule = useUpdateRuleInstance();

  const [enabled, setEnabled] = useState(instance.enabled);
  const [paramsJson, setParamsJson] = useState(JSON.stringify(instance.params, null, 2));

  const handleSave = () => {
    try {
      const parsedParams = JSON.parse(paramsJson);
      updateRule.mutate({
        ruleInstanceId: instance.id,
        data: { enabled, params: parsedParams }
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetActivePlanQueryKey(activeTenantId!) });
          toast({ title: "Rule updated successfully" });
        },
        onError: (err: any) => {
          toast({ title: "Failed to update rule", description: err.message, variant: "destructive" });
        }
      });
    } catch (e) {
      toast({ title: "Invalid JSON params", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Enabled</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <div className="space-y-2">
        <span className="text-sm font-medium">Parameters (JSON)</span>
        <Textarea 
          value={paramsJson}
          onChange={(e) => setParamsJson(e.target.value)}
          className="font-mono text-sm h-32"
        />
      </div>
      <div className="flex justify-end">
        <Button 
          size="sm" 
          onClick={handleSave} 
          disabled={updateRule.isPending || (enabled === instance.enabled && paramsJson === JSON.stringify(instance.params, null, 2))}
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
}

export function Plan() {
  const { activeTenantId } = useTenant();

  const { data: plan, isLoading: isLoadingPlan } = useGetActivePlan(activeTenantId!, {
    query: {
      enabled: !!activeTenantId,
      queryKey: activeTenantId ? getGetActivePlanQueryKey(activeTenantId) : ["plan", "empty"]
    }
  });

  const { data: modules = [], isLoading: isLoadingModules } = useListRuleModules();

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Commission Plan</h1>
        <p className="text-muted-foreground text-sm">Configure how commissions are calculated.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Active Plan</h2>
          {isLoadingPlan ? (
            <Card><CardContent className="p-6"><div className="h-8 w-1/2 bg-muted animate-pulse mb-4" /><div className="h-32 bg-muted animate-pulse" /></CardContent></Card>
          ) : plan ? (
            <Card>
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>Effective: {new Date(plan.effectiveFrom).toLocaleDateString()}</CardDescription>
              </CardHeader>
              <CardContent>
                {plan.ruleInstances && plan.ruleInstances.length > 0 ? (
                  <Accordion type="single" collapsible className="w-full">
                    {plan.ruleInstances.map((instance) => (
                      <AccordionItem value={instance.id} key={instance.id}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-3">
                            <Badge variant={instance.enabled ? "default" : "secondary"}>
                              {instance.enabled ? "Active" : "Disabled"}
                            </Badge>
                            <span className="font-medium">{instance.ruleModuleName}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="text-sm text-muted-foreground mb-4">
                            {instance.description}
                          </div>
                          <RuleInstanceEditor instance={instance} />
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                ) : (
                  <div className="text-muted-foreground text-sm text-center p-4 border border-dashed rounded">
                    No rules configured in this plan.
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="p-6 text-center text-muted-foreground">No active plan found.</CardContent></Card>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Rule Library</h2>
          {isLoadingModules ? (
            <Card><CardContent className="p-6"><div className="h-32 bg-muted animate-pulse" /></CardContent></Card>
          ) : (
            <div className="space-y-3">
              {modules.map(mod => (
                <Card key={mod.key}>
                  <CardHeader className="py-4">
                    <CardTitle className="text-base flex items-center justify-between">
                      {mod.name}
                      <Badge variant="outline">{mod.category}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <p className="text-sm text-muted-foreground">{mod.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
