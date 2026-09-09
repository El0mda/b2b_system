-- step-launch.tsx has called supabase.rpc('increment_leads_used', ...)
-- since the launch flow was written, but the function was never created.
-- The call site swallows its own errors, so every campaign launch has
-- silently failed to bill leads against the org's monthly quota —
-- subscriptions.leads_used_this_month has sat at its initial value while
-- the UI reported usage from it.
--
-- SECURITY DEFINER because subscriptions is under RLS and a salesperson
-- launching a campaign has no write access to their own billing row.
-- The org is not taken on trust from the caller: p_org_id must match the
-- caller's own org, or this is a no-op.
CREATE OR REPLACE FUNCTION public.increment_leads_used(
  p_org_id UUID,
  p_amount INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  IF p_org_id IS DISTINCT FROM public.current_org_id() THEN
    RAISE EXCEPTION 'Cannot record usage for another organization';
  END IF;

  UPDATE public.subscriptions
     SET leads_used_this_month = COALESCE(leads_used_this_month, 0) + p_amount
   WHERE org_id = p_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_leads_used(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_leads_used(UUID, INTEGER) TO authenticated;
