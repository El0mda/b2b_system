-- CRM pipeline: Opened/Clicked/Replied are derived from the existing
-- engagement columns on leads; Won/Lost are the only stages actually
-- stored, set once a lead has replied.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS pipeline_stage TEXT CHECK (pipeline_stage IN ('won', 'lost'));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS leads_pipeline_stage_idx ON public.leads(pipeline_stage);

-- Campaign ownership: the creator can always see/manage their own
-- campaign; owner/admin can see/manage every campaign in the org.
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

-- Replaces the blanket org-wide "campaigns_org_all" policy from 0002.
DROP POLICY IF EXISTS "campaigns_org_all" ON public.campaigns;
CREATE POLICY "campaigns_visible" ON public.campaigns
  FOR ALL TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (created_by = auth.uid() OR public.is_org_admin())
  )
  WITH CHECK (
    org_id = public.current_org_id()
    AND (created_by = auth.uid() OR public.is_org_admin())
  );

-- Leads inherit the same visibility as their parent campaign. Replaces
-- the blanket org-wide "leads_org_all" policy from 0002.
DROP POLICY IF EXISTS "leads_org_all" ON public.leads;
CREATE POLICY "leads_visible" ON public.leads
  FOR ALL TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (
      public.is_org_admin()
      OR campaign_id IN (SELECT id FROM public.campaigns WHERE created_by = auth.uid())
    )
  )
  WITH CHECK (
    org_id = public.current_org_id()
    AND (
      public.is_org_admin()
      OR campaign_id IN (SELECT id FROM public.campaigns WHERE created_by = auth.uid())
    )
  );
