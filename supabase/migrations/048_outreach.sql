-- ============================================================================
-- 048 · Outreach Hub — work every relationship where we need something back:
-- thin-dossier venues (need facts) and parked non-venues we want to keep warm.
-- outreach_log + the new restaurants columns are admin-only, written through the
-- service-role client (declared SERVICE_ROLE in the write-grant guardrail).
-- ============================================================================

-- Where to email a venue (many list one on their site/IG). No column existed.
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS outreach_next_followup_at timestamptz;

DO $$ BEGIN
  CREATE TYPE public.outreach_status AS ENUM (
    'none', 'to_contact', 'contacted', 'awaiting_reply',
    'info_received', 'declined', 'resolved'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Orthogonal to moderation_status: a row can be pending + needs_attention +
-- outreach_status='contacted'; a parked non-venue can carry a status too.
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS outreach_status public.outreach_status NOT NULL DEFAULT 'none';

DO $$ BEGIN
  CREATE TYPE public.outreach_channel AS ENUM (
    'instagram', 'email', 'facebook', 'phone', 'website', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.outreach_direction AS ENUM ('out', 'in');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One row per contact attempt (James hits multiple channels per venue).
CREATE TABLE IF NOT EXISTS public.outreach_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  channel       public.outreach_channel   NOT NULL,
  direction     public.outreach_direction NOT NULL DEFAULT 'out',
  contacted_at  timestamptz NOT NULL DEFAULT now(),
  note          text,
  created_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_log_restaurant_idx
  ON public.outreach_log (restaurant_id, contacted_at DESC);

-- Service-role only (same locked pattern as contact_messages / email_subscribers).
ALTER TABLE public.outreach_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outreach_log FROM anon, authenticated;
GRANT ALL  ON public.outreach_log TO service_role;
