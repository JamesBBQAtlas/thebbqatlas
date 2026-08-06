-- ============================================================================
-- 047 · "Watch, Read & Listen" — curated YouTube / books / podcasts directory.
-- Public reads published rows; all writes go through admin routes on the
-- service-role client (declared SERVICE_ROLE in the write-grant guardrail).
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.media_kind AS ENUM ('youtube', 'book', 'podcast');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.media_picks (
  id            uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          public.media_kind NOT NULL,
  name          text            NOT NULL,
  creator       text,                         -- author (book) / host (podcast) / channel owner (YT)
  url           text            NOT NULL,      -- Amazon product page (book) or channel/show link
  blurb         text            NOT NULL,      -- site-voice blurb
  image_url     text,                          -- optional cover/thumbnail
  gear_link     text,                          -- optional → /gear for a creator's kit
  sort_order    int             NOT NULL DEFAULT 0,
  is_published  boolean         NOT NULL DEFAULT true,
  created_at    timestamptz     NOT NULL DEFAULT now(),
  updated_at    timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_picks_kind_sort_idx
  ON public.media_picks (kind, sort_order, name);

ALTER TABLE public.media_picks ENABLE ROW LEVEL SECURITY;

-- Public may read only PUBLISHED rows; admin routes write via the service role.
DROP POLICY IF EXISTS media_picks_public_read ON public.media_picks;
CREATE POLICY media_picks_public_read ON public.media_picks
  FOR SELECT TO anon, authenticated
  USING (is_published);

GRANT SELECT ON public.media_picks TO anon, authenticated;
GRANT ALL    ON public.media_picks TO service_role;
