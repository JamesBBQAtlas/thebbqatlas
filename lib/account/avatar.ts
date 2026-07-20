import type { AccountType } from "@/lib/types/database";

/** Branded placeholder avatars by account type. */
export const PLACEHOLDER_AVATAR: Record<AccountType, string> = {
  consumer: "/avatars/placeholder-consumer.jpg",
  owner: "/avatars/placeholder-vendor.jpg",
  seller: "/avatars/placeholder-vendor.jpg",
};

/** Resolve the avatar to show: the user's own photo, else the branded default. */
export function avatarFor(
  avatarUrl: string | null | undefined,
  accountType: AccountType
): string {
  return avatarUrl || PLACEHOLDER_AVATAR[accountType] || PLACEHOLDER_AVATAR.consumer;
}
