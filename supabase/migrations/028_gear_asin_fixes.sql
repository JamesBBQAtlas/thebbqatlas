-- ============================================================================
-- 028 · Gear catalogue ASIN/name corrections (PM-verified on live product pages)
--
-- 1. The instant-read pointed at a "TempPro" copycat listing (wrong brand). Point
--    it at the genuine ThermoPro TP02S and drop the copycat product image (falls
--    back to the category icon until a correct ThermoPro image is sourced). Also
--    removes the false "waterproof" claim — the TP02S isn't (the TP19H was).
-- 2. The slicer pointed at a serrated/wavy knife (wrong for brisket). Point it at
--    the fluted-edge Victorinox slicer and rename. Image kept (correct brand).
-- 3. Rename the Inkbird card to match the actually-linked Bluetooth model; ASIN
--    unchanged. Image kept (correct brand).
-- ============================================================================
UPDATE public.gear_products SET
  name = 'ThermoPro TP02S Instant-Read Thermometer',
  description = 'The cheap upgrade that changes everything. One-second read, dead simple — the first thing a beginner should own.',
  image_url = NULL,
  affiliate_url = 'https://www.amazon.co.uk/dp/B01LXI5HYH?tag=thebbqatlas-21',
  updated_at = now()
WHERE name = 'ThermoPro TP19H Instant-Read Thermometer';

UPDATE public.gear_products SET
  name = 'Victorinox Fluted-Edge Slicing Knife (25cm)',
  affiliate_url = 'https://www.amazon.co.uk/dp/B077PD6CTR?tag=thebbqatlas-21',
  updated_at = now()
WHERE name = 'Victorinox Fibrox 12" Granton Slicer';

UPDATE public.gear_products SET
  name = 'Inkbird Bluetooth BBQ Thermometer',
  updated_at = now()
WHERE name = 'Inkbird IBT-4XS Bluetooth Thermometer';
