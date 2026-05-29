import React, { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useListCommissions, getListCommissionsQueryKey, CommissionState, CommissionType } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, ChevronRight } from "lucide-react";

export function Ledger() {
  const { activeTenantId } = useTenant();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<CommissionState | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<CommissionType | "ALL">("ALL");

  const queryParams = {
    ...(stateFilter !== "ALL" && { state: stateFilter }),
    ...(typeFilter !== "ALL" && { type: typeFilter }),
    ...(search && { search })
  };

  const { data: commissions = [], isLoading } = useListCommissions(activeTenantId!, queryParams, {
    query: {
      enabled: !!activeTenantId,
      queryKey: activeTenantId ? getListCommissionsQueryKey(activeTenantId, queryParams) : ["commissions", "empty"]
    }
  });

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Commission Ledger</h1>
          <p className="text-muted-foreground text-sm">Review and manage all commission entries.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search entries..." 
            className="pl-8 bg-background" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Select value={stateFilter} onValueChange={(v: any) => setStateFilter(v)}>
            <SelectTrigger className="w-[140px] bg-background">
              <SlidersHorizontal className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All States</SelectItem>
              {Object.values(CommissionState).map(state => (
                <SelectItem key={state} value={state}>{state.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
            <SelectTrigger className="w-[140px] bg-background">
              <SlidersHorizontal className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              {Object.values(CommissionType).map(type => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead>Earner</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-12 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-20 bg-muted animate-pulse rounded-full" /></TableCell>
                    <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))
              ) : commissions.length > 0 ? (
                commissions.map((entry) => (
                  <TableRow key={entry.id} className="group">
                    <TableCell className="font-medium">{entry.personName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{entry.type}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate" title={entry.sourceLabel || entry.sourceId || "-"}>
                      {entry.sourceLabel || entry.sourceId || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={entry.state === 'payable' ? 'default' : entry.state === 'paid' ? 'secondary' : 'outline'}
                        className="capitalize"
                      >
                        {entry.state.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(entry.createdAt)}</TableCell>
                    <TableCell className="text-right font-mono font-medium">{formatCurrency(entry.amount)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 h-8 w-8" asChild>
                        <Link href={`/ledger/${entry.id}`}>
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No commission entries found.
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
