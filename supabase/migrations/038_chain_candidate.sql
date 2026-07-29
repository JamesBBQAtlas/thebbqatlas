-- Soft "looks like a chain" flag set during a plain single-venue enrich (Step 1).
-- It only surfaces a "Build roster?" affordance — it creates no siblings, picks
-- no flagship, and changes no hierarchy. Cleared once the roster is built.
alter table restaurants add column if not exists chain_candidate boolean not null default false;
