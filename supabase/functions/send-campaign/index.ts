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
}

const SMARTLEAD_API = "https://server.smartlead.ai/api/v1";

interface EmailStep {
  subject: string;
  body: string;
  delayDays: number;
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
    if (row.step_type === "call") {
      carriedHours += hours;
      continue;
    }
    out.push({
      subject: row.subject ?? "",
      body: row.body ?? "",
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
        "id, org_id, name, sender_name, sender_email, reply_to_email, timezone, status",
      )
      .eq("id", campaign_id)
      .maybeSingle();
    if (campaignError || !campaign) {
      return json(
        { error: campaignError?.message ?? "Campaign not found" },
        404,
      );
    }

    // 2. Fetch leads
    const { data: leads, error: leadsError } = await userClient
      .from("leads")
      .select(
        "id, email, first_name, last_name, full_name, company, job_title, location",
      )
      .eq("campaign_id", campaign_id)
      .eq("added_to_campaign", true);
    if (leadsError) return json({ error: leadsError.message }, 500);

    // 3. Fetch sequences
    const { data: sequences, error: sequencesError } = await userClient
      .from("sequences")
      .select("step, step_type, delay_days, delay_hours, subject, body")
      .eq("campaign_id", campaign_id)
      .order("step", { ascending: true });
    if (sequencesError) return json({ error: sequencesError.message }, 500);
    if (!sequences || sequences.length === 0) {
      return json({ error: "No sequence steps for this campaign" }, 400);
    }

    // Call steps are worked by a human out of the app's own task list
    // (public.call_tasks) — SmartLead never sees them. Their delay still
    // counts, though: skipping a call step without carrying its wait
    // forward would pull every later email earlier than intended, so the
    // hours are folded into the next email's delay.
    const emailSteps = buildEmailSteps(sequences as SequenceRow[]);
    if (emailSteps.length === 0) {
      return json(
        { error: "This campaign has no email steps — nothing for SmartLead to send" },
        400,
      );
    }

    // ── Step A: Create SmartLead campaign ──
    const createRes = await smartleadFetch("/campaigns/create", smartleadKey, {
      method: "POST",
      body: JSON.stringify({ name: campaign.name }),
    });
    if (!createRes.ok) {
      const txt = await createRes.text();
      return json(
        { error: `SmartLead create campaign failed (${createRes.status}): ${txt.slice(0, 500)}` },
        502,
      );
    }
    const created = await createRes.json();
    const slCampaignId = created.id ?? created.campaign?.id;
    if (!slCampaignId) {
      return json(
        { error: "SmartLead did not return a campaign ID", raw: created },
        502,
      );
    }

    // ── Step B: Save email sequence ──
    const seqPayload = {
      sequences: emailSteps.map((s, i) => ({
        // SmartLead numbers its own steps consecutively; the original
        // step numbers have gaps wherever a call step was removed.
        seq_number: i + 1,
        seq_delay_details: { delay_in_days: s.delayDays },
        subject: toSmartleadVars(s.subject),
        email_body: toSmartleadVars(s.body).replace(/\n/g, "<br>"),
      })),
    };
    const seqRes = await smartleadFetch(
      `/campaigns/${slCampaignId}/sequences`,
      smartleadKey,
      {
        method: "POST",
        body: JSON.stringify(seqPayload),
      },
    );
    if (!seqRes.ok) {
      const txt = await seqRes.text();
      return json(
        { error: `SmartLead save sequence failed (${seqRes.status}): ${txt.slice(0, 500)}` },
        502,
      );
    }

    // ── Step C: Add leads ──
    const leadsPayload = {
      lead_list: (leads as Lead[]).map((l) => ({
        email: l.email,
        first_name: l.first_name ?? l.full_name?.split(" ")[0] ?? "",
        last_name:
          l.last_name ?? l.full_name?.split(" ").slice(1).join(" ") ?? "",
        company_name: l.company ?? "",
        location: l.location ?? "",
        custom_fields: {
          ...(l.job_title ? { job_title: l.job_title } : {}),
        },
      })),
      settings: {
        ignore_global_block_list: false,
        ignore_unsubscribe_list: false,
        ignore_community_bounce_list: false,
        ignore_duplicate_leads_in_other_campaign: false,
      },
    };
    const leadsRes = await smartleadFetch(
      `/campaigns/${slCampaignId}/leads`,
      smartleadKey,
      {
        method: "POST",
        body: JSON.stringify(leadsPayload),
      },
    );
    if (!leadsRes.ok) {
      const txt = await leadsRes.text();
      return json(
        { error: `SmartLead add leads failed (${leadsRes.status}): ${txt.slice(0, 500)}` },
        502,
      );
    }

    // ── Step C.5: Capture SmartLead's lead ids ──
    // The add-leads response above doesn't return per-lead ids, so read them
    // back via the campaign's lead list and store them locally. This is what
    // lets smartlead-sync later look up each lead's message history.
    try {
      const emailToLocalId = new Map((leads as Lead[]).map((l) => [l.email.toLowerCase(), l.id]));
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

    // ── Step D: Fetch email accounts and assign to campaign ──
    const accountsRes = await smartleadFetch(
      "/email-accounts/",
      smartleadKey,
      { method: "GET" },
    );
    let emailAccountId: number | null = null;
    let senderWarning: string | null = null;
    const senderEmail = (campaign as any).sender_email;
    if (accountsRes.ok) {
      const accounts = await accountsRes.json();
      // Find the SmartLead-connected account matching this campaign's sender.
      const target = Array.isArray(accounts)
        ? accounts.find(
            (a: any) => a.from_email === senderEmail || a.email === senderEmail,
          )
        : null;
      if (target) {
        emailAccountId = target.id;
      }
    }

    if (emailAccountId) {
      const emailAccRes = await smartleadFetch(
        `/campaigns/${slCampaignId}/email-accounts`,
        smartleadKey,
        {
          method: "POST",
          body: JSON.stringify({
            email_account_ids: [emailAccountId],
          }),
        },
      );
      if (!emailAccRes.ok) {
        const txt = await emailAccRes.text();
        console.error("SmartLead assign email account failed:", txt);
        senderWarning = `Campaign was created but couldn't assign ${senderEmail} as its sender in SmartLead (${emailAccRes.status}). Connect/reconnect it in SmartLead's Email Accounts, then assign it to this campaign manually.`;
      }
    } else {
      senderWarning = `Campaign was created but ${senderEmail} isn't connected as an email account in SmartLead, so no sender was assigned — the campaign won't actually send. Connect it in SmartLead's Email Accounts, then assign it to this campaign.`;
      console.warn(senderWarning);
    }

    // ── Step E: Update campaign settings ──
    const settingsRes = await smartleadFetch(
      `/campaigns/${slCampaignId}/settings`,
      smartleadKey,
      {
        method: "POST",
        body: JSON.stringify({
          track_settings: [],
          stop_lead_settings: "REPLY_TO_AN_EMAIL",
          send_as_plain_text: false,
          enable_ai_esp_matching: true,
        }),
      },
    );
    if (!settingsRes.ok) {
      const txt = await settingsRes.text();
      console.error("SmartLead update settings failed:", txt);
      // Non-fatal
    }

    // ── Step F: Schedule campaign ──
    const tz = campaign.timezone || "UTC";
    const scheduleRes = await smartleadFetch(
      `/campaigns/${slCampaignId}/schedule`,
      smartleadKey,
      {
        method: "POST",
        body: JSON.stringify({
          timezone: tz,
          days_of_the_week: [1, 2, 3, 4, 5],
          start_hour: "09:00",
          end_hour: "17:00",
          min_time_btw_emails: 10,
          max_new_leads_per_day: 50,
        }),
      },
    );
    if (!scheduleRes.ok) {
      const txt = await scheduleRes.text();
      console.error("SmartLead schedule failed:", txt);
      return json(
        { error: `SmartLead schedule failed (${scheduleRes.status}): ${txt.slice(0, 500)}` },
        502,
      );
    }

    // ── Step G: Start campaign ──
    const startRes = await smartleadFetch(
      `/campaigns/${slCampaignId}/status`,
      smartleadKey,
      {
        method: "POST",
        body: JSON.stringify({ status: "START" }),
      },
    );
    const startTxt = await startRes.text();
    console.log("SmartLead start response:", startRes.status, startTxt);

    // ── Step H: Register delivery/open/click/reply webhook ──
    // Non-fatal — the campaign still sends without it, it just means the
    // local dashboard won't reflect delivery status until it's added.
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
      if (!webhookRes.ok) {
        console.error("SmartLead webhook registration failed:", await webhookRes.text());
      }
    } catch (e) {
      console.error("SmartLead webhook registration error:", e);
    }

    // ── Update local DB ──
    const { error: updateCampaignErr } = await userClient
      .from("campaigns")
      .update({ status: "active", smartlead_campaign_id: String(slCampaignId) } as any)
      .eq("id", campaign_id);
    if (updateCampaignErr) {
      console.error("Failed to update campaign status:", updateCampaignErr);
    }

    const { error: updateLeadsErr } = await userClient
      .from("leads")
      .update({ email_delivered: false, current_step: 1 })
      .eq("campaign_id", campaign_id);
    if (updateLeadsErr) {
      console.error("Failed to update leads status:", updateLeadsErr);
    }

    return json({
      ok: true,
      smartlead_campaign_id: slCampaignId,
      leads_added: (leads as Lead[]).length,
      sequence_steps: emailSteps.length,
      sender_email: senderEmail,
      email_account_id: emailAccountId,
      scheduled: true,
      start_response: startTxt,
      warning: senderWarning,
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
