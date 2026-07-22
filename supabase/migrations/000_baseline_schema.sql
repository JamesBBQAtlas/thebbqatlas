-- ============================================================================
-- 000 · BASELINE SCHEMA (F-25)
-- ----------------------------------------------------------------------------
-- Introspected snapshot of the live `public` schema (project jsbhgsfnxrgcxlxsbokp)
-- as of 2026-07-22, so the database structure is reproducible from the repo.
--
-- Scope: extensions, enums, tables, and constraints (PK/FK/UNIQUE/CHECK) — the
-- structural schema. RLS enablement is included per table. RLS POLICIES, GRANTS,
-- FUNCTIONS, and TRIGGERS are established by (a) the application's original
-- Supabase project setup and (b) the incremental migrations 003–010 in this
-- folder (which also carry the Phase-9b security hardening). Applying this file
-- then 003–010 in order reproduces the current security posture on a fresh DB.
--
-- For a byte-exact authoritative dump, use the Supabase CLI:
--     supabase db dump --schema public > baseline.sql
-- ============================================================================

-- Extensions used by column defaults / types below.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.account_type AS ENUM ('consumer', 'owner', 'seller');
CREATE TYPE public.bbq_style AS ENUM ('texas', 'carolina', 'korean', 'asado', 'memphis', 'churrasco', 'yakiniku', 'other', 'kansas-city', 'alabama', 'mexican', 'braai', 'nyama-choma', 'mangal', 'modern');
CREATE TYPE public.checkin_visibility AS ENUM ('public', 'private');
CREATE TYPE public.map_item_category AS ENUM ('restaurant', 'food_truck', 'retailer', 'market', 'event', 'festival', 'school', 'caterer');
CREATE TYPE public.moderation_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.submission_kind AS ENUM ('new_venue', 'correction', 'closure');
CREATE TYPE public.user_role AS ENUM ('user', 'admin');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE public.addresses (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  full_name text,
  line1 text NOT NULL,
  line2 text,
  city text NOT NULL,
  region text,
  postal_code text,
  country text NOT NULL,
  phone text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.bookmarks (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  title text,
  slug text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.brands (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  website text,
  hero_image_url text,
  instagram_url text,
  x_url text,
  facebook_url text,
  tiktok_url text,
  youtube_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.check_ins (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  note text,
  visibility checkin_visibility NOT NULL DEFAULT 'public'::checkin_visibility,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.click_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  restaurant_id uuid,
  partner text,
  target_url text,
  page_path text,
  subtag text,
  user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.contact_messages (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  email text NOT NULL,
  subject text,
  message text NOT NULL,
  handled boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.email_log (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  to_email text NOT NULL,
  type text NOT NULL,
  stream text NOT NULL DEFAULT 'transactional'::text,
  status text NOT NULL,
  provider_id text,
  subject text,
  error text,
  user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.enrichment_runs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id uuid,
  entity_type text NOT NULL DEFAULT 'venue'::text,
  lead jsonb,
  result jsonb,
  citations jsonb,
  model text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.follows (
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.gear_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  affiliate_url text NOT NULL DEFAULT '#'::text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE public.guides (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  slug text NOT NULL,
  title text NOT NULL,
  excerpt text NOT NULL,
  content_md text NOT NULL,
  hero_image_url text NOT NULL,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.media (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  restaurant_id uuid,
  kind text NOT NULL DEFAULT 'image'::text,
  storage_path text NOT NULL,
  url text NOT NULL,
  caption text,
  source text NOT NULL DEFAULT 'upload'::text,
  status moderation_status NOT NULL DEFAULT 'pending'::moderation_status,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.news (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  slug text NOT NULL,
  title text NOT NULL,
  excerpt text,
  content_md text NOT NULL,
  hero_image_url text,
  category text NOT NULL DEFAULT 'news'::text,
  author text,
  is_published boolean NOT NULL DEFAULT true,
  published_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  stripe_session_id text,
  stripe_payment_intent text,
  type text NOT NULL DEFAULT 'other'::text,
  description text,
  amount_total integer,
  currency text,
  status text NOT NULL DEFAULT 'pending'::text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  display_name text,
  avatar_url text,
  role user_role NOT NULL DEFAULT 'user'::user_role,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  account_type account_type NOT NULL DEFAULT 'consumer'::account_type,
  username citext,
  stripe_customer_id text,
  welcome_email_sent boolean NOT NULL DEFAULT false,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  marketing_opt_in_at timestamp with time zone,
  marketing_opt_in_text text,
  unsubscribe_token uuid NOT NULL DEFAULT uuid_generate_v4()
);

CREATE TABLE public.rate_limits (
  bucket text NOT NULL,
  window_start timestamp with time zone NOT NULL,
  count integer NOT NULL DEFAULT 0
);

CREATE TABLE public.restaurant_claims (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_requested text NOT NULL DEFAULT 'owner'::text,
  status moderation_status NOT NULL DEFAULT 'pending'::moderation_status,
  note text,
  contact_email text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.restaurants (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  style bbq_style NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  country text NOT NULL,
  website text,
  price_level integer NOT NULL,
  avg_rating numeric(2,1) NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  hero_image_url text,
  is_featured boolean NOT NULL DEFAULT false,
  status moderation_status NOT NULL DEFAULT 'approved'::moderation_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  country_code text,
  alcohol text,
  offerings text[] NOT NULL DEFAULT '{}'::text[],
  category map_item_category NOT NULL DEFAULT 'restaurant'::map_item_category,
  permanently_closed boolean NOT NULL DEFAULT false,
  phone text,
  hours jsonb,
  event_starts_at timestamp with time zone,
  event_ends_at timestamp with time zone,
  owner_id uuid,
  is_premium boolean NOT NULL DEFAULT false,
  premium_until timestamp with time zone,
  instagram_url text,
  x_url text,
  facebook_url text,
  tiktok_url text,
  youtube_url text,
  brand_id uuid,
  location_label text,
  instagram_posts jsonb,
  enrichment_sources jsonb,
  enriched_at timestamp with time zone
);

CREATE TABLE public.review_photos (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  review_id uuid NOT NULL,
  storage_path text NOT NULL,
  url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  status moderation_status NOT NULL DEFAULT 'pending'::moderation_status
);

CREATE TABLE public.reviews (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  rating integer NOT NULL,
  body text NOT NULL,
  status moderation_status NOT NULL DEFAULT 'pending'::moderation_status,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.role_change_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  target_id uuid,
  target_email text,
  old_role user_role,
  new_role user_role,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.saved_spots (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.signature_dishes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  affiliate_url text NOT NULL DEFAULT '#'::text,
  affiliate_label text NOT NULL DEFAULT 'Buy on Amazon'::text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE public.submissions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text NOT NULL,
  style bbq_style NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  country text NOT NULL,
  website text,
  hero_image_url text,
  submitted_by uuid,
  moderation_status moderation_status NOT NULL DEFAULT 'pending'::moderation_status,
  admin_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  styles text[],
  contact_email text,
  instagram_handle text,
  submission_type submission_kind NOT NULL DEFAULT 'new_venue'::submission_kind,
  target_restaurant_id uuid
);

CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  stripe_subscription_id text,
  stripe_customer_id text,
  status text NOT NULL DEFAULT 'inactive'::text,
  price_id text,
  plan text,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.suggestions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  kind text NOT NULL DEFAULT 'gap_fill'::text,
  restaurant_id uuid,
  title text,
  summary text,
  current jsonb,
  proposed jsonb,
  sources jsonb,
  confidence numeric,
  status text NOT NULL DEFAULT 'pending'::text,
  created_by text NOT NULL DEFAULT 'self-heal'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  applied_at timestamp with time zone,
  agreement jsonb,
  models text[]
);

CREATE TABLE public.view_history (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  title text,
  slug text,
  viewed_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Constraints (PK / FK / UNIQUE / CHECK)
-- ---------------------------------------------------------------------------
ALTER TABLE public.addresses ADD CONSTRAINT addresses_pkey PRIMARY KEY (id);
ALTER TABLE public.addresses ADD CONSTRAINT addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.bookmarks ADD CONSTRAINT bookmarks_pkey PRIMARY KEY (id);
ALTER TABLE public.bookmarks ADD CONSTRAINT bookmarks_user_id_entity_type_entity_id_key UNIQUE (user_id, entity_type, entity_id);
ALTER TABLE public.bookmarks ADD CONSTRAINT bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.brands ADD CONSTRAINT brands_pkey PRIMARY KEY (id);
ALTER TABLE public.brands ADD CONSTRAINT brands_slug_key UNIQUE (slug);
ALTER TABLE public.check_ins ADD CONSTRAINT check_ins_pkey PRIMARY KEY (id);
ALTER TABLE public.check_ins ADD CONSTRAINT check_ins_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.check_ins ADD CONSTRAINT check_ins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.check_ins ADD CONSTRAINT check_ins_user_id_restaurant_id_key UNIQUE (user_id, restaurant_id);
ALTER TABLE public.click_events ADD CONSTRAINT click_events_pkey PRIMARY KEY (id);
ALTER TABLE public.click_events ADD CONSTRAINT click_events_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE SET NULL;
ALTER TABLE public.contact_messages ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.email_log ADD CONSTRAINT email_log_pkey PRIMARY KEY (id);
ALTER TABLE public.email_log ADD CONSTRAINT email_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.enrichment_runs ADD CONSTRAINT enrichment_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.enrichment_runs ADD CONSTRAINT enrichment_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.enrichment_runs ADD CONSTRAINT enrichment_runs_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE SET NULL;
ALTER TABLE public.follows ADD CONSTRAINT follows_check CHECK ((follower_id <> following_id));
ALTER TABLE public.follows ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.follows ADD CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.follows ADD CONSTRAINT follows_pkey PRIMARY KEY (follower_id, following_id);
ALTER TABLE public.gear_items ADD CONSTRAINT gear_items_pkey PRIMARY KEY (id);
ALTER TABLE public.gear_items ADD CONSTRAINT gear_items_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.guides ADD CONSTRAINT guides_pkey PRIMARY KEY (id);
ALTER TABLE public.guides ADD CONSTRAINT guides_slug_key UNIQUE (slug);
ALTER TABLE public.media ADD CONSTRAINT media_pkey PRIMARY KEY (id);
ALTER TABLE public.media ADD CONSTRAINT media_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.media ADD CONSTRAINT media_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.news ADD CONSTRAINT news_pkey PRIMARY KEY (id);
ALTER TABLE public.news ADD CONSTRAINT news_slug_key UNIQUE (slug);
ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE public.orders ADD CONSTRAINT orders_stripe_session_id_key UNIQUE (stripe_session_id);
ALTER TABLE public.orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_stripe_customer_id_key UNIQUE (stripe_customer_id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_key UNIQUE (username);
ALTER TABLE public.rate_limits ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (bucket, window_start);
ALTER TABLE public.restaurant_claims ADD CONSTRAINT restaurant_claims_pkey PRIMARY KEY (id);
ALTER TABLE public.restaurant_claims ADD CONSTRAINT restaurant_claims_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_claims ADD CONSTRAINT restaurant_claims_restaurant_id_user_id_key UNIQUE (restaurant_id, user_id);
ALTER TABLE public.restaurant_claims ADD CONSTRAINT restaurant_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_alcohol_check CHECK (((alcohol IS NULL) OR (alcohol = ANY (ARRAY['none'::text, 'serves'::text, 'byob'::text, 'both'::text]))));
ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_pkey PRIMARY KEY (id);
ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_price_level_check CHECK (((price_level >= 1) AND (price_level <= 4)));
ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_slug_key UNIQUE (slug);
ALTER TABLE public.review_photos ADD CONSTRAINT review_photos_pkey PRIMARY KEY (id);
ALTER TABLE public.review_photos ADD CONSTRAINT review_photos_review_id_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);
ALTER TABLE public.reviews ADD CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE public.reviews ADD CONSTRAINT reviews_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.role_change_log ADD CONSTRAINT role_change_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.role_change_log ADD CONSTRAINT role_change_log_pkey PRIMARY KEY (id);
ALTER TABLE public.role_change_log ADD CONSTRAINT role_change_log_target_id_fkey FOREIGN KEY (target_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.saved_spots ADD CONSTRAINT saved_spots_pkey PRIMARY KEY (id);
ALTER TABLE public.saved_spots ADD CONSTRAINT saved_spots_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.saved_spots ADD CONSTRAINT saved_spots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.saved_spots ADD CONSTRAINT saved_spots_user_id_restaurant_id_key UNIQUE (user_id, restaurant_id);
ALTER TABLE public.signature_dishes ADD CONSTRAINT signature_dishes_pkey PRIMARY KEY (id);
ALTER TABLE public.signature_dishes ADD CONSTRAINT signature_dishes_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.submissions ADD CONSTRAINT submissions_pkey PRIMARY KEY (id);
ALTER TABLE public.submissions ADD CONSTRAINT submissions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.submissions ADD CONSTRAINT submissions_target_restaurant_id_fkey FOREIGN KEY (target_restaurant_id) REFERENCES restaurants(id) ON DELETE SET NULL;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
ALTER TABLE public.suggestions ADD CONSTRAINT suggestions_pkey PRIMARY KEY (id);
ALTER TABLE public.suggestions ADD CONSTRAINT suggestions_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.view_history ADD CONSTRAINT view_history_pkey PRIMARY KEY (id);
ALTER TABLE public.view_history ADD CONSTRAINT view_history_user_id_entity_type_entity_id_key UNIQUE (user_id, entity_type, entity_id);
ALTER TABLE public.view_history ADD CONSTRAINT view_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- RLS is enabled on every public table. Policies + grants are (re)established by
-- the application setup and the incremental migrations 003–010 in this folder.
-- ---------------------------------------------------------------------------
ALTER TABLE public.addresses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.click_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gear_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guides            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_photos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_change_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_spots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signature_dishes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.view_history      ENABLE ROW LEVEL SECURITY;
