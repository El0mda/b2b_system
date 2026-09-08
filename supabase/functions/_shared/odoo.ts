// Shared Odoo helpers. pushLeadToOdoo is called from smartlead-webhooks
// (all campaigns are sent through SmartLead); getOdooSettings/odooCall
// are also reused directly by odoo-sync for its read-only stage poll.
//
// Push happens on two signals:
//   - click (weaker): creates a plain Odoo lead if one doesn't exist yet
//   - reply (stronger): creates an opportunity directly, or if a lead
//     record already exists from an earlier click, upgrades it to an
//     opportunity instead of creating a duplicate

// deno-lint-ignore-file no-explicit-any

interface OdooLeadInput {
  id: string;
  org_id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  email: string;
  odoo_lead_id?: string | null;
}

interface OdooSettings {
  url: string;
  db: string;
  userId: number;
  apiKey: string;
}

export async function getOdooSettings(sb: any, orgId: string): Promise<OdooSettings | null> {
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
    .eq("org_id", orgId)
    .in("key", keys);
  const settings: Record<string, string> = {};
  (rows ?? []).forEach((r: any) => (settings[r.key] = r.value));

  if (settings.odoo_auto_create_opportunities !== "true") return null;
  const url = settings.odoo_url;
  const db = settings.odoo_db;
  const userId = Number(settings.odoo_user_id);
  const apiKey = settings.odoo_api_key;
  if (!url || !db || !userId || !apiKey) return null;
  return { url, db, userId, apiKey };
}

export function odooCall(settings: OdooSettings, method: string, args: any[]) {
  return fetch(settings.url.replace(/\/$/, "") + "/jsonrpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [settings.db, settings.userId, settings.apiKey, "crm.lead", method, args],
      },
    }),
  });
}

export async function pushLeadToOdoo(
  sb: any,
  lead: OdooLeadInput,
  opts: { asOpportunity: boolean; campaignName?: string; note?: string },
): Promise<boolean> {
  try {
    const settings = await getOdooSettings(sb, lead.org_id);
    if (!settings) return false;

    const fullName = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || lead.email;
    const campaignName = opts.campaignName ?? "Campaign";

    if (!lead.odoo_lead_id) {
      const createRes = await odooCall(settings, "create", [
        {
          name: `${opts.asOpportunity ? "Reply from" : "Engaged:"} ${fullName} — ${campaignName}`,
          contact_name: fullName,
          email_from: lead.email,
          partner_name: lead.company ?? "",
          function: lead.job_title ?? "",
          description: opts.note ?? `Campaign: ${campaignName}`,
          type: opts.asOpportunity ? "opportunity" : "lead",
        },
      ]);
      if (!createRes.ok) return false;
      const createJson: any = await createRes.json();
      if (!createJson?.result) return false;
      await sb
        .from("leads")
        .update({ synced_to_odoo: true, odoo_lead_id: String(createJson.result) })
        .eq("id", lead.id);
      return true;
    }

    // Already synced from an earlier (weaker) signal — upgrade in place
    // rather than creating a second Odoo record for the same person.
    if (opts.asOpportunity) {
      const writeRes = await odooCall(settings, "write", [
        [Number(lead.odoo_lead_id)],
        { type: "opportunity", ...(opts.note ? { description: opts.note } : {}) },
      ]);
      return writeRes.ok;
    }
    return true;
  } catch {
    return false;
  }
}
