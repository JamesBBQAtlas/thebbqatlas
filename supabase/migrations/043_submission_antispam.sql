-- Anti-spam for the public submission form.
--  (1) provenance on accepted submissions (IP, country, user-agent);
--  (2) an append-only abuse-intel log of dropped/blocked attempts (honeypot,
--      too-fast, rate-limited) — the feed for future Cloudflare WAF rules.
alter table submissions
  add column if not exists submitter_ip text,
  add column if not exists submitter_country text,
  add column if not exists user_agent text,
  add column if not exists spam_signals jsonb;

create table if not exists submission_abuse_log (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  reason         text not null,
  ip             text,
  country        text,
  user_agent     text,
  cf_ray         text,
  asn            text,
  attempted_name text,
  meta           jsonb
);

create index if not exists submission_abuse_created_idx on submission_abuse_log (created_at desc);
create index if not exists submission_abuse_country_idx on submission_abuse_log (country);
create index if not exists submission_abuse_ip_idx on submission_abuse_log (ip);
create index if not exists submissions_submitter_ip_idx on submissions (submitter_ip);

alter table submission_abuse_log enable row level security;

comment on table submission_abuse_log is
  'Append-only log of dropped/blocked public-form submissions. Intel for Cloudflare WAF rules; never shown publicly.';
