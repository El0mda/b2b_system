// Swaps the sequence on a campaign that's already been launched — for
// when the wrong one went out. Pick another from the library and/or edit
// the steps; saving replaces the campaign's stored steps, re-creates the
// call/WhatsApp reminders still to come, and re-saves the email steps on
// the existing SmartLead campaign, so its leads, stats and replies stay.
//
// Only offered while the campaign is paused: SmartLead would otherwise
// keep sending the old steps while the new ones are being written.
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";
import { createCallTasks, toSequenceRows } from "@/lib/sequence-rows";
import { parseMedia } from "@/lib/email-media";
import { useSequenceLibrary } from "@/lib/sequence-library";
import {
  ANY_VERTICAL,
  SEQUENCE_PRESETS,
  isStepComplete,
  type SequenceStep,
} from "@/lib/sequence-presets";
import { getFunctionErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SequenceStepList } from "@/components/sequence/step-editor";

/** A step as stored on the campaign (public.sequences). */
export interface StoredStep {
  id: string;
  step: number;
  step_type: string | null;
  delay_days: number | null;
  delay_hours: number | null;
  subject: string | null;
  body: string | null;
  title: string | null;
  notes: string | null;
  attachments: unknown;
}

interface CallTaskLead {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  company: string | null;
  job_title: string | null;
  location: string | null;
}

function toEditorSteps(rows: StoredStep[]): SequenceStep[] {
  return [...rows]
    .sort((a, b) => a.step - b.step)
    .map((r, i) => ({
      step: i + 1,
      type: r.step_type === "call" || r.step_type === "whatsapp" ? r.step_type : "email",
      delay_days: r.delay_days ?? 0,
      delay_hours: r.delay_hours ?? 0,
      subject: r.subject ?? "",
      body: r.body ?? "",
      title: r.title ?? undefined,
      notes: r.notes ?? undefined,
      attachments: parseMedia(r.attachments),
    }));
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export function ChangeSequenceDialog({
  open,
  onClose,
  campaignId,
  campaignName,
  track,
  currentSteps,
  leads,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  campaignName: string;
  /** Null for a campaign from before multi-sequence support. */
  track: { id: string; name: string } | null;
  currentSteps: StoredStep[];
  /** The leads on this sequence — they get its call/WhatsApp reminders. */
  leads: CallTaskLead[];
}) {
  const { organization, profile } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const { templates } = useSequenceLibrary(orgId);

  const [name, setName] = useState(track?.name ?? "");
  const [steps, setSteps] = useState<SequenceStep[]>(() => toEditorSteps(currentSteps));
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [picked, setPicked] = useState("");

  // An org that hasn't opened its library yet still gets the built-ins.
  const choices = useMemo(
    () =>
      templates.length > 0
        ? templates.map((t) => ({ key: t.id, name: t.name, steps: t.steps, templateId: t.id as string | null }))
        : SEQUENCE_PRESETS.filter((p) => p.vertical !== ANY_VERTICAL).map((p) => ({
            key: `builtin:${p.key}`,
            name: p.name,
            steps: p.steps,
            templateId: null as string | null,
          })),
    [templates],
  );

  const loadTemplate = (key: string) => {
    setPicked(key);
    const t = choices.find((c) => c.key === key);
    if (!t) return;
    setSteps(clone(t.steps).map((s, i) => ({ ...s, step: i + 1 })));
    setTemplateId(t.templateId);
    if (track) setName(t.name);
  };

  const hasEmail = steps.some((s) => (s.type ?? "email") === "email");
  const incomplete = steps.some((s) => !isStepComplete(s));

  const save = useMutation({
    mutationFn: async () => {
      const oldIds = currentSteps.map((s) => s.id);

      // Reminders already worked stay as history; the ones still to come
      // belonged to the old steps and would be wrong now.
      if (oldIds.length > 0) {
        const { error: tasksError } = await supabase
          .from("call_tasks")
          .delete()
          .in("sequence_id", oldIds)
          .eq("status", "pending");
        if (tasksError) throw tasksError;
        const { error: delError } = await supabase.from("sequences").delete().in("id", oldIds);
        if (delError) throw delError;
      }

      const { data: inserted, error: insError } = await supabase
        .from("sequences")
        .insert(toSequenceRows(steps, campaignId, track?.id ?? null))
        .select("id, step, step_type, title, notes");
      if (insError) throw insError;

      if (track) {
        const { error: trackError } = await supabase
          .from("campaign_tracks")
          .update({ name: name.trim() || track.name, template_id: templateId ?? undefined })
          .eq("id", track.id);
        if (trackError) throw trackError;
      }

      // Non-fatal, as at launch: the steps are saved either way. Due
      // times count from now, the same as a fresh launch.
      let remindersFailed = false;
      try {
        await createCallTasks({
          steps,
          sequences: inserted ?? [],
          leads,
          orgId: orgId!,
          campaignId,
          userId: profile?.id ?? null,
        });
      } catch (e) {
        console.error("Failed to create call reminders:", e);
        remindersFailed = true;
      }

      const { data, error } = await supabase.functions.invoke("send-campaign", {
        body: { campaign_id: campaignId, track_id: track?.id ?? null, sequence_only: true },
      });
      if (error) {
        throw new Error(
          `Saved here, but SmartLead wasn't updated: ${await getFunctionErrorMessage(error)}. Save again to retry.`,
        );
      }
      if ((data as any)?.error) {
        throw new Error(`Saved here, but SmartLead wasn't updated: ${(data as any).error}. Save again to retry.`);
      }
      return { remindersFailed, onSmartlead: !!(data as any)?.updated_on_smartlead };
    },
    onSettled: () => {
      // The old rows are gone even when a later step failed, so the page
      // has to re-read what's actually stored.
      qc.invalidateQueries({ queryKey: ["campaign-sequences", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-tracks", campaignId] });
    },
    onSuccess: ({ remindersFailed, onSmartlead }) => {
      if (orgId && profile) {
        logActivity({
          orgId,
          actorId: profile.id,
          action: "campaign_sequence_changed",
          summary: `${profile.full_name ?? profile.email} changed the sequence${track ? ` "${name.trim() || track.name}"` : ""} on campaign "${campaignName}"`,
          metadata: { campaign_id: campaignId, track_id: track?.id ?? null },
        });
      }
      toast.success(
        onSmartlead
          ? "Sequence changed and updated in SmartLead — activate the campaign to resume sending"
          : "Sequence changed",
      );
      if (remindersFailed) toast.error("The new call/WhatsApp reminders couldn't be created.");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't change the sequence"),
  });

  return (
    <Dialog open={open} onClose={onClose} className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Change sequence{track ? ` — ${track.name}` : ""}</DialogTitle>
        <DialogDescription>
          The new steps replace the old ones on this campaign and in SmartLead. Leads who already
          got emails continue from the step they're on, so a lead past step 2 gets the new step 3
          next. Upcoming call and WhatsApp reminders are re-created; finished ones are kept.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="change-seq-template">Load from your sequences</Label>
            <Select
              id="change-seq-template"
              value={picked}
              onChange={(e) => loadTemplate(e.target.value)}
            >
              <option value="">Choose a sequence…</option>
              {choices.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          {track && (
            <div className="space-y-1.5">
              <Label htmlFor="change-seq-name">Name</Label>
              <Input id="change-seq-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
        </div>

        <SequenceStepList steps={steps} onChange={setSteps} idPrefix="change-seq" />

        {!hasEmail && (
          <p className="text-sm text-destructive">
            Add at least one email step — that's what SmartLead sends.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || steps.length === 0 || !hasEmail || incomplete}
          title={incomplete ? "Every step needs its content filled in" : undefined}
        >
          {save.isPending && <Spinner />}
          Save sequence
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
