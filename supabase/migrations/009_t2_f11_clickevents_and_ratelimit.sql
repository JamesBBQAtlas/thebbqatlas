-- ============================================================================
-- 009 · F-11 (Tier 2) — click_events integrity + Supabase-table rate limiter.
-- Vercel Firewall handles edge abuse; this backstops cost-bearing server routes
-- without any paid KV service.
-- ============================================================================

-- click_events: the anon INSERT policy was WITH CHECK (true) — an attacker could
-- attribute clicks to any user. Pin user_id to the caller (or null for anon).
DROP POLICY IF EXISTS "click_events_insert" ON public.click_events;
CREATE POLICY "click_events_insert"
  ON public.click_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Fixed-window rate-limit counters (service-role only).
CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket       text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        int         NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Atomic increment + check. Returns TRUE when the request is allowed.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text, p_limit int, p_window_seconds int
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  w timestamptz := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );
  c int;
BEGIN
  INSERT INTO public.rate_limits(bucket, window_start, count)
  VALUES (p_key, w, 1)
  ON CONFLICT (bucket, window_start)
    DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO c;
  RETURN c <= p_limit;
END $$;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text,int,int) FROM anon, authenticated, public;
