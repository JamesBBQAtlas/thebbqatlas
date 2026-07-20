import type { BbqStyle } from "@/lib/constants/styles";

export type ModerationStatus = "pending" | "approved" | "rejected";
export type UserRole = "user" | "admin";

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
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
  alcohol?: "none" | "serves" | "byob" | "both" | null;
  offerings?: string[] | null;
  price_level: number;
  avg_rating: number;
  review_count: number;
  hero_image_url: string;
  is_featured: boolean;
  status: ModerationStatus;
  created_at: string;
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

export interface Review {
  id: string;
  restaurant_id: string;
  user_id: string;
  rating: number;
  body: string;
  status: ModerationStatus;
  created_at: string;
  profiles?: Pick<Profile, "display_name" | "avatar_url">;
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