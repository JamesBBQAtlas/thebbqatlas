-- 080_photo_safety.sql
-- Prompt 4 (Photos & Safety). Adds a rights/ownership attestation captured at upload,
-- and AI-safety-screen result columns on the community photo tables. Additive +
-- idempotent. No data change. IMPORTANT: none of this auto-publishes or auto-rejects —
-- photos stay `pending` until a human approves; safety is an extra signal for the
-- moderator, and a weekly re-sweep flags (never unpublishes).

-- Rights/ownership attestation (community `media` uploads). The uploader affirms they
-- own the photo or have the right to post it; we store that they did + when.
alter table media add column if not exists rights_attested    boolean not null default false;
alter table media add column if not exists rights_attested_at timestamptz;

-- AI safety-screen result — on both community photo tables so the sweep covers both.
-- status: 'unchecked' (default) | 'pass' | 'flag' | 'error'. A 'flag' is a REVIEW
-- signal for the admin, never an auto-reject.
alter table media add column if not exists safety_status     text not null default 'unchecked';
alter table media add column if not exists safety_label      text;
alter table media add column if not exists safety_score      numeric;
alter table media add column if not exists safety_reason     text;
alter table media add column if not exists safety_model      text;
alter table media add column if not exists safety_checked_at timestamptz;
alter table media add column if not exists safety_raw        jsonb;

alter table review_photos add column if not exists safety_status     text not null default 'unchecked';
alter table review_photos add column if not exists safety_label      text;
alter table review_photos add column if not exists safety_score      numeric;
alter table review_photos add column if not exists safety_reason     text;
alter table review_photos add column if not exists safety_model      text;
alter table review_photos add column if not exists safety_checked_at timestamptz;
alter table review_photos add column if not exists safety_raw        jsonb;

-- Fast lookup of what still needs screening (the sweep selects unchecked/pending).
create index if not exists media_safety_status_idx        on media (safety_status);
create index if not exists review_photos_safety_status_idx on review_photos (safety_status);

comment on column media.rights_attested is
  'Uploader affirmed they own / have the right to post this photo (Prompt 4). Enforced at the /api/media register route.';
comment on column media.safety_status is
  'AI safety screen result (Prompt 4): unchecked|pass|flag|error. A flag is a moderator signal, never an auto-reject.';
