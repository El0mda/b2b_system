-- Tracks the SmartLead-assigned lead id so incoming webhook events (which
-- carry SmartLead's lead_id but not always an email) can be matched back to
-- the local lead row. Populated opportunistically from the first webhook
-- event we see for a lead (EMAIL_SENT/EMAIL_REPLIED include both lead_id
-- and email; EMAIL_OPENED/EMAIL_CLICKED carry lead_id only).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS smartlead_lead_id TEXT;
CREATE INDEX IF NOT EXISTS leads_smartlead_lead_id_idx ON public.leads (campaign_id, smartlead_lead_id);
