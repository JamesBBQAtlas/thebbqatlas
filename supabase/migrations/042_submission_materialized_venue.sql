-- Enrich-in-the-queue: a submission can be "materialised" into a pending
-- (non-public) venue so the normal enrichment/edit pipeline runs on it before
-- it's approved to publish. This links the submission to that pending venue.
alter table submissions
  add column if not exists materialized_restaurant_id uuid
    references restaurants(id) on delete set null;

comment on column submissions.materialized_restaurant_id is
  'The pending venue this submission was materialised into for in-queue enrichment/editing. Approving publishes that venue.';
