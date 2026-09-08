// Supabase Edge Function: smartlead-webhooks
//
// Receives real-time event webhooks from SmartLead (EMAIL_SENT, EMAIL_OPENED,
// EMAIL_CLICKED, EMAIL_REPLIED, EMAIL_BOUNCED, EMAIL_UNSUBSCRIBED) and mirrors
// them onto the matching local `leads` row so the dashboard reflects delivery
// status.
//
// SmartLead's payload carries its own numeric campaign_id and lead_id, not
// our UUIDs, so:
//   - campaigns are matched via campaigns.smartlead_campaign_id
//   - leads are matched via leads.smartlead_lead_id, which this function
//     backfills the first time it sees a lead (EMAIL_SENT/EMAIL_REPLIED
//     payloads include both lead_id and the lead's email; EMAIL_OPENED/
//     EMAIL_CLICKED only include lead_id, so they rely on that backfill
//     having already happened via an earlier EMAIL_SENT event).
//
// This endpoint is called by SmartLead directly, not from the app, so it
// carries no Supabase auth — deploy with --no-verify-jwt and use the
// service role key to write past RLS.
//
// Deploy:
//   supabase functions deploy smartlead-webhooks --no-verify-jwt
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
//
// Register with SmartLead (per-campaign, done automatically by send-campaign,
// or manually):
//   POST https://server.smartlead.ai/api/v1/webhook/create?api_key=...
//   { "name": "...", "webhook_url": "https://[ref].supabase.co/functions/v1/smartlead-webhooks",
//     "email_campaign_id": <id>, "association_type": 3,
//     "event_type_map": { "EMAIL_SENT": true, "EMAIL_OPENED": true, "EMAIL_CLICKED": true,
//                          "EMAIL_REPLIED": true, "EMAIL_BOUNCED": true, "EMAIL_UNSUBSCRIBED": true } }

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pushLeadToOdoo } from "../_shared/odoo.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Supabase env vars missing" }, 500);
    }
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => null);
    if (!body || !body.event) {
      return json({ error: "Missing event" }, 400);
    }

    const event: string = body.event;
    const slCampaignId = body.campaign_id != null ? String(body.campaign_id) : null;
    const slLeadId = body.lead_id != null ? String(body.lead_id) : null;
    const leadEmail: string | null = body.lead?.email ?? body.email?.to ?? null;

    const { data: campaign } = slCampaignId
      ? await sb
          .from("campaigns")
          .select("id, org_id, name, created_by")
          .eq("smartlead_campaign_id", slCampaignId)
          .maybeSingle()
      : { data: null };

    // Always log the raw event, matched or not — makes debugging delivery
    // issues possible without re-querying SmartLead.
    await sb.from("webhook_logs").insert({
      org_id: campaign?.org_id ?? null,
      event_type: event,
      source: "smartlead",
      campaign_name: campaign?.name ?? null,
      lead_email: leadEmail,
      lead_name: body.lead
        ? `${body.lead.first_name ?? ""} ${body.lead.last_name ?? ""}`.trim()
        : null,
      payload: body,
      processed: !!campaign,
    });

    if (!campaign) {
      // No matching local campaign (e.g. a campaign from before this
      // integration existed) — nothing further to update.
      return json({ ok: true, matched: false });
    }

    let leadQuery = sb.from("leads").select("id, smartlead_lead_id").eq("campaign_id", campaign.id);
    leadQuery = slLeadId
      ? leadQuery.eq("smartlead_lead_id", slLeadId)
      : leadEmail
        ? leadQuery.ilike("email", leadEmail)
        : leadQuery.eq("id", "__none__"); // no identifying info — no-op match
    const { data: lead } = await leadQuery.maybeSingle();

    // First time we see this lead (EMAIL_SENT/EMAIL_REPLIED carry both
    // lead_id and email) — backfill smartlead_lead_id so later
    // lead_id-only events (OPENED/CLICKED) can find it.
    let leadRowId = lead?.id ?? null;
    if (!leadRowId && leadEmail) {
      const { data: byEmail } = await sb
        .from("leads")
        .select("id")
        .eq("campaign_id", campaign.id)
        .ilike("email", leadEmail)
        .maybeSingle();
      leadRowId = byEmail?.id ?? null;
    }
    if (!leadRowId) {
      return json({ ok: true, matched: true, lead_matched: false });
    }
    if (slLeadId && !lead?.smartlead_lead_id) {
      await sb.from("leads").update({ smartlead_lead_id: slLeadId }).eq("id", leadRowId);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {};
    switch (event) {
      case "EMAIL_SENT":
        updates.email_delivered = true;
        break;
      case "EMAIL_OPENED":
        updates.email_opened = true;
        updates.email_opened_at = now;
        break;
      case "EMAIL_CLICKED":
        updates.email_clicked = true;
        updates.email_clicked_at = now;
        break;
      case "EMAIL_REPLIED":
        updates.replied_at = now;
        updates.reply_text = body.reply?.body ?? null;
        break;
      case "EMAIL_BOUNCED":
        updates.email_bounced = true;
        updates.email_bounce_reason = body.reason ?? body.bounce_reason ?? null;
        break;
      default:
        // EMAIL_UNSUBSCRIBED and anything else — logged above, no column to update.
        break;
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await sb.from("leads").update(updates).eq("id", leadRowId);
      if (error) return json({ error: error.message }, 500);
    }

    // Push to Odoo: first click creates a plain lead there, a reply
    // creates (or upgrades an already-clicked lead to) an opportunity.
    if (event === "EMAIL_CLICKED" || event === "EMAIL_REPLIED") {
      try {
        const { data: leadForOdoo } = await sb
          .from("leads")
          .select(
            "id, org_id, first_name, last_name, company, job_title, email, synced_to_odoo, odoo_lead_id",
          )
          .eq("id", leadRowId)
          .maybeSingle();
        if (leadForOdoo && (event === "EMAIL_REPLIED" || !leadForOdoo.synced_to_odoo)) {
          let odooUserId: string | null = null;
          if (campaign.created_by) {
            const { data: creator } = await sb
              .from("users")
              .select("odoo_user_id")
              .eq("id", campaign.created_by)
              .maybeSingle();
            odooUserId = creator?.odoo_user_id ?? null;
          }
          await pushLeadToOdoo(sb, leadForOdoo, {
            asOpportunity: event === "EMAIL_REPLIED",
            campaignName: campaign.name,
            odooUserId,
            note:
              event === "EMAIL_REPLIED"
                ? `Campaign: ${campaign.name}\nReply: ${now}\n\n${(body.reply?.body ?? "").slice(0, 2000)}`
                : undefined,
          });
        }
      } catch (e) {
        console.error("Odoo push failed:", e);
      }
    }

    return json({ ok: true, matched: true, lead_matched: true });
  } catch (e: any) {
    console.error("smartlead-webhooks error:", e);
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
