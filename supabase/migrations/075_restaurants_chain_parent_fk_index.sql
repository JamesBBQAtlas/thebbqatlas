-- Part 4 (perf) — cover the chain_parent_id foreign key with an index.
--
-- The Supabase performance advisor flags `restaurants_chain_parent_id_fkey` as an
-- unindexed foreign key. The chain-roster / enrichment paths query and update
-- branches by parent constantly (seedChainLocations: `.eq("chain_parent_id", parentId)`;
-- the roster route's per-branch `flagship_unset` update by parent), and every provider /
-- render roster run does many of these. Without a covering index each is a sequential
-- scan, and those write-heavy bursts are exactly what was contending with the public
-- directory reads during the 17 Aug timeout window. A partial index (only the rows that
-- are actually branches) keeps it tiny.
--
-- Non-concurrent is fine here: the table is ~940 rows, so the build locks for
-- milliseconds. `if not exists` keeps the migration idempotent.
create index if not exists restaurants_chain_parent_id_idx
  on public.restaurants (chain_parent_id)
  where chain_parent_id is not null;
