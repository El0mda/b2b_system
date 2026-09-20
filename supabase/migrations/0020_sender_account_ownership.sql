-- Per-salesperson sender accounts.
--
-- Until now sender_accounts was org-wide with no owner, and the campaign
-- wizard ignored it entirely — every campaign was hardcoded to one
-- address. A sales team can't share one inbox: replies land in the wrong
-- place, and one person's reputation damage hits everyone.
--
-- So an account gets an owner. A rep sees and sends from their own;
-- owner/admin see the whole team's, the same visibility rule campaigns
-- and leads already follow (see is_org_admin() in 0010).

ALTER TABLE public.sender_accounts
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS sender_accounts_user_idx
  ON public.sender_accounts(org_id, user_id);

-- Rows created before this migration have no owner. They stay visible to
-- the whole org rather than vanishing from under whoever was using them
-- — an unowned account reads as "shared".
DROP POLICY IF EXISTS "sender_accounts_org_all" ON public.sender_accounts;

DROP POLICY IF EXISTS "sender_accounts_select" ON public.sender_accounts;
CREATE POLICY "sender_accounts_select" ON public.sender_accounts
  FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (user_id IS NULL OR user_id = auth.uid() OR public.is_org_admin())
  );

DROP POLICY IF EXISTS "sender_accounts_insert" ON public.sender_accounts;
CREATE POLICY "sender_accounts_insert" ON public.sender_accounts
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND (user_id = auth.uid() OR public.is_org_admin())
  );

DROP POLICY IF EXISTS "sender_accounts_update" ON public.sender_accounts;
CREATE POLICY "sender_accounts_update" ON public.sender_accounts
  FOR UPDATE TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (user_id IS NULL OR user_id = auth.uid() OR public.is_org_admin())
  )
  WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "sender_accounts_delete" ON public.sender_accounts;
CREATE POLICY "sender_accounts_delete" ON public.sender_accounts
  FOR DELETE TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (user_id IS NULL OR user_id = auth.uid() OR public.is_org_admin())
  );
