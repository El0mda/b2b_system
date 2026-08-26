import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Rocket,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Users,
  Mail,
  CalendarClock,
  PartyPopper,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { processTemplate } from "@/lib/template";
import { calculateScheduledDate } from "@/lib/sequence-presets";
import { cn, getFunctionErrorMessage } from "@/lib/utils";
import type { WizardState } from "./types";

type LaunchPhase =
  | "idle"
  | "saving"
  | "create-campaign"
  | "save-sequence"
  | "add-leads"
  | "set-sender"
  | "schedule"
  | "complete";

interface PhaseResult {
  smartleadCampaignId?: string;
  leadsAdded?: number;
  sequenceSteps?: number;
  scheduled?: boolean;
}

export function StepLaunch({
  state,
  setState,
  onBack,
}: {
  state: WizardState;
  setState: (updater: (prev: WizardState) => WizardState) => void;
  onBack: () => void;
}) {
  const { organization, profile } = useAuth();
  const navigate = useNavigate();
  const orgId = organization?.id;

  const [phase, setPhase] = useState<LaunchPhase>("idle");
  const [showLeads, setShowLeads] = useState(false);
  const [showSequences, setShowSequences] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchWarning, setLaunchWarning] = useState<string | null>(null);
  const [launchedCampaignId, setLaunchedCampaignId] = useState<string | null>(null);
  const [phaseResult, setPhaseResult] = useState<PhaseResult>({});

  const selectedLeads = state.leads.filter((_, i) =>
    state.selectedLeadIds.has(String(i)),
  );
  const totalDays = state.sequenceSteps.reduce((sum, s) => sum + (s.delay_days || 0), 0);
  const launched = phase === "complete";

  const handleLaunch = async () => {
    if (!orgId) {
      toast.error("Missing organization");
      return;
    }
    if (selectedLeads.length === 0) {
      toast.error("No leads selected");
      return;
    }
    if (state.sequenceSteps.length === 0) {
      toast.error("No sequence steps defined");
      return;
    }
    setLaunchError(null);
    setLaunchWarning(null);

    try {
      setPhase("saving");

      // Final cross-source dedup safety net — the Lusha search step and
      // the import tab each dedup within their own source, but a lead
      // reaching this common launch point could still already exist in
      // the org from the *other* source (or an earlier campaign).
      let newLeads = selectedLeads;
      const emails = selectedLeads.map((l) => l.email).filter(Boolean);
      if (emails.length > 0) {
        const existing = new Set<string>();
        const CHUNK = 500;
        for (let i = 0; i < emails.length; i += CHUNK) {
          const slice = emails.slice(i, i + CHUNK);
          const { data } = await supabase
            .from("leads")
            .select("email")
            .eq("org_id", orgId)
            .in("email", slice);
          (data ?? []).forEach((r: any) => r.email && existing.add(r.email.toLowerCase()));
        }
        newLeads = selectedLeads.filter(
          (l) => !l.email || !existing.has(l.email.toLowerCase()),
        );
        const skipped = selectedLeads.length - newLeads.length;
        if (skipped > 0) {
          toast.info(
            `${skipped} lead${skipped === 1 ? "" : "s"} already in your database — skipped`,
          );
        }
      }
      if (newLeads.length === 0) {
        toast.error("All selected leads are already in your database");
        setPhase("idle");
        return;
      }

      const leadsSearched = newLeads.length;
      const leadsEnriched = newLeads.filter((l) => l.has_work_email || !!l.email).length;
      const leadsVerified = newLeads.filter((l) => l.nb_result).length;

      const { data: campaign, error: campaignError } = await supabase
        .from("campaigns")
        .insert({
          org_id: orgId,
          created_by: profile?.id ?? null,
          name: state.campaignName.trim(),
          status: "active",
          source: state.sourceTab === "lusha" ? "lusha" : "import",
          sender_email: "mariam.nasser@etriplesoft.com",
          sender_name: "Etriplesoft",
          reply_to_email: state.reply_to_email || "mariam.nasser@etriplesoft.com",
          timezone: state.timezone,
          leads_added: newLeads.length,
          leads_searched: leadsSearched,
          leads_enriched: leadsEnriched,
          leads_verified: leadsVerified,
        })
        .select()
        .single();
      if (campaignError) throw campaignError;

      const leadRows = newLeads.map((l) => ({
        org_id: orgId,
        campaign_id: campaign.id,
        source: state.sourceTab === "lusha" ? "lusha" : "import",
        contact_id: l.id ?? null,
        email: l.email,
        first_name: l.first_name ?? null,
        last_name: l.last_name ?? null,
        full_name: l.full_name ?? null,
        company: l.company ?? null,
        job_title: l.job_title ?? null,
        phone: l.phone ?? null,
        location: l.location ?? null,
        linkedin_url: l.linkedin_url ?? null,
        website: l.website ?? null,
        email_valid: l.email_valid ?? null,
        nb_result: l.nb_result ?? null,
        added_to_campaign: true,
        current_step: 1,
      }));
      const { data: insertedLeads, error: leadsError } = await supabase
        .from("leads")
        .insert(leadRows)
        .select("id, email, first_name, last_name, full_name, company, job_title, location");
      if (leadsError) throw leadsError;

      if (orgId && profile) {
        const source = state.sourceTab === "lusha" ? "via Lusha" : "via import";
        logActivity({
          orgId,
          actorId: profile.id,
          action: "campaign_launched",
          summary: `${profile.full_name ?? profile.email} launched campaign "${state.campaignName.trim()}" with ${newLeads.length} leads (${source})`,
          metadata: { campaign_id: campaign.id, leads_count: newLeads.length, source: state.sourceTab },
        });
      }

      const sequenceRows = state.sequenceSteps.map((s) => ({
        campaign_id: campaign.id,
        step: s.step,
        delay_days: s.delay_days,
        subject: s.subject,
        body: s.body,
      }));
      const { error: seqError } = await supabase.from("sequences").insert(sequenceRows);
      if (seqError) throw seqError;

      // Call send-campaign edge function (SmartLead)
      setPhase("create-campaign");
      let fnData: any;
      try {
        const { data, error } = await supabase.functions.invoke("send-campaign", {
          body: { campaign_id: campaign.id },
        });
        if (error) throw error;
        // Check if the response itself contains an error
        if (data?.error) {
          throw new Error(data.error);
        }
        fnData = data;
      } catch (fnError: any) {
        const msg = await getFunctionErrorMessage(fnError);
        console.error("send-campaign function failed:", fnError);
        setLaunchError(`SmartLead error: ${msg}`);
        toast.error(`Campaign saved but sending failed: ${msg}`);
        setPhase("idle");
        return;
      }

      setPhaseResult({
        smartleadCampaignId: fnData?.smartlead_campaign_id,
        leadsAdded: fnData?.leads_added ?? 0,
        sequenceSteps: fnData?.sequence_steps ?? 0,
        scheduled: fnData?.scheduled ?? false,
      });

      await sleep(300);
      setPhase("save-sequence");
      await sleep(300);
      setPhase("add-leads");
      await sleep(300);
      setPhase("set-sender");
      await sleep(300);
      setPhase("schedule");
      await sleep(300);

      // Increment usage
      await supabase.rpc("increment_leads_used", {
        p_org_id: orgId,
        p_amount: newLeads.length,
      }).then(() => undefined, () => {});

      setPhase("complete");
      setLaunchedCampaignId(campaign.id);
      setState((p) => ({ ...p, campaignId: campaign.id }));
      if (fnData?.warning) {
        setLaunchWarning(fnData.warning);
        toast.warning(fnData.warning, { duration: 10000 });
      } else {
        toast.success("Campaign launched!");
      }
    } catch (e: any) {
      setLaunchError(e?.message || "Failed to launch campaign");
      toast.error(e?.message || "Failed to launch campaign");
      setPhase("idle");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <SummaryRow label="Campaign name" value={state.campaignName} />
          <SummaryRow
            label="Sender"
            value="mariam.nasser@etriplesoft.com (SmartLead SMTP)"
          />
          <SummaryRow label="Timezone" value={state.timezone} />
          <SummaryRow label="Leads" value={String(selectedLeads.length)} />
          <SummaryRow label="Sequence steps" value={String(state.sequenceSteps.length)} />
          <SummaryRow label="Total duration" value={`${totalDays} days`} />
        </CardContent>
      </Card>

      <Collapsible
        title={`Leads (${selectedLeads.length})`}
        open={showLeads}
        onToggle={() => setShowLeads((s) => !s)}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Company</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {selectedLeads.slice(0, 30).map((l, i) => (
              <TableRow key={i}>
                  <TableCell>
                    {(l.full_name ?? `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim()) || "—"}
                  </TableCell>
                <TableCell>{l.email}</TableCell>
                <TableCell className="text-muted-foreground">{l.company ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {selectedLeads.length > 30 && (
          <p className="p-3 text-center text-xs text-muted-foreground">
            + {selectedLeads.length - 30} more not shown
          </p>
        )}
      </Collapsible>

      <Collapsible
        title={`Sequence (${state.sequenceSteps.length} steps)`}
        open={showSequences}
        onToggle={() => setShowSequences((s) => !s)}
      >
        <div className="space-y-3 p-4">
          {state.sequenceSteps.map((s, i) => {
            const previewLead = selectedLeads[0] ?? {
              first_name: "Sample",
              company: "Example Inc",
            };
            const scheduled =
              i === 0
                ? "Sent immediately"
                : `Sends ${calculateScheduledDate(
                    state.sequenceSteps.slice(0, i + 1).map((x) => x.delay_days),
                  ).toLocaleDateString()}`;
            return (
              <div key={i} className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="info">Step {i + 1}</Badge>
                  <span className="text-xs text-muted-foreground">{scheduled}</span>
                </div>
                <div className="text-sm font-semibold">
                  {processTemplate(s.subject, previewLead) || "(no subject)"}
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                  {processTemplate(s.body, previewLead) || "(no body)"}
                </p>
              </div>
            );
          })}
        </div>
      </Collapsible>

      <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-400">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            This will send emails to <strong>{selectedLeads.length}</strong> contacts from{" "}
            <strong>mariam.nasser@etriplesoft.com</strong>. Step 1 sends immediately;
            steps 2+ are scheduled.
          </div>
        </div>
      </div>

      {phase !== "idle" && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <ProgressRow
              icon={<Loader2 className="h-4 w-4 animate-spin text-primary" />}
              iconDone={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              label="Saving campaign…"
              active={phase === "saving"}
              done={["create-campaign", "save-sequence", "add-leads", "set-sender", "schedule", "complete"].includes(phase)}
            />
            <ProgressRow
              icon={<Rocket className="h-4 w-4 text-primary" />}
              iconDone={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              label={`Creating SmartLead campaign${phaseResult.smartleadCampaignId ? ` (#${phaseResult.smartleadCampaignId})` : ""}…`}
              active={phase === "create-campaign"}
              done={["save-sequence", "add-leads", "set-sender", "schedule", "complete"].includes(phase)}
            />
            <ProgressRow
              icon={<Mail className="h-4 w-4 text-primary" />}
              iconDone={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              label={`Saving email sequence${phaseResult.sequenceSteps ? ` (${phaseResult.sequenceSteps} steps)` : ""}…`}
              active={phase === "save-sequence"}
              done={["add-leads", "set-sender", "schedule", "complete"].includes(phase)}
            />
            <ProgressRow
              icon={<Users className="h-4 w-4 text-primary" />}
              iconDone={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              label={`Adding leads${phaseResult.leadsAdded ? ` (${phaseResult.leadsAdded} leads)` : ""}…`}
              active={phase === "add-leads"}
              done={["set-sender", "schedule", "complete"].includes(phase)}
            />
            <ProgressRow
              icon={<Mail className="h-4 w-4 text-primary" />}
              iconDone={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              label="Setting sender account…"
              active={phase === "set-sender"}
              done={["schedule", "complete"].includes(phase)}
            />
            <ProgressRow
              icon={<CalendarClock className="h-4 w-4 text-primary" />}
              iconDone={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              label="Scheduling campaign…"
              active={phase === "schedule"}
              done={phase === "complete"}
            />
            {phase === "complete" && (
              <div className="mt-2 flex items-center gap-2 rounded-md bg-emerald-500/10 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <PartyPopper className="h-5 w-5" />
                <div>
                  Campaign launched on SmartLead!
                  {phaseResult.smartleadCampaignId && (
                    <span className="ml-1 text-xs text-emerald-600">
                      (ID: {phaseResult.smartleadCampaignId})
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {launchError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {launchError}
        </div>
      )}

      {launchWarning && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-400">
          {launchWarning}
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack} disabled={phase !== "idle"}>
          Back
        </Button>
        {launched ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled className="border-emerald-500 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Launched
            </Button>
            <Button
              onClick={() =>
                launchedCampaignId ? navigate(`/campaigns/${launchedCampaignId}`) : navigate("/campaigns")
              }
            >
              View Campaign
            </Button>
          </div>
        ) : (
          <Button
            onClick={handleLaunch}
            disabled={phase !== "idle" || selectedLeads.length === 0}
            className={cn(phase !== "idle" && "bg-primary/80")}
          >
            {phase !== "idle" ? (
              <Spinner />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            Launch Campaign
          </Button>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function Collapsible({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-muted/30"
      >
        <span className="text-sm font-semibold">{title}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </Card>
  );
}

function ProgressRow({
  icon,
  iconDone,
  label,
  active,
  done,
}: {
  icon: React.ReactNode;
  iconDone: React.ReactNode;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? iconDone : active ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      ) : (
        <div className="h-4 w-4 rounded-full border-2 border-muted" />
      )}
      <span className={cn(done ? "text-foreground font-medium" : "text-muted-foreground")}>{label}</span>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
