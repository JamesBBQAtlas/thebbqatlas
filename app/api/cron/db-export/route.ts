import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { runBackup, type BackupSummary } from "@/lib/backup/run";
import { sendEmail } from "@/lib/email/send";
import { EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/email/config";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Weekly independent DB backup (BUILD PROMPT). Exports the critical tables as
 * gzipped NDJSON + a manifest to an OFF-Cloudflare S3-compatible store (Backblaze B2
 * by default), keeps the last N snapshots, and emails on BOTH success and failure —
 * a backup nobody knows failed is not a backup. Runs fully in the cloud (Vercel
 * Cron), no local machine involved. Service-role reads so RLS can't hide rows.
 */
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function emailResult(summary: BackupSummary): Promise<void> {
  const rows = summary.tables
    .map((t) => `  ${t.ok ? "✓" : "✗"} ${t.table}: ${t.exportedRows} rows (${fmtBytes(t.bytes)})${t.ok ? "" : ` — ${t.error}`}`)
    .join("\n");
  const st = summary.storage;
  const storageLine = st
    ? `Files: ${st.totalObjects} total · ${st.copied} new copied (${fmtBytes(st.bytesCopied)}) · ${st.skipped} already backed up${st.failed ? ` · ${st.failed} failed` : ""}${st.capped ? " · CAPPED (more next run)" : ""}`
    : "Files: (storage backup did not run)";
  const head = summary.ok
    ? `✅ Weekly backup OK — ${summary.tableCount} tables / ${summary.totalRows} rows, ${st?.copied ?? 0} new files, ${fmtBytes(summary.totalBytes)}`
    : `❌ Weekly backup FAILED — ${summary.failures.length} problem(s)`;
  const text =
    `${head}\n\n` +
    `Snapshot: ${summary.destination} · ${summary.prefix}/${summary.folder}\n` +
    `Duration: ${(summary.durationMs / 1000).toFixed(1)}s · kept last ${summary.retain}` +
    (summary.pruned.length ? ` · pruned ${summary.pruned.join(", ")}` : "") +
    `\n\n${storageLine}\n` +
    `\nTables:\n${rows}\n` +
    (summary.failures.length ? `\nFailures:\n${summary.failures.map((f) => `  • ${f}`).join("\n")}\n` : "") +
    `\nManifests: ${summary.prefix}/${summary.folder}/manifest.json · ${summary.prefix}/storage/manifest.json\n` +
    `Restore steps: docs/DR-restore.md`;

  await sendEmail({
    to: EMAIL_REPLY_TO,
    subject: summary.ok
      ? `✅ Backup ${summary.folder} — ${summary.totalRows} rows + ${summary.storage?.totalObjects ?? 0} files`
      : `❌ Backup FAILED ${summary.folder}`,
    text,
    html: `<pre style="font:13px/1.5 ui-monospace,monospace">${text.replace(/</g, "&lt;")}</pre>`,
    from: EMAIL_FROM.transactional,
    stream: "transactional",
    type: "db_backup",
  });
}

async function run(): Promise<BackupSummary> {
  let summary: BackupSummary;
  try {
    summary = await runBackup();
  } catch (e) {
    // A total failure (e.g. destination not configured) still emails — loudly.
    const detail = e instanceof Error ? e.message : String(e);
    try {
      await sendEmail({
        to: EMAIL_REPLY_TO,
        subject: "❌ DB backup FAILED to start — The BBQ Atlas",
        text: `The weekly DB backup could not run: ${detail}\n\nCheck BACKUP_* env + destination credentials.`,
        html: `<p>The weekly DB backup could not run: <code>${detail.replace(/</g, "&lt;")}</code></p>`,
        from: EMAIL_FROM.transactional,
        stream: "transactional",
        type: "db_backup",
      });
    } catch {
      /* swallow */
    }
    throw e;
  }
  await emailResult(summary).catch(() => {});
  return summary;
}

/** Scheduled entrypoint — Vercel Cron issues GET with Bearer CRON_SECRET. */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const ok = Boolean(process.env.CRON_SECRET) && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await run());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "backup failed" }, { status: 500 });
  }
}

/** Manual "run now" for an authenticated admin. */
export async function POST() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await run());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "backup failed" }, { status: 500 });
  }
}
