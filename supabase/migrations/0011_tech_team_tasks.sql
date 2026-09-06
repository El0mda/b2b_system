-- Extend the CRM pipeline past Won/Lost: a salesperson can book a demo
-- (creating a task for the Tech Team) and mark a meeting held before
-- closing the deal.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_pipeline_stage_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_pipeline_stage_check
  CHECK (pipeline_stage IN ('demo_booked', 'meeting_held', 'won', 'lost'));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS demo_booked_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meeting_held_at TIMESTAMPTZ;

-- Tech Team tasks: lightweight to-dos handed off when a demo is booked.
-- assigned_to is typically a user with role = 'tech', but isn't
-- constrained to that so a task can still be reassigned freely.
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tasks_org_idx ON public.tasks(org_id);
CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS tasks_lead_id_idx ON public.tasks(lead_id);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Visible/editable by whoever created it, whoever it's assigned to, or
-- an owner/admin — matches the visibility model already used for
-- campaigns/leads (see is_org_admin() in migration 0010).
DROP POLICY IF EXISTS "tasks_visible" ON public.tasks;
CREATE POLICY "tasks_visible" ON public.tasks
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
