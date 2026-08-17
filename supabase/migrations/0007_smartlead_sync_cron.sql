-- Automatic polling fallback for SmartLead delivery status: their webhook
-- system accepted registration but never actually delivered a single event
-- in testing (no error surfaced anywhere), so this polls smartlead-sync
-- every 5 minutes instead of relying on it.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'smartlead-sync-poll',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pkfprsxpvjjiszqweqfy.supabase.co/functions/v1/smartlead-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
