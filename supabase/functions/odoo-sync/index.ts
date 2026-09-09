// Supabase Edge Function: odoo-sync
//
// Polls Odoo every 5 minutes (see the odoo-stage-sync cron job, set in
// migration 0012 and rescheduled in 0015) for the current stage of every
// lead already pushed to Odoo, and mirrors the stage name back onto
// leads.odoo_stage. Odoo owns deal progression now — this is read-only,
// display-only. It also publishes the org's stage list so the app's
// Pipeline board can draw Odoo's real columns.
//
// No Supabase auth required (deploy with --no-verify-jwt) — called by
// the cron schedule (server-to-server) and by the app's "Refresh from
// Odoo" button, same pattern as smartlead-sync.
//
// Deploy: supabase functions deploy odoo-sync --no-verify-jwt

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchStages, getOdooSettings, odooCall } from "../_shared/odoo.ts";

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
        "crm.lead",
        "read",
        [odooIds, ["stage_id", "probability", "active", "expected_revenue"]],
        { context: { active_test: false } },
      );
      const rawBody = await res.text();
      let resJson: any;
      try {
        resJson = JSON.parse(rawBody);
      } catch {
        console.error(
          `Odoo read did not return JSON (HTTP ${res.status}) for org ${orgId} — check the Odoo URL points at the domain root, not /odoo. Body: ${rawBody.slice(0, 200)}`,
        );
        continue;
      }
      if (resJson?.error) {
        console.error(`Odoo read error for org ${orgId}: ${JSON.stringify(resJson.error).slice(0, 400)}`);
        continue;
      }
      const records: any[] = resJson?.result ?? [];
      const stages = await fetchStages(settings);
      // A pipeline that names its own won/lost stages is telling us how it
      // models outcomes, and that has to win over Odoo's probability
      // convention. Verified against this instance: a stage literally
      // named "won" sat at probability 50 while "reply" was flagged
      // is_won and hit 100 — so trusting probability alone marked replies
      // as won deals and never recorded an actual win.
      const namesOutcomeStages = stages.some((s) => /\b(won|lost)\b/i.test(s.name));

      // Publish the stage list so the app's Pipeline board can render the
      // org's real Odoo columns in the org's real order. The board can't
      // ask Odoo directly — the credentials only exist server-side.
      if (stages.length > 0) {
        await sb.from("settings").upsert(
          {
            org_id: orgId,
            key: "odoo_stages",
            value: JSON.stringify(
              stages.map((s) => ({ id: s.id, name: s.name, sequence: s.sequence })),
            ),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "org_id,key" },
        );
      }

      const now = new Date().toISOString();
      for (const record of records) {
        const localLeadId = idMap.get(record.id);
        if (!localLeadId) continue;
        // Many2one fields come back as [id, "Display Name"].
        const stageName = Array.isArray(record.stage_id) ? record.stage_id[1] : null;
        let odooWon: boolean | null = null;
        if (record.active === false) {
          odooWon = false; // archived via Odoo's "Mark Lost" action
        } else if (stageName && /\blost\b/i.test(stageName)) {
          odooWon = false;
        } else if (stageName && /\bwon\b/i.test(stageName)) {
          odooWon = true;
        } else if (!namesOutcomeStages && record.probability === 100) {
          odooWon = true;
        }
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
