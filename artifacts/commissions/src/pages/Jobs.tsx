import React from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useListJobs, getListJobsQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { JobSourceMappingSheet } from "@/components/jobs/JobSourceMappingSheet";

export function Jobs() {
  const { activeTenantId } = useTenant();

  const { data: jobs = [], isLoading } = useListJobs(activeTenantId!, {
    query: {
      enabled: !!activeTenantId,
      queryKey: activeTenantId ? getListJobsQueryKey(activeTenantId) : ["jobs", "empty"]
    }
  });

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground text-sm">Mirrored job records from source data.</p>
        </div>
        {activeTenantId && <JobSourceMappingSheet tenantId={activeTenantId} />}
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead>Job Name</TableHead>
                <TableHead>Job Contact Name</TableHead>
                <TableHead>Job Status</TableHead>
                <TableHead>Sales</TableHead>
                <TableHead>Coordinator</TableHead>
                <TableHead>Job End Date</TableHead>
                <TableHead className="text-right">Total Job Amount</TableHead>
                <TableHead className="text-right">Gross Profit $</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-20 bg-muted animate-pulse rounded-full" /></TableCell>
                    <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                    <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : jobs.length > 0 ? (
                jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium text-sm max-w-[220px] truncate" title={job.jobName || job.jobNumber}>{job.jobName || job.jobNumber}</TableCell>
                    <TableCell className="max-w-[150px] truncate" title={job.customer || ""}>{job.customer || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={job.cancelled ? 'destructive' : 'secondary'} className="capitalize">
                        {job.status || (job.cancelled ? "cancelled" : "active")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{job.salesRep || "-"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{job.manager || "-"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(job.completedDate)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(job.totalAmount)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <div className="flex flex-col items-end">
                        <span>{formatCurrency(job.gpAmount)}</span>
                        {job.gpPct != null && <span className="text-[10px] text-muted-foreground">{job.gpPct}%</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    No job records found.
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
