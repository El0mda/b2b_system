// Supabase Edge Function: crm-action
//
// Moves a replied lead into a closed pipeline stage (won/lost). For "won",
// best-effort syncs the outcome to Odoo if the org has it configured —
// reuses the crm.lead created at reply-time (resend-webhooks) if one
// exists, creates one otherwise, then calls Odoo's built-in
// action_set_won on it.
//
// Deploy: supabase functions deploy crm-action

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) return json({ error: "Supabase env vars missing" }, 500);

    const { lead_id, stage } = await req.json();
    if (!lead_id) return json({ error: "lead_id is required" }, 400);
    if (!["won", "lost"].includes(stage)) {
      return json({ error: `Unknown stage: ${stage}` }, 400);
    }

    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: auth } } },
    );

    const { data: lead, error: leadError } = await userClient
      .from("leads")
      .select(
        "id, org_id, campaign_id, first_name, last_name, company, job_title, email, replied_at, synced_to_odoo, odoo_lead_id",
      )
      .eq("id", lead_id)
      .maybeSingle();
    if (leadError || !lead) {
      return json({ error: leadError?.message ?? "Lead not found or not visible" }, 404);
    }
    if (!(lead as any).replied_at) {
      return json({ error: "Only replied leads can be marked won/lost" }, 400);
    }

    const now = new Date().toISOString();
    const { error: updateError } = await userClient
      .from("leads")
      .update({ pipeline_stage: stage, closed_at: now })
      .eq("id", lead_id);
    if (updateError) return json({ error: updateError.message }, 500);

    const odooSynced = stage === "won" ? await syncWonToOdoo(userClient, lead as any) : false;

    // Best-effort activity log — never fail the request over a logging issue.
    try {
      const { data: authUser } = await userClient.auth.getUser(
        auth.replace(/^Bearer\s+/i, ""),
      );
      if (authUser?.user) {
        const { data: actor } = await userClient
          .from("users")
          .select("full_name, email")
          .eq("id", authUser.user.id)
          .maybeSingle();
        const actorName = (actor as any)?.full_name ?? (actor as any)?.email ?? "Someone";
        const leadName =
          `${(lead as any).first_name ?? ""} ${(lead as any).last_name ?? ""}`.trim() ||
          (lead as any).email ||
          "a lead";
        await userClient.from("activity_log").insert({
          org_id: (lead as any).org_id,
          actor_id: authUser.user.id,
          action: stage === "won" ? "deal_won" : "deal_lost",
          summary: `${actorName} marked ${leadName} as ${stage}`,
          metadata: { lead_id },
        });
      }
    } catch (e) {
      console.error("activity log failed:", e);
    }

    return json({ ok: true, odoo_synced: odooSynced });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

async function syncWonToOdoo(sb: any, lead: any): Promise<boolean> {
  try {
    const keys = [
      "odoo_url",
      "odoo_db",
      "odoo_user_id",
      "odoo_api_key",
      "odoo_auto_create_opportunities",
    ];
    const { data: rows } = await sb
      .from("settings")
      .select("key, value")
      .eq("org_id", lead.org_id)
      .in("key", keys);
    const settings: Record<string, string> = {};
    (rows ?? []).forEach((r: any) => (settings[r.key] = r.value));

    if (settings.odoo_auto_create_opportunities !== "true") return false;
    const url = settings.odoo_url;
    const db = settings.odoo_db;
    const userId = Number(settings.odoo_user_id);
    const apiKey = settings.odoo_api_key;
    if (!url || !db || !userId || !apiKey) return false;

    const call = (method: string, args: any[]) =>
      fetch(url.replace(/\/$/, "") + "/jsonrpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: {
            service: "object",
            method: "execute_kw",
            args: [db, userId, apiKey, "crm.lead", method, args],
          },
        }),
      });

    let odooLeadId = lead.odoo_lead_id ? Number(lead.odoo_lead_id) : null;

    if (!odooLeadId) {
      const name =
        `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || lead.email || "Deal";
      const createRes = await call("create", [
        {
          name: `Won — ${name}`,
          contact_name: name,
          email_from: lead.email ?? "",
          partner_name: lead.company ?? "",
          function: lead.job_title ?? "",
          type: "opportunity",
        },
      ]);
      if (!createRes.ok) return false;
      const createJson: any = await createRes.json();
      if (!createJson?.result) return false;
      odooLeadId = createJson.result;
      await sb
        .from("leads")
        .update({ synced_to_odoo: true, odoo_lead_id: String(odooLeadId) })
        .eq("id", lead.id);
    }

    // Odoo's built-in crm.lead method for marking an opportunity won.
    const wonRes = await call("action_set_won", [[odooLeadId]]);
    return wonRes.ok;
  } catch {
    return false;
  }
}

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
