// Supabase Edge Function: odoo-push
//
// Pushes leads to Odoo on demand, from the app's "Push to Odoo" button.
// The automatic path (smartlead-webhooks) only fires on a click or a
// reply; this one has no such condition — a salesperson who knows a
// lead is worth working can put it in the pipeline immediately.
//
// The caller's JWT decides which leads they're allowed to push: the
// lookup runs through a user-scoped client, so RLS drops any lead the
// caller can't see (members only see leads on their own campaigns, see
// migration 0010). The push itself then runs with the service role,
// because the Odoo credentials in public.settings are owner-only.
//
// Deploy: supabase functions deploy odoo-push

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getOdooSettings, highestLevel, pushLeadToOdoo } from "../_shared/odoo.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json({ error: "Supabase env vars missing" }, 500);
    }

    const body = await req.json().catch(() => null);
    const leadIds: string[] = Array.isArray(body?.lead_ids)
      ? body.lead_ids
      : body?.lead_id
        ? [body.lead_id]
        : [];
    if (leadIds.length === 0) return json({ error: "lead_id or lead_ids is required" }, 400);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const sb = createClient(supabaseUrl, serviceKey);

    // RLS-scoped: anything the caller isn't allowed to see simply isn't
    // returned, and is reported back as skipped rather than pushed.
    const { data: leads, error: leadsError } = await userClient
      .from("leads")
      .select(
        "id, org_id, campaign_id, first_name, last_name, company, job_title, email, " +
          "email_delivered, email_opened, email_clicked, replied_at, reply_text, " +
          "synced_to_odoo, odoo_lead_id",
      )
      .in("id", leadIds);
    if (leadsError) return json({ error: leadsError.message }, 500);
    if (!leads || leads.length === 0) return json({ error: "No matching leads" }, 404);

    const orgId = (leads[0] as any).org_id as string;
    const settings = await getOdooSettings(sb, orgId);
    if (!settings) {
      return json(
        { error: "Odoo isn't connected for this workspace — set it up in Settings first." },
        400,
      );
    }

    // Who the opportunity gets assigned to in Odoo. The campaign's
    // creator owns the relationship (that's how the automatic push
    // attributes it too); the person clicking the button is only the
    // fallback for a lead with no campaign behind it.
    const { data: authUser } = await userClient.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    const actorId = authUser?.user?.id ?? null;
    const { data: actor } = actorId
      ? await sb
          .from("users")
          .select("full_name, email, odoo_user_id")
          .eq("id", actorId)
          .maybeSingle()
      : { data: null };
    const actorName = (actor as any)?.full_name ?? (actor as any)?.email ?? "Someone";

    const campaignIds = Array.from(
      new Set((leads as any[]).map((l) => l.campaign_id).filter(Boolean)),
    );
    const campaignById = new Map<string, { name: string; created_by: string | null }>();
    if (campaignIds.length > 0) {
      const { data: campaigns } = await sb
        .from("campaigns")
        .select("id, name, created_by")
        .in("id", campaignIds);
      for (const c of (campaigns ?? []) as any[]) {
        campaignById.set(c.id, { name: c.name, created_by: c.created_by });
      }
    }
    const creatorIds = Array.from(
      new Set(Array.from(campaignById.values()).map((c) => c.created_by).filter(Boolean)),
    ) as string[];
    const odooUserByUserId = new Map<string, string | null>();
    if (creatorIds.length > 0) {
      const { data: creators } = await sb
        .from("users")
        .select("id, odoo_user_id")
        .in("id", creatorIds);
      for (const u of (creators ?? []) as any[]) odooUserByUserId.set(u.id, u.odoo_user_id);
    }

    const pushed: string[] = [];
    const failed: string[] = [];
    for (const lead of leads as any[]) {
      if (!lead.email) {
        failed.push(lead.id);
        continue;
      }
      const campaign = lead.campaign_id ? campaignById.get(lead.campaign_id) : undefined;
      const odooUserId =
        (campaign?.created_by ? odooUserByUserId.get(campaign.created_by) : null) ??
        (actor as any)?.odoo_user_id ??
        null;

      // A lead with no engagement yet still has to land somewhere, so it
      // enters at the pipeline's first stage. One that has already
      // clicked or replied enters where it belongs — pushLeadToOdoo
      // never moves a deal backwards, so this is safe to re-run.
      const level = highestLevel(lead) ?? "delivered";
      const campaignName = campaign?.name ?? "Manual push";
      const ok = await pushLeadToOdoo(sb, lead, {
        level,
        campaignName,
        odooUserId,
        note:
          `Campaign: ${campaignName}\n` +
          `Pushed to Odoo manually by ${actorName} on ${new Date().toISOString()}` +
          (lead.reply_text ? `\n\nReply: ${String(lead.reply_text).slice(0, 2000)}` : ""),
      });
      (ok ? pushed : failed).push(lead.id);
    }

    // Best-effort activity log — never fail the push over a logging issue.
    if (actorId && pushed.length > 0) {
      try {
        await sb.from("activity_log").insert({
          org_id: orgId,
          actor_id: actorId,
          action: "leads_pushed_to_odoo",
          summary:
            pushed.length === 1
              ? `${actorName} pushed a lead to Odoo manually`
              : `${actorName} pushed ${pushed.length} leads to Odoo manually`,
          metadata: { lead_ids: pushed },
        });
      } catch (e) {
        console.error("activity log failed:", e);
      }
    }

    return json({
      ok: failed.length === 0,
      pushed: pushed.length,
      failed: failed.length,
      // Leads the caller asked for but RLS filtered out, or that don't exist.
      skipped: leadIds.length - leads.length,
      failed_ids: failed,
    });
  } catch (e: any) {
    console.error("odoo-push error:", e);
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
