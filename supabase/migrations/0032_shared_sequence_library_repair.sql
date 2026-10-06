-- Put the team's sequence library back in everyone's hands.
--
-- The library (sequence_verticals + sequence_templates) is the team's:
-- 0017 lets every member of the org read it and add to it, and 0024 lets
-- any member edit or delete a saved sequence. Yet members were seeing an
-- empty Sequences page while the person who wrote the sequences saw them
-- all.
--
-- Policies are OR-ed, so no extra policy can hide rows that the org-wide
-- one shows: an empty page means the org-wide read policy is missing from
-- the live database — a migration skipped or half-run in the SQL editor,
-- or a policy changed by hand. The files say one thing and the database
-- another, and re-running 0017 alone would leave whatever else is there.
--
-- So this drops every policy on the two tables, whatever its name, and
-- recreates exactly the intended set. Safe to run more than once.
--
-- Campaigns, leads and replies are untouched: they stay private to the
-- member who owns them (0028/0029). A campaign's own copy of its steps
-- (public.sequences) follows its campaign; "Save to library" in the
-- campaign wizard is how a sequence is shared.

DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('sequence_verticals', 'sequence_templates')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I;', p.policyname, p.tablename);
  END LOOP;
END$$;

ALTER TABLE public.sequence_verticals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_templates ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequence_verticals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequence_templates TO authenticated;

-- Everyone in the org reads and adds to both.
CREATE POLICY "sequence_verticals_select" ON public.sequence_verticals
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY "sequence_verticals_insert" ON public.sequence_verticals
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "sequence_templates_select" ON public.sequence_templates
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY "sequence_templates_insert" ON public.sequence_templates
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

-- Any member edits or deletes a saved sequence (0024): a campaign copies
-- the steps it launches with, so this never touches a running campaign.
CREATE POLICY "sequence_templates_update" ON public.sequence_templates
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "sequence_templates_delete" ON public.sequence_templates
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());

-- A vertical stays with its creator (plus owner/admin): deleting one
-- deletes every sequence filed under it.
CREATE POLICY "sequence_verticals_update" ON public.sequence_verticals
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id()
         AND (created_by = auth.uid() OR public.is_org_admin()))
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "sequence_verticals_delete" ON public.sequence_verticals
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id()
         AND (created_by = auth.uid() OR public.is_org_admin()));
