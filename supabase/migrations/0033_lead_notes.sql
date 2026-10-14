-- Notes on a lead, written from the Pipeline and mirrored into Odoo.
--
-- A salesperson working a deal needs somewhere to write "called, asked
-- for a proposal next week" — and since the deal itself lives in Odoo,
-- the note belongs on the Odoo opportunity's chatter too, where the rest
-- of the team reads it.
--
-- odoo_message_id is the mail.message the note became in Odoo. NULL
-- means it hasn't reached Odoo yet: the lead wasn't there when the note
-- was written, or Odoo couldn't be reached. Unsent notes go across the
-- moment the lead is pushed (see pushLeadToOdoo in functions/_shared).
--
-- Visibility follows the lead: the policy's subquery on public.leads is
-- itself filtered by the leads policy, so a member reads and writes notes
-- only on leads they can already see (owner/admin see them all).

CREATE TABLE IF NOT EXISTS public.lead_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (length(btrim(body)) > 0 AND length(body) <= 10000),
  odoo_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_notes_lead_idx ON public.lead_notes(lead_id, created_at DESC);

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.lead_notes TO authenticated;

DROP POLICY IF EXISTS "lead_notes_select" ON public.lead_notes;
CREATE POLICY "lead_notes_select" ON public.lead_notes
  FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND lead_id IN (SELECT id FROM public.leads)
  );

-- Written under your own name, on a lead you can see.
DROP POLICY IF EXISTS "lead_notes_insert" ON public.lead_notes;
CREATE POLICY "lead_notes_insert" ON public.lead_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND author_id = auth.uid()
    AND lead_id IN (SELECT id FROM public.leads)
  );

-- Only the author (or owner/admin) removes a note. Removing it here does
-- not remove it from Odoo, whose chatter is its own record.
DROP POLICY IF EXISTS "lead_notes_delete" ON public.lead_notes;
CREATE POLICY "lead_notes_delete" ON public.lead_notes
  FOR DELETE TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (author_id = auth.uid() OR public.is_org_admin())
  );
