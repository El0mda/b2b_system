-- A member must not see another member's leads, replies or activity.
--
-- Campaigns and leads were already scoped to their creator in 0010, but
-- three tables still carried the blanket org-wide policy from 0002, and
-- each of them leaked around that boundary:
--
--   webhook_logs — every delivery, open, click and REPLY event, with the
--     lead's email, name and the raw payload (which contains the reply
--     text). Any member could read every other member's replies.
--   imports      — who imported which file, how many rows, for which
--     campaign.
--   invitations  — pending invitees' email addresses, and FOR ALL meant
--     a member could also create or cancel invitations, which the Team
--     page only ever offered to owner/admin.
--
-- Owner and admin keep full visibility, as before.

-- ── webhook_logs: raw engagement events, incl. reply bodies ──
-- Only owner/admin can read them; they exist for diagnosing delivery.
-- Writes come from the smartlead-webhooks function on the service role,
-- which bypasses RLS, so no write policy is needed.
DROP POLICY IF EXISTS "webhook_logs_org_all" ON public.webhook_logs;
DROP POLICY IF EXISTS "webhook_logs_admin_select" ON public.webhook_logs;
CREATE POLICY "webhook_logs_admin_select" ON public.webhook_logs
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_admin());

-- ── imports: whose import was it ──
ALTER TABLE public.imports
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "imports_org_all" ON public.imports;

DROP POLICY IF EXISTS "imports_select" ON public.imports;
CREATE POLICY "imports_select" ON public.imports
  FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (
      public.is_org_admin()
      OR created_by = auth.uid()
      -- Rows from before created_by existed are matched through their
      -- campaign, which is itself scoped to its creator.
      OR campaign_id IN (SELECT id FROM public.campaigns)
    )
  );

DROP POLICY IF EXISTS "imports_insert" ON public.imports;
CREATE POLICY "imports_insert" ON public.imports
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "imports_modify" ON public.imports;
CREATE POLICY "imports_modify" ON public.imports
  FOR UPDATE TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (public.is_org_admin() OR created_by = auth.uid())
  )
  WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "imports_delete" ON public.imports;
CREATE POLICY "imports_delete" ON public.imports
  FOR DELETE TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (public.is_org_admin() OR created_by = auth.uid())
  );

-- ── invitations: owner/admin only ──
-- Accepting an invitation goes through accept_invitation /
-- get_invitation_preview (SECURITY DEFINER, 0009), so an invited person
-- needs no direct access to this table.
DROP POLICY IF EXISTS "invitations_org_all" ON public.invitations;
DROP POLICY IF EXISTS "invitations_admin_all" ON public.invitations;
CREATE POLICY "invitations_admin_all" ON public.invitations
  FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_admin())
  WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin());
