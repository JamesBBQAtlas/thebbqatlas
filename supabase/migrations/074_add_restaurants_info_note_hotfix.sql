-- 074 — restaurants.info_note (repo migration for the out-of-band prod hotfix).
--
-- Enrichment writes `restaurants.info_note` — a calm, non-blocking editorial note
-- from the copy writer (lib/ai/enrich.ts → enrich-draft/route.ts), e.g. "light on
-- backstory" — set only when the venue is NOT otherwise flagged. The write shipped
-- ahead of its migration, so every enrich 500'd until PM added the column directly
-- to prod (recorded there as 074_add_restaurants_info_note_hotfix). This file makes
-- the column part of the repo so a `db reset`, a fresh preview branch, or a local
-- DB all have it — no drift. Idempotent: `if not exists` no-ops on prod where the
-- hotfix already added it.

alter table public.restaurants
  add column if not exists info_note text;

comment on column public.restaurants.info_note is
  'Calm, non-blocking editorial note from enrichment (e.g. "light on backstory"). Set only when the venue is not otherwise flagged; NULL otherwise. Distinct from attention_reason (which is a red flag).';
