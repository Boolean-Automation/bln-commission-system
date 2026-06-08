import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useRequestStatementSignoff,
  useAcknowledgeStatementSignoff,
  useRescindStatementSignoff,
  getGetStatementForSelfQueryKey,
  getGetStatementForPersonQueryKey,
  type PeriodType,
  type Signoff,
} from "@workspace/api-client-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import { CheckCircle2, ClipboardCheck, Clock, AlertCircle } from "lucide-react";
import type { EffectiveRole } from "@/contexts/AuthContext";

type Props = {
  tenantId: string;
  personId: string;
  personName: string;
  periodType: PeriodType;
  periodKey: string;
  mode: "self" | "admin";
  effectiveRole: EffectiveRole;
  signoff: Signoff;
};

export function SignoffPanel({
  tenantId,
  personId,
  personName,
  periodType,
  periodKey,
  mode,
  effectiveRole,
  signoff,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const requestMut = useRequestStatementSignoff();
  const acknowledgeMut = useAcknowledgeStatementSignoff();
  const rescindMut = useRescindStatementSignoff();

  const isStaff =
    effectiveRole === "admin" ||
    effectiveRole === "platform_operator" ||
    effectiveRole === "super_operator";
  const isRep = effectiveRole === "rep" && mode === "self";

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: getGetStatementForSelfQueryKey(tenantId, {
        periodType,
        periodKey,
      }),
    });
    queryClient.invalidateQueries({
      queryKey: getGetStatementForPersonQueryKey(tenantId, personId, {
        periodType,
        periodKey,
      }),
    });
  };

  const handleRequest = () => {
    requestMut.mutate(
      { tenantId, personId, data: { periodType, periodKey } },
      {
        onSuccess: () => {
          toast({ title: "Validation requested" });
          invalidate();
        },
        onError: (err: unknown) => {
          toast({
            title: "Failed to request validation",
            description: (err as Error).message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleAcknowledge = () => {
    acknowledgeMut.mutate(
      { tenantId, data: { periodType, periodKey } },
      {
        onSuccess: () => {
          toast({ title: "Statement acknowledged" });
          invalidate();
        },
        onError: (err: unknown) => {
          toast({
            title: "Failed to acknowledge",
            description: (err as Error).message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleRescind = () => {
    rescindMut.mutate(
      { tenantId, personId, data: { periodType, periodKey } },
      {
        onSuccess: () => {
          toast({ title: "Request rescinded" });
          invalidate();
        },
        onError: (err: unknown) => {
          toast({
            title: "Failed to rescind",
            description: (err as Error).message,
            variant: "destructive",
          });
        },
      },
    );
  };

  if (signoff.state === "acknowledged") {
    return (
      <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <CheckCircle2 className="size-5 text-green-700 dark:text-green-400" />
          <div className="flex-1 text-sm">
            <div className="font-medium text-green-900 dark:text-green-200">
              Acknowledged by {personName}
            </div>
            {signoff.acknowledgedAt && (
              <div className="text-xs text-green-800 dark:text-green-400">
                on {formatDateTime(signoff.acknowledgedAt)}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (signoff.state === "requested") {
    if (isRep) {
      return (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <ClipboardCheck className="size-5 text-amber-700 dark:text-amber-400" />
            <div className="flex-1 text-sm">
              <div className="font-medium text-amber-900 dark:text-amber-200">
                Please review and acknowledge this statement
              </div>
              {signoff.requestedAt && (
                <div className="text-xs text-amber-800 dark:text-amber-400">
                  Requested
                  {signoff.requestedByName
                    ? ` by ${signoff.requestedByName}`
                    : ""}{" "}
                  on {formatDateTime(signoff.requestedAt)}
                </div>
              )}
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={acknowledgeMut.isPending}>
                  Acknowledge
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Acknowledge statement?</AlertDialogTitle>
                  <AlertDialogDescription>
                    By acknowledging, you confirm that you have reviewed this
                    statement and agree with the amounts shown. This action is
                    recorded in the audit log.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleAcknowledge}>
                    Acknowledge
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      );
    }
    if (isStaff && mode === "admin") {
      return (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <Clock className="size-5 text-amber-700 dark:text-amber-400" />
            <div className="flex-1 text-sm">
              <div className="font-medium text-amber-900 dark:text-amber-200">
                Waiting for {personName} to acknowledge
              </div>
              {signoff.requestedAt && (
                <div className="text-xs text-amber-800 dark:text-amber-400">
                  Requested on {formatDateTime(signoff.requestedAt)}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRescind}
              disabled={rescindMut.isPending}
            >
              Rescind request
            </Button>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
        <CardContent className="flex items-center gap-3 p-4 text-sm text-amber-900 dark:text-amber-200">
          <Clock className="size-5" />
          Awaiting acknowledgement from {personName}.
        </CardContent>
      </Card>
    );
  }

  if (isStaff && mode === "admin") {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <AlertCircle className="size-5 text-muted-foreground" />
          <div className="flex-1 text-sm">
            <div className="font-medium">Statement not yet sent for validation</div>
            <div className="text-xs text-muted-foreground">
              Ask {personName} to review and confirm this statement.
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleRequest}
            disabled={requestMut.isPending}
          >
            Request validation
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
}
