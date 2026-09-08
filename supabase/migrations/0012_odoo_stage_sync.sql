-- Odoo is now the system of record for deal progression — this just
-- mirrors its current stage back for display, twice a day (see the
-- odoo-sync function + cron below). Not constrained to a fixed enum
-- since the real stage list lives in Odoo's own pipeline configuration.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS odoo_stage TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS odoo_stage_synced_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS leads_odoo_stage_idx ON public.leads(odoo_stage);

-- Twice-daily poll (08:00 and 16:00 UTC) of every Odoo-synced lead's
-- current stage, mirroring the existing smartlead-sync-poll pattern
-- from migration 0007.
SELECT cron.schedule(
  'odoo-stage-sync',
  '0 8,16 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pkfprsxpvjjiszqweqfy.supabase.co/functions/v1/odoo-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
