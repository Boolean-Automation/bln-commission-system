import React from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background p-6">
      {children}
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, login, effectiveRole, context } =
    useAuthContext();

  if (isLoading) {
    return (
      <FullScreen>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </FullScreen>
    );
  }

  if (!isAuthenticated) {
    return (
      <FullScreen>
        <div className="w-full max-w-sm rounded-lg border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-primary">
            <span className="font-mono text-sm font-bold text-primary-foreground">
              BS
            </span>
          </div>
          <h1 className="text-lg font-semibold">Boolean Strategies</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Commission operator console
          </p>
          <Button className="mt-6 w-full" onClick={login}>
            Sign In
          </Button>
        </div>
      </FullScreen>
    );
  }

  // Authenticated but no role assigned yet (and not the bootstrap operator).
  if (context && effectiveRole === "none") {
    return (
      <FullScreen>
        <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h1 className="text-lg font-semibold">No access yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account isn't linked to a company. Ask an administrator to
            grant you access, then sign in again.
          </p>
        </div>
      </FullScreen>
    );
  }

  return <>{children}</>;
}
