// Supabase Edge Function: send-campaign
//
// Reads a campaign + its sequences + verified leads, then:
//   1. Creates Resend audience contacts for each lead
//   2. Sends Step 1 emails immediately
//   3. Schedules follow-up steps (2+) using scheduled_at
//
// Deploy:
//   supabase functions deploy send-campaign
//   supabase secrets set RESEND_API_KEY=re_...
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
  delay_days: number | null;
  subject: string;
  body: string;
}

const RESEND_API = "https://api.resend.com";

function processTemplate(template: string, lead: Lead): string {
  const map: Record<string, string> = {
    first_name: lead.first_name ?? lead.full_name?.split(" ")[0] ?? "",
    last_name:
      lead.last_name ?? lead.full_name?.split(" ").slice(1).join(" ") ?? "",
    full_name: lead.full_name ?? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim(),
    company: lead.company ?? "",
    title: lead.job_title ?? "",
    job_title: lead.job_title ?? "",
    location: lead.location ?? "",
    email: lead.email ?? "",
  };
  let out = template;
  for (const [k, v] of Object.entries(map)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "gi"), v);
  }
  return out;
}

function calculateScheduledDate(prevDelays: number[]): string {
  const totalDays = prevDelays.reduce((sum, d) => sum + (d || 0), 0);
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + totalDays);
  return date.toISOString();
}

async function resendFetch(
  path: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${RESEND_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
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
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return json({ error: "Supabase env vars missing" }, 500);
    }
    if (!resendKey) {
      return json(
        {
          error: "RESEND_API_KEY not configured. Run: supabase secrets set RESEND_API_KEY=re_...",
        },
        500,
      );
    }

    const { campaign_id } = await req.json();
    if (!campaign_id) return json({ error: "campaign_id is required" }, 400);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: auth } },
    });

    const { data: campaign, error: campaignError } = await userClient
      .from("campaigns")
      .select(
        "id, org_id, name, sender_name, sender_email, reply_to_email, timezone, status",
      )
      .eq("id", campaign_id)
      .maybeSingle();
    if (campaignError || !campaign) {
      return json({ error: campaignError?.message ?? "Campaign not found" }, 404);
    }

    // Fetch the org's Resend audience ID from settings
    const { data: audienceSetting } = await userClient
      .from("settings")
      .select("value")
      .eq("org_id", campaign.org_id)
      .eq("key", "resend_audience_id")
      .maybeSingle();
    const audienceId = (audienceSetting as { value?: string })?.value ?? null;

    const { data: leads, error: leadsError } = await userClient
      .from("leads")
      .select("id, email, first_name, last_name, full_name, company, job_title, location")
      .eq("campaign_id", campaign_id)
      .eq("added_to_campaign", true);
    if (leadsError) return json({ error: leadsError.message }, 500);

    const { data: sequences, error: sequencesError } = await userClient
      .from("sequences")
      .select("step, delay_days, subject, body")
      .eq("campaign_id", campaign_id)
      .order("step", { ascending: true });
    if (sequencesError) return json({ error: sequencesError.message }, 500);
    if (!sequences || sequences.length === 0) {
      return json({ error: "No sequence steps for this campaign" }, 400);
    }

    const fromHeader = `${campaign.sender_name ?? "Sender"} <${campaign.sender_email}>`;
    const replyTo = campaign.reply_to_email ?? campaign.sender_email;
    const orgId = campaign.org_id ?? "";

    let contactsCreated = 0;
    let stepOneSent = 0;
    let followupsScheduled = 0;
    const errors: string[] = [];

    for (const lead of (leads ?? []) as Lead[]) {
      // 0. Create contact in Resend audience (if audience ID is configured)
      if (audienceId) {
        try {
          await resendFetch(`/contacts`, resendKey, {
            method: "POST",
            body: JSON.stringify({
              audience_id: audienceId,
              email: lead.email,
              first_name: lead.first_name ?? "",
              last_name: lead.last_name ?? "",
              unsubscribed: false,
            }),
          });
        } catch {
          // non-fatal — contact creation is best-effort
        }
      }
      contactsCreated++;

      // 1. Step 1: send immediately
      const first = sequences[0] as SequenceRow;
      const html = processTemplate(first.body, lead).replace(/\n/g, "<br>");
      const subject = processTemplate(first.subject, lead);

      const r1 = await resendFetch("/emails", resendKey, {
        method: "POST",
        body: JSON.stringify({
          from: fromHeader,
          to: [lead.email],
          reply_to: replyTo,
          subject,
          html,
          tags: [
            { name: "campaign_id", value: campaign.id },
            { name: "lead_id", value: lead.id },
            { name: "step", value: "1" },
            { name: "org_id", value: orgId },
          ],
        }),
      });
      if (r1.ok) {
        stepOneSent++;
      } else {
        const text = await r1.text();
        errors.push(`step1 ${lead.email}: ${text.slice(0, 200)}`);
        continue;
      }

      // 2. Steps 2+: schedule
      for (let i = 1; i < sequences.length; i++) {
        const seq = sequences[i] as SequenceRow;
        const scheduled = calculateScheduledDate(
          sequences.slice(0, i + 1).map((s) => s.delay_days ?? 0),
        );
        const r = await resendFetch("/emails", resendKey, {
          method: "POST",
          body: JSON.stringify({
            from: fromHeader,
            to: [lead.email],
            reply_to: replyTo,
            subject: processTemplate(seq.subject, lead),
            html: processTemplate(seq.body, lead).replace(/\n/g, "<br>"),
            scheduled_at: scheduled,
            tags: [
              { name: "campaign_id", value: campaign.id },
              { name: "lead_id", value: lead.id },
              { name: "step", value: String(i + 1) },
              { name: "org_id", value: orgId },
            ],
          }),
        });
        if (r.ok) followupsScheduled++;
        else {
          const text = await r.text();
          errors.push(`step${i + 1} ${lead.email}: ${text.slice(0, 200)}`);
        }
      }
    }

    // Mark all selected leads as in-flight
    await userClient
      .from("leads")
      .update({ email_delivered: false, current_step: 1 })
      .eq("campaign_id", campaign_id);

    return json({
      ok: true,
      contacts_created: contactsCreated,
      step1_sent: stepOneSent,
      scheduled_followups: followupsScheduled,
      errors: errors.slice(0, 10),
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
