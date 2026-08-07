import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Phase 8b — Android App Links association file, served at
 * /.well-known/assetlinks.json.
 *
 * Env-driven: ANDROID_PACKAGE_NAME (e.g. "com.thebbqatlas.app") +
 * ANDROID_SHA256_CERT_FINGERPRINTS (comma-separated SHA-256 signing-cert
 * fingerprints). Until both are set we return 404 rather than publish a broken
 * association — it goes live only once the native app exists.
 */
export async function GET() {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  if (!pkg || fingerprints.length === 0) {
    return NextResponse.json({ error: "not configured" }, { status: 404 });
  }

  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: pkg,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
