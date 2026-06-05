import React, { createContext, useContext, ReactNode } from "react";
import { useAuth as useReplitAuth } from "@workspace/replit-auth-web";
import {
  useGetAuthContext,
  getGetAuthContextQueryKey,
} from "@workspace/api-client-react";
import type {
  AuthContext as AuthContextData,
  AccessibleTenant,
  MembershipRole,
} from "@workspace/api-client-react";

export type EffectiveRole = MembershipRole | "none";

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  /** Resolved RBAC context from the server, or null until loaded. */
  context: AuthContextData | null;
  isOperator: boolean;
  /** Boolean Super Admin — the only role that can manage platform operators. */
  isSuperOperator: boolean;
  /** Highest-privilege role across all of the user's memberships. */
  effectiveRole: EffectiveRole;
  accessibleTenants: AccessibleTenant[];
  displayName: string;
  email: string | null;
}

const Ctx = createContext<AuthContextType | undefined>(undefined);

function deriveRole(context: AuthContextData | null): EffectiveRole {
  if (!context) return "none";
  if (context.isSuperOperator) return "super_operator";
  if (context.isPlatformOperator) return "platform_operator";
  if (context.memberships.some((m) => m.role === "admin")) return "admin";
  if (context.memberships.some((m) => m.role === "rep")) return "rep";
  return "none";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, login, logout } =
    useReplitAuth();

  // Only resolve the RBAC context once we know the session is authenticated.
  const {
    data: context,
    isLoading: ctxLoading,
  } = useGetAuthContext({
    query: { enabled: isAuthenticated, queryKey: getGetAuthContextQueryKey() },
  });

  const resolved = context ?? null;
  const effectiveRole = deriveRole(resolved);
  const user = resolved?.user ?? null;
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.email ||
    "Account";

  return (
    <Ctx.Provider
      value={{
        isLoading: authLoading || (isAuthenticated && ctxLoading),
        isAuthenticated,
        login,
        logout,
        context: resolved,
        isOperator: resolved?.isPlatformOperator ?? false,
        isSuperOperator: resolved?.isSuperOperator ?? false,
        effectiveRole,
        accessibleTenants: resolved?.accessibleTenants ?? [],
        displayName,
        email: user?.email ?? null,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(Ctx);
  if (ctx === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return ctx;
}
