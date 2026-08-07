-- Subscribers: lifecycle tracking columns + member-email helper.
--
-- The footer newsletter (email_subscribers) drives a welcome + day-1/3/7
-- conversion drip. These per-step timestamps make "which steps were sent"
-- explicit (for the admin view) and give the drip a column-based guard alongside
-- the email_log dedup. became_member_at stops the drip the moment a subscriber
-- registers.
ALTER TABLE email_subscribers
  ADD COLUMN IF NOT EXISTS welcome_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS day1_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS day3_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS day7_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS became_member_at timestamptz;

-- Backfill from the existing email_log so already-sent steps show correctly and
-- the column-based drip doesn't re-send to the current 3 subscribers.
UPDATE email_subscribers es
SET welcome_sent_at = l.min_at
FROM (SELECT lower(to_email) e, min(created_at) min_at FROM email_log
      WHERE type = 'welcome' AND status IN ('sent','skipped') GROUP BY lower(to_email)) l
WHERE lower(es.email) = l.e AND es.welcome_sent_at IS NULL;

UPDATE email_subscribers es
SET day3_sent_at = l.min_at
FROM (SELECT lower(to_email) e, min(created_at) min_at FROM email_log
      WHERE type = 'drip_3' AND status IN ('sent','skipped') GROUP BY lower(to_email)) l
WHERE lower(es.email) = l.e AND es.day3_sent_at IS NULL;

UPDATE email_subscribers es
SET day7_sent_at = l.min_at
FROM (SELECT lower(to_email) e, min(created_at) min_at FROM email_log
      WHERE type = 'drip_7' AND status IN ('sent','skipped') GROUP BY lower(to_email)) l
WHERE lower(es.email) = l.e AND es.day7_sent_at IS NULL;

-- Flag any current subscriber who already has an account.
UPDATE email_subscribers es
SET became_member_at = now()
FROM auth.users u
WHERE lower(es.email) = lower(u.email) AND es.became_member_at IS NULL;

-- auth.users isn't reachable via PostgREST; expose a minimal, service-role-only
-- helper: each member's lowercased email + whether they're marketing opted-in.
-- Drives the drip's "stop when they become a member" and the admin reach count.
CREATE OR REPLACE FUNCTION public.marketing_members()
RETURNS TABLE(email text, marketing_opt_in boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT lower(u.email), COALESCE(p.marketing_opt_in, false)
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.email IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.marketing_members() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_members() TO service_role;
