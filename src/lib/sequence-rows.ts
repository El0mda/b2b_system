// The rows a campaign's sequence is stored as, and the call/WhatsApp
// reminders fanned out from it. Shared by the launch step and by
// changing a live campaign's sequence from its page.
import { supabase } from "@/lib/supabase";
import { processTemplate } from "@/lib/template";
import { offsetHoursThrough, stepType, type SequenceStep } from "@/lib/sequence-presets";
import type { Database } from "@/types/db";

// Each sequence's steps are numbered from 1 within that sequence.
export function toSequenceRows(steps: SequenceStep[], campaignId: string, trackId: string | null) {
  return steps.map((s, i) => {
    const kind = stepType(s);
    const human = kind !== "email";
    return {
      campaign_id: campaignId,
      track_id: trackId,
      step: i + 1,
      step_type: kind,
      delay_days: s.delay_days ?? 0,
      delay_hours: s.delay_hours ?? 0,
      subject: human ? null : s.subject,
      body: human ? null : s.body,
      // For a WhatsApp step, `notes` is the message itself.
      title: human ? (s.title?.trim() || defaultTaskTitle(kind)) : null,
      notes: human ? (s.notes ?? null) : null,
      attachments: human ? [] : (s.attachments ?? []),
    };
  });
}

export function defaultTaskTitle(kind: "call" | "whatsapp" | "email"): string {
  return kind === "whatsapp"
    ? "WhatsApp {{first_name}} at {{company}}"
    : "Call {{first_name}} at {{company}}";
}

// Fans every call step out across every lead. due_at is launch time
// plus the cumulative delay of all steps up to and including the call,
// which puts it on the same clock as the emails around it.
export async function createCallTasks({
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
    const kind = stepType(step);
    if (kind === "email") return;
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
        task_type: kind,
        // Templated the same way an email subject is, so the reminder
        // reads "Call Sara at ACME" rather than "Call the lead" — and a
        // WhatsApp message greets the lead by name.
        title: processTemplate(step.title?.trim() || defaultTaskTitle(kind), lead),
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
