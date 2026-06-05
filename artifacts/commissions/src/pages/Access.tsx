import React, { useState } from "react";
import {
  useListTenantMembers,
  getListTenantMembersQueryKey,
  useListUsers,
  getListUsersQueryKey,
  useCreateTenantMember,
  useUpdateTenantMember,
  useDeleteTenantMember,
} from "@workspace/api-client-react";
import type { Membership } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Loader2, UserPlus, Trash2 } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  platform_operator: "Platform Operator",
  admin: "Admin",
  rep: "Sales Rep",
};

function roleBadge(role: string) {
  const variant =
    role === "platform_operator"
      ? "default"
      : role === "admin"
        ? "secondary"
        : "outline";
  return <Badge variant={variant as any}>{ROLE_LABELS[role] ?? role}</Badge>;
}

export function Access() {
  const { activeTenantId, activeTenant } = useTenant();
  const { isOperator } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const tenantId = activeTenantId ?? "";
  const membersQuery = useListTenantMembers(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getListTenantMembersQueryKey(tenantId),
    },
  });
  const usersQuery = useListUsers({
    query: { enabled: isOperator, queryKey: getListUsersQueryKey() },
  });

  const [newUserId, setNewUserId] = useState<string>("");
  const [newRole, setNewRole] = useState<"admin" | "rep">("admin");

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getListTenantMembersQueryKey(tenantId),
    });

  const createMutation = useCreateTenantMember();
  const updateMutation = useUpdateTenantMember();
  const deleteMutation = useDeleteTenantMember();

  const members = membersQuery.data ?? [];
  const memberUserIds = new Set(members.map((m) => m.userId));
  const assignableUsers = (usersQuery.data ?? []).filter(
    (u) => !memberUserIds.has(u.id),
  );

  const handleAdd = () => {
    if (!newUserId) return;
    createMutation.mutate(
      { tenantId, data: { userId: newUserId, role: newRole } },
      {
        onSuccess: () => {
          toast({ title: "Member added" });
          setNewUserId("");
          invalidate();
        },
        onError: (err: any) =>
          toast({
            title: "Could not add member",
            description: err?.message,
            variant: "destructive",
          }),
      },
    );
  };

  const handleRoleChange = (m: Membership, role: "admin" | "rep") => {
    updateMutation.mutate(
      { tenantId, membershipId: m.id, data: { role } },
      {
        onSuccess: () => {
          toast({ title: "Role updated" });
          invalidate();
        },
        onError: (err: any) =>
          toast({
            title: "Could not update role",
            description: err?.message,
            variant: "destructive",
          }),
      },
    );
  };

  const handleRemove = (m: Membership) => {
    deleteMutation.mutate(
      { tenantId, membershipId: m.id },
      {
        onSuccess: () => {
          toast({ title: "Member removed" });
          invalidate();
        },
        onError: (err: any) =>
          toast({
            title: "Could not remove member",
            description: err?.message,
            variant: "destructive",
          }),
      },
    );
  };

  if (!activeTenantId) {
    return (
      <div className="text-sm text-muted-foreground">
        Select a company to manage access.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Access</h1>
        <p className="text-sm text-muted-foreground">
          Manage who can access {activeTenant?.name ?? "this company"} and what
          they can do.
        </p>
      </div>

      {isOperator && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a member</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">
                User
              </label>
              <Select value={newUserId} onValueChange={setNewUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {assignableUsers.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No users available
                    </div>
                  ) : (
                    assignableUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {[u.firstName, u.lastName].filter(Boolean).join(" ") ||
                          u.email ||
                          u.id}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <label className="mb-1 block text-xs text-muted-foreground">
                Role
              </label>
              <Select
                value={newRole}
                onValueChange={(v) => setNewRole(v as "admin" | "rep")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="rep">Sales Rep</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleAdd}
              disabled={!newUserId || createMutation.isPending}
              className="gap-2"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Add
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent>
          {membersQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No members yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Linked rep</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const isOperatorRow = m.role === "platform_operator";
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="font-medium">
                          {m.userName || m.userEmail || m.userId}
                        </div>
                        {m.userEmail && m.userName && (
                          <div className="text-xs text-muted-foreground">
                            {m.userEmail}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.personName ?? "—"}
                      </TableCell>
                      <TableCell>
                        {isOperatorRow ? (
                          roleBadge(m.role)
                        ) : (
                          <Select
                            value={m.role}
                            onValueChange={(v) =>
                              handleRoleChange(m, v as "admin" | "rep")
                            }
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="rep">Sales Rep</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isOperatorRow && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemove(m)}
                            disabled={deleteMutation.isPending}
                            className="gap-1 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
