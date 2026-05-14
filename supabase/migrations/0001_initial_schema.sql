-- Phase 1 schema for Campaign Commander.
-- Run in Supabase SQL Editor against the agpczobjcmibowwppghy project.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  plan TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  full_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'member',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, key)
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sender_email TEXT,
  sender_name TEXT,
  reply_to_email TEXT,
  timezone TEXT DEFAULT 'UTC',
  status TEXT DEFAULT 'draft',
  source TEXT,
  lusha_request_id TEXT,
  leads_searched INTEGER DEFAULT 0,
  leads_enriched INTEGER DEFAULT 0,
  leads_verified INTEGER DEFAULT 0,
  leads_added INTEGER DEFAULT 0,
  leads_imported INTEGER DEFAULT 0,
  resend_automation_id TEXT,
  filters JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  source TEXT DEFAULT 'lusha',
  contact_id TEXT,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  email TEXT,
  email_type TEXT,
  company TEXT,
  job_title TEXT,
  location TEXT,
  linkedin_url TEXT,
  website TEXT,
  phone TEXT,
  has_work_email BOOLEAN DEFAULT FALSE,
  has_phones BOOLEAN DEFAULT FALSE,
  nb_result TEXT,
  nb_code INTEGER,
  email_valid BOOLEAN,
  is_duplicate BOOLEAN DEFAULT FALSE,
  added_to_campaign BOOLEAN DEFAULT FALSE,
  email_delivered BOOLEAN DEFAULT FALSE,
  email_opened BOOLEAN DEFAULT FALSE,
  email_opened_at TIMESTAMPTZ,
  email_clicked BOOLEAN DEFAULT FALSE,
  email_clicked_at TIMESTAMPTZ,
  email_bounced BOOLEAN DEFAULT FALSE,
  email_bounce_reason TEXT,
  current_step INTEGER DEFAULT 0,
  reply_text TEXT,
  replied_at TIMESTAMPTZ,
  synced_to_odoo BOOLEAN DEFAULT FALSE,
  odoo_lead_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  delay_days INTEGER DEFAULT 0,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sender_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  reply_to_email TEXT,
  resend_domain_id TEXT,
  domain TEXT,
  domain_verified BOOLEAN DEFAULT FALSE,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT,
  source TEXT,
  campaign_name TEXT,
  lead_email TEXT,
  lead_name TEXT,
  payload JSONB,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  file_name TEXT,
  file_url TEXT,
  total_rows INTEGER,
  imported_rows INTEGER,
  skipped_rows INTEGER,
  duplicate_rows INTEGER,
  status TEXT DEFAULT 'processing',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  token TEXT,
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_org_id_idx ON public.leads(org_id);
CREATE INDEX IF NOT EXISTS leads_campaign_id_idx ON public.leads(campaign_id);
CREATE INDEX IF NOT EXISTS campaigns_org_id_idx ON public.campaigns(org_id);
CREATE INDEX IF NOT EXISTS settings_org_id_key_idx ON public.settings(org_id, key);
