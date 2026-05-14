# send-campaign Edge Function

This function is what Step 5 of the campaign wizard invokes when you click **Launch Campaign**. It runs server-side on Supabase, reads the campaign's leads + sequences from the DB, and sends emails through Resend with the platform's API key.

## Deploy

```bash
# One-time setup
npm install -g supabase
supabase login
supabase link --project-ref agpczobjcmibowwppghy

# Deploy the function
supabase functions deploy send-campaign

# Set the Resend API key as a secret (server-side only)
supabase secrets set RESEND_API_KEY=re_your_resend_key_here
```

## What it does

For each lead in the campaign:

1. **Step 1 immediately** — `POST https://api.resend.com/emails` with `from`, `to`, `reply_to`, `subject`, `html`, and `tags` (campaign_id, lead_id, step, org_id).
2. **Steps 2+ scheduled** — same payload plus `scheduled_at: <ISO timestamp>`. The timestamp adds up all previous step delays.

Tags are how the reply / events webhook will identify which campaign/lead/step a Resend event belongs to.

## Tested locally

```bash
supabase functions serve send-campaign --env-file ./supabase/.env.local
```

Then in another terminal:

```bash
curl -X POST http://localhost:54321/functions/v1/send-campaign \
  -H "Authorization: Bearer YOUR_USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"campaign_id":"00000000-0000-0000-0000-000000000000"}'
```

## Notes

- It expects `RESEND_API_KEY` in env. Without it, the function 500s with a clear message.
- Auth is forwarded — the function uses the **caller's JWT** to query Supabase, so RLS still applies. The user can only launch campaigns from their own org.
- If you also want stop-on-reply, add a second function `cancel-followups` that watches the inbound webhook and DELETEs scheduled emails for the lead.
