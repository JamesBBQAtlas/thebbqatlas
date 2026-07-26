-- ============================================================================
-- 024 · Day-3 lifecycle "social drip" guard column (P10)
--
-- Adds a per-account idempotency flag for the Day-3 marketing email, mirroring
-- `welcome_email_sent`. The daily cron (/api/cron/lifecycle-day3) atomically
-- flips this false→true so a send can never double-fire.
--
-- IMPORTANT — backfill: every EXISTING account is marked already-sent, so the
-- drip never retro-blasts users who signed up before launch. Only genuinely new
-- signups (created after this migration) can receive it.
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS day3_email_sent boolean NOT NULL DEFAULT false;

UPDATE public.profiles SET day3_email_sent = true WHERE day3_email_sent = false;
