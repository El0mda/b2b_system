// Supabase Edge Function: delete-leads
//
// Removes prospects from the app — and first from SmartLead, so a deleted
// lead in a running campaign stops being emailed. Deleting only the local
// row would leave SmartLead working through the rest of their sequence
// with nothing in the app pointing at them.
//
//   POST { lead_ids: string[], force?: boolean }
//     → { deleted, smartlead_failed: [{ id, email, error }] }
//
// A lead SmartLead won't let go of is kept, and reported, unless `force`
// is set — the same rule campaign-action applies to whole campaigns.
// Odoo is left alone: an opportunity there is the sales team's record,
// and deleting a prospect here doesn't undo the deal.
//
// The caller's JWT decides which leads they may delete: everything runs
// through a user-scoped client, so row-level security drops any lead
// they can't see (migration 0030).
//
// Deploy: supabase functions deploy delete-leads

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SMARTLEAD_API = "https://server.smartlead.ai/api/v1";
const MAX_LEADS = 1000;

function smartleadFetch(path: string, apiKey: string, init: RequestInit = {}) {
  const sep = path.includes("?") ? "&" : "?";
  return fetch(`${SMARTLEAD_API}${path}${sep}api_key=${apiKey}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const smartleadKey = Deno.env.get("SMARTLEAD_API_KEY");
    if (!supabaseUrl || !anonKey) return json({ error: "Supabase env vars missing" }, 500);

    const body = (await req.json().catch(() => ({}))) as any;
    const leadIds: string[] = Array.isArray(body?.lead_ids) ? body.lead_ids : [];
    const force = body?.force === true;
    if (leadIds.length === 0) return json({ error: "lead_ids is required" }, 400);
    if (leadIds.length > MAX_LEADS) {
      return json({ error: `Delete at most ${MAX_LEADS} leads at a time` }, 400);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });

    const { data: leads, error: leadsError } = await userClient
      .from("leads")
      .select("id, org_id, email, campaign_id, track_id, smartlead_lead_id")
      .in("id", leadIds);
    if (leadsError) return json({ error: leadsError.message }, 500);
    if (!leads || leads.length === 0) return json({ error: "No matching leads" }, 404);

    // Where each lead lives in SmartLead: its sequence's own campaign when
    // the campaign has several, otherwise the campaign-level one.
    const trackIds = [...new Set(leads.map((l: any) => l.track_id).filter(Boolean))];
    const campaignIds = [...new Set(leads.map((l: any) => l.campaign_id).filter(Boolean))];
    const slByTrack = new Map<string, string>();
    const slByCampaign = new Map<string, string>();
    if (trackIds.length > 0) {
      const { data } = await userClient
        .from("campaign_tracks")
        .select("id, smartlead_campaign_id")
        .in("id", trackIds);
      for (const t of (data ?? []) as any[]) {
        if (t.smartlead_campaign_id) slByTrack.set(t.id, String(t.smartlead_campaign_id));
      }
    }
    if (campaignIds.length > 0) {
      const { data } = await userClient
        .from("campaigns")
        .select("id, smartlead_campaign_id")
        .in("id", campaignIds);
      for (const c of (data ?? []) as any[]) {
        if (c.smartlead_campaign_id) slByCampaign.set(c.id, String(c.smartlead_campaign_id));
      }
    }

    const toDelete: string[] = [];
    const smartleadFailed: { id: string; email: string | null; error: string }[] = [];

    for (const lead of leads as any[]) {
      const slCampaignId =
        (lead.track_id && slByTrack.get(lead.track_id)) ||
        (lead.campaign_id && slByCampaign.get(lead.campaign_id)) ||
        null;
      // Never launched: nothing in SmartLead to stop.
      if (!slCampaignId) {
        toDelete.push(lead.id);
        continue;
      }
      if (!smartleadKey) {
        smartleadFailed.push({ id: lead.id, email: lead.email, error: "SMARTLEAD_API_KEY not set" });
        if (force) toDelete.push(lead.id);
        continue;
      }

      let slLeadId: string | null = lead.smartlead_lead_id ? String(lead.smartlead_lead_id) : null;
      // Freshly launched leads aren't linked yet (smartlead-sync fills the
      // id in later), so find them by email instead.
      if (!slLeadId && lead.email) {
        const res = await smartleadFetch(
          `/leads/?email=${encodeURIComponent(lead.email)}`,
          smartleadKey,
        );
        if (res.ok) {
          const found = await res.json().catch(() => null);
          if (found?.id != null) slLeadId = String(found.id);
        }
      }
      // SmartLead has no such lead, so there's nothing left to stop.
      if (!slLeadId) {
        toDelete.push(lead.id);
        continue;
      }

      const res = await smartleadFetch(
        `/campaigns/${slCampaignId}/leads/${slLeadId}`,
        smartleadKey,
        { method: "DELETE" },
      );
      // 404: already gone on their side, which is where we wanted it.
      if (res.ok || res.status === 404) {
        toDelete.push(lead.id);
      } else {
        const error = `SmartLead ${res.status}: ${(await res.text()).slice(0, 200)}`;
        smartleadFailed.push({ id: lead.id, email: lead.email, error });
        if (force) toDelete.push(lead.id);
      }
    }

    let deleted = 0;
    if (toDelete.length > 0) {
      const { error, count } = await userClient
        .from("leads")
        .delete({ count: "exact" })
        .in("id", toDelete);
      if (error) return json({ error: error.message }, 500);
      deleted = count ?? toDelete.length;
    }

    // Best-effort audit trail.
    try {
      const { data: authUser } = await userClient.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
      if (authUser?.user && deleted > 0) {
        await userClient.from("activity_log").insert({
          org_id: (leads[0] as any).org_id,
          actor_id: authUser.user.id,
          action: "leads_deleted",
          summary: deleted === 1 ? "Deleted a lead" : `Deleted ${deleted} leads`,
          metadata: { lead_ids: toDelete },
        });
      }
    } catch (e) {
      console.error("activity log failed:", e);
    }

    return json({
      ok: smartleadFailed.length === 0,
      deleted,
      // Asked for but not visible to the caller, or already gone.
      skipped: leadIds.length - leads.length,
      smartlead_failed: smartleadFailed,
    });
  } catch (e: any) {
    console.error("delete-leads error:", e);
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
