import React from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TenantProvider } from "@/contexts/TenantContext";
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

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/ledger" component={Ledger} />
        <Route path="/ledger/:id" component={EntryDetail} />
        <Route path="/payroll" component={Payroll} />
        <Route path="/plan" component={Plan} />
        <Route path="/mapping" component={Mapping} />
        <Route path="/people" component={People} />
        <Route path="/jobs" component={Jobs} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <TenantProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </TenantProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
