-- ============================================================================
-- 029 · Venue system (VENUE-SYSTEM-SPEC) data model
--
-- hero_source  — how we know what the hero is: 'user_upload' | 'venue_provided'
--                | 'atlas_licensed' | 'style_default' | 'none'. Answers "is the
--                hero a real photo or the style default?" (§1). Text (not enum)
--                for painless future values.
-- hook         — the one-line house-voice hook, stored separately from the
--                2–3 paragraph description (§6).
-- dossier      — the full Grok facts dossier, PERSISTED so "Rewrite copy"
--                (Claude-only, no re-research) can run against it (§5b).
-- pending_copy — { hook, description, created_at } proposed copy for a LIVE
--                venue, held for approval so the live page doesn't change until
--                James approves (§5b). Draft venues write hook/description direct.
-- ============================================================================
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS hero_source text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS hook text,
  ADD COLUMN IF NOT EXISTS dossier jsonb,
  ADD COLUMN IF NOT EXISTS pending_copy jsonb;

-- Existing venues with a real hero_image_url predate hero_source; mark them
-- atlas_licensed so the resolver treats them as real photos, not style defaults.
UPDATE public.restaurants
  SET hero_source = 'atlas_licensed'
  WHERE hero_source = 'none'
    AND hero_image_url IS NOT NULL
    AND btrim(hero_image_url) <> '';
