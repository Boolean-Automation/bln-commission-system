import React, { useMemo, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import {
  useListPositions,
  getListPositionsQueryKey,
  useCreatePosition,
  useUpdatePosition,
  useDeletePosition,
  useListPeople,
  getListPeopleQueryKey,
  type Position,
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
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
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
import { Plus, Pencil, Trash2, Check, X, Tag, Sparkles } from "lucide-react";

function PositionRow({
  tenantId,
  position,
  existingNames,
}: {
  tenantId: string;
  position: Position;
  existingNames: Set<string>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(position.name);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getListPositionsQueryKey(tenantId),
    });

  const updateMutation = useUpdatePosition();
  const deleteMutation = useDeletePosition();

  const save = () => {
    const name = draft.trim();
    if (!name) return;
    if (
      name.toLowerCase() !== position.name.toLowerCase() &&
      existingNames.has(name.toLowerCase())
    ) {
      toast({
        title: "Duplicate position",
        description: "A position with that name already exists.",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate(
      { tenantId, positionId: position.id, data: { name } },
      {
        onSuccess: () => {
          invalidate();
          setEditing(false);
          toast({ title: "Position renamed" });
        },
        onError: (err: any) =>
          toast({
            title: "Rename failed",
            description: err?.message,
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-4 py-3">
      {editing ? (
        <div className="flex flex-1 items-center gap-2">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setDraft(position.name);
                setEditing(false);
              }
            }}
            className="h-9"
            aria-label="Position name"
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            onClick={save}
            disabled={updateMutation.isPending}
            aria-label="Save position name"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            onClick={() => {
              setDraft(position.name);
              setEditing(false);
            }}
            aria-label="Cancel editing"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 font-medium">
            <Tag className="h-4 w-4 text-muted-foreground" />
            {position.name}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              onClick={() => setEditing(true)}
              aria-label={`Rename ${position.name}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-destructive hover:text-destructive"
                  aria-label={`Delete ${position.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete position?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Remove “{position.name}” from the list of positions. Rules
                    already using this name keep their value, but it will no
                    longer appear as an option.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      deleteMutation.mutate(
                        { tenantId, positionId: position.id },
                        {
                          onSuccess: () => {
                            invalidate();
                            toast({ title: "Position deleted" });
                          },
                          onError: (err: any) =>
                            toast({
                              title: "Delete failed",
                              description: err?.message,
                              variant: "destructive",
                            }),
                        },
                      )
                    }
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      )}
    </div>
  );
}

export function Positions() {
  const { activeTenantId } = useTenant();
  const tenantId = activeTenantId ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");

  const { data: positions, isLoading } = useListPositions(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getListPositionsQueryKey(tenantId),
    },
  });
  const { data: people } = useListPeople(tenantId, {
    query: { enabled: !!tenantId, queryKey: getListPeopleQueryKey(tenantId) },
  });

  const createMutation = useCreatePosition();

  const existingNames = useMemo(
    () => new Set((positions ?? []).map((p) => p.name.toLowerCase())),
    [positions],
  );

  const suggestions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of people ?? []) {
      const pos = (p.position ?? "").trim();
      if (pos && !existingNames.has(pos.toLowerCase()) && !seen.has(pos.toLowerCase()))
        seen.set(pos.toLowerCase(), pos);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [people, existingNames]);

  const addPosition = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (existingNames.has(trimmed.toLowerCase())) {
      toast({
        title: "Duplicate position",
        description: "A position with that name already exists.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(
      { tenantId, data: { name: trimmed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListPositionsQueryKey(tenantId),
          });
          setNewName("");
          toast({ title: "Position added" });
        },
        onError: (err: any) =>
          toast({
            title: "Add failed",
            description: err?.message,
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Positions</h1>
        <p className="text-sm text-muted-foreground">
          Define the positions used across your commission plan. These power the
          position dropdowns when configuring rules.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a position</CardTitle>
          <CardDescription>
            Create the job positions your commission rules match against (e.g.
            “Sales Manager”, “Sales Level 2”).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              placeholder="e.g. Sales Manager"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addPosition(newName);
              }}
              aria-label="New position name"
            />
            <Button
              onClick={() => addPosition(newName)}
              disabled={createMutation.isPending || !newName.trim()}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {suggestions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                From your synced people
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className="cursor-pointer gap-1 hover:bg-accent"
                    onClick={() => addPosition(s)}
                  >
                    <Plus className="h-3 w-3" />
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Configured positions
            {positions ? ` (${positions.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-12 animate-pulse rounded bg-muted" />
              <div className="h-12 animate-pulse rounded bg-muted" />
            </div>
          ) : positions && positions.length > 0 ? (
            <div className="space-y-2">
              {positions.map((p) => (
                <PositionRow
                  key={p.id}
                  tenantId={tenantId}
                  position={p}
                  existingNames={existingNames}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              No positions yet. Add one above to get started.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
