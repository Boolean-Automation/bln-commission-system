import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useListTenants } from "@workspace/api-client-react";
import type { Tenant } from "@workspace/api-client-react";

interface TenantContextType {
  activeTenantId: string | null;
  setActiveTenantId: (id: string) => void;
  activeTenant: Tenant | null;
  tenants: Tenant[];
  isLoading: boolean;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { data: tenants = [], isLoading } = useListTenants();
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);

  // Select the first tenant when none is selected, or when the currently
  // selected tenant no longer exists (e.g. after a re-seed created a new id).
  useEffect(() => {
    if (tenants.length === 0) return;
    const selectedExists = activeTenantId && tenants.some((t) => t.id === activeTenantId);
    if (!selectedExists) {
      setActiveTenantId(tenants[0].id);
    }
  }, [tenants, activeTenantId]);

  const activeTenant = tenants.find((t) => t.id === activeTenantId) || null;

  return (
    <TenantContext.Provider
      value={{
        activeTenantId,
        setActiveTenantId,
        activeTenant,
        tenants,
        isLoading,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}
