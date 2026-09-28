-- Copy the email conversation into the Odoo opportunity's chatter.
--
-- Odoo only received a one-line note ("Reply: <date>") when a lead was
-- pushed, so the salesperson had to come back here to read what was
-- actually said. The sync now posts each email and reply into the
-- opportunity's chatter instead.
--
-- The sync re-reads a lead's whole thread every few minutes, so it needs
-- to know how much of it Odoo already has, or every run would post the
-- same emails again. This records the timestamp of the newest message
-- copied across; only messages newer than it are posted.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS odoo_thread_synced_at TIMESTAMPTZ;
