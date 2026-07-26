import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { importSeedRows } from "@/lib/admin/seed-import";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Bulk venue seed import (P-import). Takes the raw seed-sheet CSV, keeps only
 * type=venue & keep=Y rows, and creates/refreshes DRAFT venues (status=pending).
 * Idempotent on instagram_handle. Admin + 2FA gated via requireAdmin. Returns a
 * summary the import panel shows to the admin.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!csv.trim()) {
    return NextResponse.json({ error: "No CSV provided." }, { status: 400 });
  }
  if (csv.length > 5_000_000) {
    return NextResponse.json({ error: "CSV too large (5MB max)." }, { status: 413 });
  }

  try {
    const result = await importSeedRows(ctx.db, csv);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed." },
      { status: 500 }
    );
  }
}
