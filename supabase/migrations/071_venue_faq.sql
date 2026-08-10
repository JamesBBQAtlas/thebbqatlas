-- 071 — Part G: per-venue editable / venue-provided FAQ.
--
-- The on-page FAQ is auto-generated from the venue's own fields at render time
-- (never stored). This adds a place to store OPERATOR-EDITED and VENUE-PROVIDED
-- Q&A that merge into the same accordion + FAQPage JSON-LD. Each entry carries a
-- `source` (auto | admin | venue) and, for owner-submitted entries, a `status`
-- (pending | approved) so venue-provided FAQ goes through moderation before it
-- shows; admin-entered FAQ is trusted. `manual_faq` protects a hand-edited FAQ
-- from being overwritten by a later enrich (mirrors manual_copy / manual_category).

alter table public.restaurants
  add column if not exists faq jsonb,
  add column if not exists manual_faq boolean not null default false,
  add column if not exists manual_faq_at timestamptz;

comment on column public.restaurants.faq is
  'Operator/venue-provided FAQ entries [{q,a,source,status}]. Merged with the auto-generated FAQ on the venue page + JSON-LD. Owner-submitted (source=venue) entries only show once status=approved.';
comment on column public.restaurants.manual_faq is
  'True when the FAQ was hand-edited by an operator; a later AI enrich must not overwrite it (Part G).';
