// Supabase Edge Function: lead-notes
//
// Adds a note to a lead from the Pipeline, and — when the lead is already
// an opportunity in Odoo — posts it onto that opportunity's chatter right
// away. A lead that isn't in Odoo yet keeps the note in the app; it goes
// across the moment the lead is pushed (flushLeadNotes, called from
// pushLeadToOdoo).
//
//   POST { lead_id, body }  →  { note, odoo: "posted" | "pending" | "failed" }
//
// The note is written through a client carrying the caller's JWT, so
// row-level security decides whether they may note this lead at all
// (migration 0033). Odoo is then reached with the service role, because
// the Odoo credentials in public.settings are owner-only.
//
// Deploy: supabase functions deploy lead-notes

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getOdooSettings, postNoteToOdoo } from "../_shared/odoo.ts";

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

    const { lead_id, body } = (await req.json().catch(() => ({}))) as any;
    const text = typeof body === "string" ? body.trim() : "";
    if (!lead_id) return json({ error: "lead_id is required" }, 400);
    if (!text) return json({ error: "Write a note first" }, 400);
    if (text.length > 10_000) return json({ error: "That note is too long" }, 400);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const sb = createClient(supabaseUrl, serviceKey);

    const { data: authUser } = await userClient.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    const userId = authUser?.user?.id;
    if (!userId) return json({ error: "Not signed in" }, 401);

    // RLS-scoped: a lead the caller can't see comes back empty.
    const { data: lead } = await userClient
      .from("leads")
      .select("id, org_id, email, odoo_lead_id")
      .eq("id", lead_id)
      .maybeSingle();
    if (!lead) return json({ error: "Lead not found" }, 404);

    const { data: note, error: insertError } = await userClient
      .from("lead_notes")
      .insert({ org_id: lead.org_id, lead_id: lead.id, author_id: userId, body: text })
      .select("id, lead_id, author_id, body, odoo_message_id, created_at")
      .single();
    if (insertError || !note) {
      return json({ error: insertError?.message ?? "Couldn't save the note" }, 500);
    }

    if (!lead.odoo_lead_id) return json({ note, odoo: "pending" });

    const settings = await getOdooSettings(sb, lead.org_id);
    if (!settings) return json({ note, odoo: "pending" });

    const { data: author } = await sb
      .from("users")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    const messageId = await postNoteToOdoo(settings, Number(lead.odoo_lead_id), {
      body: text,
      author: (author as any)?.full_name ?? (author as any)?.email ?? null,
      created_at: note.created_at,
    });
    // A note Odoo refused stays unsent; the next push of this lead
    // retries it.
    if (!messageId) return json({ note, odoo: "failed" });

    await sb.from("lead_notes").update({ odoo_message_id: messageId }).eq("id", note.id);
    return json({ note: { ...note, odoo_message_id: messageId }, odoo: "posted" });
  } catch (e: any) {
    console.error("lead-notes error:", e);
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
