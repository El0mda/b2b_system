// Supabase Edge Function: smartlead-accounts
//
// Lists the mailboxes actually connected in SmartLead.
//
// SmartLead is what sends the mail: send-campaign matches a campaign's
// sender_email against this list, and a campaign whose sender isn't here
// is created but never sends. That failure used to surface only as a
// warning after launch — this lets the app check up front, on the Sender
// Accounts page and before a campaign is created.
//
// The SmartLead API key is server-side only, which is why this is a
// function rather than a direct call from the browser.
//
// Deploy: supabase functions deploy smartlead-accounts

// deno-lint-ignore-file no-explicit-any

const SMARTLEAD_API = "https://server.smartlead.ai/api/v1";

export interface ConnectedMailbox {
  id: number | null;
  from_email: string;
  from_name: string | null;
  // SmartLead reports warmup separately per account; a mailbox still
  // warming up can send, but shouldn't carry a real campaign yet.
  warmup_status: string | null;
  daily_limit: number | null;
}

// SmartLead's account objects have shifted field names over time
// (from_email vs email), so both are accepted.
export function normalizeAccounts(payload: any): ConnectedMailbox[] {
  const list = Array.isArray(payload) ? payload : (payload?.data ?? []);
  if (!Array.isArray(list)) return [];
  return list.flatMap((a: any) => {
    const email = String(a?.from_email ?? a?.email ?? "").toLowerCase().trim();
    if (!email) return [];
    return [
      {
        id: typeof a?.id === "number" ? a.id : null,
        from_email: email,
        from_name: a?.from_name ?? a?.name ?? null,
        warmup_status: a?.warmup_details?.status ?? a?.warmup_status ?? null,
        daily_limit:
          typeof a?.message_per_day === "number"
            ? a.message_per_day
            : typeof a?.daily_sent_count_limit === "number"
              ? a.daily_sent_count_limit
              : null,
      },
    ];
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    if (!req.headers.get("Authorization")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const apiKey = Deno.env.get("SMARTLEAD_API_KEY");
    if (!apiKey) return json({ error: "SMARTLEAD_API_KEY secret not set" }, 500);

    const res = await fetch(
      `${SMARTLEAD_API}/email-accounts/?api_key=${encodeURIComponent(apiKey)}`,
    );
    const text = await res.text();
    if (!res.ok) {
      return json(
        { error: `SmartLead returned ${res.status}: ${text.slice(0, 300)}` },
        502,
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      return json({ error: `SmartLead returned a non-JSON response` }, 502);
    }

    const accounts = normalizeAccounts(payload);
    return json({
      ok: true,
      count: accounts.length,
      accounts,
      // Just the addresses, for the common "is this one connected?" check.
      emails: accounts.map((a) => a.from_email),
    });
  } catch (e: any) {
    console.error("smartlead-accounts error:", e);
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
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}
