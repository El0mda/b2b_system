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
  PhoneCall,
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
import {
  offsetHoursThrough,
  stepType,
  type SequenceStep,
} from "@/lib/sequence-presets";
import { describeDays } from "@/lib/campaign-settings";
import { assignLeads, leadKey } from "@/lib/tracks";
import { cn, getFunctionErrorMessage } from "@/lib/utils";
import type { Database } from "@/types/db";
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

// What send-campaign reports for each sequence.
interface TrackResult {
  id: string;
  name: string;
  status: "pending" | "active" | "failed" | "skipped";
  error?: string | null;
  leads?: number;
  smartlead_campaign_id?: string | null;
}

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
  // Same routing the Sequences step showed, recomputed here so the
  // summary and the launch agree on exactly who gets what.
  const routing = assignLeads(
    selectedLeads,
    state.tracks,
    state.defaultTrackKey,
    state.trackOverrides,
  );
  const routedCount = selectedLeads.length - routing.excluded;
  const longestDays = Math.max(
    0,
    ...state.tracks.map((t) =>
      t.steps.length ? Math.round(offsetHoursThrough(t.steps, t.steps.length - 1) / 24) : 0,
    ),
  );
  const launched = phase === "complete";

  // Once the campaign row exists, launching again would create a second
  // copy. A failed send is retried against the same campaign instead.
  const [savedCampaignId, setSavedCampaignId] = useState<string | null>(null);
  const [trackResults, setTrackResults] = useState<TrackResult[]>([]);
  const [retrying, setRetrying] = useState(false);

  const handleLaunch = async () => {
    if (!orgId) {
      toast.error("Missing organization");
      return;
    }
    if (selectedLeads.length === 0) {
      toast.error("No leads selected");
      return;
    }
    if (state.tracks.length === 0 || state.tracks.some((t) => t.steps.length === 0)) {
      toast.error("Every sequence needs at least one step");
      return;
    }
    // The sender is chosen in step 1; without it SmartLead has no
    // mailbox to send from and the campaign would never go out.
    if (!state.sender_email) {
      toast.error("Pick the address to send from in the Configure step");
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

      // Route leads to sequences. Anyone matching none, with the default
      // set to "leave them out", is dropped here rather than launched
      // with no sequence.
      const routed = assignLeads(
        newLeads,
        state.tracks,
        state.defaultTrackKey,
        state.trackOverrides,
      );
      newLeads = newLeads.filter((l) => routed.byLead.get(leadKey(l)));
      if (newLeads.length === 0) {
        toast.error("None of these leads are assigned to a sequence");
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
          sender_email: state.sender_email,
          sender_name: state.sender_name ?? "",
          reply_to_email: state.reply_to_email || state.sender_email,
          timezone: state.timezone,
          // Read back by send-campaign when it schedules in SmartLead.
          send_settings: { ...state.sendSettings },
          leads_added: newLeads.length,
          leads_searched: leadsSearched,
          leads_enriched: leadsEnriched,
          leads_verified: leadsVerified,
        })
        .select()
        .single();
      if (campaignError) throw campaignError;
      setSavedCampaignId(campaign.id);

      // One row per sequence. send-campaign turns each into its own
      // SmartLead campaign — SmartLead allows only one sequence apiece.
      const trackRows = state.tracks.map((t, i) => {
        const count = routed.counts.get(t.key) ?? 0;
        return {
          campaign_id: campaign.id,
          org_id: orgId,
          name: t.name.trim() || `Sequence ${i + 1}`,
          position: i,
          job_positions: t.jobPositions,
          is_default: t.key === state.defaultTrackKey,
          template_id: t.templateId,
          lead_count: count,
          status: count > 0 ? "pending" : "skipped",
        };
      });
      const { data: insertedTracks, error: tracksError } = await supabase
        .from("campaign_tracks")
        .insert(trackRows)
        .select("id, position");
      if (tracksError) throw tracksError;
      // Keyed by position, not insert order: the returned rows aren't
      // guaranteed to come back in the order they were sent.
      const trackIdByKey = new Map(
        state.tracks.map((t, i) => [
          t.key,
          (insertedTracks ?? []).find((r) => r.position === i)?.id as string,
        ]),
      );

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
        track_id: trackIdByKey.get(routed.byLead.get(leadKey(l)) ?? "") ?? null,
      }));
      const { data: insertedLeads, error: leadsError } = await supabase
        .from("leads")
        .insert(leadRows)
        .select("id, email, first_name, last_name, full_name, company, job_title, location, track_id");
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

      // Each sequence's steps are numbered from 1 within that sequence,
      // and its call reminders go only to the leads routed to it.
      for (const track of state.tracks) {
        const trackId = trackIdByKey.get(track.key);
        if (!trackId) continue;
        const sequenceRows = track.steps.map((s, i) => ({
          campaign_id: campaign.id,
          track_id: trackId,
          step: i + 1,
          step_type: stepType(s),
          delay_days: s.delay_days ?? 0,
          delay_hours: s.delay_hours ?? 0,
          subject: stepType(s) === "call" ? null : s.subject,
          body: stepType(s) === "call" ? null : s.body,
          title: stepType(s) === "call" ? (s.title ?? "Call the lead") : null,
          notes: stepType(s) === "call" ? (s.notes ?? null) : null,
          attachments: stepType(s) === "call" ? [] : (s.attachments ?? []),
        }));
        const { data: insertedSequences, error: seqError } = await supabase
          .from("sequences")
          .insert(sequenceRows)
          .select("id, step, step_type, title, notes");
        if (seqError) throw seqError;

        // A call step is work for a person, not something SmartLead can
        // run — so it becomes one reminder per lead. Non-fatal: a missing
        // reminder shouldn't fail a launch.
        try {
          await createCallTasks({
            steps: track.steps,
            sequences: insertedSequences ?? [],
            leads: (insertedLeads ?? []).filter((l) => l.track_id === trackId),
            orgId: orgId!,
            campaignId: campaign.id,
            userId: profile?.id ?? null,
          });
        } catch (taskError) {
          console.error("Failed to create call reminders:", taskError);
          toast.error(`"${track.name}" launched, but its call reminders couldn't be created.`);
        }
      }

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
        setTrackResults(((data as any)?.tracks ?? []) as TrackResult[]);
      } catch (fnError: any) {
        const msg = await getFunctionErrorMessage(fnError);
        console.error("send-campaign function failed:", fnError);
        setLaunchError(
          `Campaign saved, but SmartLead didn't accept it: ${msg}. Use "Retry sending" below — pressing Launch again would create a duplicate.`,
        );
        toast.error(`Campaign saved but sending failed: ${msg}`);
        setPhase("idle");
        return;
      }

      // Some sequences may have gone live and others not. Report it
      // honestly and offer a retry, rather than calling it launched.
      const failedTracks = ((fnData as any)?.tracks ?? []).filter(
        (t: TrackResult) => t.status === "failed",
      );
      if (failedTracks.length > 0) {
        setLaunchError(
          `${failedTracks.length} sequence${failedTracks.length === 1 ? "" : "s"} couldn't be sent to SmartLead — see below and use "Retry sending".`,
        );
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

      // Increment usage. Deliberately non-fatal — the campaign is already
      // live in SmartLead by this point, so failing the launch over a
      // billing counter would be worse than under-counting. But it is
      // logged: this call silently failed against a function that didn't
      // exist for the whole life of the launch flow (fixed in 0016).
      const { error: usageError } = await supabase.rpc("increment_leads_used", {
        p_org_id: orgId,
        p_amount: newLeads.length,
      });
      if (usageError) {
        console.error("Failed to record lead usage:", usageError.message);
      }

      setLaunchedCampaignId(campaign.id);
      if (failedTracks.length > 0) {
        // Leave the retry path open; don't claim success.
        setPhase("idle");
        return;
      }
      setPhase("complete");
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

  // Re-sends only the sequences that aren't live yet — send-campaign
  // skips any that already have a SmartLead campaign, so this never
  // duplicates what went out the first time.
  const retrySend = async () => {
    if (!savedCampaignId) return;
    setRetrying(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-campaign", {
        body: { campaign_id: savedCampaignId },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      if ((data as any)?.error) throw new Error((data as any).error);
      const results = ((data as any)?.tracks ?? []) as TrackResult[];
      setTrackResults(results);
      const stillFailed = results.filter((t) => t.status === "failed");
      if (stillFailed.length === 0) {
        setLaunchError(null);
        setLaunchedCampaignId(savedCampaignId);
        setPhase("complete");
        toast.success("All sequences are live");
      } else {
        setLaunchError(
          `${stillFailed.length} sequence${stillFailed.length === 1 ? "" : "s"} still failing — see the reason below.`,
        );
      }
    } catch (e: any) {
      setLaunchError(e?.message || "Retry failed");
      toast.error(e?.message || "Retry failed");
    } finally {
      setRetrying(false);
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
            value={
              state.sender_email
                ? `${state.sender_name ?? ""} <${state.sender_email}>`.trim()
                : "Not selected"
            }
          />
          <SummaryRow label="Timezone" value={state.timezone} />
          <SummaryRow
            label="Schedule"
            value={`${describeDays(state.sendSettings.days)} ${state.sendSettings.startHour}–${state.sendSettings.endHour} · ${state.sendSettings.minGapMinutes} min apart · ${state.sendSettings.maxLeadsPerDay}/day`}
          />
          <SummaryRow label="Leads" value={String(routedCount)} />
          <SummaryRow
            label={state.tracks.length === 1 ? "Sequence" : "Sequences"}
            value={
              state.tracks.length === 1
                ? `${state.tracks[0].name} · ${state.tracks[0].steps.length} steps`
                : state.tracks
                    .map((t) => `${t.name} (${routing.counts.get(t.key) ?? 0})`)
                    .join(" · ")
            }
          />
          {routing.excluded > 0 && (
            <SummaryRow
              label="Left out"
              value={`${routing.excluded} lead${routing.excluded === 1 ? "" : "s"} matching no sequence`}
            />
          )}
          <SummaryRow label="Longest sequence" value={`${longestDays} days`} />
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
        title={
          state.tracks.length === 1
            ? `Sequence (${state.tracks[0]?.steps.length ?? 0} steps)`
            : `Sequences (${state.tracks.length})`
        }
        open={showSequences}
        onToggle={() => setShowSequences((s) => !s)}
      >
        <div className="space-y-5 p-4">
          {state.tracks.map((track) => {
            // Preview each sequence with one of its own leads.
            const sample =
              selectedLeads.find((l) => routing.byLead.get(leadKey(l)) === track.key) ??
              selectedLeads[0] ?? { first_name: "Sample", company: "Example Inc" };
            return (
              <div key={track.key} className="space-y-3">
                {state.tracks.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{track.name}</p>
                    <Badge variant="secondary">
                      {routing.counts.get(track.key) ?? 0} leads
                    </Badge>
                    {track.jobPositions.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        for {track.jobPositions.join(", ")}
                      </span>
                    )}
                  </div>
                )}
                {track.steps.map((s, i) => {
                  const isCall = stepType(s) === "call";
                  const offsetHours = offsetHoursThrough(track.steps, i);
                  const when = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
                  const scheduled =
                    offsetHours === 0
                      ? isCall
                        ? "Due at launch"
                        : "Sent immediately"
                      : `${isCall ? "Due" : "Sends"} ${when.toLocaleString([], {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}`;
                  return (
                    <div key={i} className="rounded-md border border-border p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Badge variant="info">Step {i + 1}</Badge>
                        {isCall ? (
                          <Badge variant="warning">
                            <PhoneCall className="h-3 w-3" /> Call
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Mail className="h-3 w-3" /> Email
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">{scheduled}</span>
                      </div>
                      <div className="text-sm font-semibold">
                        {isCall
                          ? processTemplate(s.title ?? "", sample) || "Call the lead"
                          : processTemplate(s.subject, sample) || "(no subject)"}
                      </div>
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                        {isCall
                          ? processTemplate(s.notes ?? "", sample) || "No call script"
                          : processTemplate(s.body, sample) || "(no body)"}
                      </p>
                      {!isCall && (s.attachments?.length ?? 0) > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {s.attachments!.map((m, j) => (
                            <div key={j} className="relative">
                              <img
                                src={m.kind === "video" ? (m.poster_url ?? "") : m.url}
                                alt={m.name}
                                className="h-14 w-24 rounded border border-border object-cover"
                              />
                              {m.kind === "video" && (
                                <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[10px] text-white">
                                  Video
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Collapsible>

      <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-400">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            This will send emails to <strong>{routedCount}</strong> contacts from{" "}
            <strong>{state.sender_email ?? "your sender account"}</strong>. Step 1 sends
            immediately; steps 2+ are scheduled.
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

      {trackResults.length > 1 && (
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-sm font-semibold">Sequences in SmartLead</p>
            {trackResults.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2.5 text-sm"
              >
                <span className="font-medium">
                  {t.name}
                  {typeof t.leads === "number" && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{t.leads} leads</span>
                  )}
                </span>
                {t.status === "active" && <Badge variant="success">Live</Badge>}
                {t.status === "skipped" && <Badge variant="secondary">No leads — skipped</Badge>}
                {t.status === "pending" && <Badge variant="secondary">Not sent yet</Badge>}
                {t.status === "failed" && <Badge className="bg-destructive/10 text-destructive">Failed</Badge>}
                {t.status === "failed" && t.error && (
                  <p className="w-full text-xs text-destructive">{t.error}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {savedCampaignId && !launched && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={retrySend} disabled={retrying}>
            {retrying ? <Spinner /> : <Rocket className="h-4 w-4" />}
            Retry sending
          </Button>
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
            disabled={phase !== "idle" || routedCount === 0 || !!savedCampaignId}
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

// Fans every call step out across every lead. due_at is launch time
// plus the cumulative delay of all steps up to and including the call,
// which puts it on the same clock as the emails around it.
async function createCallTasks({
  steps,
  sequences,
  leads,
  orgId,
  campaignId,
  userId,
}: {
  steps: SequenceStep[];
  sequences: Array<{ id: string; step: number; step_type: string | null; title: string | null; notes: string | null }>;
  leads: Array<{
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    company: string | null;
    job_title: string | null;
    location: string | null;
  }>;
  orgId: string;
  campaignId: string;
  userId: string | null;
}): Promise<void> {
  const launchedAt = Date.now();
  const rows: Database["public"]["Tables"]["call_tasks"]["Insert"][] = [];

  steps.forEach((step, index) => {
    if (stepType(step) !== "call") return;
    const sequenceRow = sequences.find((r) => r.step === index + 1);
    const dueAt = new Date(
      launchedAt + offsetHoursThrough(steps, index) * 60 * 60 * 1000,
    ).toISOString();

    for (const lead of leads) {
      rows.push({
        org_id: orgId,
        campaign_id: campaignId,
        lead_id: lead.id,
        sequence_id: sequenceRow?.id ?? null,
        step: index + 1,
        // The person who launched the campaign owns the calls; the task
        // is reassignable from the Tasks page afterwards.
        assigned_to: userId,
        created_by: userId,
        // Templated the same way an email subject is, so the reminder
        // reads "Call Sara at ACME" rather than "Call the lead".
        title: processTemplate(step.title?.trim() || "Call {{first_name}} at {{company}}", lead),
        notes: step.notes ? processTemplate(step.notes, lead) : null,
        due_at: dueAt,
      });
    }
  });

  if (rows.length === 0) return;

  // Chunked: a campaign with a few hundred leads and two call steps
  // would otherwise be a single insert of a thousand-plus rows.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from("call_tasks").insert(rows.slice(i, i + CHUNK));
    if (error) throw error;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
