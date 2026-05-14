// Supabase Edge Function: resend-proxy
//
// Proxies all Resend API calls using shared API key from env.
//
// Actions: create-contact, send-email, list-domains, create-domain, get-domain, cancel-email
// Deploy: supabase functions deploy resend-proxy
// Secrets: supabase secrets set RESEND_API_KEY=...

// deno-lint-ignore-file no-explicit-any

const RESEND_API = "https://api.resend.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ error: "RESEND_API_KEY env secret not set" }, 500);

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    switch (action) {
      case "create-contact":
        return await handleCreateContact(body, resendKey);
      case "send-email":
        return await handleSendEmail(body, resendKey);
      case "list-domains":
        return await handleListDomains(resendKey);
      case "create-domain":
        return await handleCreateDomain(body, resendKey);
      case "get-domain":
        return await handleGetDomain(body.domain_id, resendKey);
      case "cancel-email":
        return await handleCancelEmail(body.email_id, resendKey);
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

async function resendFetch(path: string, resendKey: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${RESEND_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
      ...(init.headers ?? {}),
    },
  });
}

async function handleCreateContact(body: any, resendKey: string): Promise<Response> {
  const { audience_id, email, first_name, last_name, unsubscribed } = body;
  if (!audience_id || !email) return json({ error: "audience_id and email required" }, 400);
  const res = await resendFetch("/contacts", resendKey, {
    method: "POST",
    body: JSON.stringify({ audience_id, email, first_name: first_name ?? "", last_name: last_name ?? "", unsubscribed: unsubscribed ?? false }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json({ error: data?.message ?? `Resend responded ${res.status}` }, 502);
  return json(data);
}

async function handleSendEmail(body: any, resendKey: string): Promise<Response> {
  const { from, to, reply_to, subject, html, scheduled_at, tags } = body;
  if (!from || !to || !subject) return json({ error: "from, to, subject required" }, 400);
  const payload: Record<string, any> = { from, to, subject, html: html ?? "" };
  if (reply_to) payload.reply_to = reply_to;
  if (scheduled_at) payload.scheduled_at = scheduled_at;
  if (tags) payload.tags = tags;
  const res = await resendFetch("/emails", resendKey, { method: "POST", body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json({ error: data?.message ?? `Resend responded ${res.status}` }, 502);
  return json(data);
}

async function handleListDomains(resendKey: string): Promise<Response> {
  const res = await resendFetch("/domains", resendKey);
  const data = await res.json();
  if (!res.ok) return json({ error: `Resend responded ${res.status}` }, 502);
  return json(data?.data ?? data ?? []);
}

async function handleCreateDomain(body: any, resendKey: string): Promise<Response> {
  const { name, region } = body;
  if (!name) return json({ error: "domain name required" }, 400);
  const res = await resendFetch("/domains", resendKey, {
    method: "POST",
    body: JSON.stringify({ name, region: region ?? "us-east-1" }),
  });
  const data = await res.json();
  if (!res.ok) return json({ error: data?.message ?? `Resend responded ${res.status}` }, 502);
  return json(data);
}

async function handleGetDomain(domainId: string | null, resendKey: string): Promise<Response> {
  if (!domainId) return json({ error: "domain_id required" }, 400);
  const res = await resendFetch(`/domains/${domainId}`, resendKey);
  const data = await res.json();
  if (!res.ok) return json({ error: data?.message ?? `Resend responded ${res.status}` }, 502);
  return json(data);
}

async function handleCancelEmail(emailId: string | null, resendKey: string): Promise<Response> {
  if (!emailId) return json({ error: "email_id required" }, 400);
  const res = await resendFetch(`/emails/${emailId}`, resendKey, { method: "DELETE" });
  if (res.status === 204) return json({ ok: true, email_id: emailId });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json({ error: data?.message ?? `Resend responded ${res.status}` }, 502);
  return json(data);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
