// Supabase Edge Function: smartlead-sync
//
// Polls SmartLead directly for delivery/open/click/reply status and mirrors
// it onto local `leads` rows. Built as a fallback to webhooks: SmartLead's
// webhook system accepted registration (200/201, correctly listed via their
// own API) but never actually delivered a single event in testing, with no
// error or delivery log exposed to diagnose why — so this polls instead.
//
// Call modes:
//   { campaign_id: "<local campaign uuid>" }  — sync one campaign (used by
//     the app's manual "Refresh status" action)
//   {} / no body                              — sync every campaign that
//     has a smartlead_campaign_id (used by the cron schedule)
//
// No Supabase auth required (deploy with --no-verify-jwt) — called both by
// the cron schedule (server-to-server) and directly from the app.
//
// Deploy:
//   supabase functions deploy smartlead-sync --no-verify-jwt
//   supabase secrets set SMARTLEAD_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=...

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SMARTLEAD_API = "https://server.smartlead.ai/api/v1";

async function smartleadFetch(path: string, apiKey: string): Promise<Response> {
  const separator = path.includes("?") ? "&" : "?";
  return fetch(`${SMARTLEAD_API}${path}${separator}api_key=${apiKey}`);
}

function stripReplyHtml(html: string): string {
  // Message bodies include the quoted original thread — keep only the
  // reply's own top-level text (everything before the first quoted block).
  // Cut at the tag boundary (the `<`), not mid-attribute, or the trailing
  // fragment (e.g. `class="`) survives the tag-stripping pass below.
  const cutIdx = html.search(/<blockquote|<div[^>]*class="[^"]*gmail_quote/i);
  const withoutQuote = cutIdx >= 0 ? html.slice(0, cutIdx) : html;
  const ENTITIES: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
  };
  return withoutQuote
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function syncLead(
  sb: ReturnType<typeof createClient>,
  smartleadKey: string,
  slCampaignId: string,
  lead: { id: string; smartlead_lead_id: string },
): Promise<void> {
  const res = await smartleadFetch(
    `/campaigns/${slCampaignId}/leads/${lead.smartlead_lead_id}/message-history`,
    smartleadKey,
  );
  if (!res.ok) return;
  const data = await res.json();
  const history: any[] = data?.history ?? [];
  if (history.length === 0) return;

  const updates: Record<string, unknown> = {};
  const sent = history.filter((h) => h.type === "SENT");
  const reply = history.find((h) => h.type === "REPLY");

  if (sent.length > 0) updates.email_delivered = true;
  const anyOpened = sent.some((h) => (h.open_count ?? 0) > 0);
  if (anyOpened) {
    updates.email_opened = true;
    updates.email_opened_at = sent.find((h) => (h.open_count ?? 0) > 0)?.time ?? null;
  }
  const anyClicked = sent.some((h) => (h.click_count ?? 0) > 0);
  if (anyClicked) {
    updates.email_clicked = true;
    updates.email_clicked_at = sent.find((h) => (h.click_count ?? 0) > 0)?.time ?? null;
  }
  if (reply) {
    updates.replied_at = reply.time;
    updates.reply_text = stripReplyHtml(reply.email_body ?? "");
  }

  if (Object.keys(updates).length > 0) {
    await sb.from("leads").update(updates).eq("id", lead.id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const smartleadKey = Deno.env.get("SMARTLEAD_API_KEY");
    if (!supabaseUrl || !serviceKey || !smartleadKey) {
      return json({ error: "Env vars missing" }, 500);
    }
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const campaignId: string | undefined = body?.campaign_id;

    let campaignsQuery = sb
      .from("campaigns")
      .select("id, smartlead_campaign_id")
      .not("smartlead_campaign_id", "is", null);
    if (campaignId) campaignsQuery = campaignsQuery.eq("id", campaignId);
    const { data: campaigns, error: campaignsError } = await campaignsQuery;
    if (campaignsError) return json({ error: campaignsError.message }, 500);

    let leadsSynced = 0;
    for (const campaign of campaigns ?? []) {
      const { data: leads } = await sb
        .from("leads")
        .select("id, smartlead_lead_id")
        .eq("campaign_id", (campaign as any).id)
        .not("smartlead_lead_id", "is", null);
      for (const lead of (leads ?? []) as any[]) {
        await syncLead(sb, smartleadKey, (campaign as any).smartlead_campaign_id, lead);
        leadsSynced++;
      }
    }

    return json({ ok: true, campaigns_synced: campaigns?.length ?? 0, leads_synced: leadsSynced });
  } catch (e: any) {
    console.error("smartlead-sync error:", e);
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
