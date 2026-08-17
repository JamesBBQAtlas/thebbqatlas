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

  // Refresh the session if it has expired (safe no-op when logged out) — but NEVER
  // let a slow or unreachable auth service hang the page. The 17 Aug incident included
  // `/middleware` 504s (function >25s) clustered with the DB-timeout window: every
  // matched page request awaits this auth round-trip, so when Supabase auth is slow the
  // middleware itself stalls the whole page. Bound it: on timeout/error we proceed with
  // the cookies we have (an unrefreshed session just refreshes on the next request —
  // far better than a 504). This is per-request work made resilient, not removed.
  const AUTH_REFRESH_TIMEOUT_MS = 2500;
  try {
    await Promise.race([
      supabase.auth.getUser(),
      new Promise<void>((resolve) => setTimeout(resolve, AUTH_REFRESH_TIMEOUT_MS)),
    ]);
  } catch {
    /* auth refresh failed — serve the page as-is; the next request retries */
  }

  return response;
}

export const config = {
  // Run on page routes only. Exclude API + auth route handlers, Next internals,
  // and static assets (so the map tiles, images, and video are never rewritten).
  matcher: [
    "/((?!api|auth|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|logos|images|markers|video|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|webm|txt|xml)$).*)",
  ],
};
