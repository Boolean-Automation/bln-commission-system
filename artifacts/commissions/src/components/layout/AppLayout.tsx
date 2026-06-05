import React from "react";
import { Link, useLocation } from "wouter";
import { useTenant } from "@/contexts/TenantContext";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTenant,
  getGetTenantQueryKey,
  useSyncFromAirtable,
} from "@workspace/api-client-react";
import { TenantSwitcher } from "./TenantSwitcher";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import logoUrl from "@assets/channels4_profile_1780667990826.jpg";
import { 
  LayoutDashboard, 
  BookOpen, 
  Wallet, 
  Map, 
  Users, 
  Briefcase, 
  Settings2,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Tags,
  ShieldCheck,
  LogOut
} from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  platform_operator: "Platform Operator",
  admin: "Admin",
  rep: "Sales Rep",
  none: "No access",
};

function UserMenu() {
  const { displayName, email, effectiveRole, logout } = useAuthContext();
  const initials =
    displayName
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium sm:inline">
            {displayName}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="font-medium">{displayName}</div>
          {email && (
            <div className="text-xs font-normal text-muted-foreground">
              {email}
            </div>
          )}
          <div className="mt-1 text-xs font-normal text-muted-foreground">
            {ROLE_LABELS[effectiveRole] ?? effectiveRole}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="gap-2">
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarSync({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: tenant } = useGetTenant(tenantId, {
    query: { enabled: !!tenantId, queryKey: getGetTenantQueryKey(tenantId) },
  });
  const syncMutation = useSyncFromAirtable();

  const handleSync = () => {
    syncMutation.mutate(
      { tenantId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(tenantId) });
          toast({ title: "Sync completed successfully" });
        },
        onError: (err: any) => {
          toast({ title: "Sync failed", description: err?.message, variant: "destructive" });
        },
      },
    );
  };

  const connected = tenant?.airtableConnected;

  return (
    <Button
      onClick={handleSync}
      disabled={syncMutation.isPending || !connected}
      size="sm"
      className="w-full justify-center gap-2"
      title={connected ? "Sync data from Airtable" : "Connect an Airtable base first"}
    >
      {syncMutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      {syncMutation.isPending ? "Syncing..." : "Sync Now"}
    </Button>
  );
}

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { activeTenant, activeTenantId, isLoading } = useTenant();

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Ledger", href: "/ledger", icon: BookOpen },
    { name: "Payroll", href: "/payroll", icon: Wallet },
  ];

  const configuration = [
    { name: "Commission Plan", href: "/plan", icon: CheckCircle2 },
    { name: "Positions", href: "/positions", icon: Tags },
    { name: "Schema Mapping", href: "/mapping", icon: Settings2 },
  ];

  const sourceData = [
    { name: "People", href: "/people", icon: Users },
    { name: "Jobs", href: "/jobs", icon: Briefcase },
  ];

  const administration = [
    { name: "Access", href: "/access", icon: ShieldCheck },
  ];

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          <SidebarHeader className="p-4 border-b border-sidebar-border/50">
            <div className="mb-4">
              <h2 className="text-lg font-bold tracking-tight text-sidebar-primary-foreground flex items-center gap-2">
                <img
                  src={logoUrl}
                  alt="Boolean Automation"
                  className="h-6 w-6 rounded-sm object-cover"
                />
                Boolean Automation
              </h2>
            </div>
            {!isLoading && <TenantSwitcher />}
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50">Core</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigation.map((item) => {
                    const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                    return (
                      <SidebarMenuItem key={item.name}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.name}
                        >
                          <Link href={item.href}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50">Configuration</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {configuration.map((item) => {
                    const isActive = location.startsWith(item.href);
                    return (
                      <SidebarMenuItem key={item.name}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.name}
                        >
                          <Link href={item.href}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50">Source Data</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {sourceData.map((item) => {
                    const isActive = location.startsWith(item.href);
                    return (
                      <SidebarMenuItem key={item.name}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.name}
                        >
                          <Link href={item.href}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50">Administration</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {administration.map((item) => {
                    const isActive = location.startsWith(item.href);
                    return (
                      <SidebarMenuItem key={item.name}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.name}
                        >
                          <Link href={item.href}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-4 border-t border-sidebar-border/50 space-y-3">
            {activeTenantId && <SidebarSync tenantId={activeTenantId} />}
            <div className="text-xs text-sidebar-foreground/40 font-mono">
              OPERATOR CONSOLE v1.0
            </div>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-14 flex items-center justify-between px-6 border-b bg-card">
            {activeTenant ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{activeTenant.name}</span>
                <span>/</span>
                <span className="capitalize">{location === "/" ? "Dashboard" : location.slice(1)}</span>
              </div>
            ) : (
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            )}
            <UserMenu />
          </header>
          <div className="flex-1 overflow-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
