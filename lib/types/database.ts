import type { BbqStyle } from "@/lib/constants/styles";

export type ModerationStatus = "pending" | "approved" | "rejected";
export type UserRole = "user" | "admin";
export type AccountType = "consumer" | "owner" | "seller";
export type SubmissionKind = "new_venue" | "correction" | "closure";
export type MapItemCategory =
  | "restaurant"
  | "food_truck"
  | "retailer"
  | "market"
  | "event"
  | "festival"
  | "school"
  | "caterer";

export interface Profile {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: UserRole;
  account_type: AccountType;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  status: string;
  price_id: string | null;
  plan: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  user_id: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  type: string;
  description: string | null;
  amount_total: number | null;
  currency: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Address {
  id: string;
  user_id: string;
  full_name: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postal_code: string | null;
  country: string;
  phone: string | null;
  is_default: boolean;
  created_at: string;
}

export interface ViewHistoryItem {
  id: string;
  user_id: string;
  entity_type: "venue" | "guide" | "news";
  entity_id: string;
  title: string | null;
  slug: string | null;
  viewed_at: string;
}

export interface RestaurantClaim {
  id: string;
  restaurant_id: string;
  user_id: string;
  role_requested: "owner" | "seller";
  status: ModerationStatus;
  note: string | null;
  contact_email: string | null;
  created_at: string;
}

export interface Brand {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  website: string | null;
  hero_image_url: string | null;
  instagram_url: string | null;
  x_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  created_at: string;
}

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  description: string;
  style: BbqStyle;
  lat: number;
  lng: number;
  address: string;
  city: string;
  country: string;
  country_code?: string | null;
  website: string | null;
  instagram_url?: string | null;
  x_url?: string | null;
  facebook_url?: string | null;
  tiktok_url?: string | null;
  youtube_url?: string | null;
  alcohol?: "none" | "serves" | "byob" | "both" | null;
  offerings?: string[] | null;
  price_level: number;
  avg_rating: number;
  review_count: number;
  hero_image_url: string | null;
  is_featured: boolean;
  status: ModerationStatus;
  created_at: string;
  // Category-aware / time-based map item fields (foundation).
  category?: MapItemCategory;
  permanently_closed?: boolean;
  phone?: string | null;
  hours?: Record<string, string> | null;
  event_starts_at?: string | null;
  event_ends_at?: string | null;
  owner_id?: string | null;
  // Multi-location: a location belongs to an optional brand; location_label
  // names the branch (e.g. "Albert Park").
  brand_id?: string | null;
  location_label?: string | null;
  instagram_posts?: string[] | null;
  enrichment_sources?: string[] | null;
  enriched_at?: string | null;
}

export interface ReviewPhoto {
  id: string;
  review_id: string;
  storage_path: string;
  url: string;
  status: ModerationStatus;
  created_at: string;
}

export interface SignatureDish {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  affiliate_url: string;
  affiliate_label: string;
  sort_order: number;
}

export interface GearItem {
  id: string;
  restaurant_id: string;
  name: string;
  affiliate_url: string;
  sort_order: number;
}

export type VoiceSlot =
  | "homepage_subline"
  | "footer"
  | "empty_state"
  | "loading"
  | "not_found"
  | "newsletter_confirm"
  | "success_toast";

/** Admin-managed house-voice microcopy line (see /admin/voice). */
export interface VoiceLine {
  id: string;
  slot: VoiceSlot;
  text: string;
  tag: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type GearCategory =
  | "thermometers"
  | "smokers_grills"
  | "fuel_wood"
  | "tools"
  | "cleaning";

/** Global, admin-managed affiliate catalogue product (see /gear). */
export interface GearProduct {
  id: string;
  name: string;
  brand: string | null;
  category: GearCategory;
  description: string | null;
  image_url: string | null;
  affiliate_url: string;
  partner: string | null;
  price_note: string | null;
  style_tags: string[];
  is_featured: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  restaurant_id: string;
  user_id: string;
  rating: number;
  body: string;
  status: ModerationStatus;
  created_at: string;
  profiles?: Pick<Profile, "username">;
}

export interface Submission {
  id: string;
  name: string;
  description: string;
  style: BbqStyle;
  styles?: string[] | null;
  lat: number;
  lng: number;
  address: string;
  city: string;
  country: string;
  website: string | null;
  hero_image_url: string | null;
  contact_email?: string | null;
  instagram_handle?: string | null;
  submitted_by: string | null;
  moderation_status: ModerationStatus;
  admin_notes: string | null;
  created_at: string;
  submission_type?: SubmissionKind;
  target_restaurant_id?: string | null;
}

export interface SavedSpot {
  id: string;
  user_id: string;
  restaurant_id: string;
  created_at: string;
  restaurants?: Restaurant;
}

export interface Guide {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content_md: string;
  hero_image_url: string;
  is_published: boolean;
  published_at: string;
  created_at: string;
}

export type NewsCategory = "news" | "missive";

export interface NewsPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content_md: string;
  hero_image_url: string;
  category: NewsCategory;
  author: string;
  is_published: boolean;
  published_at: string;
  created_at: string;
}

export type CheckInVisibility = "public" | "private";

export interface CheckIn {
  id: string;
  user_id: string;
  restaurant_id: string;
  note: string | null;
  visibility: CheckInVisibility;
  created_at: string;
  updated_at: string;
  restaurants?: Pick<Restaurant, "name" | "slug" | "city" | "country">;
}

export interface Follow {
  follower_id: string;
  following_id: string;
  created_at: string;
}