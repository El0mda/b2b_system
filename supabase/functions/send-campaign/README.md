# send-campaign Edge Function

This function is what Step 5 of the campaign wizard invokes when you click **Launch Campaign**. It runs server-side on Supabase, reads the campaign's leads + sequences from the DB, and sends them to SmartLead which handles email delivery via your configured SMTP sender account.

## Deploy

```bash
# One-time setup
npm install -g supabase
supabase login
supabase link --project-ref agpczobjcmibowwppghy

# Deploy the function
supabase functions deploy send-campaign

# Set the SmartLead API key as a secret (server-side only)
supabase secrets set SMARTLEAD_API_KEY=your_smartlead_api_key_here
```

## What it does

1. **Creates a SmartLead campaign** — `POST /campaigns` with the campaign name.
2. **Saves the email sequence** — `POST /campaigns/{id}/sequences` with all steps. Template variables (`{{first_name}}`, `{{company}}`, etc.) are automatically converted to SmartLead format (`{{firstName}}`, `{{companyName}}`).
3. **Adds leads** — `POST /campaigns/{id}/leads` with all selected leads.
4. **Sets the sender account** — `POST /campaigns/{id}/settings` with the SmartLead SMTP sender account ID.
5. **Schedules the campaign** — `POST /campaigns/{id}/schedule` with timezone and sending window config.

SmartLead handles all actual email sending, follow-up scheduling, and delivery tracking.

## Test locally

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

- It expects `SMARTLEAD_API_KEY` in env. Without it, the function 500s with a clear message.
- Auth is forwarded — the function uses the **caller's JWT** to query Supabase, so RLS still applies. The user can only launch campaigns from their own org.
- Emails are sent from whatever `sender_email` the campaign was created with (the caller must have that address connected as a SmartLead sender account).
