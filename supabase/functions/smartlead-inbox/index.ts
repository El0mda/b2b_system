// Supabase Edge Function: smartlead-inbox
//
// The app's replies inbox: read a lead's email thread, and reply to it,
// without leaving the app for SmartLead.
//
// Actions (POST, with the caller's JWT):
//   { action: "thread", lead_id }        — the conversation, oldest first
//   { action: "reply",  lead_id, body }  — answer the lead's latest reply
//
// Access is decided by the caller's own permissions: the lead is loaded
// through a client carrying their JWT, so row-level security hides any
// lead that isn't on one of their campaigns (owner/admin see all — see
// migration 0010). The SmartLead key itself never leaves the server.
//
// Deploy: supabase functions deploy smartlead-inbox

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SMARTLEAD_API = "https://server.smartlead.ai/api/v1";

function smartleadFetch(path: string, apiKey: string, init: RequestInit = {}) {
  const sep = path.includes("?") ? "&" : "?";
  return fetch(`${SMARTLEAD_API}${path}${sep}api_key=${apiKey}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Email HTML → readable text.
 *
 * The inbox shows plain text rather than rendering the lead's HTML: an
 * email body is content from outside the company, and injecting it into
 * the page would let a crafted email run script in a salesperson's
 * session. Quoted history ("On … wrote:") is cut so each message shows
 * only what it adds — the full thread is already on screen.
 */
export function htmlToText(html: string): string {
  const cut = html.search(/<blockquote|<div[^>]*class="[^"]*gmail_quote/i);
  const own = cut >= 0 ? html.slice(0, cut) : html;
  return own
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(p|div|li|tr|h[1-6])(\s[^>]*)?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface Message {
  type: "sent" | "reply";
  time: string | null;
  subject: string | null;
  text: string;
  // Needed to thread a reply onto the right message; not sent to the app.
  raw: any;
}

/**
 * SmartLead's history entries, oldest first. Field names are read
 * defensively (message_id vs messageId, stats_id vs email_stats_id)
 * because the two versions of SmartLead's docs disagree on them.
 */
export function normalizeHistory(history: any[]): Message[] {
  return history
    .map((h) => ({
      type: (h?.type === "REPLY" ? "reply" : "sent") as Message["type"],
      time: h?.time ?? h?.sent_time ?? null,
      subject: h?.subject ?? null,
      text: htmlToText(String(h?.email_body ?? h?.body ?? "")),
      raw: h,
    }))
    .sort((a, b) => new Date(a.time ?? 0).getTime() - new Date(b.time ?? 0).getTime());
}

/**
 * The payload for SmartLead's reply-email-thread.
 *
 * SmartLead's two sets of docs list different fields for this call — one
 * shows lead_id / email_body / reply_message_id / reply_email_time, the
 * other also email_stats_id / reply_email_body / add_signature. Sending
 * every field either names (from the message being answered) is harmless
 * where extra, and avoids a rejection where required.
 */
export function buildReplyPayload(
  slLeadId: string,
  target: any,
  bodyText: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    lead_id: Number.isNaN(Number(slLeadId)) ? slLeadId : Number(slLeadId),
    email_body: escapeHtml(bodyText.trim()).replace(/\n/g, "<br>"),
    email_stats_id: target?.stats_id ?? target?.email_stats_id,
    reply_message_id: target?.message_id ?? target?.messageId,
    reply_email_time: target?.time,
    reply_email_body: target?.email_body,
    add_signature: true,
  };
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined || payload[k] === null) delete payload[k];
  }
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const smartleadKey = Deno.env.get("SMARTLEAD_API_KEY");
    if (!supabaseUrl || !anonKey) return json({ error: "Supabase env vars missing" }, 500);
    if (!smartleadKey) return json({ error: "SMARTLEAD_API_KEY secret not set" }, 500);

    const { action, lead_id, body } = await req.json().catch(() => ({}));
    if (!lead_id) return json({ error: "lead_id is required" }, 400);
    if (action !== "thread" && action !== "reply") {
      return json({ error: `Unknown action: ${action}` }, 400);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });

    // Loaded as the caller: RLS hides leads that aren't theirs.
    const { data: lead } = await userClient
      .from("leads")
      .select("id, org_id, email, smartlead_lead_id, campaign_id, track_id")
      .eq("id", lead_id)
      .maybeSingle();
    if (!lead) return json({ error: "Conversation not found" }, 404);
    if (!lead.smartlead_lead_id) {
      return json({ error: "This lead isn't linked to SmartLead yet — try again in a few minutes." }, 409);
    }

    // With several sequences, the lead lives in its own sequence's
    // SmartLead campaign, not the campaign-level one.
    let slCampaignId: string | null = null;
    if (lead.track_id) {
      const { data: track } = await userClient
        .from("campaign_tracks")
        .select("smartlead_campaign_id")
        .eq("id", lead.track_id)
        .maybeSingle();
      slCampaignId = track?.smartlead_campaign_id ?? null;
    }
    if (!slCampaignId && lead.campaign_id) {
      const { data: campaign } = await userClient
        .from("campaigns")
        .select("smartlead_campaign_id")
        .eq("id", lead.campaign_id)
        .maybeSingle();
      slCampaignId = campaign?.smartlead_campaign_id ?? null;
    }
    if (!slCampaignId) return json({ error: "This lead's campaign isn't in SmartLead" }, 409);

    const histRes = await smartleadFetch(
      `/campaigns/${slCampaignId}/leads/${lead.smartlead_lead_id}/message-history`,
      smartleadKey,
    );
    if (!histRes.ok) {
      const t = await histRes.text();
      return json({ error: `SmartLead returned ${histRes.status}: ${t.slice(0, 200)}` }, 502);
    }
    const histJson = await histRes.json();
    const messages = normalizeHistory(histJson?.history ?? []);

    if (action === "thread") {
      return json({
        ok: true,
        messages: messages.map(({ raw: _raw, ...m }) => m),
      });
    }

    // ── reply ──
    const text = typeof body === "string" ? body.trim() : "";
    if (!text) return json({ error: "Write a message first" }, 400);
    if (text.length > 10_000) return json({ error: "That message is too long" }, 400);

    // Answer the lead's most recent reply, so it threads under what they
    // actually said last.
    const target = [...messages].reverse().find((m) => m.type === "reply");
    if (!target) return json({ error: "This lead hasn't replied — there's nothing to answer yet." }, 400);

    const payload = buildReplyPayload(String(lead.smartlead_lead_id), target.raw, text);
    const replyRes = await smartleadFetch(`/campaigns/${slCampaignId}/reply-email-thread`, smartleadKey, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const replyText = await replyRes.text();
    if (!replyRes.ok) {
      // SmartLead's own message, verbatim — this call's required fields
      // aren't documented consistently, so the exact reason matters.
      console.error("SmartLead reply failed:", replyRes.status, replyText, Object.keys(payload));
      return json({ error: `SmartLead didn't send the reply (${replyRes.status}): ${replyText.slice(0, 300)}` }, 502);
    }

    // Best-effort bookkeeping: replying counts as reading, and the team
    // feed records who answered whom.
    try {
      await userClient.from("leads").update({ reply_read_at: new Date().toISOString() }).eq("id", lead.id);
      const { data: authUser } = await userClient.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
      if (authUser?.user) {
        await userClient.from("activity_log").insert({
          org_id: lead.org_id,
          actor_id: authUser.user.id,
          action: "lead_reply_sent",
          summary: `Replied to ${lead.email} from the inbox`,
          metadata: { lead_id: lead.id },
        });
      }
    } catch (e) {
      console.error("post-reply bookkeeping failed:", e);
    }

    return json({ ok: true });
  } catch (e: any) {
    console.error("smartlead-inbox error:", e);
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
