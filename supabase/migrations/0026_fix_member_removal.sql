-- Removing a team member never worked.
--
-- "Remove" sets the member's org_id to NULL. The update policy from 0002
-- had no WITH CHECK, so Postgres reused its USING expression as the check:
--
--   id = auth.uid() OR org_id = public.current_org_id()
--
-- The updated row has org_id NULL and isn't the caller's own row, so the
-- check failed and every removal was rejected.
--
-- The replacement also tightens who may edit whom. The old policy let ANY
-- member update ANY other member's row in the org — including their role.
-- Editing someone else now requires owner/admin, which is what the Team
-- page already assumed.

DROP POLICY IF EXISTS "users_update_self_or_org" ON public.users;
DROP POLICY IF EXISTS "users_update_self_or_admin" ON public.users;
CREATE POLICY "users_update_self_or_admin" ON public.users
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR (
      org_id = public.current_org_id()
      AND public.is_org_admin()
      -- An admin must not be able to demote or remove the owner; only the
      -- owner can change their own row (through the branch above).
      AND (role IS DISTINCT FROM 'owner' OR public.is_org_owner())
    )
  )
  -- NULL org_id is the removal itself, so the check can't require the row
  -- to still belong to the org.
  WITH CHECK (id = auth.uid() OR public.is_org_admin());
