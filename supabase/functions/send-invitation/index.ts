// Supabase Edge Function: send-invitation
//
// Creates/refreshes a pending invitation row and emails the invite link via
// Resend. Kept separate from resend-proxy on purpose: resend-proxy has no
// authorization checks beyond "any authenticated user" and would let any
// team member send arbitrary email through the org's domain — this function
// enforces server-side that only the org's owner/admin can invite, and never
// trusts a client-supplied org_id (it looks up the caller's own row).
//
// Deploy: supabase functions deploy send-invitation
// Secrets: supabase secrets set RESEND_API_KEY=...
//   Optional: RESEND_FROM_EMAIL (defaults to the no-setup Resend sandbox
//   sender, which can only deliver to the Resend account's own address —
//   switch this once etriplesoft.com is verified in Resend, no code change
//   needed).

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const RESEND_API = "https://api.resend.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!supabaseUrl) return json({ error: "Supabase env vars missing" }, 500);
    if (!resendKey) return json({ error: "RESEND_API_KEY not configured" }, 500);

    const { email, role, invite_link_base } = await req.json();
    if (!email || !invite_link_base) {
      return json({ error: "email and invite_link_base are required" }, 400);
    }
    const targetRole = role === "admin" ? "admin" : "member";
    const normalizedEmail = String(email).trim().toLowerCase();

    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: auth } } },
    );

    const { data: authUser } = await userClient.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!authUser?.user) return json({ error: "Unauthorized" }, 401);

    // Never trust a client-supplied org_id — resolve the caller's own org
    // and role, and enforce owner/admin server-side (the invitations table's
    // RLS only checks org membership, not role, so this check has to live
    // here rather than relying on the policy).
    const { data: caller, error: callerError } = await userClient
      .from("users")
      .select("org_id, role, full_name, email")
      .eq("id", authUser.user.id)
      .maybeSingle();
    if (callerError || !caller?.org_id) {
      return json({ error: "You don't belong to a workspace" }, 403);
    }
    if (caller.role !== "owner" && caller.role !== "admin") {
      return json({ error: "Only owners and admins can invite members" }, 403);
    }

    const { data: org } = await userClient
      .from("organizations")
      .select("name")
      .eq("id", caller.org_id)
      .maybeSingle();

    // Re-inviting the same pending email rotates the token (old links stop
    // working) rather than creating a duplicate row.
    const { data: existing } = await userClient
      .from("invitations")
      .select("id")
      .eq("org_id", caller.org_id)
      .eq("email", normalizedEmail)
      .is("accepted_at", null)
      .maybeSingle();

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    if (existing) {
      const { error } = await userClient
        .from("invitations")
        .update({ token, role: targetRole, created_at: new Date().toISOString(), expires_at: expiresAt })
        .eq("id", (existing as any).id);
      if (error) return json({ error: error.message }, 500);
    } else {
      const { error } = await userClient.from("invitations").insert({
        org_id: caller.org_id,
        email: normalizedEmail,
        role: targetRole,
        token,
        invited_by: authUser.user.id,
        expires_at: expiresAt,
      });
      if (error) return json({ error: error.message }, 500);
    }

    const inviterName = (caller as any).full_name ?? (caller as any).email ?? "A teammate";
    const orgName = (org as any)?.name ?? "your team";
    const link = `${String(invite_link_base).replace(/\/$/, "")}/invite/${token}`;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "Campaign Commander <onboarding@resend.dev>";

    const emailRes = await fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: normalizedEmail,
        subject: `${inviterName} invited you to join ${orgName} on Campaign Commander`,
        html: renderInviteEmail({ inviterName, orgName, role: targetRole, link }),
      }),
    });

    if (!emailRes.ok) {
      const text = await emailRes.text();
      // The invitation row is already saved either way — the link still
      // works if shared manually, so this is a warning, not a hard failure.
      return json(
        {
          ok: true,
          email_sent: false,
          email_error: `Resend responded ${emailRes.status}: ${text.slice(0, 300)}`,
          invite_link: link,
        },
        200,
      );
    }

    return json({ ok: true, email_sent: true, invite_link: link });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

function renderInviteEmail(opts: { inviterName: string; orgName: string; role: string; link: string }): string {
  const { inviterName, orgName, role, link } = opts;
  return `
  <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
    <h2 style="color: #16203f; margin-bottom: 8px;">You're invited to ${orgName}</h2>
    <p style="color: #64708a; font-size: 14px; line-height: 1.6;">
      ${inviterName} invited you to join <strong>${orgName}</strong> on Campaign Commander as
      a <strong>${role}</strong>.
    </p>
    <a href="${link}"
       style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #0c7b92;
              color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
      Accept invitation
    </a>
    <p style="color: #898781; font-size: 12px; margin-top: 24px;">
      This link expires in 14 days. If you weren't expecting this, you can ignore this email.
    </p>
  </div>`;
}

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
