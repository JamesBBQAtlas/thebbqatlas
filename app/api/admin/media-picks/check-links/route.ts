import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { checkLibraryLinks } from "@/lib/media/link-health";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Part C — run the library link-health checker on demand. POST { ids?: string[] }
 * checks a specific set (per-row re-check / bulk "Re-check links"); with no ids it
 * reviews the WHOLE library ("Review library links"). Persists status on each and
 * returns a summary for the banner. Operator-only.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : undefined;

  const summary = await checkLibraryLinks(ctx.db, { ids });
  revalidatePath("/watch-read-listen");
  return NextResponse.json({ ok: true, summary });
}
