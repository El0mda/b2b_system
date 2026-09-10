-- Three things that all hang off "who is allowed to do what":
--   1. Sequence verticals — a per-industry library of reusable sequence
--      templates, so a campaign can start from copy written for that
--      industry instead of the hard-coded manufacturing presets.
--   2. Settings become owner-only. Admins manage the team and the
--      pipeline; the Odoo credentials and workspace config are the
--      owner's alone.
--   3. is_org_owner(), the counterpart to is_org_admin() from 0010.

CREATE OR REPLACE FUNCTION public.is_org_owner()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner'
  );
$$;

-- =========================================================
-- Sequence verticals + templates
-- =========================================================

-- A vertical is an industry ("Manufacturing", "Logistics", …). It groups
-- the templates written for that audience; the app also ships built-in
-- verticals in code, which need no rows here.
CREATE TABLE IF NOT EXISTS public.sequence_verticals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, name)
);

-- Steps are stored as JSONB in the same shape the campaign wizard and
-- public.sequences already use: [{ step, delay_days, subject, body }].
-- They're a template, not a live schedule, so there's nothing to join
-- against and no reason to split them into rows.
CREATE TABLE IF NOT EXISTS public.sequence_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vertical_id UUID REFERENCES public.sequence_verticals(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sequence_verticals_org_idx ON public.sequence_verticals(org_id);
CREATE INDEX IF NOT EXISTS sequence_templates_org_idx ON public.sequence_templates(org_id);
CREATE INDEX IF NOT EXISTS sequence_templates_vertical_idx ON public.sequence_templates(vertical_id);

ALTER TABLE public.sequence_verticals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_templates ENABLE ROW LEVEL SECURITY;

-- The library is shared: everyone in the org can read and use it, but
-- editing is limited to whoever wrote the entry (plus owner/admin), the
-- same rule campaigns follow.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sequence_verticals', 'sequence_templates']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_select" ON public.%I FOR SELECT TO authenticated '
      'USING (org_id = public.current_org_id());', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_insert" ON public.%I FOR INSERT TO authenticated '
      'WITH CHECK (org_id = public.current_org_id());', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_update" ON public.%I FOR UPDATE TO authenticated '
      'USING (org_id = public.current_org_id() '
      '       AND (created_by = auth.uid() OR public.is_org_admin())) '
      'WITH CHECK (org_id = public.current_org_id());', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_delete" ON public.%I FOR DELETE TO authenticated '
      'USING (org_id = public.current_org_id() '
      '       AND (created_by = auth.uid() OR public.is_org_admin()));', t, t);
  END LOOP;
END$$;

-- =========================================================
-- settings: readable org-wide, writable by the owner only
-- =========================================================
-- Replaces the blanket "settings_org_all" policy from 0002. The read
-- stays org-wide because the Pipeline board reads the published Odoo
-- stage list (key = 'odoo_stages') for every member — but the Odoo API
-- key is held back from everyone but the owner, since a member with the
-- anon key could otherwise just select it.
DROP POLICY IF EXISTS "settings_org_all" ON public.settings;

DROP POLICY IF EXISTS "settings_select" ON public.settings;
CREATE POLICY "settings_select" ON public.settings
  FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (key <> 'odoo_api_key' OR public.is_org_owner())
  );

DROP POLICY IF EXISTS "settings_owner_write" ON public.settings;
CREATE POLICY "settings_owner_write" ON public.settings
  FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_owner())
  WITH CHECK (org_id = public.current_org_id() AND public.is_org_owner());
