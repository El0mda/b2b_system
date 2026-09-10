-- Call steps in a sequence.
--
-- A sequence stops being email-only: a step is either an email (sent by
-- SmartLead, as before) or a call — a job for a human, which nothing
-- outside this app can carry out. So a call step becomes one row per
-- lead in public.call_tasks, due at the point in the cadence the step
-- sits at, and the app nags the assignee until it's marked done.
--
-- Delays gain an hours component because "call them 6 hours after the
-- first email" is the natural unit for a call, while SmartLead only
-- understands whole days for the emails around it.

ALTER TABLE public.sequences
  ADD COLUMN IF NOT EXISTS step_type TEXT NOT NULL DEFAULT 'email';
ALTER TABLE public.sequences DROP CONSTRAINT IF EXISTS sequences_step_type_check;
ALTER TABLE public.sequences
  ADD CONSTRAINT sequences_step_type_check CHECK (step_type IN ('email', 'call'));

ALTER TABLE public.sequences
  ADD COLUMN IF NOT EXISTS delay_hours INTEGER NOT NULL DEFAULT 0;
-- Call steps carry a task title and a call script instead of a subject
-- and a body, so the email columns can no longer be mandatory.
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.sequences ALTER COLUMN subject DROP NOT NULL;
ALTER TABLE public.sequences ALTER COLUMN body DROP NOT NULL;

-- One row per lead per call step, created when the campaign launches.
-- due_at is the launch time plus the cumulative delay of every step up
-- to and including this one — the same clock the emails run on.
--
-- snoozed_until is what "remind me later" writes: the task stays
-- pending and simply drops out of the due list until then.
CREATE TABLE IF NOT EXISTS public.call_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES public.sequences(id) ON DELETE SET NULL,
  step INTEGER,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  notes TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  snoozed_until TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'skipped')),
  outcome TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- The reminder query is "my pending tasks, soonest first", so that's the
-- index it gets.
CREATE INDEX IF NOT EXISTS call_tasks_assignee_due_idx
  ON public.call_tasks(assigned_to, status, due_at);
CREATE INDEX IF NOT EXISTS call_tasks_org_due_idx
  ON public.call_tasks(org_id, status, due_at);
CREATE INDEX IF NOT EXISTS call_tasks_lead_idx ON public.call_tasks(lead_id);
CREATE INDEX IF NOT EXISTS call_tasks_campaign_idx ON public.call_tasks(campaign_id);

ALTER TABLE public.call_tasks ENABLE ROW LEVEL SECURITY;

-- Same visibility model as campaigns and leads (see 0010): yours if
-- it's assigned to you or you created it, everything for owner/admin.
DROP POLICY IF EXISTS "call_tasks_visible" ON public.call_tasks;
CREATE POLICY "call_tasks_visible" ON public.call_tasks
  FOR ALL TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (
      assigned_to = auth.uid()
      OR created_by = auth.uid()
      OR public.is_org_admin()
    )
  )
  WITH CHECK (
    org_id = public.current_org_id()
    AND (
      assigned_to = auth.uid()
      OR created_by = auth.uid()
      OR public.is_org_admin()
    )
  );
