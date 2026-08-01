-- Fix 3: "manual copy is sacred". When an operator hand-edits a venue's hook /
-- description, we mark it so a later AI enrich/rewrite warns before overwriting
-- the human's words instead of silently clobbering them.
alter table restaurants
  add column if not exists manual_copy boolean not null default false,
  add column if not exists manual_copy_at timestamptz;

comment on column restaurants.manual_copy is
  'True when hook/description were last set by a human edit (admin editor). A later AI enrich/rewrite must confirm/override before overwriting.';
