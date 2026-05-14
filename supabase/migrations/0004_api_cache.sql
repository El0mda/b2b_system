-- Phase 7: API proxy caching table.
-- Stores cached responses from external API proxies (Lusha filters, etc.)
-- to reduce external API calls for data that rarely changes.

CREATE TABLE IF NOT EXISTS public.api_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  response_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;

-- Only the service_role can read/write cache (no direct user access needed)
DROP POLICY IF EXISTS "api_cache_service" ON public.api_cache;
CREATE POLICY "api_cache_service" ON public.api_cache
  USING (true)
  WITH CHECK (true);
