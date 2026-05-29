import React from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useListPeople, getListPeopleQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";

export function People() {
  const { activeTenantId } = useTenant();

  const { data: people = [], isLoading } = useListPeople(activeTenantId!, {
    query: {
      enabled: !!activeTenantId,
      queryKey: activeTenantId ? getListPeopleQueryKey(activeTenantId) : ["people", "empty"]
    }
  });

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">People</h1>
        <p className="text-muted-foreground text-sm">Mirrored personnel records from source data.</p>
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead className="text-right">YTD Sales</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-20 bg-muted animate-pulse rounded-full" /></TableCell>
                    <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-16 bg-muted animate-pulse rounded-full" /></TableCell>
                    <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : people.length > 0 ? (
                people.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell className="font-medium">{person.name}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {person.roles.map(r => (
                          <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{person.position || "-"}</TableCell>
                    <TableCell>
                      {person.active ? (
                        <div className="flex items-center text-sm text-emerald-600 gap-1">
                          <CheckCircle2 className="h-4 w-4" /> Active
                        </div>
                      ) : (
                        <div className="flex items-center text-sm text-muted-foreground gap-1">
                          <XCircle className="h-4 w-4" /> Inactive
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(person.startDate)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(person.ytdSales)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No people records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
