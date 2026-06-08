import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useOpenStatementThreadForSelf,
  useOpenStatementThreadForPerson,
  getGetStatementThreadsForSelfQueryKey,
  getGetStatementThreadsForPersonQueryKey,
  type PeriodType,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Props = {
  tenantId: string;
  personId: string;
  periodType: PeriodType;
  periodKey: string;
  mode: "self" | "admin";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId?: string;
  defaultSubject?: string;
};

export function NewThreadDialog({
  tenantId,
  personId,
  periodType,
  periodKey,
  mode,
  open,
  onOpenChange,
  entryId,
  defaultSubject,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (open) {
      setSubject(defaultSubject ?? "");
      setBody("");
    }
  }, [open, defaultSubject]);

  const selfMut = useOpenStatementThreadForSelf();
  const personMut = useOpenStatementThreadForPerson();
  const isPending = selfMut.isPending || personMut.isPending;

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: getGetStatementThreadsForSelfQueryKey(tenantId, {
        periodType,
        periodKey,
      }),
    });
    queryClient.invalidateQueries({
      queryKey: getGetStatementThreadsForPersonQueryKey(
        tenantId,
        personId,
        { periodType, periodKey },
      ),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    const data = {
      periodType,
      periodKey,
      body: trimmed,
      ...(subject.trim().length > 0 ? { subject: subject.trim() } : {}),
      ...(entryId ? { entryId } : {}),
    };

    const onSuccess = () => {
      toast({ title: "Discussion started" });
      invalidate();
      onOpenChange(false);
    };
    const onError = (err: unknown) => {
      toast({
        title: "Failed to start discussion",
        description: (err as Error).message,
        variant: "destructive",
      });
    };

    if (mode === "self") {
      selfMut.mutate({ tenantId, data }, { onSuccess, onError });
    } else {
      personMut.mutate({ tenantId, personId, data }, { onSuccess, onError });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {entryId ? "Discuss this item" : "Start a discussion"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Subject (optional)</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="A short title for this thread"
            />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              required
              placeholder="Describe what you'd like to discuss…"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || body.trim().length === 0}
            >
              Start discussion
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
