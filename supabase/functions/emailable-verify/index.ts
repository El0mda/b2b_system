// Supabase Edge Function: emailable-verify
//
// Email verification through Emailable (https://emailable.com).
//
// Replaces both earlier attempts: neverbounce-proxy (still deployed but
// unused) and smartlead-verify, which was abandoned because SmartLead's
// verification is a dashboard feature — its API key is rejected on the
// verification route with "Please login to continue".
//
// Emailable verifies one address per request, so this fans a batch out
// with a small concurrency cap rather than hammering the API. Results
// are normalized to the vocabulary the app already stores in
// leads.nb_result / leads.email_valid (valid, catchall, invalid,
// disposable, risky, unknown) so filters, badges and analytics are
// unaffected.
//
// Deploy: supabase functions deploy emailable-verify
// Secrets: supabase secrets set EMAILABLE_API_KEY=...

// deno-lint-ignore-file no-explicit-any

const VERIFY_URL = "https://api.emailable.com/v1/verify";

// Emailable's own cap is 10s; 5 is their default and keeps a batch of
// 50 comfortably inside the edge function's execution budget.
const PER_EMAIL_TIMEOUT_SECONDS = 5;

// Requests in flight at once. Emailable rate-limits per account, and a
// burst of 50 parallel SMTP probes is the quickest way to get throttled.
const CONCURRENCY = 8;

export interface NormalizedResult {
  result: string;
  valid: boolean | null;
}

/**
 * Maps an Emailable response onto the app's vocabulary.
 *
 * Emailable folds several distinct situations into state "risky", so
 * the supporting flags decide which one it actually is — a catch-all
 * domain is sendable, a disposable address is not.
 */
export function normalizeState(payload: any): NormalizedResult {
  const state = String(payload?.state ?? "").toLowerCase();

  // Checked before state: a disposable address can come back
  // "deliverable" and still be worthless to send to.
  if (payload?.disposable === true) return { result: "disposable", valid: false };

  switch (state) {
    case "deliverable":
      return { result: "valid", valid: true };
    case "undeliverable":
      return { result: "invalid", valid: false };
    case "risky":
      // accept_all means the domain accepts every address, so the
      // mailbox can't be confirmed — but it is still deliverable, which
      // is how this app has always treated catch-alls.
      if (payload?.accept_all === true) return { result: "catchall", valid: true };
      return { result: "risky", valid: false };
    case "unknown":
      // Deliberately null rather than false: an inconclusive check
      // shouldn't get a lead filtered out as invalid.
      return { result: "unknown", valid: null };
    default:
      return { result: state || "unknown", valid: null };
  }
}

async function verifyOne(email: string, apiKey: string): Promise<NormalizedResult> {
  const url =
    `${VERIFY_URL}?email=${encodeURIComponent(email)}` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    `&timeout=${PER_EMAIL_TIMEOUT_SECONDS}`;
  try {
    const res = await fetch(url);

    // 249 is Emailable's "still working, retry shortly". One retry is
    // worth it; beyond that the address is reported as unknown.
    if (res.status === 249) {
      await new Promise((r) => setTimeout(r, 1500));
      const retry = await fetch(url);
      if (!retry.ok) return { result: "unknown", valid: null };
      return normalizeState(await retry.json());
    }

    if (!res.ok) {
      // 401/402 are account-level problems (bad key, no credits) and
      // apply to every address, so they're raised rather than recorded
      // as a per-email outcome.
      if (res.status === 401 || res.status === 402) {
        const text = await res.text();
        throw new Error(
          `Emailable rejected the request (${res.status}): ${text.slice(0, 200)}` +
            (res.status === 402 ? " — your Emailable credits are used up." : ""),
        );
      }
      return { result: "skipped", valid: null };
    }

    return normalizeState(await res.json());
  } catch (e: any) {
    // Re-raise account-level failures; swallow per-address noise.
    if (e?.message?.startsWith("Emailable rejected")) throw e;
    console.error(`Verification failed for ${email}:`, e?.message ?? e);
    return { result: "skipped", valid: null };
  }
}

// Simple worker pool: CONCURRENCY workers pulling from a shared cursor.
async function verifyAll(
  emails: string[],
  apiKey: string,
): Promise<Map<string, NormalizedResult>> {
  const out = new Map<string, NormalizedResult>();
  let cursor = 0;

  const worker = async () => {
    while (cursor < emails.length) {
      const index = cursor++;
      const email = emails[index];
      out.set(email.toLowerCase(), await verifyOne(email, apiKey));
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, emails.length) }, () => worker()),
  );
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    if (!req.headers.get("Authorization")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const apiKey = Deno.env.get("EMAILABLE_API_KEY");
    if (!apiKey) {
      return json(
        { error: "EMAILABLE_API_KEY secret not set — add it in Supabase project settings." },
        500,
      );
    }

    const body = await req.json().catch(() => ({}));
    const emails: string[] = Array.isArray(body?.emails)
      ? body.emails.filter((e: unknown) => typeof e === "string" && e.includes("@"))
      : [];
    if (emails.length === 0) return json({ error: "emails[] is required" }, 400);
    if (emails.length > 100) {
      return json({ error: "Verify at most 100 emails per request" }, 400);
    }

    const verified = await verifyAll(emails, apiKey);

    const results = emails.map((email) => {
      const hit = verified.get(email.toLowerCase());
      return {
        email,
        result: hit?.result ?? "skipped",
        valid: hit ? hit.valid : null,
      };
    });

    return json({
      ok: true,
      provider: "emailable",
      requested: emails.length,
      verified: results.filter((r) => r.result !== "skipped").length,
      results,
    });
  } catch (e: any) {
    console.error("emailable-verify error:", e);
    // Account-level failures reach here and are worth surfacing to the
    // user verbatim — "credits used up" is actionable, "failed" isn't.
    return json({ error: e?.message ?? String(e) }, 502);
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
