import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity";

/**
 * A lead on its way into the database.
 *
 * Produced by the Lusha search and by the file importer, consumed by the
 * campaign wizard and by the Find Leads page.
 */
export interface LeadDraft {
  /** Lusha's contactId. Absent for imported rows. */
  id?: string;
  /**
   * Set when this lead is already a row in the database — saved from the
   * Find Leads page before any campaign existed. The launch attaches
   * that row to the campaign instead of inserting a second copy of the
   * same person.
   */
  lead_id?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  company?: string;
  job_title?: string;
  /** As the data provider wrote it; sequences route on it (job-match.ts). */
  department?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  website?: string;
  nb_result?: string | null;
  email_valid?: boolean | null;
  has_work_email?: boolean;
  has_phones?: boolean;
}

/**
 * Whether a lead has an address worth emailing. A Lusha contact with no
 * email is saved under a made-up `first.last@unknown.com` (the column
 * can't be empty), which must never be sent to: every one bounces and
 * costs the sending domain reputation.
 */
export function hasRealEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim();
  return e.includes("@") && !/@unknown\.com$/i.test(e);
}

/** Wizard selection ids (row indexes) for the leads that can be emailed. */
export function emailableIds(leads: { email?: string | null }[]): Set<string> {
  return new Set(
    leads.flatMap((l, i) => (hasRealEmail(l.email) ? [String(i)] : [])),
  );
}

export function leadDisplayName(l: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  return (
    l.full_name?.trim() ||
    `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim() ||
    ""
  );
}

/** Emails this org already holds, lowercased. Chunked: `in` has limits. */
async function existingEmails(orgId: string, emails: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < emails.length; i += CHUNK) {
    const { data } = await supabase
      .from("leads")
      .select("email")
      .eq("org_id", orgId)
      .in("email", emails.slice(i, i + CHUNK));
    (data ?? []).forEach((r) => r.email && found.add(r.email.toLowerCase()));
  }
  return found;
}

/**
 * Saves searched leads to the Leads list with no campaign attached.
 *
 * created_by is what makes them visible to the person who found them:
 * a lead with no campaign matches no campaign-based rule (migration
 * 0030). Leads already in the org are skipped rather than duplicated,
 * and the Lusha credits spent revealing them are billed here, because
 * this is where they were spent — the launch only bills leads it reveals
 * itself.
 */
export async function saveFoundLeads({
  orgId,
  userId,
  userLabel,
  leads,
}: {
  orgId: string;
  userId: string;
  userLabel?: string;
  leads: LeadDraft[];
}): Promise<{ saved: number; skipped: number }> {
  const withEmail = leads.filter((l) => l.email);
  const existing = await existingEmails(
    orgId,
    withEmail.map((l) => l.email),
  );
  const fresh = withEmail.filter((l) => !existing.has(l.email.toLowerCase()));
  if (fresh.length === 0) {
    return { saved: 0, skipped: withEmail.length };
  }

  const rows = fresh.map((l) => ({
    org_id: orgId,
    campaign_id: null,
    created_by: userId,
    source: "lusha",
    contact_id: l.id ?? null,
    email: l.email,
    first_name: l.first_name ?? null,
    last_name: l.last_name ?? null,
    full_name: l.full_name ?? null,
    company: l.company ?? null,
    job_title: l.job_title ?? null,
    department: l.department ?? null,
    phone: l.phone ?? null,
    location: l.location ?? null,
    linkedin_url: l.linkedin_url ?? null,
    website: l.website ?? null,
    email_valid: l.email_valid ?? null,
    nb_result: l.nb_result ?? null,
    has_work_email: l.has_work_email ?? !!l.email,
    has_phones: l.has_phones ?? !!l.phone,
    added_to_campaign: false,
    current_step: 0,
  }));

  const { error } = await supabase.from("leads").insert(rows);
  if (error) throw error;

  // Non-fatal bookkeeping: the leads are saved either way.
  const { error: usageError } = await supabase.rpc("increment_leads_used", {
    p_org_id: orgId,
    p_amount: rows.length,
  });
  if (usageError) console.error("Failed to record lead usage:", usageError.message);

  logActivity({
    orgId,
    actorId: userId,
    action: "leads_found",
    summary: `${userLabel ?? "A team member"} saved ${rows.length} lead${
      rows.length === 1 ? "" : "s"
    } from a Lusha search`,
    metadata: { count: rows.length },
  });

  return { saved: rows.length, skipped: withEmail.length - fresh.length };
}
