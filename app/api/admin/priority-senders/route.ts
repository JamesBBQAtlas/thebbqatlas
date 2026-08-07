import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getPrioritySenders } from "@/lib/priority/senders";

export const dynamic = "force-dynamic";

/**
 * The current priority-sender lists, live from the DB (Priority-senders feature).
 * GET                      → JSON { venueDomains, premiumEmails }
 * GET ?download=domains    → text/plain, one registrable domain per line
 * GET ?download=emails     → text/plain, one email per line
 * The plain-text forms paste straight into a Gmail filter / Google Group.
 */
export async function GET(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { venueDomains, premiumEmails } = await getPrioritySenders();
  const download = new URL(request.url).searchParams.get("download");

  if (download === "domains" || download === "emails") {
    const lines = (download === "domains" ? venueDomains : premiumEmails).join("\n");
    return new NextResponse(lines + (lines ? "\n" : ""), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="priority-${download}.txt"`,
      },
    });
  }

  return NextResponse.json({ venueDomains, premiumEmails });
}
