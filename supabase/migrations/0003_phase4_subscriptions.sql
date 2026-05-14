-- Phase 4: managed-platform pivot.
-- Adds subscriptions table; relaxes sender_accounts (we now use our shared sending domain).

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan TEXT DEFAULT 'starter',
  leads_quota_monthly INTEGER DEFAULT 1000,
  leads_used_this_month INTEGER DEFAULT 0,
  quota_reset_date DATE DEFAULT (CURRENT_DATE + INTERVAL '1 month'),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id)
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_org_all" ON public.subscriptions;
CREATE POLICY "subscriptions_org_all" ON public.subscriptions
  FOR ALL TO authenticated
  USING (org_id = (SELECT org_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM public.users WHERE id = auth.uid()));

-- All existing sender_accounts are auto-verified going forward.
ALTER TABLE public.sender_accounts
  ALTER COLUMN domain_verified SET DEFAULT TRUE;

UPDATE public.sender_accounts SET domain_verified = TRUE WHERE domain_verified IS DISTINCT FROM TRUE;

-- Auto-create a starter subscription whenever a new organization is created.
CREATE OR REPLACE FUNCTION public.create_default_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (org_id) VALUES (NEW.id)
  ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_default_subscription ON public.organizations;
CREATE TRIGGER organizations_default_subscription
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.create_default_subscription();

-- Backfill subscriptions for orgs that already exist.
INSERT INTO public.subscriptions (org_id)
SELECT o.id FROM public.organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.org_id = o.id);
