import React, { useMemo, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import {
  useListPeople,
  getListPeopleQueryKey,
  useListManualInputs,
  getListManualInputsQueryKey,
  useUpsertManualInput,
  useDeleteManualInput,
  useGetManualInputEvents,
  getGetManualInputEventsQueryKey,
  type Person,
  type ManualInput,
  type PeriodType,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Check, X, History, Target, Loader2 } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  PERIOD_TYPE_OPTIONS,
  periodKeyOptions,
  currentPeriodKey,
  formatPeriodKey,
} from "@/lib/periods";

type Draft = {
  quota: string;
  ote: string;
  acceleratorThreshold: string;
  acceleratorMultiplier: string;
  notes: string;
};

function toDraft(input: ManualInput | undefined): Draft {
  return {
    quota: input?.quota != null ? String(input.quota) : "",
    ote: input?.ote != null ? String(input.ote) : "",
    acceleratorThreshold:
      input?.acceleratorThreshold != null
        ? String(input.acceleratorThreshold)
        : "",
    acceleratorMultiplier:
      input?.acceleratorMultiplier != null
        ? String(input.acceleratorMultiplier)
        : "",
    notes: input?.notes ?? "",
  };
}

function parseNumber(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined; // invalid
  return n;
}

function HistoryDialog({
  tenantId,
  manualInputId,
  open,
  onOpenChange,
}: {
  tenantId: string;
  manualInputId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: events, isLoading } = useGetManualInputEvents(
    tenantId,
    manualInputId,
    {
      query: {
        enabled: open && !!manualInputId,
        queryKey: getGetManualInputEventsQueryKey(tenantId, manualInputId),
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Change history</DialogTitle>
          <DialogDescription>
            Every edit to this rep's quota, OTE, and targets is recorded.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : events && events.length > 0 ? (
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {events.map((ev) => (
              <div key={ev.id} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="capitalize">
                    {ev.eventKind}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(ev.at)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  by {ev.actor}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No history yet.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RepRow({
  tenantId,
  person,
  input,
  periodType,
  periodKey,
  onSaved,
}: {
  tenantId: string;
  person: Person;
  input: ManualInput | undefined;
  periodType: PeriodType;
  periodKey: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(input));
  const [historyOpen, setHistoryOpen] = useState(false);

  const upsert = useUpsertManualInput();
  const del = useDeleteManualInput();

  const startEdit = () => {
    setDraft(toDraft(input));
    setEditing(true);
  };

  const cancel = () => {
    setDraft(toDraft(input));
    setEditing(false);
  };

  const save = () => {
    const quota = parseNumber(draft.quota);
    const ote = parseNumber(draft.ote);
    const acceleratorThreshold = parseNumber(draft.acceleratorThreshold);
    const acceleratorMultiplier = parseNumber(draft.acceleratorMultiplier);

    if (
      quota === undefined ||
      ote === undefined ||
      acceleratorThreshold === undefined ||
      acceleratorMultiplier === undefined
    ) {
      toast({
        title: "Invalid number",
        description: "Quota, OTE, and accelerator fields must be numbers.",
        variant: "destructive",
      });
      return;
    }

    upsert.mutate(
      {
        tenantId,
        data: {
          personId: person.id,
          periodType,
          periodKey,
          quota,
          ote,
          acceleratorThreshold,
          acceleratorMultiplier,
          notes: draft.notes.trim() === "" ? null : draft.notes.trim(),
        },
      },
      {
        onSuccess: () => {
          setEditing(false);
          onSaved();
          toast({ title: `Saved targets for ${person.name}` });
        },
        onError: (err: any) =>
          toast({
            title: "Save failed",
            description: err?.message,
            variant: "destructive",
          }),
      },
    );
  };

  const clear = () => {
    if (!input) return;
    del.mutate(
      { tenantId, manualInputId: input.id },
      {
        onSuccess: () => {
          setEditing(false);
          onSaved();
          toast({ title: `Cleared targets for ${person.name}` });
        },
        onError: (err: any) =>
          toast({
            title: "Clear failed",
            description: err?.message,
            variant: "destructive",
          }),
      },
    );
  };

  const isSet = !!input;

  if (editing) {
    return (
      <TableRow>
        <TableCell className="font-medium">{person.name}</TableCell>
        <TableCell>
          <Input
            type="number"
            value={draft.quota}
            onChange={(e) => setDraft({ ...draft, quota: e.target.value })}
            className="h-8 w-28"
            placeholder="—"
            aria-label="Quota"
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            value={draft.ote}
            onChange={(e) => setDraft({ ...draft, ote: e.target.value })}
            className="h-8 w-28"
            placeholder="—"
            aria-label="OTE"
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            value={draft.acceleratorThreshold}
            onChange={(e) =>
              setDraft({ ...draft, acceleratorThreshold: e.target.value })
            }
            className="h-8 w-24"
            placeholder="—"
            aria-label="Accelerator threshold"
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            value={draft.acceleratorMultiplier}
            onChange={(e) =>
              setDraft({ ...draft, acceleratorMultiplier: e.target.value })
            }
            className="h-8 w-20"
            placeholder="—"
            aria-label="Accelerator multiplier"
          />
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={save}
              disabled={upsert.isPending}
              aria-label="Save"
            >
              {upsert.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={cancel}
              aria-label="Cancel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className={isSet ? undefined : "text-muted-foreground"}>
      <TableCell className="font-medium text-foreground">
        {person.name}
      </TableCell>
      <TableCell>{input?.quota != null ? formatCurrency(input.quota) : "—"}</TableCell>
      <TableCell>{input?.ote != null ? formatCurrency(input.ote) : "—"}</TableCell>
      <TableCell>
        {input?.acceleratorThreshold != null
          ? formatCurrency(input.acceleratorThreshold)
          : "—"}
      </TableCell>
      <TableCell>
        {input?.acceleratorMultiplier != null
          ? `${input.acceleratorMultiplier}×`
          : "—"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {isSet && (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setHistoryOpen(true)}
                aria-label={`History for ${person.name}`}
              >
                <History className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-destructive hover:text-destructive"
                onClick={clear}
                disabled={del.isPending}
              >
                Clear
              </Button>
            </>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={startEdit}
            aria-label={`Edit targets for ${person.name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
        {isSet && historyOpen && (
          <HistoryDialog
            tenantId={tenantId}
            manualInputId={input.id}
            open={historyOpen}
            onOpenChange={setHistoryOpen}
          />
        )}
      </TableCell>
    </TableRow>
  );
}

export function ManualInputs() {
  const { activeTenantId } = useTenant();
  const tenantId = activeTenantId ?? "";
  const queryClient = useQueryClient();

  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [periodKey, setPeriodKey] = useState<string>(() =>
    currentPeriodKey("monthly"),
  );

  const keyOptions = useMemo(
    () => periodKeyOptions(periodType),
    [periodType],
  );

  const onPeriodTypeChange = (value: string) => {
    const pt = value as PeriodType;
    setPeriodType(pt);
    setPeriodKey(currentPeriodKey(pt));
  };

  const { data: people, isLoading: peopleLoading } = useListPeople(tenantId, {
    query: { enabled: !!tenantId, queryKey: getListPeopleQueryKey(tenantId) },
  });

  const listParams = { periodType, periodKey };
  const { data: inputs, isLoading: inputsLoading } = useListManualInputs(
    tenantId,
    listParams,
    {
      query: {
        enabled: !!tenantId,
        queryKey: getListManualInputsQueryKey(tenantId, listParams),
      },
    },
  );

  const inputsByPerson = useMemo(() => {
    const map = new Map<string, ManualInput>();
    for (const i of inputs ?? []) map.set(i.personId, i);
    return map;
  }, [inputs]);

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: getListManualInputsQueryKey(tenantId, listParams),
    });
  };

  const reps = useMemo(
    () =>
      (people ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [people],
  );

  const setCount = inputsByPerson.size;
  const isLoading = peopleLoading || inputsLoading;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quotas &amp; Targets</h1>
        <p className="text-sm text-muted-foreground">
          Set each rep's quota, on-target earnings (OTE), and accelerator
          targets by hand for a given period. These values feed attainment,
          forecasting, and leaderboards.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Period</CardTitle>
          <CardDescription>
            Targets are stored per rep, per period. Pick the period you want to
            edit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={periodType} onValueChange={onPeriodTypeChange}>
              <SelectTrigger className="w-40" aria-label="Period type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={periodKey} onValueChange={setPeriodKey}>
              <SelectTrigger className="w-48" aria-label="Period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keyOptions.map((k) => (
                  <SelectItem key={k} value={k}>
                    {formatPeriodKey(periodType, k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            {formatPeriodKey(periodType, periodKey)} targets
            {reps.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {setCount} of {reps.length} set
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-10 animate-pulse rounded bg-muted" />
              <div className="h-10 animate-pulse rounded bg-muted" />
              <div className="h-10 animate-pulse rounded bg-muted" />
            </div>
          ) : reps.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rep</TableHead>
                  <TableHead>Quota</TableHead>
                  <TableHead>OTE</TableHead>
                  <TableHead>Accel. threshold</TableHead>
                  <TableHead>Accel. multiplier</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reps.map((p) => (
                  <RepRow
                    key={p.id}
                    tenantId={tenantId}
                    person={p}
                    input={inputsByPerson.get(p.id)}
                    periodType={periodType}
                    periodKey={periodKey}
                    onSaved={invalidate}
                  />
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              No people found for this company. Add people first, then set their
              quotas and targets here.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
