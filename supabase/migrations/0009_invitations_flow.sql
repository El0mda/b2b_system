-- Completes the team invitation flow: an invitee has no org membership yet,
-- so the standard org-scoped RLS on `invitations` (which requires
-- current_org_id() to already resolve) can't let them read their own
-- invitation or join. These SECURITY DEFINER functions are the same
-- trusted-function pattern already used by current_org_id() and
-- create_default_subscription() — they bypass RLS deliberately, and each
-- validates the token/caller itself rather than relying on table policies.

ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days');

-- Preview an invitation by token before the visitor has an account — safe to
-- expose to anon since a token is an unguessable random UUID (a bearer
-- secret), and this returns only what's needed to render the invite screen.
CREATE OR REPLACE FUNCTION public.get_invitation_preview(p_token TEXT)
RETURNS TABLE (
  org_name TEXT,
  email TEXT,
  role TEXT,
  is_expired BOOLEAN,
  is_accepted BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.name,
    i.email,
    i.role,
    (i.expires_at IS NOT NULL AND i.expires_at < NOW()),
    (i.accepted_at IS NOT NULL)
  FROM public.invitations i
  JOIN public.organizations o ON o.id = i.org_id
  WHERE i.token = p_token;
$$;
GRANT EXECUTE ON FUNCTION public.get_invitation_preview(TEXT) TO anon, authenticated;

-- Join the inviting org as the invited role. Rejects (rather than silently
-- allowing) an email mismatch or an already-org'd caller — see the plan
-- notes: multi-org membership and link-forwarding are explicitly out of
-- scope, so this errs conservative.
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token TEXT)
RETURNS TABLE (org_id UUID, org_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation RECORD;
  v_caller_email TEXT;
  v_caller_org_id UUID;
BEGIN
  SELECT i.id, i.org_id, i.email, i.role, i.accepted_at, i.expires_at
    INTO v_invitation
    FROM public.invitations i
    WHERE i.token = p_token;

  IF v_invitation IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;
  IF v_invitation.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation already accepted';
  END IF;
  IF v_invitation.expires_at IS NOT NULL AND v_invitation.expires_at < NOW() THEN
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF v_caller_email IS NULL OR lower(v_caller_email) != lower(v_invitation.email) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address';
  END IF;

  SELECT u.org_id INTO v_caller_org_id FROM public.users u WHERE u.id = auth.uid();
  IF v_caller_org_id IS NOT NULL THEN
    RAISE EXCEPTION 'You already belong to a workspace';
  END IF;

  INSERT INTO public.users (id, org_id, email, full_name, role)
  VALUES (auth.uid(), v_invitation.org_id, v_caller_email, v_caller_email, v_invitation.role)
  ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id, role = EXCLUDED.role;

  UPDATE public.invitations SET accepted_at = NOW() WHERE id = v_invitation.id;

  RETURN QUERY SELECT o.id, o.name FROM public.organizations o WHERE o.id = v_invitation.org_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_invitation(TEXT) TO authenticated;

-- Catches the user who ignores the invite email and just signs up fresh
-- with the same address, or who has to confirm their email mid-flow and
-- lands back on /onboarding afterward instead of the /invite/:token link.
CREATE OR REPLACE FUNCTION public.pending_invitation_for_current_user()
RETURNS TABLE (token TEXT, org_name TEXT, role TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.token, o.name, i.role
  FROM public.invitations i
  JOIN public.organizations o ON o.id = i.org_id
  WHERE lower(i.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
    AND i.accepted_at IS NULL
    AND (i.expires_at IS NULL OR i.expires_at > NOW())
  ORDER BY i.created_at DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.pending_invitation_for_current_user() TO authenticated;
