-- Team management through functions instead of row-level rules.
--
-- Removing a member (setting users.org_id = NULL) kept failing with
-- "new row violates row-level security policy for table users", even
-- after 0026 fixed the obvious cause, and even when run directly in SQL
-- as the owner with is_org_admin() verified true. The table has exactly
-- three permissive policies, no restrictive ones, no triggers and no
-- rules — so the rejection couldn't be explained from the catalog.
--
-- Rather than keep guessing, membership changes now go through
-- SECURITY DEFINER functions that do the permission check in plain SQL,
-- the same pattern accept_invitation (0009) has always used reliably.
-- The checks are stricter than the policy was, not looser:
--   * caller must be owner or admin of the target's org
--   * the owner's row can't be changed by anyone else
--   * a role must be one the app understands
--
-- The 0026 policy stays in place for direct updates (e.g. a member
-- editing their own profile).

CREATE OR REPLACE FUNCTION public.remove_org_member(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org UUID;
  v_caller_role TEXT;
  v_target_org UUID;
  v_target_role TEXT;
BEGIN
  SELECT org_id, role INTO v_caller_org, v_caller_role
    FROM public.users WHERE id = auth.uid();
  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'You are not part of a workspace';
  END IF;
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only an owner or admin can remove members';
  END IF;

  SELECT org_id, role INTO v_target_org, v_target_role
    FROM public.users WHERE id = p_user_id;
  IF v_target_org IS NULL OR v_target_org <> v_caller_org THEN
    RAISE EXCEPTION 'That person is not in your workspace';
  END IF;
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'The workspace owner cannot be removed';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove yourself';
  END IF;

  -- Their campaigns, leads and sequences stay with the workspace; only
  -- the person's access to it is withdrawn.
  UPDATE public.users SET org_id = NULL WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_member_role(p_user_id UUID, p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org UUID;
  v_caller_role TEXT;
  v_target_org UUID;
  v_target_role TEXT;
BEGIN
  IF p_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'Role must be admin or member';
  END IF;

  SELECT org_id, role INTO v_caller_org, v_caller_role
    FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only an owner or admin can change roles';
  END IF;

  SELECT org_id, role INTO v_target_org, v_target_role
    FROM public.users WHERE id = p_user_id;
  IF v_target_org IS NULL OR v_target_org <> v_caller_org THEN
    RAISE EXCEPTION 'That person is not in your workspace';
  END IF;
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'The workspace owner''s role cannot be changed';
  END IF;

  UPDATE public.users SET role = p_role WHERE id = p_user_id;
END;
$$;

-- Same story for the Odoo user id on the Team page: it writes to someone
-- else's row and would hit the same wall.
CREATE OR REPLACE FUNCTION public.set_member_odoo_user_id(p_user_id UUID, p_odoo_user_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org UUID;
  v_caller_role TEXT;
  v_target_org UUID;
BEGIN
  SELECT org_id, role INTO v_caller_org, v_caller_role
    FROM public.users WHERE id = auth.uid();
  SELECT org_id INTO v_target_org FROM public.users WHERE id = p_user_id;

  -- Anyone may set their own; changing someone else's needs owner/admin.
  IF p_user_id <> auth.uid() AND v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only an owner or admin can change this';
  END IF;
  IF v_target_org IS NULL OR v_target_org <> v_caller_org THEN
    RAISE EXCEPTION 'That person is not in your workspace';
  END IF;

  UPDATE public.users
     SET odoo_user_id = NULLIF(btrim(coalesce(p_odoo_user_id, '')), '')
   WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_member_odoo_user_id(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_role(UUID, TEXT) TO authenticated;
