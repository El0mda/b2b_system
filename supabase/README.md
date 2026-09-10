# Supabase setup

The app expects every file in `migrations/` applied in filename order.

## How to apply

Open the Supabase dashboard → **SQL Editor** → New query → paste each file in order → Run:

1. `migrations/0001_initial_schema.sql` — creates all tables and indexes
2. `migrations/0002_rls_policies.sql` — enables RLS and adds org-scoped policies
3. …through `migrations/0018_sequence_call_steps.sql`

The files are idempotent (`CREATE TABLE IF NOT EXISTS` / `DROP POLICY IF EXISTS`), so re-running them is safe.

After any migration, regenerate the app's types so the client stays in step:

```
supabase gen types typescript --project-id <ref> --schema public > src/types/db.ts
```

## Edge functions

```
supabase functions deploy odoo-push          # manual "Push to Odoo" button
supabase functions deploy odoo-sync --no-verify-jwt
supabase functions deploy campaign-action
supabase functions deploy send-campaign   # re-deploy after 0018: call steps are filtered out of the SmartLead push
supabase functions deploy smartlead-sync --no-verify-jwt
supabase functions deploy smartlead-webhooks --no-verify-jwt
```

`odoo-push` verifies the caller's JWT, so it must **not** be deployed with `--no-verify-jwt`.

## Auth settings

In **Authentication → Providers**:
- Email is enabled by default — keep it on
- Turn **off** "Confirm email" while developing, otherwise the signup flow lands you on an unconfirmed account and the dashboard queries return zeros

## Security notes

- The `anon` key is what the app uses and is safe to embed in the build
- Never put the `service_role` key in `.env` shipped to clients — rotate it immediately if exposed
