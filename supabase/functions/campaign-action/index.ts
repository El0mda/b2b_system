// Supabase Edge Function: campaign-action
//
// Applies a status change or delete to a campaign, keeping the local row and
// the SmartLead campaign (if one was ever launched) in sync:
//   - "draft"   -> pause the SmartLead campaign, set local status to draft
//   - "active"  -> resume/start the SmartLead campaign, set local status to active
//   - "delete"  -> delete the SmartLead campaign, then delete the local row
//     (leads/sequences cascade via FK)
//
// A campaign that was never launched (no smartlead_campaign_id yet) only
// touches the local row — there's nothing remote to sync.
//
// Deploy: supabase functions deploy campaign-action
// Secrets: supabase secrets set SMARTLEAD_API_KEY=your_key_here

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SMARTLEAD_API = "https://server.smartlead.ai/api/v1";

async function smartleadFetch(
  path: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<Response> {
  const separator = path.includes("?") ? "&" : "?";
  return fetch(`${SMARTLEAD_API}${path}${separator}api_key=${apiKey}`, {
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
    const smartleadKey = Deno.env.get("SMARTLEAD_API_KEY");
    if (!supabaseUrl) return json({ error: "Supabase env vars missing" }, 500);

    const { campaign_id, action } = await req.json();
    if (!campaign_id) return json({ error: "campaign_id is required" }, 400);
    if (!["draft", "active", "delete"].includes(action)) {
      return json({ error: `Unknown action: ${action}` }, 400);
    }

    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: auth } } },
    );

    const { data: campaign, error: campaignError } = await userClient
      .from("campaigns")
      .select("id, name, org_id, smartlead_campaign_id")
      .eq("id", campaign_id)
      .maybeSingle();
    if (campaignError || !campaign) {
      return json({ error: campaignError?.message ?? "Campaign not found" }, 404);
    }

    const slId = (campaign as any).smartlead_campaign_id as string | null;

    if (slId && smartleadKey) {
      if (action === "delete") {
        const res = await smartleadFetch(`/campaigns/${slId}`, smartleadKey, {
          method: "DELETE",
        });
        if (!res.ok && res.status !== 404) {
          const text = await res.text();
          return json(
            { error: `SmartLead delete failed (${res.status}): ${text.slice(0, 300)}` },
            502,
          );
        }
      } else {
        const status = action === "active" ? "START" : "PAUSED";
        const res = await smartleadFetch(`/campaigns/${slId}/status`, smartleadKey, {
          method: "POST",
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          const text = await res.text();
          return json(
            { error: `SmartLead status update failed (${res.status}): ${text.slice(0, 300)}` },
            502,
          );
        }
      }
    }

    if (action === "delete") {
      const { error } = await userClient.from("campaigns").delete().eq("id", campaign_id);
      if (error) return json({ error: error.message }, 500);
    } else {
      const { error } = await userClient
        .from("campaigns")
        .update({ status: action })
        .eq("id", campaign_id);
      if (error) return json({ error: error.message }, 500);
    }

    // Best-effort activity log — never fail the request over a logging issue.
    try {
      // getUser() without an explicit token relies on the client's own
      // internal session state, which this ephemeral server-side client
      // never has — the Authorization header set via `global.headers` above
      // is honored by .from()/PostgREST calls but not by auth-js's own
      // requests, so the JWT has to be passed here explicitly.
      const { data: authUser } = await userClient.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
      if (authUser?.user) {
        const { data: actor } = await userClient
          .from("users")
          .select("full_name, email")
          .eq("id", authUser.user.id)
          .maybeSingle();
        const actorName = (actor as any)?.full_name ?? (actor as any)?.email ?? "Someone";
        const campaignName = (campaign as any).name ?? "campaign";
        const summary =
          action === "delete"
            ? `${actorName} deleted campaign "${campaignName}"`
            : action === "active"
              ? `${actorName} activated campaign "${campaignName}"`
              : `${actorName} set campaign "${campaignName}" to draft`;
        await userClient.from("activity_log").insert({
          org_id: (campaign as any).org_id,
          actor_id: authUser.user.id,
          action: action === "delete" ? "campaign_deleted" : "campaign_status_changed",
          summary,
          metadata: { campaign_id, new_status: action },
        });
      }
    } catch (e) {
      console.error("activity log failed:", e);
    }

    return json({ ok: true, synced_to_smartlead: !!slId });
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
