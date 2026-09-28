-- The sequence library belongs to the team, not to whoever typed it in.
--
-- Editing a saved sequence was limited to its creator (plus owner/admin),
-- so a salesperson improving a teammate's copy had to duplicate it
-- instead — leaving near-identical sequences behind and no single version
-- anyone could rely on. Any member of the org can now edit and delete
-- them.
--
-- Deleting a template is safe by design: a campaign copies the steps it
-- launches with (public.sequences), so removing a template never touches
-- a running campaign.
--
-- Verticals keep the stricter rule: deleting one takes every sequence
-- inside it with it (ON DELETE CASCADE), which is not something one
-- person should do to the team's library by accident.

DROP POLICY IF EXISTS "sequence_templates_update" ON public.sequence_templates;
CREATE POLICY "sequence_templates_update" ON public.sequence_templates
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "sequence_templates_delete" ON public.sequence_templates;
CREATE POLICY "sequence_templates_delete" ON public.sequence_templates
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());
