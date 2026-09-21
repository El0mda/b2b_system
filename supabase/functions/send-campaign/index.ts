// Supabase Edge Function: send-campaign
//
// Reads a campaign + its email sequence steps + verified leads, then:
//   1. Creates a SmartLead campaign
//   2. Saves the email sequence
//   3. Adds leads to the campaign
//   4. Assigns the email account to the campaign
//   5. Updates campaign settings
//   6. Schedules the campaign
//
// Deploy:
//   supabase functions deploy send-campaign
//   supabase secrets set SMARTLEAD_API_KEY=your_key_here
//
// Invoke from the app:
//   supabase.functions.invoke("send-campaign", { body: { campaign_id } })

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface Lead {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  company: string | null;
  job_title: string | null;
  location: string | null;
}

interface SequenceRow {
  step: number;
  step_type: string | null;
  delay_days: number | null;
  delay_hours: number | null;
  subject: string | null;
  body: string | null;
  attachments: unknown;
}

const SMARTLEAD_API = "https://server.smartlead.ai/api/v1";

// When and how fast this campaign may send. Mirrors the defaults in
// src/lib/campaign-settings.ts — a campaign created before that column
// existed has {} and falls back to these.
interface SendSettings {
  days: number[];
  startHour: string;
  endHour: string;
  minGapMinutes: number;
  maxLeadsPerDay: number;
  trackOpens: boolean;
  trackClicks: boolean;
  stopOnReply: boolean;
  plainText: boolean;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseSendSettings(value: any): SendSettings {
  const v = (value ?? {}) as Record<string, any>;
  const days = Array.isArray(v.days)
    ? v.days.filter((n: any) => typeof n === "number" && n >= 0 && n <= 6)
    : [];
  return {
    days: days.length > 0 ? days : [1, 2, 3, 4, 5],
    startHour: typeof v.startHour === "string" && HHMM.test(v.startHour) ? v.startHour : "09:00",
    endHour: typeof v.endHour === "string" && HHMM.test(v.endHour) ? v.endHour : "17:00",
    minGapMinutes: typeof v.minGapMinutes === "number" && v.minGapMinutes > 0 ? v.minGapMinutes : 15,
    maxLeadsPerDay:
      typeof v.maxLeadsPerDay === "number" && v.maxLeadsPerDay > 0 ? v.maxLeadsPerDay : 25,
    trackOpens: typeof v.trackOpens === "boolean" ? v.trackOpens : true,
    trackClicks: typeof v.trackClicks === "boolean" ? v.trackClicks : true,
    stopOnReply: typeof v.stopOnReply === "boolean" ? v.stopOnReply : true,
    plainText: typeof v.plainText === "boolean" ? v.plainText : false,
  };
}

interface EmailStep {
  subject: string;
  body: string;
  mediaHtml: string;
  delayDays: number;
}

// Photos and videos stored on the step (see migration 0019). SmartLead's
// sequence API has no attachment field, so they're embedded as hosted
// media: photos inline, videos as a clickable poster frame (generated
// in the browser at upload time — see src/lib/email-media.ts).
function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function renderMediaHtml(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((raw: any) => {
      if (!raw || typeof raw.url !== "string") return "";
      const url = escapeAttr(raw.url);
      const name = escapeAttr(typeof raw.name === "string" ? raw.name : "attachment");
      if (raw.kind === "image") {
        return `<p style="margin:16px 0"><img src="${url}" alt="${name}" width="560" style="display:block;max-width:100%;height:auto;border:0;border-radius:6px"></p>`;
      }
      if (raw.kind !== "video") return "";
      const poster = typeof raw.poster_url === "string"
        ? `<a href="${url}" target="_blank"><img src="${escapeAttr(raw.poster_url)}" alt="Watch: ${name}" width="560" style="display:block;max-width:100%;height:auto;border:0;border-radius:6px"></a>`
        : "";
      return `<p style="margin:16px 0">${poster}<a href="${url}" target="_blank" style="display:inline-block;margin-top:6px">&#9654; Watch the video</a></p>`;
    })
    .join("");
}

// Drops call steps from the sequence while preserving the cadence:
// every skipped step's wait is added to the next email's, and the total
// is rounded to whole days because that's the only unit SmartLead's
// seq_delay_details accepts.
function buildEmailSteps(rows: SequenceRow[]): EmailStep[] {
  const out: EmailStep[] = [];
  let carriedHours = 0;
  for (const row of rows) {
    const hours = (row.delay_days ?? 0) * 24 + (row.delay_hours ?? 0);
    // Call and WhatsApp steps are done by a person, not SmartLead —
    // anything that isn't an email is skipped, its wait carried forward.
    if ((row.step_type ?? "email") !== "email") {
      carriedHours += hours;
      continue;
    }
    out.push({
      subject: row.subject ?? "",
      body: row.body ?? "",
      mediaHtml: renderMediaHtml(row.attachments),
      delayDays: Math.round((hours + carriedHours) / 24),
    });
    carriedHours = 0;
  }
  return out;
}

// Map app template vars to SmartLead's merge tags, which mirror the lead
// field names sent in Step C below (first_name, last_name, company_name,
// location) — SmartLead's tags are snake_case, not camelCase. Getting this
// wrong doesn't error; SmartLead just silently substitutes an empty string,
// so a mismatch here is invisible until you read a sent email.
function toSmartleadVars(template: string): string {
  const map: Record<string, string> = {
    first_name: "first_name",
    last_name: "last_name",
    full_name: "first_name",
    company: "company_name",
    job_title: "job_title",
    title: "job_title",
    location: "location",
    email: "email",
  };
  let out = template;
  for (const [snake, camel] of Object.entries(map)) {
    out = out.replace(
      new RegExp(`\\{\\{\\s*${snake}\\s*\\}\\}`, "gi"),
      `{{${camel}}}`,
    );
  }
  return out;
}

async function smartleadFetch(
  path: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<Response> {
  const separator = path.includes("?") ? "&" : "?";
  return fetch(`${SMARTLEAD_API}${path}${separator}api_key=${apiKey}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

const LEAD_FIELDS = "id, email, first_name, last_name, full_name, company, job_title, location";
const SEQUENCE_FIELDS = "step, step_type, delay_days, delay_hours, subject, body, attachments";

interface TrackResult {
  id: string;
  name: string;
  status: "active" | "failed" | "skipped" | "pending";
  error?: string;
  leads?: number;
  email_steps?: number;
  smartlead_campaign_id?: string | null;
}

async function markFailed(userClient: any, track: any, error: string): Promise<TrackResult> {
  console.error(`Sequence "${track.name}" (${track.id}) failed: ${error}`);
  await userClient
    .from("campaign_tracks")
    .update({ status: "failed", error: error.slice(0, 500) })
    .eq("id", track.id);
  return { id: track.id, name: track.name, status: "failed", error };
}

interface LaunchContext {
  smartleadKey: string;
  supabaseUrl: string;
  userClient: any;
  campaign: any;
  sendSettings: SendSettings;
  emailAccountId: number | null;
}

type LaunchOutcome =
  | { ok: true; slCampaignId: string; emailSteps: number }
  | { ok: false; error: string };

/**
 * Creates and starts one SmartLead campaign: create, save sequence, add
 * leads, assign the sender, apply settings, schedule, start, and register
 * the webhook. Called once per sequence in the campaign.
 *
 * If a step fails after the SmartLead campaign has been created, the
 * half-built campaign is deleted, so a retry starts clean instead of
 * leaving an orphan behind in SmartLead.
 */
async function launchOnSmartlead(
  input: { name: string; leads: Lead[]; sequences: SequenceRow[] },
  ctx: LaunchContext,
): Promise<LaunchOutcome> {
  const { smartleadKey, supabaseUrl, userClient, campaign, sendSettings, emailAccountId } = ctx;

  // Call steps are worked by a human out of the app's own task list
  // (public.call_tasks) — SmartLead never sees them. Their delay still
  // counts, though, so it's folded into the next email's.
  const emailSteps = buildEmailSteps(input.sequences);
  if (emailSteps.length === 0) {
    return { ok: false, error: "This sequence has no email steps — nothing for SmartLead to send" };
  }

  // ── Step A: Create SmartLead campaign ──
  const createRes = await smartleadFetch("/campaigns/create", smartleadKey, {
    method: "POST",
    body: JSON.stringify({ name: input.name }),
  });
  if (!createRes.ok) {
    const txt = await createRes.text();
    return { ok: false, error: `SmartLead create campaign failed (${createRes.status}): ${txt.slice(0, 300)}` };
  }
  const created = await createRes.json();
  const slCampaignId = created.id ?? created.campaign?.id;
  if (!slCampaignId) return { ok: false, error: "SmartLead did not return a campaign ID" };

  const fail = async (error: string): Promise<LaunchOutcome> => {
    try {
      await smartleadFetch(`/campaigns/${slCampaignId}`, smartleadKey, { method: "DELETE" });
    } catch (e) {
      console.error(`Couldn't clean up SmartLead campaign ${slCampaignId}:`, e);
    }
    return { ok: false, error };
  };

  // ── Step B: Save email sequence ──
  const seqRes = await smartleadFetch(`/campaigns/${slCampaignId}/sequences`, smartleadKey, {
    method: "POST",
    body: JSON.stringify({
      sequences: emailSteps.map((s, i) => ({
        // SmartLead numbers its own steps consecutively; the original
        // step numbers have gaps wherever a call step was removed.
        seq_number: i + 1,
        seq_delay_details: { delay_in_days: s.delayDays },
        subject: toSmartleadVars(s.subject),
        // Media goes after the newline conversion: its markup must reach
        // SmartLead untouched, with no <br> spliced into attributes.
        email_body: toSmartleadVars(s.body).replace(/\n/g, "<br>") + s.mediaHtml,
      })),
    }),
  });
  if (!seqRes.ok) {
    const txt = await seqRes.text();
    return fail(`SmartLead save sequence failed (${seqRes.status}): ${txt.slice(0, 300)}`);
  }

  // ── Step C: Add leads ──
  const leadsRes = await smartleadFetch(`/campaigns/${slCampaignId}/leads`, smartleadKey, {
    method: "POST",
    body: JSON.stringify({
      lead_list: input.leads.map((l) => ({
        email: l.email,
        first_name: l.first_name ?? l.full_name?.split(" ")[0] ?? "",
        last_name: l.last_name ?? l.full_name?.split(" ").slice(1).join(" ") ?? "",
        company_name: l.company ?? "",
        location: l.location ?? "",
        custom_fields: { ...(l.job_title ? { job_title: l.job_title } : {}) },
      })),
      settings: {
        ignore_global_block_list: false,
        ignore_unsubscribe_list: false,
        ignore_community_bounce_list: false,
        ignore_duplicate_leads_in_other_campaign: false,
      },
    }),
  });
  if (!leadsRes.ok) {
    const txt = await leadsRes.text();
    return fail(`SmartLead add leads failed (${leadsRes.status}): ${txt.slice(0, 300)}`);
  }

  // ── Step C.5: Capture SmartLead's lead ids ──
  // The add-leads response doesn't return per-lead ids, so read them back
  // via the campaign's lead list. smartlead-sync needs them later.
  try {
    const emailToLocalId = new Map(input.leads.map((l) => [l.email.toLowerCase(), l.id]));
    let offset = 0;
    const limit = 100;
    for (;;) {
      const listRes = await smartleadFetch(
        `/campaigns/${slCampaignId}/leads?offset=${offset}&limit=${limit}`,
        smartleadKey,
      );
      if (!listRes.ok) break;
      const page = await listRes.json();
      const rows: any[] = page?.data ?? [];
      for (const row of rows) {
        const localId = emailToLocalId.get(String(row.lead?.email ?? "").toLowerCase());
        if (localId && row.lead?.id != null) {
          await userClient
            .from("leads")
            .update({ smartlead_lead_id: String(row.lead.id) } as any)
            .eq("id", localId);
        }
      }
      offset += limit;
      if (rows.length < limit || offset >= Number(page?.total_leads ?? 0)) break;
    }
  } catch (e) {
    console.error("Failed to capture SmartLead lead ids:", e);
  }

  // ── Step D: Assign the sender mailbox ──
  if (emailAccountId) {
    const emailAccRes = await smartleadFetch(`/campaigns/${slCampaignId}/email-accounts`, smartleadKey, {
      method: "POST",
      body: JSON.stringify({ email_account_ids: [emailAccountId] }),
    });
    if (!emailAccRes.ok) {
      console.error("SmartLead assign email account failed:", await emailAccRes.text());
    }
  }

  // ── Step E: Campaign settings ── (non-fatal)
  const settingsRes = await smartleadFetch(`/campaigns/${slCampaignId}/settings`, smartleadKey, {
    method: "POST",
    body: JSON.stringify({
      // SmartLead expresses tracking as opt-outs.
      track_settings: [
        ...(sendSettings.trackOpens ? [] : ["DONT_EMAIL_OPEN"]),
        ...(sendSettings.trackClicks ? [] : ["DONT_LINK_CLICK"]),
      ],
      stop_lead_settings: sendSettings.stopOnReply ? "REPLY_TO_AN_EMAIL" : "NEVER",
      send_as_plain_text: sendSettings.plainText,
      enable_ai_esp_matching: true,
    }),
  });
  if (!settingsRes.ok) console.error("SmartLead update settings failed:", await settingsRes.text());

  // ── Step F: Schedule ──
  const scheduleRes = await smartleadFetch(`/campaigns/${slCampaignId}/schedule`, smartleadKey, {
    method: "POST",
    body: JSON.stringify({
      timezone: campaign.timezone || "UTC",
      days_of_the_week: sendSettings.days,
      start_hour: sendSettings.startHour,
      end_hour: sendSettings.endHour,
      min_time_btw_emails: sendSettings.minGapMinutes,
      max_new_leads_per_day: sendSettings.maxLeadsPerDay,
    }),
  });
  if (!scheduleRes.ok) {
    const txt = await scheduleRes.text();
    return fail(`SmartLead schedule failed (${scheduleRes.status}): ${txt.slice(0, 300)}`);
  }

  // ── Step G: Start ──
  const startRes = await smartleadFetch(`/campaigns/${slCampaignId}/status`, smartleadKey, {
    method: "POST",
    body: JSON.stringify({ status: "START" }),
  });
  console.log(`SmartLead start ${slCampaignId}:`, startRes.status, await startRes.text());

  // ── Step H: Webhook ── (non-fatal: sending works without it)
  try {
    const webhookRes = await smartleadFetch("/webhook/create", smartleadKey, {
      method: "POST",
      body: JSON.stringify({
        name: "Campaign Commander sync",
        webhook_url: `${supabaseUrl}/functions/v1/smartlead-webhooks`,
        email_campaign_id: slCampaignId,
        association_type: 3,
        event_type_map: {
          EMAIL_SENT: true,
          EMAIL_OPENED: true,
          EMAIL_CLICKED: true,
          EMAIL_REPLIED: true,
          EMAIL_BOUNCED: true,
          EMAIL_UNSUBSCRIBED: true,
        },
      }),
    });
    if (!webhookRes.ok) console.error("SmartLead webhook registration failed:", await webhookRes.text());
  } catch (e) {
    console.error("SmartLead webhook registration error:", e);
  }

  return { ok: true, slCampaignId: String(slCampaignId), emailSteps: emailSteps.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const smartleadKey = Deno.env.get("SMARTLEAD_API_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return json({ error: "Supabase env vars missing" }, 500);
    }
    if (!smartleadKey) {
      return json(
        {
          error:
            "SMARTLEAD_API_KEY not configured. Run: supabase secrets set SMARTLEAD_API_KEY=your_key_here",
        },
        500,
      );
    }

    const { campaign_id } = await req.json();
    if (!campaign_id) return json({ error: "campaign_id is required" }, 400);

    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: auth } },
      },
    );

    // 1. Fetch campaign from DB
    const { data: campaign, error: campaignError } = await userClient
      .from("campaigns")
      .select(
        "id, org_id, name, sender_name, sender_email, reply_to_email, timezone, status, send_settings",
      )
      .eq("id", campaign_id)
      .maybeSingle();
    if (campaignError || !campaign) {
      return json(
        { error: campaignError?.message ?? "Campaign not found" },
        404,
      );
    }

    const sendSettings = parseSendSettings((campaign as any).send_settings);

    // The sender mailbox is the same for every sequence in the campaign,
    // so it's looked up once rather than per SmartLead campaign.
    const accountsRes = await smartleadFetch("/email-accounts/", smartleadKey, { method: "GET" });
    let emailAccountId: number | null = null;
    let senderWarning: string | null = null;
    const senderEmail = (campaign as any).sender_email;
    if (accountsRes.ok) {
      const accounts = await accountsRes.json();
      const target = Array.isArray(accounts)
        ? accounts.find((a: any) => a.from_email === senderEmail || a.email === senderEmail)
        : null;
      if (target) emailAccountId = target.id;
    }
    if (!emailAccountId) {
      senderWarning = `${senderEmail} isn't connected as an email account in SmartLead, so no sender was assigned — the campaign won't actually send. Connect it in SmartLead's Email Accounts, then assign it to this campaign.`;
      console.warn(senderWarning);
    }

    const ctx: LaunchContext = {
      smartleadKey,
      supabaseUrl,
      userClient,
      campaign,
      sendSettings,
      emailAccountId,
    };

    const { data: tracks, error: tracksError } = await userClient
      .from("campaign_tracks")
      .select("id, name, position, status, smartlead_campaign_id")
      .eq("campaign_id", campaign_id)
      .order("position", { ascending: true });
    if (tracksError) return json({ error: tracksError.message }, 500);

    // ── Campaigns from before tracks existed: one sequence, one SmartLead
    // campaign, exactly as before.
    if (!tracks || tracks.length === 0) {
      const { data: leads, error: leadsError } = await userClient
        .from("leads")
        .select(LEAD_FIELDS)
        .eq("campaign_id", campaign_id)
        .eq("added_to_campaign", true);
      if (leadsError) return json({ error: leadsError.message }, 500);

      const { data: sequences, error: sequencesError } = await userClient
        .from("sequences")
        .select(SEQUENCE_FIELDS)
        .eq("campaign_id", campaign_id)
        .order("step", { ascending: true });
      if (sequencesError) return json({ error: sequencesError.message }, 500);
      if (!sequences || sequences.length === 0) {
        return json({ error: "No sequence steps for this campaign" }, 400);
      }

      const outcome = await launchOnSmartlead(
        { name: campaign.name, leads: (leads ?? []) as Lead[], sequences: sequences as SequenceRow[] },
        ctx,
      );
      if (!outcome.ok) return json({ error: outcome.error }, 502);

      await userClient
        .from("campaigns")
        .update({ status: "active", smartlead_campaign_id: outcome.slCampaignId } as any)
        .eq("id", campaign_id);
      await userClient
        .from("leads")
        .update({ email_delivered: false, current_step: 1 })
        .eq("campaign_id", campaign_id);

      return json({
        ok: true,
        smartlead_campaign_id: outcome.slCampaignId,
        leads_added: (leads ?? []).length,
        sequence_steps: outcome.emailSteps,
        sender_email: senderEmail,
        email_account_id: emailAccountId,
        scheduled: true,
        warning: senderWarning,
        tracks: [],
      });
    }

    // ── One SmartLead campaign per sequence (SmartLead allows only one
    // sequence per campaign). Safe to call again: sequences already live
    // are left alone, so a retry only re-sends what failed.
    const multi = tracks.length > 1;
    const results: TrackResult[] = [];
    for (const track of tracks as any[]) {
      if (track.status === "active" && track.smartlead_campaign_id) {
        results.push({
          id: track.id,
          name: track.name,
          status: "active",
          smartlead_campaign_id: track.smartlead_campaign_id,
        });
        continue;
      }

      const { data: leads, error: leadsError } = await userClient
        .from("leads")
        .select(LEAD_FIELDS)
        .eq("track_id", track.id)
        .eq("added_to_campaign", true);
      if (leadsError) {
        results.push(await markFailed(userClient, track, leadsError.message));
        continue;
      }
      if (!leads || leads.length === 0) {
        await userClient
          .from("campaign_tracks")
          .update({ status: "skipped", error: null, lead_count: 0 })
          .eq("id", track.id);
        results.push({ id: track.id, name: track.name, status: "skipped", leads: 0 });
        continue;
      }

      const { data: sequences, error: sequencesError } = await userClient
        .from("sequences")
        .select(SEQUENCE_FIELDS)
        .eq("track_id", track.id)
        .order("step", { ascending: true });
      if (sequencesError || !sequences || sequences.length === 0) {
        results.push(
          await markFailed(userClient, track, sequencesError?.message ?? "This sequence has no steps"),
        );
        continue;
      }

      // Named per audience in SmartLead so the split is legible there;
      // a single sequence keeps the plain campaign name.
      const outcome = await launchOnSmartlead(
        {
          name: multi ? `${campaign.name} — ${track.name}` : campaign.name,
          leads: leads as Lead[],
          sequences: sequences as SequenceRow[],
        },
        ctx,
      );

      if (!outcome.ok) {
        results.push(await markFailed(userClient, track, outcome.error));
        continue;
      }

      await userClient
        .from("campaign_tracks")
        .update({
          status: "active",
          smartlead_campaign_id: outcome.slCampaignId,
          error: null,
          lead_count: leads.length,
        })
        .eq("id", track.id);
      await userClient
        .from("leads")
        .update({ email_delivered: false, current_step: 1 })
        .eq("track_id", track.id);
      results.push({
        id: track.id,
        name: track.name,
        status: "active",
        leads: leads.length,
        email_steps: outcome.emailSteps,
        smartlead_campaign_id: outcome.slCampaignId,
      });
    }

    // campaigns.smartlead_campaign_id keeps pointing at the first live
    // sequence, so everything keyed on it (sync, webhooks, the campaign
    // page) still finds this campaign. The rest are found through
    // campaign_tracks.
    const firstActive = results.find((r) => r.status === "active");
    await userClient
      .from("campaigns")
      .update({
        status: firstActive ? "active" : "draft",
        smartlead_campaign_id: firstActive?.smartlead_campaign_id ?? null,
      } as any)
      .eq("id", campaign_id);

    return json({
      ok: results.every((r) => r.status !== "failed"),
      smartlead_campaign_id: firstActive?.smartlead_campaign_id ?? null,
      leads_added: results.reduce((n, r) => n + (r.status === "active" ? (r.leads ?? 0) : 0), 0),
      sequence_steps: results.reduce((n, r) => n + (r.email_steps ?? 0), 0),
      sender_email: senderEmail,
      email_account_id: emailAccountId,
      scheduled: !!firstActive,
      warning: senderWarning,
      tracks: results,
    });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}
