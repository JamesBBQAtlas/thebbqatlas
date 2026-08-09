-- 068 — Part 2: close the "non-venue went live" gap at the database level.
--
-- The baseline schema set `restaurants.status DEFAULT 'approved'` (000_baseline
-- line 251). Every current insert path overrides it to 'pending', but that
-- default is a sharp edge: any future importer or code path that forgets to set
-- `status` would publish straight to live with no human review — exactly the
-- 05-Aug IG-seed class of bug. Flip the default to 'pending' so "goes live"
-- always requires an explicit `status = 'approved'` (only ever written by an
-- admin Approve/Publish action).
--
-- This changes ONLY the default for NEW rows that omit status; existing rows and
-- any insert that sets status explicitly are unaffected.

alter table public.restaurants
  alter column status set default 'pending';

comment on column public.restaurants.status is
  'Moderation status. Defaults to pending — nothing is published without an explicit admin approve (Part 2 moderation gate).';
