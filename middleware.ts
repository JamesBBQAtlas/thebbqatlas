import { type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Composed middleware:
 *  1. next-intl handles locale routing (rewrites unprefixed paths to the
 *     default locale; prefixes future locales).
 *  2. Supabase refreshes the auth session, writing refreshed cookies onto
 *     the same response so SSR pages see a valid session.
 */
export async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session if it has expired (safe no-op when logged out).
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Run on page routes only. Exclude API + auth route handlers, Next internals,
  // and static assets (so the map tiles, images, and video are never rewritten).
  matcher: [
    "/((?!api|auth|_next/static|_next/image|favicon.ico|logos|images|markers|video|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|webm)$).*)",
  ],
};
