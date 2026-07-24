import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountType } from "@/lib/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { avatarFor } from "./avatar";

/**
 * Resolve a DISPLAY url for an avatar. The `avatars` bucket is private (F-08),
 * so profiles store the storage PATH (e.g. "{uid}/avatar.jpg") and we mint a
 * short-lived signed URL for rendering. Legacy absolute URLs and empty values
 * fall through to the branded placeholder.
 */
export async function resolveAvatarUrl(
  supabase: SupabaseClient,
  avatarValue: string | null | undefined,
  accountType: AccountType
): Promise<string> {
  if (avatarValue && !/^https?:\/\//i.test(avatarValue)) {
    try {
      const { data } = await supabase.storage
        .from("avatars")
        .createSignedUrl(avatarValue, 60 * 60);
      if (data?.signedUrl) return data.signedUrl;
    } catch {
      /* fall through to placeholder */
    }
    // It's a path but we couldn't sign it → show the branded placeholder.
    return avatarFor(null, accountType);
  }
  return avatarFor(avatarValue, accountType);
}

/**
 * Resolve a PUBLIC-facing avatar URL for ANOTHER user (public profiles, "who's
 * been here"). The `avatars` bucket is private (F-08), and the anon role can't
 * sign its objects, so we mint a short-lived signed URL with the service-role
 * client when it's configured; otherwise (or on any failure) we fall back to the
 * branded placeholder. Never throws. Safe to call from ISR/statically-generated
 * public pages.
 */
export async function resolvePublicAvatarUrl(
  avatarValue: string | null | undefined,
  accountType: AccountType = "consumer"
): Promise<string> {
  if (!avatarValue) return avatarFor(null, accountType);
  if (/^https?:\/\//i.test(avatarValue)) return avatarFor(avatarValue, accountType);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return avatarFor(null, accountType);
  try {
    const admin = createAdminClient();
    const { data } = await admin.storage
      .from("avatars")
      .createSignedUrl(avatarValue, 60 * 60);
    return data?.signedUrl ?? avatarFor(null, accountType);
  } catch {
    return avatarFor(null, accountType);
  }
}
