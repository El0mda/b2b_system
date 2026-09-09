// Shared Odoo helpers, used by smartlead-webhooks and smartlead-sync
// (which both observe engagement) and by odoo-sync (read-only poll).
//
// Records are created as opportunities so they land in Odoo's Pipeline
// kanban — leads (type: "lead") live under a separate menu that isn't
// visible unless Odoo's Leads feature is switched on.
//
// As engagement progresses the opportunity is moved along the org's own
// pipeline stages (delivered → opened → clicked → replied). Stages are
// matched by name against whatever the org actually configured in Odoo,
// so this needs no stage-ID setup on our side. Movement is forward-only:
// a salesperson who drags a deal to a later stage never gets dragged
// back by a subsequent sync.

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

export type EngagementLevel = "delivered" | "opened" | "clicked" | "replied";

interface OdooStage {
  id: number;
  name: string;
  sequence: number;
}

// Matched against the org's real stage names in order of preference. The
// defaults here cover Odoo's own stock stages as well as funnel-shaped
// ones like "open email" / "clicked" / "reply".
const STAGE_PATTERNS: Record<EngagementLevel, RegExp[]> = {
  delivered: [/^new\b/i, /^lead/i, /^prospect/i],
  opened: [/open/i],
  clicked: [/click/i],
  replied: [/repl/i, /respond/i, /interest/i, /qualified/i],
};

const LEVEL_ORDER: EngagementLevel[] = ["delivered", "opened", "clicked", "replied"];

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

// Odoo 17+ serves its web client under /odoo (and older versions under
// /web), so that's what people copy out of the browser — but JSON-RPC
// always lives at the domain root. Posting to /odoo/jsonrpc returns the
// web client's HTML with a 200, which then blows up as a JSON parse
// error rather than anything that looks like a misconfiguration.
export function odooBaseUrl(url: string): string {
  return url.replace(/\/+$/, "").replace(/\/(odoo|web)$/i, "");
}

export function odooCall(
  settings: OdooSettings,
  model: string,
  method: string,
  args: any[],
  kwargs?: Record<string, any>,
) {
  return fetch(odooBaseUrl(settings.url) + "/jsonrpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [
          settings.db,
          settings.userId,
          settings.apiKey,
          model,
          method,
          args,
          ...(kwargs ? [kwargs] : []),
        ],
      },
    }),
  });
}

// Odoo answers 200 with an HTML page for a wrong endpoint, and 200 with
// a JSON `error` object for auth/permission problems — neither of which
// `res.ok` catches. Surfacing both here is the difference between a
// diagnosable log line and a push that silently does nothing.
export async function parseOdooResponse(res: Response, label: string): Promise<any | null> {
  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error(
      `Odoo ${label} did not return JSON (HTTP ${res.status}) — check the Odoo URL points at the domain root, not /odoo. Body: ${text.slice(0, 200)}`,
    );
    return null;
  }
  if (parsed?.error) {
    console.error(`Odoo ${label} error: ${JSON.stringify(parsed.error).slice(0, 400)}`);
    return null;
  }
  return parsed;
}

export async function fetchStages(settings: OdooSettings): Promise<OdooStage[]> {
  const res = await odooCall(settings, "crm.stage", "search_read", [[], ["name", "sequence"]], {
    order: "sequence asc",
  });
  const json = await parseOdooResponse(res, "stage lookup");
  return (json?.result ?? []) as OdooStage[];
}

// Picks the stage whose name best matches this engagement level. Falls
// back to the earliest stage for "delivered" so a brand-new opportunity
// always starts somewhere sensible; other levels return null rather than
// guessing, leaving the deal where it is.
function stageFor(stages: OdooStage[], level: EngagementLevel): OdooStage | null {
  for (const pattern of STAGE_PATTERNS[level]) {
    const hit = stages.find((s) => pattern.test(s.name));
    if (hit) return hit;
  }
  return level === "delivered" ? (stages[0] ?? null) : null;
}

export async function pushLeadToOdoo(
  sb: any,
  lead: OdooLeadInput,
  opts: {
    level: EngagementLevel;
    campaignName?: string;
    note?: string;
    odooUserId?: string | null;
  },
): Promise<boolean> {
  try {
    const settings = await getOdooSettings(sb, lead.org_id);
    if (!settings) return false;

    const fullName = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || lead.email;
    const campaignName = opts.campaignName ?? "Campaign";
    const assigneeId = opts.odooUserId ? Number(opts.odooUserId) : null;
    const stages = await fetchStages(settings);
    const targetStage = stageFor(stages, opts.level);

    if (!lead.odoo_lead_id) {
      const createRes = await odooCall(settings, "crm.lead", "create", [
        {
          name: `${fullName} — ${campaignName}`,
          contact_name: fullName,
          email_from: lead.email,
          partner_name: lead.company ?? "",
          function: lead.job_title ?? "",
          description: opts.note ?? `Campaign: ${campaignName}`,
          type: "opportunity",
          ...(assigneeId && !Number.isNaN(assigneeId) ? { user_id: assigneeId } : {}),
          ...(targetStage ? { stage_id: targetStage.id } : {}),
        },
      ]);
      const createJson = await parseOdooResponse(createRes, "create");
      if (!createJson?.result) return false;
      await sb
        .from("leads")
        .update({ synced_to_odoo: true, odoo_lead_id: String(createJson.result) })
        .eq("id", lead.id);
      return true;
    }

    // Already in Odoo — advance it, but never drag it backwards past
    // wherever a salesperson has since moved it by hand.
    if (!targetStage) return true;
    const odooId = Number(lead.odoo_lead_id);
    const readRes = await odooCall(settings, "crm.lead", "read", [[odooId], ["stage_id"]], {
      context: { active_test: false },
    });
    const readJson = await parseOdooResponse(readRes, "read");
    const current = readJson?.result?.[0];
    const currentStageId = Array.isArray(current?.stage_id) ? current.stage_id[0] : null;
    const currentSequence = stages.find((s) => s.id === currentStageId)?.sequence ?? -1;
    if (targetStage.sequence <= currentSequence) return true;

    const writeRes = await odooCall(settings, "crm.lead", "write", [
      [odooId],
      {
        stage_id: targetStage.id,
        type: "opportunity",
        ...(opts.note ? { description: opts.note } : {}),
      },
    ]);
    return !!(await parseOdooResponse(writeRes, "write"));
  } catch (e) {
    console.error("Odoo push failed:", e);
    return false;
  }
}

// Highest engagement level a lead has reached, for callers that observe
// the full current state (polling) rather than one discrete event.
export function highestLevel(state: {
  email_delivered?: boolean | null;
  email_opened?: boolean | null;
  email_clicked?: boolean | null;
  replied_at?: string | null;
}): EngagementLevel | null {
  const reached: Record<EngagementLevel, boolean> = {
    delivered: !!state.email_delivered,
    opened: !!state.email_opened,
    clicked: !!state.email_clicked,
    replied: !!state.replied_at,
  };
  for (let i = LEVEL_ORDER.length - 1; i >= 0; i--) {
    if (reached[LEVEL_ORDER[i]]) return LEVEL_ORDER[i];
  }
  return null;
}

export function levelRank(level: EngagementLevel): number {
  return LEVEL_ORDER.indexOf(level);
}
