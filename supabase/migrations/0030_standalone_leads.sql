-- Leads that exist on their own, before any campaign.
--
-- Lead visibility used to run entirely through the parent campaign
-- (0010): a member sees a lead if they created its campaign, owner and
-- admin see all. That rule has no answer for a lead with
-- campaign_id IS NULL — it belongs to no campaign, so it matched nobody
-- and the person who just searched for it could not see their own
-- result.
--
-- Leads now carry their own owner. Saving a lead from the Find Leads
-- page records created_by, and that alone makes it visible to its
-- finder — campaign or no campaign. The campaign branch stays, so a
-- lead someone else's campaign owns is still visible to that campaign's
-- creator (and nothing a member saved becomes visible to other members).

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_created_by_idx ON public.leads(org_id, created_by);

-- Existing leads inherit the owner of the campaign they were added to,
-- so nobody loses sight of a lead they already had.
UPDATE public.leads l
   SET created_by = c.created_by
  FROM public.campaigns c
 WHERE l.campaign_id = c.id
   AND l.created_by IS NULL
   AND c.created_by IS NOT NULL;

DROP POLICY IF EXISTS "leads_visible" ON public.leads;
CREATE POLICY "leads_visible" ON public.leads
  FOR ALL TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (
      public.is_org_admin()
      OR created_by = auth.uid()
      OR campaign_id IN (SELECT id FROM public.campaigns WHERE created_by = auth.uid())
    )
  )
  WITH CHECK (
    org_id = public.current_org_id()
    AND (
      public.is_org_admin()
      -- A member may only create or keep leads under their own name;
      -- they cannot write a lead onto someone else's campaign.
      OR created_by = auth.uid()
      OR campaign_id IN (SELECT id FROM public.campaigns WHERE created_by = auth.uid())
    )
  );
