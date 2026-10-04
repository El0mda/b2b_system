-- Sequences can target a whole department, not only named job titles.
--
-- A sequence used to say who it was for with job positions alone ("HR
-- Manager"), and every lead's title had to match one of them. Titles are
-- written a hundred ways for the same job, so a sequence can now also
-- name departments — Human Resources, Finance, IT — and any lead in that
-- function gets it, however their title is worded.
--
-- Department keys are the ones in src/lib/job-match.ts (human_resources,
-- sales, …). They're matched against the lead's own department where the
-- data provider gave us one, and otherwise inferred from the job title,
-- so imported leads with nothing but a title still route correctly.

ALTER TABLE public.campaign_tracks
  ADD COLUMN IF NOT EXISTS departments TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.sequence_templates
  ADD COLUMN IF NOT EXISTS departments TEXT[] NOT NULL DEFAULT '{}';

-- What the provider said the lead's department is. Lusha returns it with
-- the enriched contact; imports rarely carry one, which is why matching
-- falls back to the job title.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS department TEXT;
