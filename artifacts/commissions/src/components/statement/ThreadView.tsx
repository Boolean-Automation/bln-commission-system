import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePostThreadMessage,
  useResolveStatementThread,
  useReopenStatementThread,
  getGetStatementThreadsForSelfQueryKey,
  getGetStatementThreadsForPersonQueryKey,
  type PeriodType,
  type ThreadWithMessages,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import type { EffectiveRole } from "@/contexts/AuthContext";

type Props = {
  tenantId: string;
  personId: string;
  periodType: PeriodType;
  periodKey: string;
  thread: ThreadWithMessages;
  mode: "self" | "admin";
  effectiveRole: EffectiveRole;
};

export function ThreadView({
  tenantId,
  personId,
  periodType,
  periodKey,
  thread,
  mode,
  effectiveRole,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const postMut = usePostThreadMessage();
  const resolveMut = useResolveStatementThread();
  const reopenMut = useReopenStatementThread();

  const isStaff =
    effectiveRole === "admin" ||
    effectiveRole === "platform_operator" ||
    effectiveRole === "super_operator";

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: getGetStatementThreadsForSelfQueryKey(tenantId, {
        periodType,
        periodKey,
      }),
    });
    queryClient.invalidateQueries({
      queryKey: getGetStatementThreadsForPersonQueryKey(tenantId, personId, {
        periodType,
        periodKey,
      }),
    });
  };

  const handleSend = () => {
    const body = draft.trim();
    if (body.length === 0) return;
    postMut.mutate(
      { tenantId, threadId: thread.id, data: { body } },
      {
        onSuccess: () => {
          setDraft("");
          invalidate();
        },
        onError: (err: unknown) => {
          toast({
            title: "Failed to send",
            description: (err as Error).message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleResolve = () => {
    resolveMut.mutate(
      { tenantId, threadId: thread.id },
      {
        onSuccess: () => {
          toast({ title: "Thread resolved" });
          invalidate();
        },
        onError: (err: unknown) => {
          toast({
            title: "Failed to resolve",
            description: (err as Error).message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleReopen = () => {
    reopenMut.mutate(
      { tenantId, threadId: thread.id },
      {
        onSuccess: () => {
          toast({ title: "Thread reopened" });
          invalidate();
        },
        onError: (err: unknown) => {
          toast({
            title: "Failed to reopen",
            description: (err as Error).message,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant={thread.status === "open" ? "default" : "secondary"}>
            {thread.status}
          </Badge>
          {thread.subject && (
            <span className="text-sm font-medium">{thread.subject}</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          Opened by {thread.openedByName ?? "Unknown"}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {thread.messages.map((m) => (
          <div
            key={m.id}
            className="rounded-md border bg-card p-3"
            data-testid={`thread-message-${m.id}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {m.authorName ?? m.authorUserId}
              </span>
              <span>
                <Badge variant="outline" className="mr-2">
                  {m.authorRoleAtPost}
                </Badge>
                {formatDateTime(m.createdAt)}
              </span>
            </div>
            <div className="mt-2 whitespace-pre-wrap text-sm">{m.body}</div>
          </div>
        ))}
      </div>

      {thread.status === "open" ? (
        <div className="space-y-2">
          <Textarea
            placeholder="Write a reply…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
          />
          <div className="flex items-center justify-between gap-2">
            {isStaff ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResolve}
                disabled={resolveMut.isPending}
              >
                Mark resolved
              </Button>
            ) : (
              <span />
            )}
            <Button
              size="sm"
              onClick={handleSend}
              disabled={postMut.isPending || draft.trim().length === 0}
            >
              Send
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
          <span>This thread has been resolved.</span>
          {isStaff && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReopen}
              disabled={reopenMut.isPending}
            >
              Reopen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
