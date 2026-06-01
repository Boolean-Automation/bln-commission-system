import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateTenant,
  useDeleteTenant,
  getListTenantsQueryKey,
  type Tenant,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";

const PROTECTED_SLUGS = new Set(["paragon-atlanta"]);

export function ManageCompanyDialog({
  tenant,
  open,
  onOpenChange,
  onDeleted,
}: {
  tenant: Tenant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the deleted tenant id after a successful delete. */
  onDeleted?: (tenantId: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateTenant = useUpdateTenant();
  const deleteTenant = useDeleteTenant();

  // Reset local form state whenever the dialog opens for a (different) tenant.
  useEffect(() => {
    if (open && tenant) {
      setName(tenant.name);
      setConfirmName("");
      setConfirmDelete(false);
    }
  }, [open, tenant]);

  if (!tenant) return null;

  const isProtected = PROTECTED_SLUGS.has(tenant.slug);
  const trimmedName = name.trim();
  const nameChanged = trimmedName.length > 0 && trimmedName !== tenant.name;
  const deleteEnabled = confirmName.trim() === tenant.name && !isProtected;

  const handleRename = () => {
    if (!nameChanged) return;
    updateTenant.mutate(
      { tenantId: tenant.id, data: { name: trimmedName } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData<Tenant[]>(
            getListTenantsQueryKey(),
            (old) =>
              (old ?? []).map((t) => (t.id === updated.id ? updated : t)),
          );
          queryClient.invalidateQueries({
            queryKey: getListTenantsQueryKey(),
          });
          toast({
            title: "Company renamed",
            description: `Now called “${updated.name}”.`,
          });
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          toast({
            title: "Could not rename company",
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleDelete = () => {
    if (!deleteEnabled) return;
    deleteTenant.mutate(
      { tenantId: tenant.id },
      {
        onSuccess: () => {
          queryClient.setQueryData<Tenant[]>(
            getListTenantsQueryKey(),
            (old) => (old ?? []).filter((t) => t.id !== tenant.id),
          );
          queryClient.invalidateQueries({
            queryKey: getListTenantsQueryKey(),
          });
          toast({
            title: "Company deleted",
            description: `“${tenant.name}” and all of its data were removed.`,
          });
          onDeleted?.(tenant.id);
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          toast({
            title: "Could not delete company",
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  const busy = updateTenant.isPending || deleteTenant.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage company</DialogTitle>
          <DialogDescription>
            Rename {tenant.name} or remove it from the system.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="company-name">Company name</Label>
          <Input
            id="company-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
            }}
          />
          <p className="text-xs text-muted-foreground">
            The URL identifier (<span className="font-mono">{tenant.slug}</span>)
            stays the same when you rename.
          </p>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleRename}
              disabled={!nameChanged || busy}
            >
              {updateTenant.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Save name
            </Button>
          </div>
        </div>

        <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4" />
            <span className="text-sm font-semibold">Danger zone</span>
          </div>
          {isProtected ? (
            <p className="mt-2 text-xs text-muted-foreground">
              This is the live launch company and is protected from deletion.
            </p>
          ) : !confirmDelete ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Permanently delete this company and all of its people, jobs,
                commissions, and history.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                Delete
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <Label htmlFor="confirm-name" className="text-xs">
                Type{" "}
                <span className="font-semibold text-foreground">
                  {tenant.name}
                </span>{" "}
                to confirm deletion
              </Label>
              <Input
                id="confirm-name"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={tenant.name}
                disabled={busy}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConfirmDelete(false);
                    setConfirmName("");
                  }}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={!deleteEnabled || busy}
                >
                  {deleteTenant.isPending && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  Delete forever
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
