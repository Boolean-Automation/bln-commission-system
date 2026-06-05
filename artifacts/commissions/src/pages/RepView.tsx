import React from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, LogOut } from "lucide-react";
import logoUrl from "@assets/channels4_profile_1780667990826.jpg";

export function RepView() {
  const { displayName, accessibleTenants, logout } = useAuthContext();
  const company = accessibleTenants[0]?.name;

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="flex h-14 items-center justify-between border-b bg-card px-6">
        <div className="flex items-center gap-2">
          <img
            src={logoUrl}
            alt="Boolean Automation"
            className="h-6 w-6 rounded-sm object-cover"
          />
          <span className="text-sm font-medium">My Commissions</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{displayName}</span>
          <Button variant="ghost" size="sm" onClick={logout} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              Your commissions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Welcome{displayName ? `, ${displayName}` : ""}
              {company ? ` — ${company}` : ""}.
            </p>
            <p>
              Your personal commission statements will appear here. This view is
              read-only and is being built out.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
