import type { LucideIcon } from "lucide-react";
import {
  BadgeDollarSign,
  Banknote,
  CircleDollarSign,
  Medal,
  Percent,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { KpiKey, RepDashboardSummary } from "@workspace/api-client-react";
import { formatCurrency, formatPercent } from "@/lib/format";

type CatalogItem = {
  label: string;
  Icon: LucideIcon;
  value: (summary: RepDashboardSummary) => string;
};

export const REP_KPI_KEYS: KpiKey[] = [
  "earnedInPeriod",
  "attainmentPct",
  "rank",
  "projectedEarning",
  "quota",
  "ote",
  "accrued",
  "payable",
  "paid",
  "deltaToQuota",
];

export const repKpiCatalog: Record<KpiKey, CatalogItem> = {
  earnedInPeriod: {
    label: "Earned This Period",
    Icon: CircleDollarSign,
    value: (summary) => formatCurrency(summary.earnedInPeriod),
  },
  attainmentPct: {
    label: "Quota Attainment",
    Icon: Percent,
    value: (summary) => formatPercent(summary.attainmentPct),
  },
  rank: {
    label: "Peer Rank",
    Icon: Medal,
    value: (summary) =>
      summary.rank != null ? `#${summary.rank} of ${summary.peerCount}` : "-",
  },
  projectedEarning: {
    label: "Projected Earning",
    Icon: TrendingUp,
    value: (summary) =>
      formatCurrency(summary.projection.projectedEarning),
  },
  quota: {
    label: "Quota",
    Icon: Target,
    value: (summary) => formatCurrency(summary.quota),
  },
  ote: {
    label: "OTE",
    Icon: BadgeDollarSign,
    value: (summary) => formatCurrency(summary.ote),
  },
  accrued: {
    label: "Accrued",
    Icon: Wallet,
    value: (summary) => formatCurrency(summary.commissionByState.accrued),
  },
  payable: {
    label: "Payable",
    Icon: Banknote,
    value: (summary) => formatCurrency(summary.commissionByState.payable),
  },
  paid: {
    label: "Paid",
    Icon: BadgeDollarSign,
    value: (summary) => formatCurrency(summary.commissionByState.paid),
  },
  deltaToQuota: {
    label: "Delta To Quota",
    Icon: Target,
    value: (summary) => formatCurrency(summary.deltaToQuota),
  },
};
