-- Twice a day was fine while the Odoo stage was only a display detail.
-- Now the app's Pipeline board mirrors Odoo's own stages, so a
-- salesperson who moves a deal to "demo" in Odoo expects to see it move
-- here too — waiting until 16:00 UTC reads as the sync being broken.
--
-- Every 5 minutes matches smartlead-sync-poll (migration 0007). The cost
-- is one Odoo `read` per org per run over only the leads already pushed
-- to Odoo, which is a small set by construction (click/reply only).
--
-- cron.schedule() upserts on job name, so this replaces the schedule set
-- in migration 0012 rather than creating a second job.
SELECT cron.schedule(
  'odoo-stage-sync',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pkfprsxpvjjiszqweqfy.supabase.co/functions/v1/odoo-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
