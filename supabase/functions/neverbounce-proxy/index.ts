// Supabase Edge Function: neverbounce-proxy
//
// Proxies NeverBounce email verification using shared API key from env.
//
// Actions: verify (POST with { email })
// Deploy: supabase functions deploy neverbounce-proxy
// Secrets: supabase secrets set NEVERBOUNCE_API_KEY=...

// deno-lint-ignore-file no-explicit-any

const NEVERBOUNCE_API = "https://api.neverbounce.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

  try {
    const apiKey = Deno.env.get("NEVERBOUNCE_API_KEY");
    if (!apiKey) return json({ error: "NEVERBOUNCE_API_KEY env secret not set" }, 500);

    const body = await req.json().catch(() => ({}));
    const email = body.action === "verify" ? body.email : body.email;

    if (!email) return json({ error: "email required" }, 400);

    const res = await fetch(
      `${NEVERBOUNCE_API}/v4.2/single/check?key=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}`,
    );
    if (!res.ok) return json({ error: `NeverBounce responded ${res.status}` }, 502);

    const data = await res.json();
    const result = data?.result ?? "unknown";
    return json({ email, nb_result: result, email_valid: result === "valid" || result === "catchall", raw: data });
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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
