-- Persist the SmartLead campaign id created by the send-campaign function so
-- later actions (pause, delete) can be applied to the same remote campaign.
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS smartlead_campaign_id TEXT;
