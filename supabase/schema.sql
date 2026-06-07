-- ============================================================
-- THE BBQ ATLAS â€” Complete Supabase Schema
-- Run this ONCE in Supabase SQL Editor
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
DO $$ BEGIN
  CREATE TYPE bbq_style AS ENUM ('texas','carolina','korean','argentine','memphis','brazilian','japanese','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE moderation_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Restaurants
CREATE TABLE IF NOT EXISTS restaurants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  style bbq_style NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  website TEXT,
  price_level INTEGER NOT NULL CHECK (price_level BETWEEN 1 AND 4),
  avg_rating NUMERIC(2,1) NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  hero_image_url TEXT NOT NULL,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  status moderation_status NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restaurants_style ON restaurants(style);
CREATE INDEX IF NOT EXISTS idx_restaurants_city ON restaurants(city);
CREATE INDEX IF NOT EXISTS idx_restaurants_country ON restaurants(country);
CREATE INDEX IF NOT EXISTS idx_restaurants_featured ON restaurants(is_featured);
CREATE INDEX IF NOT EXISTS idx_restaurants_status ON restaurants(status);

-- Signature dishes
CREATE TABLE IF NOT EXISTS signature_dishes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  affiliate_url TEXT NOT NULL DEFAULT '#',
  affiliate_label TEXT NOT NULL DEFAULT 'Buy on Amazon',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Gear items
CREATE TABLE IF NOT EXISTS gear_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  affiliate_url TEXT NOT NULL DEFAULT '#',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL,
  status moderation_status NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Review photos
CREATE TABLE IF NOT EXISTS review_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Submissions
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  style bbq_style NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  website TEXT,
  hero_image_url TEXT,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  moderation_status moderation_status NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Saved spots (My Atlas)
CREATE TABLE IF NOT EXISTS saved_spots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, restaurant_id)
);

-- Guides
CREATE TABLE IF NOT EXISTS guides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  content_md TEXT NOT NULL,
  hero_image_url TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rating trigger
CREATE OR REPLACE FUNCTION update_restaurant_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE restaurants SET
    avg_rating = (SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 0) FROM reviews WHERE restaurant_id = COALESCE(NEW.restaurant_id, OLD.restaurant_id) AND status = 'approved'),
    review_count = (SELECT COUNT(*) FROM reviews WHERE restaurant_id = COALESCE(NEW.restaurant_id, OLD.restaurant_id) AND status = 'approved')
  WHERE id = COALESCE(NEW.restaurant_id, OLD.restaurant_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_rating ON reviews;
CREATE TRIGGER trg_update_rating
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_restaurant_rating();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gear_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;

-- Helper: is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Profiles
CREATE POLICY "Public profiles readable" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Restaurants
CREATE POLICY "Public read approved restaurants" ON restaurants FOR SELECT USING (status = 'approved' OR is_admin());
CREATE POLICY "Admin manage restaurants" ON restaurants FOR ALL USING (is_admin());

-- Signature dishes & gear
CREATE POLICY "Public read dishes" ON signature_dishes FOR SELECT USING (true);
CREATE POLICY "Admin manage dishes" ON signature_dishes FOR ALL USING (is_admin());
CREATE POLICY "Public read gear" ON gear_items FOR SELECT USING (true);
CREATE POLICY "Admin manage gear" ON gear_items FOR ALL USING (is_admin());

-- Reviews
CREATE POLICY "Public read approved reviews" ON reviews FOR SELECT USING (status = 'approved' OR auth.uid() = user_id OR is_admin());
CREATE POLICY "Users insert own reviews" ON reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own reviews" ON reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admin manage reviews" ON reviews FOR ALL USING (is_admin());

-- Review photos
CREATE POLICY "Public read review photos" ON review_photos FOR SELECT USING (true);
CREATE POLICY "Users insert review photos" ON review_photos FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM reviews WHERE id = review_id AND user_id = auth.uid())
);

-- Submissions
CREATE POLICY "Users insert submissions" ON submissions FOR INSERT WITH CHECK (auth.uid() = submitted_by OR submitted_by IS NULL);
CREATE POLICY "Users read own submissions" ON submissions FOR SELECT USING (auth.uid() = submitted_by OR is_admin());
CREATE POLICY "Admin manage submissions" ON submissions FOR ALL USING (is_admin());

-- Saved spots
CREATE POLICY "Users manage own saved spots" ON saved_spots FOR ALL USING (auth.uid() = user_id);

-- Guides
CREATE POLICY "Public read published guides" ON guides FOR SELECT USING (is_published = true OR is_admin());
CREATE POLICY "Admin manage guides" ON guides FOR ALL USING (is_admin());

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('review-photos', 'review-photos', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('submissions', 'submissions', false) ON CONFLICT DO NOTHING;

CREATE POLICY "Public read review photos" ON storage.objects FOR SELECT USING (bucket_id = 'review-photos');
CREATE POLICY "Auth upload review photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'review-photos' AND auth.role() = 'authenticated');
CREATE POLICY "Auth upload submissions" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'submissions' AND auth.role() = 'authenticated');

-- ============================================================
-- SEED: GUIDES
-- ============================================================

INSERT INTO guides (id, slug, title, excerpt, content_md, hero_image_url, is_published, published_at) VALUES
('20000000-0000-4000-8000-000000000001', 'top-10-bbq-joints-texas', 'Top 10 BBQ Joints in Texas', 'From Franklin to Snow''s â€” the essential Texas barbecue pilgrimage list.', '## The Texas BBQ Pilgrimage\n\nTexas is the spiritual home of American barbecue.', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80', true, '2026-05-01'),
('20000000-0000-4000-8000-000000000002', 'carolina-vinegar-vs-mustard', 'Carolina Vinegar vs Mustard Sauce', 'Eastern NC vinegar-pepper vs South Carolina gold mustard.', '## Two Carolinas, Two Philosophies', 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80', true, '2026-05-15'),
('20000000-0000-4000-8000-000000000003', 'korean-bbq-around-the-world', 'Korean BBQ Around the World', 'From Gangnam galbi to global fusion.', '## The Global Rise of Korean BBQ', 'https://images.unsplash.com/photo-1598439210625-2a9f0d2a2f5d?w=800&q=80', true, '2026-05-20'),
('20000000-0000-4000-8000-000000000004', 'smoking-secrets-pitmasters', 'Smoking Secrets from Pitmasters', 'Fire management, wood selection, and patience.', '## What the Pitmasters Know', 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80', true, '2026-06-01')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- SEED: 75 RESTAURANTS
-- ============================================================
INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000001', 'franklin-barbecue-austin', 'Franklin Barbecue', 'Legendary Austin pit serving pepper-rubbed brisket with a cult following. Lines form at dawn for post oak-smoked beef that melts on the fork.', 'texas', 30.2701, -97.7313, '900 E 11th St, Austin, TX 78702', 'Austin', 'USA', NULL, 2, 4.9, 152, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80', true, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000002', 'louie-mueller-barbecue-taylor', 'Louie Mueller Barbecue', 'Family-run since 1949 in a century-old brick pit house. Beef ribs and fatty brisket smoked over oak with no shortcuts.', 'texas', 30.5707, -97.4094, '206 W 2nd St, Taylor, TX 76574', 'Taylor', 'USA', NULL, 2, 4.8, 29, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80', true, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000003', 'snow-s-bbq-lexington', 'Snow''s BBQ', 'Saturday-only destination crowned Texas Monthly''s best BBQ. Tootsie Tomanetz''s brisket and pork steak are worth the pilgrimage.', 'texas', 30.4191, -97.0116, '516 Main St, Lexington, TX 78947', 'Lexington', 'USA', NULL, 2, 4.9, 107, 'https://images.unsplash.com/photo-1529193594215-9c4c0c0c0c0c?w=800&q=80', true, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000004', 'kreuz-market-lockhart', 'Kreuz Market', 'No sauce, no forks â€” just oak-smoked sausage and brisket on butcher paper. A Lockhart institution since 1900.', 'texas', 29.8849, -97.67, '619 N Colorado St, Lockhart, TX 78644', 'Lockhart', 'USA', NULL, 2, 4.7, 99, 'https://images.unsplash.com/photo-1504670280998-4f1c0c0c0c0c?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000005', 'pecan-lodge-dallas', 'Pecan Lodge', 'Deep Ellum smokehouse famous for the Hot Mess â€” a loaded sweet potato topped with brisket, butter, and cheese.', 'texas', 32.7767, -96.797, '2702 Main St, Dallas, TX 75226', 'Dallas', 'USA', NULL, 2, 4.6, 193, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000006', 'the-salt-lick-bbq-driftwood', 'The Salt Lick BBQ', 'Open-pit barbecue in the Hill Country with family-style platters of brisket, ribs, and sausage under the oaks.', 'texas', 30.1396, -98.0253, '18300 FM 1826, Driftwood, TX 78619', 'Driftwood', 'USA', NULL, 3, 4.5, 187, 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000007', 'cooper-s-old-time-pit-bar-b-que-llano', 'Cooper''s Old Time Pit Bar-B-Que', 'Pick your meat straight from the open pit. Big beef ribs and goat are specialties at this West Texas legend.', 'texas', 30.7494, -98.6759, '604 W Young St, Llano, TX 78643', 'Llano', 'USA', NULL, 2, 4.6, 158, 'https://images.unsplash.com/photo-1598439210625-2a9f0d2a2f5d?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000008', 'micklethwait-craft-meats-austin', 'Micklethwait Craft Meats', 'Trailer-turned-institution with house-made sausages, beef cheeks, and some of Austin''s finest bark on brisket.', 'texas', 30.244, -97.723, '1309 Rosewood Ave, Austin, TX 78702', 'Austin', 'USA', NULL, 2, 4.7, 30, 'https://images.unsplash.com/photo-1529048201918-8a8a8a8a8a8a?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000009', 'hutchins-bbq-frisco', 'Hutchins BBQ', 'DFW favorite with moist brisket, jalapeÃ±o cheddar sausage, and a welcoming sit-down dining room.', 'texas', 33.1507, -96.8236, '9225 Preston Rd, Frisco, TX 75033', 'Frisco', 'USA', NULL, 2, 4.7, 110, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000010', 'valentina-s-tex-mex-bbq-austin', 'Valentina''s Tex Mex BBQ', 'Brisket breakfast tacos and smoked carnitas bridge Texas BBQ and Tex-Mex in one irresistible menu.', 'texas', 30.215, -97.796, '11500 Manchaca Rd, Austin, TX 78748', 'Austin', 'USA', NULL, 2, 4.6, 177, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000011', 'pinkerton-s-barbecue-houston', 'Pinkerton''s Barbecue', 'Houston heavyweight with fatty brisket, beef ribs, and a full bar. The pit crew knows smoke.', 'texas', 29.77, -95.362, '1804 Shepherd Dr, Houston, TX 77008', 'Houston', 'USA', NULL, 2, 4.6, 45, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000012', '2m-smokehouse-san-antonio', '2M Smokehouse', 'San Antonio''s finest with perfect bark, house-made chorizo, and brisket that rivals the Hill Country greats.', 'texas', 29.39, -98.48, '2731 W Division St, San Antonio, TX 78225', 'San Antonio', 'USA', NULL, 2, 4.7, 153, 'https://images.unsplash.com/photo-1529193594215-9c4c0c0c0c0c?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000013', 'skylight-inn-bbq-ayden', 'Skylight Inn BBQ', 'Whole-hog chapel of barbecue with cracklin''-crisp skin and vinegar-pepper sauce. A James Beard American Classic.', 'carolina', 35.4726, -77.4419, '4618 S Lee St, Ayden, NC 28513', 'Ayden', 'USA', NULL, 2, 4.8, 137, 'https://images.unsplash.com/photo-1504670280998-4f1c0c0c0c0c?w=800&q=80', true, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000014', 'sam-jones-bbq-winterville', 'Sam Jones BBQ', 'Third-generation whole-hog pitmaster serving Eastern NC barbecue with cornbread sticks and slaw.', 'carolina', 35.5293, -77.4019, '772 W Fire Tower Rd, Winterville, NC 28590', 'Winterville', 'USA', NULL, 2, 4.7, 102, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000015', 'rodney-scott-s-whole-hog-bbq-charleston', 'Rodney Scott''s Whole Hog BBQ', 'Pitmaster Rodney Scott''s whole hog with mustard and vinegar sauces. The skin is the star.', 'carolina', 32.7765, -79.9311, '1011 King St, Charleston, SC 29403', 'Charleston', 'USA', NULL, 2, 4.7, 155, 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80', true, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000016', 'lexington-barbecue-lexington', 'Lexington Barbecue', 'Western NC style with pork shoulder and red slaw. A Lexington landmark since 1962.', 'carolina', 35.824, -80.2534, '100 Smokehouse Ln, Lexington, NC 27295', 'Lexington', 'USA', NULL, 2, 4.5, 76, 'https://images.unsplash.com/photo-1598439210625-2a9f0d2a2f5d?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000017', 'bum-s-restaurant-ayden', 'Bum''s Restaurant', 'No-frills Eastern NC whole hog with fried chicken and hush puppies on the side.', 'carolina', 35.472, -77.44, '566 3rd St, Ayden, NC 28513', 'Ayden', 'USA', NULL, 1, 4.6, 153, 'https://images.unsplash.com/photo-1529048201918-8a8a8a8a8a8a?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000018', 'scott-s-bar-b-que-hemingway', 'Scott''s Bar-B-Que', 'Rodney Scott''s original pit â€” whole hog over coals with a vinegar-pepper sauce that cuts the richness.', 'carolina', 33.7538, -79.4456, '2734 Hemingway Hwy, Hemingway, SC 29554', 'Hemingway', 'USA', NULL, 1, 4.7, 160, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000019', 'melvin-s-legendary-bbq-charleston', 'Melvin''s Legendary BBQ', 'Mustard-based SC sauce on pulled pork and ribs. A Charleston staple for locals and visitors alike.', 'carolina', 32.8, -79.95, '331 Meeting St, Charleston, SC 29403', 'Charleston', 'USA', NULL, 2, 4.4, 94, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000020', 'grady-s-bbq-dudley', 'Grady''s BBQ', 'Family pit since 1986 serving Eastern NC chopped pork with sweet tea and hush puppies.', 'carolina', 35.306, -78, '3096 Arrington Bridge Rd, Dudley, NC 28333', 'Dudley', 'USA', NULL, 1, 4.6, 162, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000021', 'charlie-vergos-rendezvous-memphis', 'Charlie Vergos'' Rendezvous', 'Dry-rubbed ribs in a basement alley since 1948. No sauce on the meat â€” just paprika, garlic, and legend.', 'memphis', 35.1388, -90.0515, '52 S 2nd St, Memphis, TN 38103', 'Memphis', 'USA', NULL, 2, 4.5, 156, 'https://images.unsplash.com/photo-1529193594215-9c4c0c0c0c0c?w=800&q=80', true, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000022', 'central-bbq-memphis', 'Central BBQ', 'Memphis-style dry rub ribs with wet and dry options. BBQ nachos and smoked bologna are cult favorites.', 'memphis', 35.13, -90.04, '147 E Butler Ave, Memphis, TN 38103', 'Memphis', 'USA', NULL, 2, 4.6, 216, 'https://images.unsplash.com/photo-1504670280998-4f1c0c0c0c0c?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000023', 'cozy-corner-bbq-memphis', 'Cozy Corner BBQ', 'James Beard winner Desiree Robinson''s corner joint with smoked Cornish hen and pork rib tips.', 'memphis', 35.16, -90.02, '735 N Parkway, Memphis, TN 38105', 'Memphis', 'USA', NULL, 1, 4.7, 72, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000024', 'the-bar-b-q-shop-memphis', 'The Bar-B-Q Shop', 'Spaghetti with BBQ sauce and smoked bologna sandwiches. Memphis soul food meets the pit.', 'memphis', 35.11, -89.95, '1782 Madison Ave, Memphis, TN 38104', 'Memphis', 'USA', NULL, 1, 4.5, 211, 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000025', 'a-r-bar-b-que-memphis', 'A&R Bar-B-Que', 'Late-night Memphis institution near Graceland. Bologna sandwiches and rib tips feed the city after dark.', 'memphis', 35.07, -89.98, '1801 Elvis Presley Blvd, Memphis, TN 38116', 'Memphis', 'USA', NULL, 1, 4.4, 22, 'https://images.unsplash.com/photo-1598439210625-2a9f0d2a2f5d?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000026', 'joe-s-kansas-city-bar-b-que-kansas-city', 'Joe''s Kansas City Bar-B-Que', 'Z-Man sandwich and burnt ends in a gas station that became a BBQ pilgrimage site.', 'other', 39.084, -94.605, '3002 W 47th Ave, Kansas City, KS 66103', 'Kansas City', 'USA', NULL, 2, 4.7, 208, 'https://images.unsplash.com/photo-1529048201918-8a8a8a8a8a8a?w=800&q=80', true, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000027', 'arthur-bryant-s-kansas-city', 'Arthur Bryant''s', 'KC institution with thick tomato-molasses sauce and sliced brisket on white bread.', 'other', 39.092, -94.58, '1727 Brooklyn Ave, Kansas City, MO 64127', 'Kansas City', 'USA', NULL, 1, 4.3, 48, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000028', 'dinosaur-bar-b-que-syracuse', 'Dinosaur Bar-B-Que', 'Blues bar meets BBQ joint with St. Louis ribs and pulled pork in upstate New York.', 'other', 43.048, -76.155, '246 W Willow St, Syracuse, NY 13202', 'Syracuse', 'USA', NULL, 2, 4.5, 53, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000029', 'southern-soul-bbq-st-simons-island', 'Southern Soul BBQ', 'Coastal Georgia smokehouse with Brunswick stew and pecan-smoked pork.', 'carolina', 31.17, -81.39, '2020 Demere Rd, St Simons Island, GA 31522', 'St. Simons Island', 'USA', NULL, 2, 4.7, 89, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000030', 'pecos-pit-santa-fe', 'Pecos Pit', 'Santa Fe''s open-pit barbecue with green chile brisket and Southwest smoke.', 'texas', 35.687, -105.9378, '500 Rodeo Rd, Santa Fe, NM 87505', 'Santa Fe', 'USA', NULL, 2, 4.4, 133, 'https://images.unsplash.com/photo-1529193594215-9c4c0c0c0c0c?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000031', 'big-bob-gibson-bar-b-q-decatur', 'Big Bob Gibson Bar-B-Q', 'Alabama white sauce inventor. Smoked chicken with mayo-vinegar dip is iconic.', 'other', 34.6059, -86.9833, '2520 Danville Rd SW, Decatur, AL 35603', 'Decatur', 'USA', NULL, 2, 4.7, 55, 'https://images.unsplash.com/photo-1504670280998-4f1c0c0c0c0c?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000032', 'hog-wild-pit-bbq-berkeley', 'Hog Wild Pit BBQ', 'Bay Area pit with tri-tip, ribs, and a sauce bar spanning regional American styles.', 'other', 37.8715, -122.273, '2535 San Pablo Ave, Berkeley, CA 94702', 'Berkeley', 'USA', NULL, 2, 4.4, 100, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000033', 'montreal-bbq-pit-montreal', 'Montreal BBQ Pit', 'Quebec''s smoke-forward BBQ with maple-glazed ribs and poutine on the side.', 'other', 45.5017, -73.5673, '1234 Rue Saint-Laurent, Montreal, QC H2X 2S5', 'Montreal', 'Canada', NULL, 2, 4.3, 169, 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000034', 'barque-smokehouse-toronto', 'Barque Smokehouse', 'Toronto''s Texas-style destination with brisket, burnt ends, and craft beer pairings.', 'texas', 43.6532, -79.3832, '850 Eglinton Ave W, Toronto, ON M5N 1E7', 'Toronto', 'Canada', NULL, 3, 4.5, 147, 'https://images.unsplash.com/photo-1598439210625-2a9f0d2a2f5d?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000035', 'dinosaur-bar-b-que-toronto-toronto', 'Dinosaur Bar-B-Que Toronto', 'Canadian outpost of the Syracuse legend with live blues and St. Louis ribs.', 'other', 43.64, -79.42, '215 Fort York Blvd, Toronto, ON M5V 1A4', 'Toronto', 'Canada', NULL, 2, 4.4, 39, 'https://images.unsplash.com/photo-1529048201918-8a8a8a8a8a8a?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000036', 'blue-smoke-vancouver-vancouver', 'Blue Smoke Vancouver', 'Pacific Northwest smokehouse blending Texas brisket with local cedar-plank salmon.', 'other', 49.2827, -123.1207, '456 Granville St, Vancouver, BC V6C 1T4', 'Vancouver', 'Canada', NULL, 3, 4.3, 97, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000037', 'el-norte-o-monterrey', 'El NorteÃ±o', 'Northern Mexico cabrito and arrachera grilled over mesquite â€” the border cousin of Texas BBQ.', 'texas', 25.6866, -100.3161, 'Av ConstituciÃ³n 800, Monterrey, NL 64000', 'Monterrey', 'Mexico', NULL, 2, 4.6, 103, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000038', 'la-coste-a-bbq-mexico-city', 'La CosteÃ±a BBQ', 'CDMX smokehouse bringing Texas brisket culture to the capital with mezcal pairings.', 'texas', 19.4326, -99.1332, 'Calle Ãlvaro ObregÃ³n 200, Roma Norte, CDMX', 'Mexico City', 'Mexico', NULL, 2, 4.4, 152, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000039', 'smoke-fire-oaxaca-oaxaca', 'Smoke & Fire Oaxaca', 'Oaxacan mole meets American smoke with tlayuda BBQ and mezcal-marinated ribs.', 'other', 17.0732, -96.7266, 'Calle Macedonio AlcalÃ¡ 300, Oaxaca', 'Oaxaca', 'Mexico', NULL, 2, 4.3, 214, 'https://images.unsplash.com/photo-1529193594215-9c4c0c0c0c0c?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000040', 'pitmaster-guatemala-guatemala-city', 'Pitmaster Guatemala', 'Central America''s first dedicated Texas-style smokehouse with imported post oak.', 'texas', 14.6349, -90.5069, 'Zona 10, Guatemala City 01010', 'Guatemala City', 'Guatemala', NULL, 2, 4.2, 89, 'https://images.unsplash.com/photo-1504670280998-4f1c0c0c0c0c?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000041', 'smokehouse-panama-panama-city', 'Smokehouse Panama', 'Canal-side BBQ with brisket, yuca fries, and rum cocktails in the financial district.', 'texas', 8.9824, -79.5199, 'Calle 50, Panama City', 'Panama City', 'Panama', NULL, 3, 4.3, 97, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000042', 'la-cabrera-buenos-aires', 'La Cabrera', 'Palermo parrilla with perfectly charred bife de chorizo and chimichurri. Argentine asado at its finest.', 'argentine', -34.5889, -58.4303, 'Cabrera 5099, Palermo, Buenos Aires', 'Buenos Aires', 'Argentina', NULL, 3, 4.8, 123, 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80', true, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000043', 'don-julio-buenos-aires', 'Don Julio', 'World-ranked parrilla with dry-aged steaks and a wine list that matches the fire.', 'argentine', -34.59, -58.425, 'Guatemala 4699, Palermo, Buenos Aires', 'Buenos Aires', 'Argentina', NULL, 4, 4.9, 76, 'https://images.unsplash.com/photo-1598439210625-2a9f0d2a2f5d?w=800&q=80', true, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000044', 'el-boliche-de-alberto-bariloche', 'El Boliche de Alberto', 'Patagonian lamb and beef grilled over wood in the Andes. A Bariloche institution since 1964.', 'argentine', -41.1335, -71.3103, 'Mitre 395, San Carlos de Bariloche', 'Bariloche', 'Argentina', NULL, 3, 4.7, 55, 'https://images.unsplash.com/photo-1529048201918-8a8a8a8a8a8a?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000045', 'fogo-de-ch-o-s-o-paulo', 'Fogo de ChÃ£o', 'Brazilian churrasco rodÃ­zio with picanha, linguiÃ§a, and endless gaucho-carved meats.', 'brazilian', -23.5505, -46.6333, 'Av. Santo Amaro 4664, SÃ£o Paulo', 'SÃ£o Paulo', 'Brazil', NULL, 4, 4.5, 123, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000046', 'barbacoa-do-sul-porto-alegre', 'Barbacoa do Sul', 'GaÃºcho-style costela no fogo de chÃ£o â€” beef ribs slow-roasted over open flame in southern Brazil.', 'brazilian', -30.0346, -51.2177, 'Rua Padre Chagas 200, Porto Alegre', 'Porto Alegre', 'Brazil', NULL, 2, 4.6, 124, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000047', 'parrilla-el-fog-n-montevideo', 'Parrilla El FogÃ³n', 'Uruguayan asado with grass-fed beef and morcilla by the Rio de la Plata.', 'argentine', -34.9011, -56.1645, 'Rambla 25 de Agosto, Montevideo', 'Montevideo', 'Uruguay', NULL, 2, 4.5, 158, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000048', 'churrasco-santiago-santiago', 'Churrasco Santiago', 'Chilean parrilla with Argentine cuts and CarmÃ©nÃ¨re wine pairings in Providencia.', 'argentine', -33.4489, -70.6693, 'Av. Providencia 2000, Santiago', 'Santiago', 'Chile', NULL, 3, 4.4, 143, 'https://images.unsplash.com/photo-1529193594215-9c4c0c0c0c0c?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000049', 'smokestak-london', 'Smokestak', 'Shoreditch smokehouse with oak-smoked brisket and beef brisket croquettes. London''s BBQ benchmark.', 'texas', 51.523, -0.075, '8 Sclater St, London E1 6HR', 'London', 'UK', NULL, 3, 4.6, 155, 'https://images.unsplash.com/photo-1504670280998-4f1c0c0c0c0c?w=800&q=80', true, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000050', 'bodean-s-bbq-london', 'Bodean''s BBQ', 'American-style ribs and pulled pork in Soho since 2002. A London BBQ pioneer.', 'other', 51.51, -0.13, '12 Archer St, London W1D 7BB', 'London', 'UK', NULL, 2, 4.3, 83, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000051', 'red-dog-saloon-london', 'Red Dog Saloon', 'Deep South ribs and bourbon in Hoxton. A lively American BBQ experience.', 'other', 51.515, -0.14, '37 Hoxton Square, London N1 6NN', 'London', 'UK', NULL, 2, 4.2, 171, 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000052', 'pitt-cue-co-london', 'Pitt Cue Co.', 'Bun-sized brisket sandwiches and bone marrow mash. Influential London pit since 2011.', 'texas', 51.512, -0.138, '18-22 Great Eastern St, London EC2A 3AS', 'London', 'UK', NULL, 3, 4.5, 31, 'https://images.unsplash.com/photo-1598439210625-2a9f0d2a2f5d?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000053', 'fowl-fodder-bristol', 'Fowl & Fodder', 'Bristol smokehouse with pulled pork, smoked chicken, and local craft beer.', 'other', 51.4545, -2.5879, '38 Victoria St, Bristol BS1 6BY', 'Bristol', 'UK', NULL, 2, 4.4, 137, 'https://images.unsplash.com/photo-1529048201918-8a8a8a8a8a8a?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000054', 'pitt-bros-dublin', 'Pitt Bros', 'Dublin''s Texas-style BBQ with brisket boxes and mac attack sides.', 'texas', 53.3498, -6.2603, '5 Lord Edward St, Dublin D02 P634', 'Dublin', 'Ireland', NULL, 2, 4.5, 140, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000055', 'kimchi-bbq-berlin-berlin', 'Kimchi BBQ Berlin', 'Kreuzberg fusion of Korean gochujang glaze and American smoke on pork belly.', 'korean', 52.52, 13.405, 'OranienstraÃŸe 200, Berlin 10999', 'Berlin', 'Germany', NULL, 2, 4.4, 142, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000056', 'big-apple-bbq-amsterdam-amsterdam', 'Big Apple BBQ Amsterdam', 'Amsterdam''s American BBQ with ribs, brisket, and canal-side terrace seating.', 'other', 52.3676, 4.9041, 'Leidseplein 10, Amsterdam 1017 PT', 'Amsterdam', 'Netherlands', NULL, 2, 4.3, 47, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000057', 'kang-ho-dong-baekjeong-seoul', 'Kang Ho-dong Baekjeong', 'Premium Korean BBQ with marinated galbi and ssam wraps. A Gangnam institution.', 'korean', 37.5172, 127.0473, 'Apgujeong-ro, Gangnam, Seoul', 'Seoul', 'South Korea', NULL, 3, 4.7, 182, 'https://images.unsplash.com/photo-1529193594215-9c4c0c0c0c0c?w=800&q=80', true, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000058', 'maple-tree-house-seoul', 'Maple Tree House', 'Itaewon favorite with hanwoo beef and tableside grilling. Popular with expats and locals.', 'korean', 37.53, 127.03, 'Itaewon-ro, Yongsan, Seoul', 'Seoul', 'South Korea', NULL, 3, 4.6, 184, 'https://images.unsplash.com/photo-1504670280998-4f1c0c0c0c0c?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000059', 'wangbijib-seoul', 'Wangbijib', 'All-you-can-eat Korean BBQ with pork belly, beef tongue, and unlimited banchan.', 'korean', 37.51, 127.06, 'Gangnam-daero, Gangnam, Seoul', 'Seoul', 'South Korea', NULL, 2, 4.5, 104, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000060', 'gogung-busan', 'Gogung', 'Busan beachside Korean BBQ with fresh seafood ssam and grilled pork.', 'korean', 35.1796, 129.0756, 'Haeundae Beach Rd, Busan', 'Busan', 'South Korea', NULL, 2, 4.4, 176, 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000061', 'yakiniku-jumbo-tokyo', 'Yakiniku Jumbo', 'Premium wagyu yakiniku with tableside grilling and dipping sauces. Shinjuku''s finest.', 'japanese', 35.6762, 139.6503, 'Shinjuku, Tokyo 160-0022', 'Tokyo', 'Japan', NULL, 3, 4.6, 160, 'https://images.unsplash.com/photo-1598439210625-2a9f0d2a2f5d?w=800&q=80', true, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000062', 'ushigoro-tokyo', 'Ushigoro', 'Ebisu wagyu specialist with charcoal-grilled beef and omakase-style courses.', 'japanese', 35.66, 139.7, 'Ebisu, Shibuya, Tokyo', 'Tokyo', 'Japan', NULL, 4, 4.8, 75, 'https://images.unsplash.com/photo-1529048201918-8a8a8a8a8a8a?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000063', 'rokkasen-tokyo', 'Rokkasen', 'All-you-can-eat wagyu yakiniku in Shinjuku with premium cuts and sake pairings.', 'japanese', 35.69, 139.7, 'Nishi-Shinjuku, Tokyo', 'Tokyo', 'Japan', NULL, 3, 4.5, 154, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000064', 'seoul-garden-melbourne-melbourne', 'Seoul Garden Melbourne', 'Melbourne''s Korean BBQ in Chinatown with tabletop grills and banchan.', 'korean', -37.8136, 144.9631, 'Little Bourke St, Melbourne VIC 3000', 'Melbourne', 'Australia', NULL, 2, 4.4, 188, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000065', 'burnt-ends-singapore', 'Burnt Ends', 'Michelin-starred modern BBQ with smoked quail, brisket, and open-kitchen theatre.', 'other', 1.28, 103.85, '20 Teck Lim Rd, Singapore 088391', 'Singapore', 'Singapore', NULL, 4, 4.8, 50, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80', true, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000066', 'moyo-shisanyama-johannesburg', 'Moyo Shisanyama', 'South African braai culture with boerewors, pap, and chakalaka by the fire.', 'other', -26.2041, 28.0473, 'Melrose Arch, Johannesburg', 'Johannesburg', 'South Africa', NULL, 2, 4.3, 70, 'https://images.unsplash.com/photo-1529193594215-9c4c0c0c0c0c?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000067', 'carnivore-restaurant-nairobi', 'Carnivore Restaurant', 'All-you-can-eat game meat feast â€” ostrich, crocodile, and beef roasted on Maasai swords.', 'other', -1.3192, 36.8219, 'Langata Rd, Nairobi', 'Nairobi', 'Kenya', NULL, 3, 4.4, 83, 'https://images.unsplash.com/photo-1504670280998-4f1c0c0c0c0c?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000068', 'the-meat-co-dubai-dubai', 'The Meat Co. Dubai', 'Marina-side steakhouse with Argentine cuts and views of the yacht basin.', 'argentine', 25.2048, 55.2708, 'Dubai Marina Walk, Dubai', 'Dubai', 'UAE', NULL, 4, 4.5, 81, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000069', 'smoke-barrel-tel-aviv-tel-aviv', 'Smoke & Barrel Tel Aviv', 'Israeli-American smokehouse with pastrami burnt ends and tahini slaw.', 'other', 32.0853, 34.7818, 'Rothschild Blvd, Tel Aviv', 'Tel Aviv', 'Israel', NULL, 3, 4.4, 50, 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000070', 'bluebonnet-bbq-melbourne', 'Bluebonnet BBQ', 'Abbotsford''s Texas-style pit with brisket, ribs, and house pickles.', 'texas', -37.8, 144.99, '340 Victoria St, Abbotsford VIC 3067', 'Melbourne', 'Australia', NULL, 2, 4.6, 104, 'https://images.unsplash.com/photo-1598439210625-2a9f0d2a2f5d?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000071', 'auckland-smokehouse-auckland', 'Auckland Smokehouse', 'Harbour-side smoke with lamb shoulder and manuka-smoked brisket.', 'other', -36.8485, 174.7633, 'Viaduct Harbour, Auckland 1010', 'Auckland', 'New Zealand', NULL, 3, 4.3, 119, 'https://images.unsplash.com/photo-1529048201918-8a8a8a8a8a8a?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000072', 'terry-black-s-bbq-austin', 'Terry Black''s BBQ', 'Family pit with beef ribs, turkey, and sides that hold their own against the meat.', 'texas', 30.26, -97.75, '1003 Barton Springs Rd, Austin, TX 78704', 'Austin', 'USA', NULL, 2, 4.6, 128, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000073', 'la-barbecue-austin', 'La Barbecue', 'East Austin trailer with fatty brisket and house-made sausage on Cesar Chavez.', 'texas', 30.25, -97.73, '2401 E Cesar Chavez St, Austin, TX 78702', 'Austin', 'USA', NULL, 2, 4.5, 116, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000074', 'heim-barbecue-fort-worth', 'Heim Barbecue', 'Bacon burnt ends and craft beer in Fort Worth''s BBQ renaissance.', 'texas', 32.7555, -97.3308, '3000 S Hulen St, Fort Worth, TX 76109', 'Fort Worth', 'USA', NULL, 2, 4.6, 71, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80', false, 'approved'
);

INSERT INTO restaurants (id, slug, name, description, style, lat, lng, address, city, country, website, price_level, avg_rating, review_count, hero_image_url, is_featured, status) VALUES (
  '00000000-0000-4000-8000-000000000075', 'cattleack-barbecue-dallas', 'Cattleack Barbecue', 'Friday-Saturday only Dallas destination with prime brisket and beef ribs.', 'texas', 32.9, -96.85, '13628 Gamma Rd, Farmers Branch, TX 75244', 'Dallas', 'USA', NULL, 2, 4.7, 70, 'https://images.unsplash.com/photo-1529193594215-9c4c0c0c0c0c?w=800&q=80', false, 'approved'
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Signature Brisket', 'Slow-smoked until tender with house rub', '#', 'Buy on Amazon', 0
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'House Sausage', 'Craft sausage with regional spice blend', '#', 'Shop ThermoWorks', 1
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Signature Brisket', 'Slow-smoked until tender with house rub', '#', 'Buy on Amazon', 0
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'House Sausage', 'Craft sausage with regional spice blend', '#', 'Shop ThermoWorks', 1
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000003', 'Signature Brisket', 'Slow-smoked until tender with house rub', '#', 'Buy on Amazon', 0
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000003', 'House Sausage', 'Craft sausage with regional spice blend', '#', 'Shop ThermoWorks', 1
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000013', 'Signature Brisket', 'Slow-smoked until tender with house rub', '#', 'Buy on Amazon', 0
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000013', 'House Sausage', 'Craft sausage with regional spice blend', '#', 'Shop ThermoWorks', 1
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000015', 'Signature Brisket', 'Slow-smoked until tender with house rub', '#', 'Buy on Amazon', 0
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000015', 'House Sausage', 'Craft sausage with regional spice blend', '#', 'Shop ThermoWorks', 1
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', 'Signature Brisket', 'Slow-smoked until tender with house rub', '#', 'Buy on Amazon', 0
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000021', 'House Sausage', 'Craft sausage with regional spice blend', '#', 'Shop ThermoWorks', 1
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000026', 'Signature Brisket', 'Slow-smoked until tender with house rub', '#', 'Buy on Amazon', 0
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000026', 'House Sausage', 'Craft sausage with regional spice blend', '#', 'Shop ThermoWorks', 1
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000042', 'Signature Brisket', 'Slow-smoked until tender with house rub', '#', 'Buy on Amazon', 0
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000016', '00000000-0000-4000-8000-000000000042', 'House Sausage', 'Craft sausage with regional spice blend', '#', 'Shop ThermoWorks', 1
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000017', '00000000-0000-4000-8000-000000000043', 'Signature Brisket', 'Slow-smoked until tender with house rub', '#', 'Buy on Amazon', 0
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000018', '00000000-0000-4000-8000-000000000043', 'House Sausage', 'Craft sausage with regional spice blend', '#', 'Shop ThermoWorks', 1
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000019', '00000000-0000-4000-8000-000000000049', 'Signature Brisket', 'Slow-smoked until tender with house rub', '#', 'Buy on Amazon', 0
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000049', 'House Sausage', 'Craft sausage with regional spice blend', '#', 'Shop ThermoWorks', 1
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000057', 'Signature Brisket', 'Slow-smoked until tender with house rub', '#', 'Buy on Amazon', 0
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000057', 'House Sausage', 'Craft sausage with regional spice blend', '#', 'Shop ThermoWorks', 1
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000061', 'Signature Brisket', 'Slow-smoked until tender with house rub', '#', 'Buy on Amazon', 0
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000024', '00000000-0000-4000-8000-000000000061', 'House Sausage', 'Craft sausage with regional spice blend', '#', 'Shop ThermoWorks', 1
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000025', '00000000-0000-4000-8000-000000000065', 'Signature Brisket', 'Slow-smoked until tender with house rub', '#', 'Buy on Amazon', 0
);

INSERT INTO signature_dishes (id, restaurant_id, name, description, affiliate_url, affiliate_label, sort_order) VALUES (
  '10000000-0000-4000-8000-000000000026', '00000000-0000-4000-8000-000000000065', 'House Sausage', 'Craft sausage with regional spice blend', '#', 'Shop ThermoWorks', 1
);
