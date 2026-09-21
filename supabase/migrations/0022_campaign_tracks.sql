-- Several sequences in one campaign, each for a different audience.
--
-- A campaign used to have exactly one sequence. Now it can have several
-- "tracks" — one for HR, one for sales, one for project managers — and
-- each lead is routed to the track whose job positions match its title.
--
-- SmartLead only allows one sequence per campaign, so each track becomes
-- its own SmartLead campaign behind the scenes. In this app they stay
-- grouped under the one campaign the user created.
--
-- Campaigns created before this have no tracks at all; every function
-- that reads tracks falls back to campaigns.smartlead_campaign_id for
-- them, so they keep working untouched.

-- The audience a saved sequence is written for, set in the Sequences tab.
ALTER TABLE public.sequence_templates
  ADD COLUMN IF NOT EXISTS job_positions TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.campaign_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Order matters: a lead matching two tracks goes to the earlier one.
  position INTEGER NOT NULL DEFAULT 0,
  job_positions TEXT[] NOT NULL DEFAULT '{}',
  -- Receives leads whose title matches no track.
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  template_id UUID REFERENCES public.sequence_templates(id) ON DELETE SET NULL,
  smartlead_campaign_id TEXT,
  -- pending: not launched yet · active: live in SmartLead
  -- failed: SmartLead rejected it (see error) · skipped: no leads matched
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'failed', 'skipped')),
  error TEXT,
  lead_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS campaign_tracks_campaign_idx
  ON public.campaign_tracks(campaign_id, position);
-- Webhooks arrive carrying only SmartLead's campaign id.
CREATE INDEX IF NOT EXISTS campaign_tracks_smartlead_idx
  ON public.campaign_tracks(smartlead_campaign_id);

ALTER TABLE public.campaign_tracks ENABLE ROW LEVEL SECURITY;

-- Visible exactly when the parent campaign is: the subquery runs under
-- campaigns' own policy (creator, or owner/admin — see 0010).
DROP POLICY IF EXISTS "campaign_tracks_visible" ON public.campaign_tracks;
CREATE POLICY "campaign_tracks_visible" ON public.campaign_tracks
  FOR ALL TO authenticated
  USING (
    org_id = public.current_org_id()
    AND campaign_id IN (SELECT id FROM public.campaigns)
  )
  WITH CHECK (
    org_id = public.current_org_id()
    AND campaign_id IN (SELECT id FROM public.campaigns)
  );

-- Which track a step and a lead belong to. Null on campaigns that
-- predate tracks.
ALTER TABLE public.sequences
  ADD COLUMN IF NOT EXISTS track_id UUID REFERENCES public.campaign_tracks(id) ON DELETE CASCADE;
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS track_id UUID REFERENCES public.campaign_tracks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sequences_track_idx ON public.sequences(track_id);
CREATE INDEX IF NOT EXISTS leads_track_idx ON public.leads(track_id);
