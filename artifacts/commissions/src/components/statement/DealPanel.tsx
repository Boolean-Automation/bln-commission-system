import React from "react";
import { Briefcase } from "lucide-react";
import type { StatementDeal } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";

type Props = { deal: StatementDeal };

function FieldRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed pb-1 last:border-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

export function DealPanel({ deal }: Props) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-2 flex items-start gap-2">
        <Briefcase className="mt-0.5 size-4 text-muted-foreground" />
        <div>
          <div className="text-sm font-semibold">
            #{deal.jobNumber}
            {deal.jobName ? (
              <span className="text-muted-foreground"> — {deal.jobName}</span>
            ) : null}
          </div>
          {deal.customer && (
            <div className="text-xs text-muted-foreground">{deal.customer}</div>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <FieldRow
          label="Total Amount"
          value={deal.totalAmount != null ? formatCurrency(deal.totalAmount) : "—"}
        />
        <FieldRow
          label="GP Amount"
          value={deal.gpAmount != null ? formatCurrency(deal.gpAmount) : "—"}
        />
        <FieldRow
          label="GP %"
          value={deal.gpPct != null ? `${deal.gpPct.toFixed(1)}%` : "—"}
        />
        <FieldRow label="Status" value={deal.status} />
        <FieldRow label="Signed Date" value={formatDate(deal.signedDate)} />
        <FieldRow label="Completed Date" value={formatDate(deal.completedDate)} />
      </dl>
    </div>
  );
}
