import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountType } from "@/lib/types/database";
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
