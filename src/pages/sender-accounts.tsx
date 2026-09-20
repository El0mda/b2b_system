// Sender Accounts — each salesperson's own From address.
//
// Two things must line up before a rep can send, and only one of them
// lives in this app:
//   1. a row here, owned by them (migration 0020)
//   2. the same mailbox connected in SmartLead, which does the sending
//
// The page therefore leads with the steps, and shows SmartLead's real
// connection state per address rather than implying it's set up here.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Mail,
  Star,
  Trash2,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Flame,
  Users,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
import {
  findMailbox,
  useConnectedMailboxes,
  useSenderAccounts,
  type ConnectedMailbox,
  type SenderAccount,
} from "@/lib/sender-accounts";

const SMARTLEAD_ACCOUNTS_URL = "https://app.smartlead.ai/app/email-accounts";

function extractDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase().trim() ?? "";
}

export default function SenderAccountsPage() {
  const { organization, profile } = useAuth();
  const orgId = organization?.id;
  const userId = profile?.id ?? null;
  const isAdmin = profile?.role === "owner" || profile?.role === "admin";
  const qc = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<SenderAccount | null>(null);
  const [showTeam, setShowTeam] = useState(false);

  const { data: accounts = [], isLoading } = useSenderAccounts(orgId, userId, {
    mine: !(isAdmin && showTeam),
  });
  const { data: mailboxes } = useConnectedMailboxes();
  const connected = mailboxes?.accounts ?? [];
  const smartleadReachable = mailboxes?.reachable ?? false;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["sender-accounts"] });
  };

  // Default is per person: clearing it must not touch a teammate's.
  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) return;
      const owned = supabase
        .from("sender_accounts")
        .update({ is_default: false })
        .eq("org_id", orgId);
      await (userId ? owned.eq("user_id", userId) : owned);
      const { error } = await supabase
        .from("sender_accounts")
        .update({ is_default: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
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
      invalidate();
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
            The address your campaigns are sent from. Each salesperson uses their own.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <div className="flex items-center gap-2 text-sm">
              <Switch
                checked={showTeam}
                onCheckedChange={setShowTeam}
                aria-label="Show the whole team's sender accounts"
              />
              <span className="flex items-center gap-1 text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Whole team
              </span>
            </div>
          )}
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add my sender account
          </Button>
        </div>
      </div>

      <SetupSteps onAdd={() => setAddOpen(true)} />

      {!smartleadReachable && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          Couldn't reach SmartLead just now, so the connection column below is unavailable. Your
          accounts are unaffected.
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {accounts.length === 0 ? (
            <div className="p-12 text-center">
              <Mail className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="mb-4 text-sm text-muted-foreground">
                You don't have a sender account yet. Follow the steps above, then add yours.
              </p>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Add my sender account
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sender Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>SmartLead</TableHead>
                    <TableHead>Warm-up</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => {
                    const mailbox = findMailbox(connected, a.sender_email);
                    const mine = a.user_id === userId || a.user_id === null;
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">
                          {a.sender_name}
                          {a.user_id === null && (
                            <Badge variant="secondary" className="ml-2">
                              shared
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{a.sender_email}</TableCell>
                        <TableCell>
                          <ConnectionBadge
                            mailbox={mailbox}
                            reachable={smartleadReachable}
                          />
                        </TableCell>
                        <TableCell>
                          <WarmupBadge mailbox={mailbox} />
                        </TableCell>
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
                              title={mine ? "Edit" : "Edit (team member's account)"}
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
            </div>
          )}
        </CardContent>
      </Card>

      <SenderAccountDialog
        open={addOpen || !!editing}
        existing={editing}
        orgId={orgId ?? null}
        userId={userId}
        connected={connected}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        onSaved={invalidate}
      />
    </div>
  );
}

// The instructions the sales team follows. Deliberately on the page
// rather than in a doc nobody opens — half of it happens in SmartLead,
// so without this the app looks broken when a campaign doesn't send.
function SetupSteps({ onAdd }: { onAdd: () => void }) {
  const steps = [
    {
      title: "Connect your mailbox in SmartLead",
      body: "Open SmartLead → Email Accounts → Add Account, and connect your own work email (Google, Microsoft or SMTP). This is what actually sends your campaigns.",
      action: (
        <a
          href={SMARTLEAD_ACCOUNTS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Open SmartLead Email Accounts <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ),
    },
    {
      title: "Turn on warm-up and wait",
      body: "Switch warm-up on for the new mailbox and leave it running for about two weeks before you send a real campaign. A brand-new address that starts blasting goes straight to spam.",
    },
    {
      title: "Add the same address here",
      body: "Use exactly the address you connected in SmartLead — they're matched by the address, and a mismatch means the campaign is created but never sends.",
      action: (
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" /> Add my sender account
        </Button>
      ),
    },
    {
      title: "Pick it when you create a campaign",
      body: "Your sender is chosen in the first step of the campaign wizard. You'll only see your own addresses there.",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>How to send from your own address</CardTitle>
        <CardDescription>
          Do this once. Steps 1 and 2 happen in SmartLead; steps 3 and 4 happen here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {i + 1}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.body}</p>
              {step.action}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ConnectionBadge({
  mailbox,
  reachable,
}: {
  mailbox: ConnectedMailbox | null;
  reachable: boolean;
}) {
  if (!reachable) return <Badge variant="secondary">Unknown</Badge>;
  if (mailbox) {
    return (
      <Badge variant="success">
        <CheckCircle2 className="h-3 w-3" /> Connected
      </Badge>
    );
  }
  return (
    <a
      href={SMARTLEAD_ACCOUNTS_URL}
      target="_blank"
      rel="noreferrer"
      title="This address isn't connected in SmartLead, so campaigns using it won't send."
    >
      <Badge variant="warning">
        <AlertTriangle className="h-3 w-3" /> Not connected
      </Badge>
    </a>
  );
}

function WarmupBadge({ mailbox }: { mailbox: ConnectedMailbox | null }) {
  if (!mailbox?.warmup_status) return <span className="text-xs text-muted-foreground">—</span>;
  const active = /active|running|started/i.test(mailbox.warmup_status);
  return (
    <Badge variant={active ? "success" : "secondary"}>
      <Flame className="h-3 w-3" /> {mailbox.warmup_status}
    </Badge>
  );
}

function SenderAccountDialog({
  open,
  existing,
  orgId,
  userId,
  connected,
  onClose,
  onSaved,
}: {
  open: boolean;
  existing: SenderAccount | null;
  orgId: string | null;
  userId: string | null;
  connected: ConnectedMailbox[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

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

  // Live feedback while typing: the single most common mistake is
  // adding an address that was never connected in SmartLead.
  const match = findMailbox(connected, senderEmail);
  const showMatchHint = senderEmail.includes("@");

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
      const email = senderEmail.trim().toLowerCase();
      const domain = extractDomain(email);
      let resultId: string | undefined;
      if (existing) {
        const { data, error } = await supabase
          .from("sender_accounts")
          .update({
            sender_name: senderName.trim(),
            sender_email: email,
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
            // Ownership: this is what keeps a rep's address theirs.
            user_id: userId,
            sender_name: senderName.trim(),
            sender_email: email,
            domain,
            domain_verified: true,
            is_default: isDefault,
          })
          .select("id")
          .single();
        if (error) throw error;
        resultId = data.id;
      }

      // Only clear the default among this person's own accounts.
      if (isDefault && resultId && userId) {
        await supabase
          .from("sender_accounts")
          .update({ is_default: false })
          .eq("org_id", orgId)
          .eq("user_id", userId)
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
        <DialogTitle>{existing ? "Edit sender account" : "Add my sender account"}</DialogTitle>
        <DialogDescription>
          Use the same address you connected in SmartLead.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="sender-name">Your name (shown to the recipient)</Label>
          <Input
            id="sender-name"
            placeholder="Sarah Johnson"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sender-email">Your sending address</Label>
          <Input
            id="sender-email"
            type="email"
            placeholder="sarah@yourcompany.com"
            value={senderEmail}
            onChange={(e) => setSenderEmail(e.target.value)}
          />
          {showMatchHint &&
            (match ? (
              <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Connected in SmartLead — campaigns from this address will send.
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Not connected in SmartLead yet. You can save it, but connect it there before
                launching a campaign.
              </p>
            ))}
        </div>

        {!existing && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="is-default"
              checked={isDefault}
              onCheckedChange={(v) => setIsDefault(v)}
            />
            <Label htmlFor="is-default" className="cursor-pointer text-sm font-normal">
              Make this my default sender
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
          {existing ? "Save changes" : "Add sender"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
