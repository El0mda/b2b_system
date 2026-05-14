import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { TIMEZONES, type SenderOption, type WizardState } from "./types";
import { assignedSenderAddress } from "@/lib/sender";

export function StepConfigure({
  state,
  setState,
  onNext,
}: {
  state: WizardState;
  setState: (updater: (prev: WizardState) => WizardState) => void;
  onNext: () => void;
}) {
  const { organization } = useAuth();
  const orgId = organization?.id;

  const { data: senders = [] } = useQuery<SenderOption[]>({
    queryKey: ["campaign-wizard-senders", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sender_accounts")
        .select("id, sender_name, sender_email, reply_to_email, is_default")
        .eq("org_id", orgId!)
        .eq("domain_verified", true)
        .order("is_default", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SenderOption[];
    },
  });

  // Default sender pre-select + auto-fill sender fields
  useEffect(() => {
    if (!state.senderAccountId && senders.length > 0) {
      const def = senders.find((s) => s.is_default) ?? senders[0];
      setState((p) => ({
        ...p,
        senderAccountId: def.id,
        sender_email: def.sender_email,
        sender_name: def.sender_name,
        reply_to_email: def.reply_to_email ?? def.sender_email,
      }));
    }
  }, [senders, state.senderAccountId, setState]);

  const handleSenderChange = (id: string) => {
    const s = senders.find((x) => x.id === id);
    setState((p) => ({
      ...p,
      senderAccountId: id || null,
      sender_email: s?.sender_email ?? "",
      sender_name: s?.sender_name ?? "",
      reply_to_email: s?.reply_to_email ?? s?.sender_email ?? "",
    }));
  };

  const canContinue = !!state.campaignName.trim() && !!state.senderAccountId;

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
            <Label htmlFor="sender-account">Sender Account</Label>
            {senders.length === 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1">
                  No sender accounts configured.{" "}
                  <Link to="/sender-accounts" className="font-medium underline">
                    Go to Sender Accounts
                  </Link>{" "}
                  to add one.
                </div>
              </div>
            ) : (
              <>
                <Select
                  id="sender-account"
                  value={state.senderAccountId ?? ""}
                  onChange={(e) => handleSenderChange(e.target.value)}
                >
                  {senders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.sender_name} {s.sender_email}
                      {s.is_default ? " (default)" : ""}
                    </option>
                  ))}
                </Select>
                {state.senderAccountId &&
                  (() => {
                    const s = senders.find((x) => x.id === state.senderAccountId);
                    if (!s) return null;
                    const assigned = assignedSenderAddress(s.sender_name, {
                      slug: organization?.slug,
                      name: organization?.name ?? "workspace",
                    });
                    return (
                      <p className="text-xs text-muted-foreground">
                        Outbound from <span className="font-mono">{assigned}</span>
                      </p>
                    );
                  })()}
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
