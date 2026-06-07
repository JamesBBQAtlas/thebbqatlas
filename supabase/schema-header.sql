-- ============================================================
-- THE BBQ ATLAS — Complete Supabase Schema
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
('20000000-0000-4000-8000-000000000001', 'top-10-bbq-joints-texas', 'Top 10 BBQ Joints in Texas', 'From Franklin to Snow''s — the essential Texas barbecue pilgrimage list.', '## The Texas BBQ Pilgrimage\n\nTexas is the spiritual home of American barbecue.', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80', true, '2026-05-01'),
('20000000-0000-4000-8000-000000000002', 'carolina-vinegar-vs-mustard', 'Carolina Vinegar vs Mustard Sauce', 'Eastern NC vinegar-pepper vs South Carolina gold mustard.', '## Two Carolinas, Two Philosophies', 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80', true, '2026-05-15'),
('20000000-0000-4000-8000-000000000003', 'korean-bbq-around-the-world', 'Korean BBQ Around the World', 'From Gangnam galbi to global fusion.', '## The Global Rise of Korean BBQ', 'https://images.unsplash.com/photo-1598439210625-2a9f0d2a2f5d?w=800&q=80', true, '2026-05-20'),
('20000000-0000-4000-8000-000000000004', 'smoking-secrets-pitmasters', 'Smoking Secrets from Pitmasters', 'Fire management, wood selection, and patience.', '## What the Pitmasters Know', 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80', true, '2026-06-01')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- SEED: 75 RESTAURANTS
-- ============================================================