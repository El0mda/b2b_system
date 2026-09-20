import { useEffect } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  findMailbox,
  isSendable,
  useConnectedMailboxes,
  useSenderAccounts,
} from "@/lib/sender-accounts";
import { TIMEZONES, type WizardState } from "./types";

export function StepConfigure({
  state,
  setState,
  onNext,
}: {
  state: WizardState;
  setState: (updater: (prev: WizardState) => WizardState) => void;
  onNext: () => void;
}) {
  const { organization, profile } = useAuth();
  const { data: senders = [], isLoading } = useSenderAccounts(organization?.id, profile?.id);
  const { data: mailboxes } = useConnectedMailboxes();
  const connected = mailboxes?.accounts ?? [];
  const reachable = mailboxes?.reachable ?? false;

  const selected = senders.find((s) => s.id === state.senderAccountId) ?? null;

  // Preselect the rep's default (or their only address) so the common
  // case is one click.
  useEffect(() => {
    if (state.senderAccountId || senders.length === 0) return;
    const pick = senders.find((s) => s.is_default) ?? senders[0];
    setState((p) => ({
      ...p,
      senderAccountId: pick.id,
      sender_email: pick.sender_email,
      sender_name: pick.sender_name,
      reply_to_email: p.reply_to_email || pick.sender_email,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senders.length]);

  const chooseSender = (id: string) => {
    const pick = senders.find((s) => s.id === id);
    if (!pick) return;
    setState((p) => ({
      ...p,
      senderAccountId: pick.id,
      sender_email: pick.sender_email,
      sender_name: pick.sender_name,
      reply_to_email: pick.sender_email,
    }));
  };

  const mailbox = findMailbox(connected, selected?.sender_email);
  // A campaign whose sender isn't connected in SmartLead is created but
  // never sends, so it's blocked here rather than failing silently later.
  const sendable = isSendable(connected, reachable, selected?.sender_email);
  const canContinue = !!state.campaignName.trim() && !!selected && sendable;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="campaign-name">Campaign Name</Label>
            <Input
              id="campaign-name"
              placeholder="e.g. Q2 Manufacturing Outbound"
              value={state.campaignName}
              onChange={(e) => setState((p) => ({ ...p, campaignName: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sender">Send from</Label>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading your sender accounts…</p>
            ) : senders.length === 0 ? (
              <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  You don't have a sender account yet
                </p>
                <p className="text-sm text-muted-foreground">
                  Campaigns send from your own address. Set yours up once, then come back.
                </p>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/sender-accounts">
                    <Plus className="h-3.5 w-3.5" /> Set up my sender account
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <Select
                  id="sender"
                  value={state.senderAccountId ?? ""}
                  onChange={(e) => chooseSender(e.target.value)}
                >
                  {senders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.sender_name} — {s.sender_email}
                      {s.is_default ? " (default)" : ""}
                    </option>
                  ))}
                </Select>

                {selected && reachable && (
                  mailbox ? (
                    <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Connected in SmartLead
                      {mailbox.warmup_status ? ` · warm-up ${mailbox.warmup_status}` : ""}
                    </p>
                  ) : (
                    <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        {selected.sender_email} isn't connected in SmartLead
                      </p>
                      <p className="text-xs text-muted-foreground">
                        A campaign from this address would be created but never send. Connect the
                        mailbox in SmartLead first — the steps are on the Sender Accounts page.
                      </p>
                      <Link
                        to="/sender-accounts"
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Open Sender Accounts
                      </Link>
                    </div>
                  )
                )}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              id="timezone"
              value={state.timezone}
              onChange={(e) => setState((p) => ({ ...p, timezone: e.target.value }))}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!canContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
