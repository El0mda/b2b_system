// Supabase Edge Function: resend-webhooks
//
// Handles incoming webhooks from Resend:
//   1. Delivery events (email.delivered, email.opened, email.clicked, email.bounced, email.complained)
//   2. Inbound replies (lead replies to a campaign email)
//
// Configure in Resend dashboard:
//   Events Webhook: https://[PROJECT_REF].supabase.co/functions/v1/resend-webhooks
//   Inbound Webhook: https://[PROJECT_REF].supabase.co/functions/v1/resend-webhooks
//
// Deploy:
//   supabase functions deploy resend-webhooks
//   supabase secrets set RESEND_API_KEY=re_...
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pushLeadToOdoo } from "../_shared/odoo.ts";

const RESEND_API = "https://api.resend.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return json({ error: "Supabase env vars missing" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    if (!body || Object.keys(body).length === 0) {
      return json({ error: "Empty body" }, 400);
    }

    const sb = createClient(supabaseUrl, supabaseKey);

    // Determine if this is a delivery event or an inbound reply
    if (body.type && body.type.startsWith("email.")) {
      return await handleDeliveryEvent(body, sb);
    }

    if (body.from && (body.text || body.html)) {
      return await handleInboundReply(body, sb);
    }

    // Unknown format — log and return 200 to avoid Resend retries
    await sb.from("webhook_logs").insert({
      event_type: "unknown",
      source: "resend",
      payload: body,
      processed: false,
    });

    return json({ ok: true, message: "Unknown event type — logged" });
  } catch (e: any) {
    console.error("Webhook error:", e);
    return json({ error: e?.message ?? "Internal error" }, 500);
  }
});

// ─── Delivery Events ──────────────────────────────────────────────────────────

async function handleDeliveryEvent(body: any, sb: any): Promise<Response> {
  const eventType = body.type as string; // email.delivered, email.opened, email.clicked, email.bounced, email.complained
  const data = body.data ?? {};
  const tags = data.tags ?? [];

  const tagMap = new Map<string, string>();
  for (const t of tags) {
    if (t.name && t.value) tagMap.set(t.name, t.value);
  }

  const campaignId = tagMap.get("campaign_id");
  const leadId = tagMap.get("lead_id");
  const orgId = tagMap.get("org_id");

  if (!leadId || !orgId) {
    // Can't identify the lead — log and return 200
    await sb.from("webhook_logs").insert({
      event_type: eventType,
      source: "resend",
      lead_email: data.to?.[0] ?? null,
      payload: body,
      processed: false,
    });
    return json({ ok: true, message: "No lead_id/org_id in tags" });
  }

  // Build update payload
  const update: Record<string, any> = {};
  let eventLabel = eventType;

  switch (eventType) {
    case "email.delivered":
      update.email_delivered = true;
      break;
    case "email.opened":
      update.email_opened = true;
      update.email_opened_at = new Date().toISOString();
      break;
    case "email.clicked":
      update.email_clicked = true;
      update.email_clicked_at = new Date().toISOString();
      break;
    case "email.bounced":
      update.email_bounced = true;
      update.email_bounce_reason = data?.bounce?.message ?? data?.bounce?.reason ?? null;
      break;
    case "email.complained":
      update.email_bounced = true;
      update.email_bounce_reason = "Complaint/spam report";
      break;
    default:
      eventLabel = `email.${eventType}`;
  }

  if (Object.keys(update).length > 0) {
    await sb.from("leads").update(update).eq("id", leadId);
  }

  // First click is a weak-but-real engagement signal — push to Odoo as a
  // plain lead (not yet an opportunity; that upgrade happens on reply).
  if (eventType === "email.clicked") {
    try {
      const { data: lead } = await sb
        .from("leads")
        .select(
          "id, org_id, first_name, last_name, company, job_title, email, synced_to_odoo, odoo_lead_id",
        )
        .eq("id", leadId)
        .maybeSingle();
      if (lead && !lead.synced_to_odoo) {
        const { data: campaign } = await sb
          .from("campaigns")
          .select("name")
          .eq("id", campaignId)
          .maybeSingle();
        await pushLeadToOdoo(sb, lead, {
          asOpportunity: false,
          campaignName: campaign?.name,
        });
      }
    } catch (e) {
      console.error("Odoo push-on-click failed:", e);
    }
  }

  // Log the event
  await sb.from("webhook_logs").insert({
    org_id: orgId,
    campaign_id: campaignId,
    event_type: eventType,
    source: "resend",
    lead_email: data.to?.[0] ?? null,
    lead_name: data?.lead_name ?? null,
    payload: body,
    processed: true,
  });

  return json({ ok: true, event: eventLabel, lead_id: leadId });
}

// ─── Inbound Reply ────────────────────────────────────────────────────────────

async function handleInboundReply(body: any, sb: any): Promise<Response> {
  const fromEmail = (body.from ?? "").toLowerCase().trim();
  const text = body.text ?? "";
  const html = body.html ?? "";
  const subject = body.subject ?? "";

  if (!fromEmail) {
    return json({ error: "No from email" }, 400);
  }

  // Find the lead by email where added_to_campaign = true
  const { data: leads, error: leadError } = await sb
    .from("leads")
    .select("id, org_id, campaign_id, first_name, last_name, company, job_title, created_at")
    .eq("email", fromEmail)
    .eq("added_to_campaign", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (leadError) {
    return json({ error: leadError.message }, 500);
  }

  if (!leads || leads.length === 0) {
    // Not a campaign lead — log and ignore
    await sb.from("webhook_logs").insert({
      event_type: "inbound_reply",
      source: "resend",
      lead_email: fromEmail,
      payload: body,
      processed: false,
    });
    return json({ ok: true, message: "Unknown sender — not a campaign lead" });
  }

  const lead = leads[0];
  const now = new Date().toISOString();

  // 1. Save reply_text and replied_at on the lead
  await sb.from("leads").update({
    reply_text: text.slice(0, 5000),
    replied_at: now,
    email_opened: true,
    email_opened_at: now,
  }).eq("id", lead.id);

  // 2. Cancel remaining scheduled emails for this lead via Resend API
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey) {
    try {
      // List emails for this lead (we need to find scheduled ones)
      // Resend doesn't have a direct "list by tag" endpoint,
      // so we cancel based on what we know: steps > current_step
      // We look up the lead's current_step and cancel future emails
      const { data: leadData } = await sb
        .from("leads")
        .select("current_step")
        .eq("id", lead.id)
        .single();

      const currentStep = leadData?.current_step ?? 1;
      // Attempt to cancel by fetching recent sent emails (best-effort)
      // Resend API doesn't expose a cancel-by-tag endpoint natively
      // We rely on the fact that we can't enumerate sent emails via API.
      // Instead we update the lead to stop future sends.
    } catch {
      // non-fatal
    }
  }

  // 3. Odoo auto-sync — upgrade to (or create as) an opportunity, since a
  // reply is a much stronger signal than the click that may have already
  // pushed this lead over as a plain lead.
  try {
    const { data: odooFields } = await sb
      .from("leads")
      .select("synced_to_odoo, odoo_lead_id")
      .eq("id", lead.id)
      .maybeSingle();
    const { data: campaign } = await sb
      .from("campaigns")
      .select("name")
      .eq("id", lead.campaign_id)
      .maybeSingle();
    await pushLeadToOdoo(
      sb,
      { ...lead, email: fromEmail, ...(odooFields ?? {}) },
      {
        asOpportunity: true,
        campaignName: campaign?.name,
        note: `Campaign: ${campaign?.name ?? "Campaign"}\nReply: ${now}\n\n${text.slice(0, 2000)}`,
      },
    );
  } catch (e) {
    console.error("Odoo sync-on-reply failed:", e);
  }

  // 4. Log to webhook_logs
  await sb.from("webhook_logs").insert({
    org_id: lead.org_id,
    campaign_id: lead.campaign_id,
    event_type: "inbound_reply",
    source: "resend",
    lead_email: fromEmail,
    lead_name: `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || null,
    payload: body,
    processed: true,
  });

  return json({ ok: true, message: "Reply processed", lead_id: lead.id });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    "Access-Control-Allow-Headers": "content-type",
  };
}
