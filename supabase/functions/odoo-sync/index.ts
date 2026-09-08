// Supabase Edge Function: odoo-sync
//
// Polls Odoo twice a day (see the odoo-stage-sync cron job in migration
// 0012) for the current stage of every lead already pushed to Odoo, and
// mirrors the stage name back onto leads.odoo_stage. Odoo owns deal
// progression now — this is read-only, display-only.
//
// No Supabase auth required (deploy with --no-verify-jwt) — called by
// the cron schedule (server-to-server), same pattern as smartlead-sync.
//
// Deploy: supabase functions deploy odoo-sync --no-verify-jwt

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getOdooSettings, odooCall } from "../_shared/odoo.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Env vars missing" }, 500);
    }
    const sb = createClient(supabaseUrl, serviceKey);

    // Every org that has at least one lead pushed to Odoo.
    const { data: orgRows, error: orgError } = await sb
      .from("leads")
      .select("org_id")
      .eq("synced_to_odoo", true)
      .not("odoo_lead_id", "is", null);
    if (orgError) return json({ error: orgError.message }, 500);
    const orgIds = Array.from(new Set((orgRows ?? []).map((r: any) => r.org_id)));

    let leadsSynced = 0;
    let orgsSynced = 0;
    for (const orgId of orgIds) {
      const settings = await getOdooSettings(sb, orgId);
      if (!settings) continue;

      const { data: leads } = await sb
        .from("leads")
        .select("id, odoo_lead_id")
        .eq("org_id", orgId)
        .eq("synced_to_odoo", true)
        .not("odoo_lead_id", "is", null);
      if (!leads || leads.length === 0) continue;

      const idMap = new Map<number, string>(); // odoo id -> local lead id
      for (const l of leads as any[]) {
        const odooId = Number(l.odoo_lead_id);
        if (!Number.isNaN(odooId)) idMap.set(odooId, l.id);
      }
      const odooIds = Array.from(idMap.keys());
      if (odooIds.length === 0) continue;

      // active_test: false is required or archived (lost) opportunities
      // are silently dropped from the result instead of being returned.
      const res = await odooCall(
        settings,
        "read",
        [odooIds, ["stage_id", "probability", "active", "expected_revenue"]],
        { context: { active_test: false } },
      );
      if (!res.ok) continue;
      const resJson: any = await res.json();
      const records: any[] = resJson?.result ?? [];

      const now = new Date().toISOString();
      for (const record of records) {
        const localLeadId = idMap.get(record.id);
        if (!localLeadId) continue;
        // Many2one fields come back as [id, "Display Name"].
        const stageName = Array.isArray(record.stage_id) ? record.stage_id[1] : null;
        // Odoo's own convention: archived (active=false) means lost;
        // still-active with probability at 100 means won; anything else
        // is still an open deal.
        const odooWon =
          record.active === false ? false : record.probability === 100 ? true : null;
        await sb
          .from("leads")
          .update({
            odoo_stage: stageName,
            odoo_stage_synced_at: now,
            odoo_won: odooWon,
            odoo_expected_revenue: record.expected_revenue ?? null,
          })
          .eq("id", localLeadId);
        leadsSynced++;
      }
      orgsSynced++;
    }

    return json({ ok: true, orgs_synced: orgsSynced, leads_synced: leadsSynced });
  } catch (e: any) {
    console.error("odoo-sync error:", e);
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
