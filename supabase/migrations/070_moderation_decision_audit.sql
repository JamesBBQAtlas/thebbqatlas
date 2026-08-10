-- 070 — Part E: record WHO moderated and WHEN (and why, for a rejection) on
-- reviews and review photos, so a moderation decision is auditable at a glance —
-- the same context submissions already carry via admin_notes.

alter table public.reviews
  add column if not exists moderated_by uuid references auth.users(id),
  add column if not exists moderated_at timestamptz,
  add column if not exists moderation_note text;

alter table public.review_photos
  add column if not exists moderated_by uuid references auth.users(id),
  add column if not exists moderated_at timestamptz,
  add column if not exists moderation_note text;

comment on column public.reviews.moderation_note is
  'Reason/context recorded by the moderator on a decision (e.g. a rejection reason code).';
