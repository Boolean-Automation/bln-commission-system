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
import { TenantSwitcher } from "./TenantSwitcher";
import { 
  LayoutDashboard, 
  BookOpen, 
  Wallet, 
  Map, 
  Users, 
  Briefcase, 
  Settings2,
  CheckCircle2
} from "lucide-react";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { activeTenant, isLoading } = useTenant();

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Ledger", href: "/ledger", icon: BookOpen },
    { name: "Payroll", href: "/payroll", icon: Wallet },
  ];

  const configuration = [
    { name: "Commission Plan", href: "/plan", icon: CheckCircle2 },
    { name: "Schema Mapping", href: "/mapping", icon: Settings2 },
  ];

  const sourceData = [
    { name: "People", href: "/people", icon: Users },
    { name: "Jobs", href: "/jobs", icon: Briefcase },
  ];

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          <SidebarHeader className="p-4 border-b border-sidebar-border/50">
            <div className="mb-4">
              <h2 className="text-lg font-bold tracking-tight text-sidebar-primary-foreground flex items-center gap-2">
                <div className="h-6 w-6 rounded-sm bg-sidebar-primary flex items-center justify-center">
                  <span className="text-xs font-mono text-white">BS</span>
                </div>
                Boolean
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
          </SidebarContent>

          <SidebarFooter className="p-4 border-t border-sidebar-border/50 text-xs text-sidebar-foreground/40 font-mono">
            OPERATOR CONSOLE v1.0
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-14 flex items-center px-6 border-b bg-card">
            {activeTenant ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{activeTenant.name}</span>
                <span>/</span>
                <span className="capitalize">{location === "/" ? "Dashboard" : location.slice(1)}</span>
              </div>
            ) : (
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            )}
          </header>
          <div className="flex-1 overflow-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
