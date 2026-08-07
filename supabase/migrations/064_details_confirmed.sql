-- #61 — venue "confirm your details" outreach flow.
-- When a venue owner follows the confirm link (from an outreach email) and says
-- "these details are correct", we stamp it so the Outreach Hub and the listing
-- can show the details are owner-verified.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS details_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS details_confirmed_email text;
