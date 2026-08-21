import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

/**
 * B8 — env-gated CORS for the native app origins. DARK until APP_ORIGINS is set (a
 * comma-separated allowlist), exactly like the AASA/assetlinks routes stay dark until the
 * app IDs exist. Native clients authenticate with a Bearer token (not cookies), so no
 * credentialed CORS is needed. The web flow never reaches this branch.
 */
function handleApiCors(request: NextRequest): NextResponse {
  const allowlist = (process.env.APP_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = request.headers.get("origin");
  const allowed = Boolean(origin && allowlist.includes(origin));

  const res =
    request.method === "OPTIONS"
      ? new NextResponse(null, { status: 204 })
      : NextResponse.next();

  if (allowed && origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.headers.set("Access-Control-Max-Age", "86400");
  }
  return res;
}

/**
 * Composed middleware:
 *  1. next-intl handles locale routing (rewrites unprefixed paths to the
 *     default locale; prefixes future locales).
 *  2. Supabase refreshes the auth session, writing refreshed cookies onto
 *     the same response so SSR pages see a valid session.
 */
export async function middleware(request: NextRequest) {
  // API routes: no locale routing, no cookie refresh — just env-gated CORS (dark by
  // default). Returns before any page logic, so the web page flow is unchanged.
  if (request.nextUrl.pathname.startsWith("/api")) {
    return handleApiCors(request);
  }

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
    // B8 — also run on /api, but ONLY for the CORS branch above (env-gated, dark by default).
    "/api/:path*",
  ],
};
