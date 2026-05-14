import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Mail, Star, Trash2, Pencil, Copy, CheckCircle2 } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Spinner, FullPageSpinner } from "@/components/ui/spinner";
import { assignedSenderAddress } from "@/lib/sender";

interface SenderAccount {
  id: string;
  org_id: string | null;
  sender_name: string;
  sender_email: string;
  domain: string | null;
  is_default: boolean | null;
  created_at: string | null;
}

function extractDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase().trim() ?? "";
}

export default function SenderAccountsPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<SenderAccount | null>(null);

  const { data: accounts = [], isLoading } = useQuery<SenderAccount[]>({
    queryKey: ["sender-accounts", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sender_accounts")
        .select("id, org_id, sender_name, sender_email, domain, is_default, created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SenderAccount[];
    },
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) return;
      await supabase.from("sender_accounts").update({ is_default: false }).eq("org_id", orgId);
      const { error } = await supabase
        .from("sender_accounts")
        .update({ is_default: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sender-accounts", orgId] });
      toast.success("Default sender updated");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to set default"),
  });

  const removeAccount = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sender_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sender-accounts", orgId] });
      toast.success("Sender account removed");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to remove"),
  });

  if (isLoading) return <FullPageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Sender Accounts</h2>
          <p className="text-sm text-muted-foreground">
            Each sender gets a managed address on our shared sending domain.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Sender Account
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {accounts.length === 0 ? (
            <div className="p-12 text-center">
              <Mail className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="mb-4 text-sm text-muted-foreground">
                No sender accounts yet. Add one to start sending campaigns.
              </p>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Add Sender Account
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sender Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Assigned Address</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => {
                  const assigned = assignedSenderAddress(a.sender_name, {
                    slug: organization?.slug,
                    name: organization?.name ?? "workspace",
                  });
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.sender_name}</TableCell>
                      <TableCell>{a.sender_email}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {assigned}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{a.domain ?? "—"}</TableCell>
                      <TableCell>
                        {a.is_default ? (
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        ) : (
                          <button
                            onClick={() => setDefault.mutate(a.id)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            Set default
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditing(a)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(`Remove ${a.sender_email}?`))
                                removeAccount.mutate(a.id);
                            }}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SenderAccountDialog
        open={addOpen || !!editing}
        existing={editing}
        orgId={orgId ?? null}
        orgSlug={organization?.slug ?? null}
        orgName={organization?.name ?? "workspace"}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        onSaved={() => qc.invalidateQueries({ queryKey: ["sender-accounts", orgId] })}
      />
    </div>
  );
}

function SenderAccountDialog({
  open,
  existing,
  orgId,
  orgSlug,
  orgName,
  onClose,
  onSaved,
}: {
  open: boolean;
  existing: SenderAccount | null;
  orgId: string | null;
  orgSlug: string | null;
  orgName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (existing) {
      setSenderName(existing.sender_name);
      setSenderEmail(existing.sender_email);
      setIsDefault(!!existing.is_default);
    } else {
      setSenderName("");
      setSenderEmail("");
      setIsDefault(false);
    }
  }, [existing, open]);

  const assigned = senderName
    ? assignedSenderAddress(senderName, { slug: orgSlug, name: orgName })
    : "";

  const copyAssigned = async () => {
    if (!assigned) return;
    try {
      await navigator.clipboard.writeText(assigned);
      setCopied(true);
      toast.success("Address copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  };

  const handleSave = async () => {
    if (!orgId) return;
    if (!senderName.trim() || !senderEmail.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (!senderEmail.includes("@")) {
      toast.error("Sender email must be a valid email");
      return;
    }
    setSaving(true);
    try {
      const domain = extractDomain(senderEmail);
      let resultId: string | undefined;
      if (existing) {
        const { data, error } = await supabase
          .from("sender_accounts")
          .update({
            sender_name: senderName.trim(),
            sender_email: senderEmail.trim().toLowerCase(),
            domain,
            domain_verified: true,
          })
          .eq("id", existing.id)
          .select("id")
          .single();
        if (error) throw error;
        resultId = data.id;
      } else {
        const { data, error } = await supabase
          .from("sender_accounts")
          .insert({
            org_id: orgId,
            sender_name: senderName.trim(),
            sender_email: senderEmail.trim().toLowerCase(),
            domain,
            domain_verified: true,
            is_default: isDefault,
          })
          .select("id")
          .single();
        if (error) throw error;
        resultId = data.id;
      }

      if (isDefault && resultId) {
        await supabase
          .from("sender_accounts")
          .update({ is_default: false })
          .eq("org_id", orgId)
          .neq("id", resultId);
      }

      toast.success(existing ? "Sender account updated" : "Sender account added");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save sender account");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>{existing ? "Edit Sender Account" : "Add Sender Account"}</DialogTitle>
        <DialogDescription>
          Configure who your campaign emails appear to be from.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="sender-name">Sender Name</Label>
          <Input
            id="sender-name"
            placeholder="Sarah Johnson"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sender-email">Sender Email</Label>
          <Input
            id="sender-email"
            type="email"
            placeholder="sarah@yourcompany.com"
            value={senderEmail}
            onChange={(e) => setSenderEmail(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Shown as the From address. Replies route to your reply-to inbox automatically.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Assigned sending address</Label>
          <div className="flex gap-2">
            <Input
              value={assigned || "Enter a sender name to preview"}
              readOnly
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              onClick={copyAssigned}
              disabled={!assigned}
              className="shrink-0"
            >
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Campaign Commander delivers from this managed address — no DNS setup required.
          </p>
        </div>

        {!existing && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="is-default"
              checked={isDefault}
              onCheckedChange={(v) => setIsDefault(v)}
            />
            <Label htmlFor="is-default" className="cursor-pointer text-sm font-normal">
              Set as default sender
            </Label>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Spinner />}
          {existing ? "Save Changes" : "Add Sender"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
