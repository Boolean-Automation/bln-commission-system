import React, { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { Check, ChevronsUpDown, Building, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export function TenantSwitcher() {
  const { activeTenant, tenants, setActiveTenantId } = useTenant();
  const [wizardOpen, setWizardOpen] = useState(false);

  if (!activeTenant) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground border border-sidebar-border bg-sidebar-accent/30"
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-sm bg-sidebar-primary text-sidebar-primary-foreground">
              <Building className="size-4" />
            </div>
            <div className="flex flex-col gap-0.5 leading-none">
              <span className="font-semibold text-sm">{activeTenant.name}</span>
              <span className="text-xs text-sidebar-foreground/60">{activeTenant.slug}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/50" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-md"
          align="start"
          side="bottom"
          sideOffset={4}
        >
          {tenants.map((tenant) => (
            <DropdownMenuItem
              key={tenant.id}
              onClick={() => setActiveTenantId(tenant.id)}
              className="flex items-center gap-2 p-2 cursor-pointer"
            >
              <div className="flex aspect-square size-6 items-center justify-center rounded-sm bg-muted text-muted-foreground">
                <Building className="size-3" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{tenant.name}</span>
                <span className="text-xs text-muted-foreground">{tenant.slug}</span>
              </div>
              {tenant.id === activeTenant.id && (
                <Check className="ml-auto size-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-2 p-2 cursor-pointer"
          >
            <div className="flex aspect-square size-6 items-center justify-center rounded-sm border border-dashed text-muted-foreground">
              <Plus className="size-3" />
            </div>
            <span className="font-medium">Add company</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OnboardingWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={(tenantId) => setActiveTenantId(tenantId)}
      />
    </>
  );
}
