import React, { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { Check, ChevronsUpDown, Building, Plus, AlertCircle } from "lucide-react";
import type { Tenant } from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { isSetupIncomplete } from "@/lib/setupStatus";

export function TenantSwitcher() {
  const { activeTenant, tenants, setActiveTenantId } = useTenant();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resumeTenant, setResumeTenant] = useState<Tenant | null>(null);

  if (!activeTenant) return null;

  const openNewCompany = () => {
    setResumeTenant(null);
    setWizardOpen(true);
  };

  const openResume = (tenant: Tenant) => {
    setActiveTenantId(tenant.id);
    setResumeTenant(tenant);
    setWizardOpen(true);
  };

  const activeIncomplete = isSetupIncomplete(activeTenant);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground border border-sidebar-border bg-sidebar-accent/30"
          >
            <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-sm bg-sidebar-primary text-sidebar-primary-foreground">
              <Building className="size-4" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-none">
              <span className="truncate font-semibold text-sm" title={activeTenant.name}>
                {activeTenant.name}
              </span>
              <span className="truncate text-xs text-sidebar-foreground/60">
                {activeIncomplete ? (
                  <span className="flex items-center gap-1 text-amber-500">
                    <AlertCircle className="size-3 shrink-0" />
                    Setup incomplete
                  </span>
                ) : (
                  activeTenant.slug
                )}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 shrink-0 text-sidebar-foreground/50" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-md"
          align="start"
          side="bottom"
          sideOffset={4}
        >
          {tenants.map((tenant) => {
            const incomplete = isSetupIncomplete(tenant);
            return (
              <DropdownMenuItem
                key={tenant.id}
                onClick={() => setActiveTenantId(tenant.id)}
                className="flex items-center gap-2 p-2 cursor-pointer"
              >
                <div className="flex aspect-square size-6 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
                  <Building className="size-3" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium" title={tenant.name}>
                    {tenant.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{tenant.slug}</span>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  {incomplete && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 bg-amber-500/10 text-amber-600 text-[10px] gap-1 px-1.5 py-0"
                    >
                      <AlertCircle className="size-3" />
                      Incomplete
                    </Badge>
                  )}
                  {tenant.id === activeTenant.id && (
                    <Check className="size-4 text-primary" />
                  )}
                </div>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={openNewCompany}
            className="flex items-center gap-2 p-2 cursor-pointer"
          >
            <div className="flex aspect-square size-6 items-center justify-center rounded-sm border border-dashed text-muted-foreground">
              <Plus className="size-3" />
            </div>
            <span className="font-medium">Add company</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {activeIncomplete && (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 w-full justify-start gap-2 border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 hover:text-amber-800"
          onClick={() => openResume(activeTenant)}
        >
          <AlertCircle className="size-3.5" />
          Finish setup
        </Button>
      )}

      <OnboardingWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        resumeTenant={resumeTenant}
        onCreated={(tenantId) => setActiveTenantId(tenantId)}
      />
    </>
  );
}
