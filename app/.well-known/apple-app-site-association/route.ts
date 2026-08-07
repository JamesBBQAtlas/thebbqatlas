import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Phase 8b — Apple universal-links association file, served at
 * /.well-known/apple-app-site-association (no extension, application/json, no
 * redirects — Apple fetches it verbatim).
 *
 * Env-driven: APPLE_APP_ID = "<TEAMID>.<bundleId>" (e.g. "ABC123.com.thebbqatlas.app").
 * Until that's set we return 404 rather than advertise a broken association, so
 * the file only goes live once the native app exists. Optional
 * APPLE_APP_PATHS (comma-separated) narrows the deep-linkable paths (default: all).
 */
export async function GET() {
  const appId = process.env.APPLE_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "not configured" }, { status: 404 });
  }
  const paths = (process.env.APPLE_APP_PATHS ?? "*")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const body = {
    applinks: {
      apps: [],
      details: [{ appID: appId, paths }],
    },
    webcredentials: { apps: [appId] },
  };

  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
