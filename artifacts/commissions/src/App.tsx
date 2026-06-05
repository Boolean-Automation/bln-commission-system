import React from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TenantProvider } from "@/contexts/TenantContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider, useAuthContext } from "@/contexts/AuthContext";
import { AuthGate } from "@/components/auth/AuthGate";
import { AppLayout } from "@/components/layout/AppLayout";
import NotFound from "@/pages/not-found";
import { Dashboard } from "@/pages/Dashboard";
import { Ledger } from "@/pages/Ledger";
import { People } from "@/pages/People";
import { Jobs } from "@/pages/Jobs";
import { Payroll } from "@/pages/Payroll";
import { Plan } from "@/pages/Plan";
import { EntryDetail } from "@/pages/EntryDetail";
import { Mapping } from "@/pages/Mapping";
import { Positions } from "@/pages/Positions";
import { Access } from "@/pages/Access";
import { RepView } from "@/pages/RepView";

const queryClient = new QueryClient();

function StaffRouter() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/ledger" component={Ledger} />
        <Route path="/ledger/:id" component={EntryDetail} />
        <Route path="/payroll" component={Payroll} />
        <Route path="/plan" component={Plan} />
        <Route path="/mapping" component={Mapping} />
        <Route path="/positions" component={Positions} />
        <Route path="/people" component={People} />
        <Route path="/jobs" component={Jobs} />
        <Route path="/access" component={Access} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

function RoleRouter() {
  const { effectiveRole } = useAuthContext();

  if (effectiveRole === "rep") {
    return (
      <WouterRouter base={base}>
        <RepView />
      </WouterRouter>
    );
  }

  return (
    <TenantProvider>
      <WouterRouter base={base}>
        <StaffRouter />
      </WouterRouter>
    </TenantProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <AuthGate>
              <RoleRouter />
            </AuthGate>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
