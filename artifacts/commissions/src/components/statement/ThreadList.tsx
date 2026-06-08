import React, { useMemo, useState } from "react";
import {
  useGetStatementThreadsForSelf,
  useGetStatementThreadsForPerson,
  getGetStatementThreadsForSelfQueryKey,
  getGetStatementThreadsForPersonQueryKey,
  type PeriodType,
  type ThreadWithMessages,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MessageSquare } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { ThreadView } from "./ThreadView";
import type { EffectiveRole } from "@/contexts/AuthContext";

type Props = {
  tenantId: string;
  personId: string;
  periodType: PeriodType;
  periodKey: string;
  mode: "self" | "admin";
  effectiveRole: EffectiveRole;
};

export function ThreadList({
  tenantId,
  personId,
  periodType,
  periodKey,
  mode,
  effectiveRole,
}: Props) {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const selfQuery = useGetStatementThreadsForSelf(
    tenantId,
    { periodType, periodKey },
    {
      query: {
        enabled: mode === "self" && !!tenantId,
        queryKey: getGetStatementThreadsForSelfQueryKey(tenantId, {
          periodType,
          periodKey,
        }),
      },
    },
  );

  const personQuery = useGetStatementThreadsForPerson(
    tenantId,
    personId,
    { periodType, periodKey },
    {
      query: {
        enabled: mode === "admin" && !!tenantId && !!personId,
        queryKey: getGetStatementThreadsForPersonQueryKey(
          tenantId,
          personId,
          { periodType, periodKey },
        ),
      },
    },
  );

  const data = mode === "self" ? selfQuery.data : personQuery.data;
  const threads = useMemo(() => data?.threads ?? [], [data]);
  const activeThread = useMemo<ThreadWithMessages | null>(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  if (threads.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-5 text-sm text-muted-foreground">
          No discussions yet for this statement.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {threads.map((thread) => {
          const label =
            thread.subject ??
            (thread.entryId ? "Discussion on a line item" : "Discussion");
          return (
            <Card key={thread.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <MessageSquare className="size-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{label}</span>
                    <Badge
                      variant={thread.status === "open" ? "default" : "secondary"}
                    >
                      {thread.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {thread.messageCount} message
                    {thread.messageCount === 1 ? "" : "s"} ·{" "}
                    {formatDateTime(thread.lastMessageAt)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveThreadId(thread.id)}
                >
                  Open
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Sheet
        open={activeThread !== null}
        onOpenChange={(open) => {
          if (!open) setActiveThreadId(null);
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-4 sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle>Discussion</SheetTitle>
          </SheetHeader>
          {activeThread && (
            <ThreadView
              tenantId={tenantId}
              personId={personId}
              periodType={periodType}
              periodKey={periodKey}
              thread={activeThread}
              mode={mode}
              effectiveRole={effectiveRole}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
