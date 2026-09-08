-- Tech Team tasks and the local demo/meeting/won/lost pipeline stages
-- (added in 0010/0011) were replaced by pushing straight to Odoo (0012)
-- — Odoo owns deal progression now, so this local bookkeeping is unused.
DROP TABLE IF EXISTS public.tasks;
ALTER TABLE public.leads DROP COLUMN IF EXISTS pipeline_stage;
ALTER TABLE public.leads DROP COLUMN IF EXISTS demo_booked_at;
ALTER TABLE public.leads DROP COLUMN IF EXISTS meeting_held_at;
ALTER TABLE public.leads DROP COLUMN IF EXISTS closed_at;
