-- ============================================================================
-- 025 · Fill the gear catalogue with real products (GEAR-PLACEHOLDER-
-- REPLACEMENTS.md, PM curated 26 Jul)
--
-- Turns the icon-only placeholder slots seeded in 014 into real, sellable
-- products: manufacturer product images (compliant brand assets, same method as
-- the live four), amazon.co.uk affiliate links carrying tag=thebbqatlas-21, and
-- house-voice copy. NO prices are stored (Amazon terms). Matched by the original
-- placeholder name so this stays idempotent and never touches the separately
-- added imaged rows (MEATER, ThermoPro TP17, Weber Rapidfire, Killer Hogs).
--
-- Page/category order is set in lib/constants/gear.ts (thermometers → rubs →
-- fuel → tools → cleaning → smokers last); sort_order below orders within each.
-- ASINs are current best-match amazon.co.uk listings (Amazon blocks automated
-- /dp/ verification, so spot-check at leisure). Anything without a clean
-- manufacturer image keeps the graceful category-icon fallback.
-- ============================================================================

-- Thermometers -------------------------------------------------------------
UPDATE public.gear_products SET
  name = 'ThermoPro TP19H Instant-Read Thermometer',
  brand = 'ThermoPro',
  description = 'The cheap upgrade that changes everything. One-second read, waterproof, idiot-proof. The first thing a beginner should own.',
  image_url = 'https://temppro.com/cdn/shop/files/TP19HZT1.webp?v=1778205376',
  affiliate_url = 'https://www.amazon.co.uk/dp/B0CRZ5V6SF?tag=thebbqatlas-21',
  price_note = NULL, partner = 'amazon', is_active = true, sort_order = 1, updated_at = now()
WHERE name = 'Instant-Read Thermometer';

UPDATE public.gear_products SET
  name = 'Inkbird IBBQ-4T WiFi Thermometer',
  brand = 'Inkbird',
  description = 'Four probes, your phone, and the freedom to walk away. Watch the pit from the pub.',
  image_url = 'https://www.inkbird.com/cdn/shop/files/wifi-bbq-thermometer-ibbq-4t-713361.png?v=1745376236',
  affiliate_url = 'https://www.amazon.co.uk/dp/B07XNTJKY4?tag=thebbqatlas-21',
  price_note = NULL, partner = 'amazon', is_active = true, sort_order = 2, updated_at = now()
WHERE name = 'Dual-Probe Wireless Pit Monitor';

UPDATE public.gear_products SET
  name = 'Inkbird IBT-4XS Bluetooth Thermometer',
  brand = 'Inkbird',
  description = 'One in the meat, one in the pit, both on your phone. The honest workhorse.',
  image_url = 'https://www.inkbird.com/cdn/shop/files/bluetooth-bbq-thermometer-ibt-4xs-158670.png?v=1745376239',
  affiliate_url = 'https://www.amazon.co.uk/dp/B0BXCPZB99?tag=thebbqatlas-21',
  price_note = NULL, partner = 'amazon', is_active = true, sort_order = 3, updated_at = now()
WHERE name = 'Leave-In Ambient + Meat Probes';

-- Rubs & Spices ------------------------------------------------------------
INSERT INTO public.gear_products
  (name, brand, category, description, image_url, affiliate_url, partner, is_featured, is_active, sort_order)
SELECT
  'Angus & Oink Dirty Cow Beef Rub', 'Angus & Oink', 'rubs_spices',
  'Home-grown flavour, serious credentials. Fly the flag on the page.',
  'https://angusandoink.com/cdn/shop/files/dirty-cow-beef-bbq-rub.png?v=1714395838',
  'https://www.amazon.co.uk/dp/B0B6CT163V?tag=thebbqatlas-21',
  'amazon', true, true, 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.gear_products WHERE name = 'Angus & Oink Dirty Cow Beef Rub'
);

-- Fuel & Wood --------------------------------------------------------------
UPDATE public.gear_products SET
  name = 'ProQ Oak Smoking Wood Chunks',
  brand = 'ProQ',
  description = 'Oak for beef, always. The backbone of a proper brisket.',
  image_url = 'https://proqsmokers.co.uk/cdn/shop/files/ProQPremiumSmokingWoodChunks-Oak-WEB.jpg?v=1690969740',
  affiliate_url = 'https://www.amazon.co.uk/dp/B015YE0D5S?tag=thebbqatlas-21',
  price_note = NULL, partner = 'amazon', is_active = true, sort_order = 1, updated_at = now()
WHERE name = 'Post Oak Splits';

UPDATE public.gear_products SET
  name = 'Big K Restaurant-Grade Lumpwood Charcoal',
  brand = 'Big K',
  description = 'Real fire, real flavour. Life''s too short for petrol-flavoured briquettes.',
  image_url = 'https://bigkproducts.co.uk/media/catalog/product/cache/6517c62f5899ad6aa0ba23ceb3eeff97/b/i/big_k_products_-_rch12fsc_chilla-grilla_restaurant_grade_charcoal_fsc_certified_image_1.png',
  affiliate_url = 'https://www.amazon.co.uk/dp/B00F1LXSX4?tag=thebbqatlas-21',
  price_note = NULL, partner = 'amazon', is_active = true, sort_order = 2, updated_at = now()
WHERE name = 'Lump Charcoal';

UPDATE public.gear_products SET
  name = 'Weber Apple Wood Chunks',
  brand = 'Weber',
  description = 'Smoke is a seasoning. Apple for pork, hickory when you mean it.',
  image_url = 'https://product-images.weber.com/accessory-images/17616_Apple-Wood-Chunks_Front_REV.png?w=800&h=800&auto=compress%2cformat',
  affiliate_url = 'https://www.amazon.co.uk/dp/B0167AA0D8?tag=thebbqatlas-21',
  price_note = NULL, partner = 'amazon', is_active = true, sort_order = 3, updated_at = now()
WHERE name = 'Smoking Wood Chunks Variety Pack';

-- Tools & Prep -------------------------------------------------------------
UPDATE public.gear_products SET
  name = 'RAPICCA BBQ Gloves (932°F)',
  brand = 'RAPICCA',
  description = 'For handling a 6kg brisket at 90°C with your dignity intact.',
  image_url = 'https://www.rapicca.com/cdn/shop/products/51QPYe2uvFL_grande.jpg?v=1557221524',
  affiliate_url = 'https://www.amazon.co.uk/dp/B07PLXD1XD?tag=thebbqatlas-21',
  price_note = NULL, partner = 'amazon', is_active = true, sort_order = 1, updated_at = now()
WHERE name = 'Heat-Resistant Nitrile Gloves';

UPDATE public.gear_products SET
  name = 'Unwaxed Pink Butcher Paper',
  description = 'The Texas crutch. Wrap it, keep the bark, save the moisture.',
  affiliate_url = 'https://www.amazon.co.uk/dp/B07SYB2BFW?tag=thebbqatlas-21',
  price_note = NULL, partner = 'amazon', is_active = true, sort_order = 2, updated_at = now()
WHERE name = 'Unwaxed Pink Butcher Paper';

UPDATE public.gear_products SET
  name = 'Victorinox Fibrox 12" Granton Slicer',
  brand = 'Victorinox',
  description = 'The pro''s budget slicer, until your Dalstrong lands. One long, clean pull.',
  image_url = 'https://imageengine.victorinox.com/transform/d1f63fdf-4167-4362-a6d2-7ce97f913450/CUT_5-4723-30_S1',
  affiliate_url = 'https://www.amazon.co.uk/dp/B078KBTLTG?tag=thebbqatlas-21',
  price_note = NULL, partner = 'amazon', is_active = true, sort_order = 3, updated_at = now()
WHERE name = 'Brisket Slicing Knife';

-- Cleaning & Care ----------------------------------------------------------
UPDATE public.gear_products SET
  name = 'GRILLART Bristle-Free Grill Brush & Scraper',
  brand = 'GRILLART',
  description = 'Cleans the grates without leaving a wire bristle in someone''s dinner.',
  image_url = 'https://www.grillartus.com/cdn/shop/products/1_7f27c5a4-0bd0-4a38-9fe7-c03d3c157c13_250x250@2x.jpg?v=1648284162',
  affiliate_url = 'https://www.amazon.co.uk/dp/B07F731D86?tag=thebbqatlas-21',
  price_note = NULL, partner = 'amazon', is_active = true, sort_order = 1, updated_at = now()
WHERE name = 'Bristle-Free Grill Brush';

UPDATE public.gear_products SET
  name = 'Weber Grate Cleaner Spray',
  brand = 'Weber',
  description = 'For when the pit''s done its work and the grates haven''t.',
  image_url = 'https://product-images.weber.com/accessory-images/17875-Weber_Grate-Cleaner.png?w=800&h=800&auto=compress%2cformat',
  affiliate_url = 'https://www.amazon.co.uk/dp/B0813WYD45?tag=thebbqatlas-21',
  price_note = NULL, partner = 'amazon', is_active = true, sort_order = 2, updated_at = now()
WHERE name = 'Grill & Grate Degreaser';

-- Smokers & Grills (last) --------------------------------------------------
UPDATE public.gear_products SET
  name = 'Weber Smokey Mountain Cooker (57cm)',
  brand = 'Weber',
  description = 'The people''s smoker. Holds temp like a champion, outlives you.',
  image_url = 'https://product-images.weber.com/Grill-Images/Charcoal/731001B_1800x1800-REV2.png?w=800&h=800&auto=compress%2cformat',
  affiliate_url = 'https://www.amazon.co.uk/dp/B006ZL146M?tag=thebbqatlas-21',
  price_note = NULL, partner = 'amazon', is_active = true, sort_order = 1, updated_at = now()
WHERE name = 'Weber Smokey Mountain Cooker';

UPDATE public.gear_products SET
  name = 'Oklahoma Joe''s Highland Offset Smoker',
  brand = 'Oklahoma Joe''s',
  description = 'A stick-burner for people who want to work for it.',
  image_url = 'https://www.oklahomajoes.com/cdn/shop/files/wnybw51lxra4vtccxogr.png?v=1785070436',
  affiliate_url = 'https://www.amazon.co.uk/dp/B01DTXUUJA?tag=thebbqatlas-21',
  price_note = NULL, partner = 'amazon', is_active = true, sort_order = 2, updated_at = now()
WHERE name = 'Offset Stick-Burner Smoker';

UPDATE public.gear_products SET
  name = 'Kamado Joe Classic II',
  brand = 'Kamado Joe',
  description = 'Charcoal, ceramic, patience. Sears like fury, smokes all day.',
  image_url = 'https://www.kamadojoe.com/cdn/shop/files/KJ23RHC_01_Hero.webp?v=1772458127',
  affiliate_url = 'https://www.amazon.co.uk/dp/B01INNA89S?tag=thebbqatlas-21',
  price_note = NULL, partner = 'amazon', is_active = true, sort_order = 3, updated_at = now()
WHERE name = 'Kamado Ceramic Grill';

UPDATE public.gear_products SET
  name = 'Traeger Pro 575',
  brand = 'Traeger',
  description = 'Set-and-forget smoke for people with jobs.',
  image_url = 'https://i8.amplience.net/i/traeger/Pro-575-black-1?scaleFit=poi%26%24poi2%24&fmt=auto&w=600&sm=aspect&aspect=724%3A612&qlt=default',
  affiliate_url = 'https://www.amazon.co.uk/dp/B07SJW67X2?tag=thebbqatlas-21',
  price_note = NULL, partner = 'amazon', is_active = true, sort_order = 4, updated_at = now()
WHERE name = 'Wi-Fi Pellet Smoker';
