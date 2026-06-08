import React, { useMemo, useState } from "react";
import type { StatementItem, ThreadSummary } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  MessageSquarePlus,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { FormulaBreakdown } from "@/components/statement/FormulaBreakdown";
import { DealPanel } from "@/components/statement/DealPanel";

const STATE_VARIANT: Record<
  StatementItem["state"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  accrued: "secondary",
  payable: "default",
  paid: "default",
  clawed_back: "destructive",
  voided: "outline",
  disputed: "outline",
};

type Props = {
  item: StatementItem;
  threads: ThreadSummary[];
  onDiscuss: (entryId: string) => void;
};

export function StatementItemCard({ item, threads, onDiscuss }: Props) {
  const [open, setOpen] = useState(false);

  const entryThreads = useMemo(
    () => threads.filter((t) => t.entryId === item.entryId),
    [threads, item.entryId],
  );
  const openCount = entryThreads.filter((t) => t.status === "open").length;
  const hasAny = entryThreads.length > 0;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono">
                {item.type}
              </Badge>
              {item.ruleDescription && (
                <span className="text-sm font-medium text-muted-foreground">
                  {item.ruleDescription}
                </span>
              )}
            </div>
            {item.source.label && (
              <div className="text-xs text-muted-foreground">
                {item.source.label}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">
              {formatCurrency(item.amount)}
            </div>
            <Badge variant={STATE_VARIANT[item.state]} className="mt-1">
              {item.state}
            </Badge>
          </div>
        </div>

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start gap-2 px-2 text-xs text-muted-foreground"
            >
              {open ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              {open ? "Hide" : "Show"} calculation
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            <FormulaBreakdown formula={item.formula} />
            {item.deal && <DealPanel deal={item.deal} />}
          </CollapsibleContent>
        </Collapsible>

        <div className="flex items-center justify-between border-t pt-3">
          {hasAny ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MessageSquare className="size-3" />
              {openCount > 0
                ? `${openCount} open thread${openCount === 1 ? "" : "s"}`
                : `${entryThreads.length} resolved thread${entryThreads.length === 1 ? "" : "s"}`}
            </div>
          ) : (
            <span />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => onDiscuss(item.entryId)}
          >
            <MessageSquarePlus className="size-3" />
            Discuss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
