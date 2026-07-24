-- ============================================================================
-- 013 · Email capture (2d) — anonymous marketing subscriber list.
-- Anonymous visitors have no profile row, so their marketing opt-in can't live
-- on profiles.marketing_opt_in. This is the list for footer/page email capture.
-- P7 consent standard: unticked, freely given, unbundled. We persist the exact
-- consent wording + version with every subscription (mirrors profiles), so each
-- opt-in stays attributable under UK-GDPR/PECR.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_subscribers (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text        NOT NULL UNIQUE,   -- always stored lower-cased by the API
  consent_text      text        NOT NULL,          -- verbatim wording the user agreed to
  consent_version   text        NOT NULL,
  source            text,                          -- where they signed up (e.g. "footer")
  unsubscribe_token uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  confirmed_at      timestamptz,                   -- reserved for future double-opt-in
  unsubscribed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS email_subscribers_token_idx
  ON public.email_subscribers (unsubscribe_token);

-- RLS on, NO policies: only the service role (which bypasses RLS) reads or writes.
-- All access is through server routes (/api/subscribe, /api/unsubscribe); the
-- browser can never enumerate or read the list.
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_subscribers FROM anon, authenticated;
