-- ============================================================================
-- 014 · Gear catalogue (Point 1) — global, admin-managed affiliate catalogue.
-- Replaces the hardcoded /gear constants with a DB-backed, admin-editable set.
-- The dormant, venue-scoped `gear_items` table is left untouched (unused).
-- Public reads see ACTIVE products only; all writes are service-role (admin API).
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.gear_category AS ENUM
    ('thermometers','smokers_grills','fuel_wood','tools','cleaning');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.gear_products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  brand         text,
  category      public.gear_category NOT NULL,
  description   text,
  image_url     text,                          -- official/affiliate assets ONLY
  affiliate_url text NOT NULL,
  partner       text,                          -- amazon | thermoworks | traeger | ...
  price_note    text,                          -- display-only, e.g. "$99"
  style_tags    text[] NOT NULL DEFAULT '{}',  -- BBQ styles this suits (empty = general)
  is_featured   boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gear_products_active_idx
  ON public.gear_products (category, sort_order) WHERE is_active;

ALTER TABLE public.gear_products ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.gear_products TO anon, authenticated;
DROP POLICY IF EXISTS gear_products_select_active ON public.gear_products;
CREATE POLICY gear_products_select_active
  ON public.gear_products FOR SELECT
  TO anon, authenticated
  USING (is_active);

-- Starter catalogue (migrated from the old hardcoded /gear list). Amazon SEARCH
-- URLs — always valid, and monetised automatically once NEXT_PUBLIC_AMAZON_ASSOC_TAG
-- is set. No images yet (official SiteStripe/PA-API/brand assets to be added in
-- admin). Seeded only when the table is empty so re-runs never duplicate.
INSERT INTO public.gear_products (name, brand, category, affiliate_url, partner, is_featured, sort_order)
SELECT v.name, v.brand, v.category::public.gear_category, v.url, 'amazon', v.featured, v.sort
FROM (VALUES
  ('Instant-Read Thermometer', NULL, 'thermometers', 'https://www.amazon.com/s?k=thermapen+instant+read+thermometer', true, 1),
  ('Dual-Probe Wireless Pit Monitor', NULL, 'thermometers', 'https://www.amazon.com/s?k=wireless+bbq+meat+thermometer', false, 2),
  ('Leave-In Ambient + Meat Probes', NULL, 'thermometers', 'https://www.amazon.com/s?k=leave+in+meat+thermometer+probe', false, 3),
  ('Weber Smokey Mountain Cooker', 'Weber', 'smokers_grills', 'https://www.amazon.com/s?k=weber+smokey+mountain+cooker', true, 1),
  ('Offset Stick-Burner Smoker', NULL, 'smokers_grills', 'https://www.amazon.com/s?k=offset+smoker', false, 2),
  ('Kamado Ceramic Grill', NULL, 'smokers_grills', 'https://www.amazon.com/s?k=kamado+ceramic+grill', false, 3),
  ('Wi-Fi Pellet Smoker', NULL, 'smokers_grills', 'https://www.amazon.com/s?k=wifi+pellet+smoker', false, 4),
  ('Post Oak Splits', NULL, 'fuel_wood', 'https://www.amazon.com/s?k=post+oak+bbq+wood', false, 1),
  ('Lump Charcoal', NULL, 'fuel_wood', 'https://www.amazon.com/s?k=lump+charcoal', false, 2),
  ('Smoking Wood Chunks Variety Pack', NULL, 'fuel_wood', 'https://www.amazon.com/s?k=smoking+wood+chunks+variety', false, 3),
  ('Heat-Resistant Nitrile Gloves', NULL, 'tools', 'https://www.amazon.com/s?k=heat+resistant+bbq+gloves+nitrile', true, 1),
  ('Unwaxed Pink Butcher Paper', NULL, 'tools', 'https://www.amazon.com/s?k=pink+butcher+paper+unwaxed', false, 2),
  ('Brisket Slicing Knife', NULL, 'tools', 'https://www.amazon.com/s?k=brisket+slicing+knife', false, 3),
  ('Bristle-Free Grill Brush', NULL, 'cleaning', 'https://www.amazon.com/s?k=bristle+free+grill+brush', false, 1),
  ('Grill & Grate Degreaser', NULL, 'cleaning', 'https://www.amazon.com/s?k=grill+grate+cleaner+degreaser', false, 2)
) AS v(name, brand, category, url, featured, sort)
WHERE NOT EXISTS (SELECT 1 FROM public.gear_products);
