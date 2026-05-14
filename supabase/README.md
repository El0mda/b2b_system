# Supabase setup

The app expects two migrations applied to the `agpczobjcmibowwppghy` project.

## How to apply

Open the Supabase dashboard → **SQL Editor** → New query → paste each file in order → Run:

1. `migrations/0001_initial_schema.sql` — creates all tables and indexes
2. `migrations/0002_rls_policies.sql` — enables RLS and adds org-scoped policies

Both files are idempotent (`CREATE TABLE IF NOT EXISTS` / `DROP POLICY IF EXISTS`), so re-running them is safe.

## Auth settings

In **Authentication → Providers**:
- Email is enabled by default — keep it on
- Turn **off** "Confirm email" while developing, otherwise the signup flow lands you on an unconfirmed account and the dashboard queries return zeros

## Security notes

- The `anon` key is what the app uses and is safe to embed in the build
- Never put the `service_role` key in `.env` shipped to clients — rotate it immediately if exposed
