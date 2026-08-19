import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  UsersRound,
  Mail,
  Crown,
  Shield,
  User as UserIcon,
  X,
  Clock,
  MoreHorizontal,
  Activity,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DropdownMenu, DropdownItem } from "@/components/ui/dropdown-menu";
import { Spinner, FullPageSpinner } from "@/components/ui/spinner";

interface Member {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  created_at: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string | null;
  created_at: string | null;
  accepted_at: string | null;
}

interface ActivityEntry {
  id: string;
  summary: string;
  action: string;
  created_at: string | null;
}

function roleBadge(role: string | null) {
  switch (role) {
    case "owner":
      return (
        <Badge variant="warning">
          <Crown className="h-3 w-3" /> Owner
        </Badge>
      );
    case "admin":
      return (
        <Badge variant="info">
          <Shield className="h-3 w-3" /> Admin
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <UserIcon className="h-3 w-3" /> Member
        </Badge>
      );
  }
}

export default function TeamPage() {
  const { organization, profile } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);

  const isOwner = profile?.role === "owner";
  const canManage = isOwner || profile?.role === "admin";

  const { data: members = [], isLoading: membersLoading } = useQuery<Member[]>({
    queryKey: ["team-members", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, email, full_name, role, created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const { data: invitations = [] } = useQuery<Invitation[]>({
    queryKey: ["team-invitations", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("id, email, role, created_at, accepted_at")
        .eq("org_id", orgId!)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invitation[];
    },
  });

  const { data: activity = [] } = useQuery<ActivityEntry[]>({
    queryKey: ["team-activity", orgId],
    enabled: !!orgId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("id, summary, action, created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ActivityEntry[];
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; email: string; role: string }) => {
      const { error } = await supabase.from("users").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_data, { email, role }) => {
      qc.invalidateQueries({ queryKey: ["team-members", orgId] });
      toast.success("Role updated");
      if (orgId && profile) {
        await logActivity({
          orgId,
          actorId: profile.id,
          action: "member_role_changed",
          summary: `${profile.full_name ?? profile.email} changed ${email}'s role to ${role}`,
          metadata: { target_email: email, new_role: role },
        });
        qc.invalidateQueries({ queryKey: ["team-activity", orgId] });
      }
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update role"),
  });

  const removeMember = useMutation({
    mutationFn: async ({ id }: { id: string; email: string }) => {
      const { error } = await supabase.from("users").update({ org_id: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_data, { email }) => {
      qc.invalidateQueries({ queryKey: ["team-members", orgId] });
      toast.success("Member removed");
      if (orgId && profile) {
        await logActivity({
          orgId,
          actorId: profile.id,
          action: "member_removed",
          summary: `${profile.full_name ?? profile.email} removed ${email} from the team`,
          metadata: { target_email: email },
        });
        qc.invalidateQueries({ queryKey: ["team-activity", orgId] });
      }
    },
    onError: (e: any) => toast.error(e?.message || "Failed to remove member"),
  });

  const cancelInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invitations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-invitations", orgId] });
      toast.success("Invitation canceled");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to cancel invitation"),
  });

  if (membersLoading) return <FullPageSpinner />;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Team</h2>
          <p className="text-sm text-muted-foreground">
            Invite teammates and manage their access to{" "}
            {organization?.name ?? "your workspace"}.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" />
            Invite Member
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <div className="p-12 text-center">
              <UsersRound className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No members yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const isSelf = m.id === profile?.id;
                  const isMemberOwner = m.role === "owner";
                  const canEdit = canManage && !isSelf && !isMemberOwner;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {m.full_name ?? "—"}
                        {isSelf && (
                          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.email}</TableCell>
                      <TableCell>{roleBadge(m.role)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.created_at
                          ? new Date(m.created_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canEdit ? (
                          <DropdownMenu
                            trigger={
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            }
                          >
                            {(close) => (
                              <>
                                <DropdownItem
                                  onSelect={() => {
                                    close();
                                    updateRole.mutate({
                                      id: m.id,
                                      email: m.email ?? "",
                                      role: m.role === "admin" ? "member" : "admin",
                                    });
                                  }}
                                >
                                  {m.role === "admin" ? "Demote to Member" : "Promote to Admin"}
                                </DropdownItem>
                                <DropdownItem
                                  destructive
                                  onSelect={() => {
                                    close();
                                    if (confirm(`Remove ${m.email} from the team?`)) {
                                      removeMember.mutate({ id: m.id, email: m.email ?? "" });
                                    }
                                  }}
                                >
                                  Remove from team
                                </DropdownItem>
                              </>
                            )}
                          </DropdownMenu>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
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

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
            <CardDescription>
              These users have been invited but haven't accepted yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>{roleBadge(inv.role)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage ? (
                        <Button variant="ghost" size="sm" onClick={() => cancelInvite.mutate(inv.id)}>
                          <X className="h-4 w-4" /> Cancel
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <CardTitle>Team Activity</CardTitle>
            </div>
            <CardDescription>What your team has been doing recently.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {activity.length === 0 ? (
              <div className="p-12 text-center">
                <Activity className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                    <span className="text-foreground">{a.summary}</span>
                    <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                      {a.created_at
                        ? new Date(a.created_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <InviteDialog
        open={inviteOpen}
        orgId={orgId ?? null}
        invitedById={profile?.id ?? null}
        invitedByName={profile?.full_name ?? profile?.email ?? "Someone"}
        onClose={() => setInviteOpen(false)}
        onSent={() => {
          qc.invalidateQueries({ queryKey: ["team-invitations", orgId] });
          qc.invalidateQueries({ queryKey: ["team-activity", orgId] });
        }}
      />
    </div>
  );
}

function InviteDialog({
  open,
  orgId,
  invitedById,
  invitedByName,
  onClose,
  onSent,
}: {
  open: boolean;
  orgId: string | null;
  invitedById: string | null;
  invitedByName: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!orgId) return;
    if (!email.trim() || !email.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-invitation", {
        body: {
          email: email.trim(),
          role,
          invite_link_base: window.location.origin,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (invitedById) {
        logActivity({
          orgId,
          actorId: invitedById,
          action: "member_invited",
          summary: `${invitedByName} invited ${email.trim()} as ${role}`,
          metadata: { target_email: email.trim(), role },
        });
      }

      if (data?.email_sent) {
        toast.success(`Invitation sent to ${email.trim()}`);
      } else {
        // Sandbox sending (no verified domain yet) can only deliver to the
        // Resend account's own address — the invite still exists, so hand
        // over the link to share manually rather than calling this a failure.
        toast.success(`Invitation created for ${email.trim()}`, {
          description: data?.invite_link
            ? `Email couldn't be delivered yet — share this link directly: ${data.invite_link}`
            : undefined,
          duration: 10000,
        });
      }
      setEmail("");
      setRole("member");
      onSent();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to send invitation");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Invite a team member</DialogTitle>
        <DialogDescription>
          They'll get an email to join your workspace.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <Select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="admin">Admin — manage everything except billing</option>
            <option value="member">Member — campaigns and leads only</option>
          </Select>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={sending}>
          Cancel
        </Button>
        <Button onClick={handleSend} disabled={sending || !email}>
          {sending && <Spinner />}
          Send Invite
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
