-- Row-level security: every row is scoped to the requester's organization.
-- A helper function reads the caller's org_id from public.users.

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.users WHERE id = auth.uid();
$$;

-- Enable RLS on every tenant-scoped table.
ALTER TABLE public.organizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequences      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sender_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations    ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- organizations: signup needs INSERT before users.org_id is set
-- =========================================================
DROP POLICY IF EXISTS "orgs_select_own" ON public.organizations;
CREATE POLICY "orgs_select_own" ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.current_org_id());

DROP POLICY IF EXISTS "orgs_insert_authenticated" ON public.organizations;
CREATE POLICY "orgs_insert_authenticated" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "orgs_update_own" ON public.organizations;
CREATE POLICY "orgs_update_own" ON public.organizations
  FOR UPDATE TO authenticated
  USING (id = public.current_org_id());

-- =========================================================
-- users: caller can read their own row + everyone in their org,
--        and insert their own row at signup
-- =========================================================
DROP POLICY IF EXISTS "users_select_self_or_org" ON public.users;
CREATE POLICY "users_select_self_or_org" ON public.users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR org_id = public.current_org_id()
  );

DROP POLICY IF EXISTS "users_insert_self" ON public.users;
CREATE POLICY "users_insert_self" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "users_update_self_or_org" ON public.users;
CREATE POLICY "users_update_self_or_org" ON public.users
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR org_id = public.current_org_id()
  );

-- =========================================================
-- Generic org-scoped policies for the remaining tables
-- =========================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'settings', 'campaigns', 'leads', 'sender_accounts',
    'webhook_logs', 'imports', 'invitations'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_org_all" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_org_all" ON public.%I FOR ALL TO authenticated '
      'USING (org_id = public.current_org_id()) '
      'WITH CHECK (org_id = public.current_org_id());',
      t, t
    );
  END LOOP;
END$$;

-- sequences has no org_id directly; scope through its parent campaign.
DROP POLICY IF EXISTS "sequences_org_all" ON public.sequences;
CREATE POLICY "sequences_org_all" ON public.sequences
  FOR ALL TO authenticated
  USING (
    campaign_id IN (
      SELECT id FROM public.campaigns WHERE org_id = public.current_org_id()
    )
  )
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM public.campaigns WHERE org_id = public.current_org_id()
    )
  );
