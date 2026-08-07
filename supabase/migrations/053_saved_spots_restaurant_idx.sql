-- Phase 3 (Fable Low): saved_spots is queried by restaurant_id (venue "is it
-- saved" checks + counts) but only had a user-scoped index. Add the reverse.
-- Applied to prod via MCP; recorded here for version history.
create index if not exists saved_spots_restaurant_id_idx
  on public.saved_spots (restaurant_id);
