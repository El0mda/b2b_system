-- Team activity feed: records who did what (campaign launches, imports,
-- team management, logins) so owners/admins can see team activity.
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activity_log_org_created_idx ON public.activity_log(org_id, created_at DESC);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Any org member can record their own activity.
DROP POLICY IF EXISTS "activity_log_insert_self" ON public.activity_log;
CREATE POLICY "activity_log_insert_self" ON public.activity_log
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND actor_id = auth.uid());

-- Only owner/admin can read the feed.
DROP POLICY IF EXISTS "activity_log_select_admin" ON public.activity_log;
CREATE POLICY "activity_log_select_admin" ON public.activity_log
  FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );
