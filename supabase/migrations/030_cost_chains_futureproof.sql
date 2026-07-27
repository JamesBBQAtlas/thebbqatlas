-- ============================================================================
-- 030 · §09 — cost meter, chain seeds, full-change approvals, future-proofing
-- ============================================================================

-- 1. Per-venue cost meter (exact, from API usage) ---------------------------
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS enrichment_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enrichment_cost_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS enrichment_model text;

-- 2. Chains — sibling seeds point back at the parent (never auto-enriched) ---
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS chain_parent_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL;

-- 3. Full-change approvals — hold the whole proposed set for a live venue ----
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS pending_changes jsonb;
-- Migrate any existing pending_copy into the new full-change bag.
UPDATE public.restaurants
  SET pending_changes = jsonb_strip_nulls(jsonb_build_object(
    'hook', pending_copy->'hook', 'description', pending_copy->'description'))
  WHERE pending_copy IS NOT NULL AND pending_changes IS NULL;

-- 6. Future-proofing (nullable, unused until their own Wave) -----------------
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS premium_tier text,
  ADD COLUMN IF NOT EXISTS claimed_by uuid,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS hero_uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS hero_photo_credit text,
  ADD COLUMN IF NOT EXISTS hero_rights_granted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hero_exif jsonb,
  ADD COLUMN IF NOT EXISTS hero_dup_check text NOT NULL DEFAULT 'unchecked',
  ADD COLUMN IF NOT EXISTS hero_reward_granted boolean NOT NULL DEFAULT false;

-- events table (media-capable, tier-gateable). Not surfaced yet.
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text,
  starts_at timestamptz,
  ends_at timestamptz,
  description text,
  flyer_url text,
  video_url text,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_venue_id_idx ON public.events (venue_id);
-- Locked down until its own Wave: RLS on, no policies (service_role bypasses).
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
