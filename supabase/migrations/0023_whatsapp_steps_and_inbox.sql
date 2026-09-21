-- WhatsApp steps in sequences, and read tracking for the replies inbox.

-- ── WhatsApp steps ──
-- A WhatsApp step works like a call step: SmartLead can't send it, so it
-- becomes a task per lead, due at its point in the cadence. The task
-- carries the personalised message and opens a WhatsApp chat in one click.
ALTER TABLE public.sequences DROP CONSTRAINT IF EXISTS sequences_step_type_check;
ALTER TABLE public.sequences
  ADD CONSTRAINT sequences_step_type_check
  CHECK (step_type IN ('email', 'call', 'whatsapp'));

-- call_tasks now holds both kinds of human step. Existing rows are calls.
-- For a WhatsApp task, `notes` holds the message to send.
ALTER TABLE public.call_tasks
  ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'call';
ALTER TABLE public.call_tasks DROP CONSTRAINT IF EXISTS call_tasks_task_type_check;
ALTER TABLE public.call_tasks
  ADD CONSTRAINT call_tasks_task_type_check CHECK (task_type IN ('call', 'whatsapp'));

-- ── Replies inbox ──
-- replied_at is the lead's FIRST reply — the sync recomputes it from the
-- oldest reply on every run, and analytics depend on that. A follow-up
-- reply therefore never changed anything, so the inbox couldn't tell a
-- conversation had new activity. last_reply_at tracks the most recent.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ;
UPDATE public.leads
  SET last_reply_at = replied_at
  WHERE replied_at IS NOT NULL AND last_reply_at IS NULL;

-- When the salesperson last opened this lead's conversation. Unread while
-- last_reply_at is newer than this, or it's never been opened.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS reply_read_at TIMESTAMPTZ;

-- The inbox lists conversations by most recent reply.
CREATE INDEX IF NOT EXISTS leads_last_reply_idx
  ON public.leads(org_id, last_reply_at DESC)
  WHERE last_reply_at IS NOT NULL;
