import { Link } from "@/i18n/navigation";

/**
 * Part 5 — a subtle, privacy-safe attribution line for a venue page.
 *
 * Rules (see the build spec):
 *  • "Added to the Atlas · {Month YYYY}" from the first submission, falling back
 *    to created_at for bulk imports.
 *  • A submitter is named ONLY when they have a public profile (username); the
 *    name links to /u/{username}. A community submission with no public profile
 *    reads "Submitted by a community member"; a bulk import reads "Added by The
 *    BBQ Atlas" — never a fake submitter.
 *  • "Last updated {Month YYYY}" with NO actor name — internal admin/enrichment
 *    edits are never named publicly, and there is no member-updater path yet.
 *  • Never renders an email, IP, country, or private account. It only ever
 *    receives a public username.
 */
function monthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export interface VenueAttributionProps {
  /** first_submitted_at ?? created_at — the "added" date. */
  addedAtISO: string | null;
  /** Public username of the first submitter, or null (anonymous / no public profile / bulk). */
  submitterUsername: string | null;
  /** True when the venue came through the submission form (has a first submission). */
  hasSubmission: boolean;
  /** updated_at, when the venue has a meaningful last edit. */
  updatedAtISO: string | null;
}

export function VenueAttribution({
  addedAtISO,
  submitterUsername,
  hasSubmission,
  updatedAtISO,
}: VenueAttributionProps) {
  const added = addedAtISO ? monthYear(addedAtISO) : "";
  const updated = updatedAtISO ? monthYear(updatedAtISO) : "";
  if (!added && !updated) return null;

  const parts: React.ReactNode[] = [];
  if (added) parts.push(<span key="added">Added to the Atlas · {added}</span>);

  if (submitterUsername) {
    parts.push(
      <span key="by">
        Submitted by{" "}
        <Link
          href={`/u/${submitterUsername}`}
          className="text-text-secondary underline decoration-dotted underline-offset-2 hover:text-brand-gold"
        >
          @{submitterUsername}
        </Link>
      </span>
    );
  } else if (hasSubmission) {
    parts.push(<span key="by">Submitted by a community member</span>);
  } else {
    parts.push(<span key="by">Added by The BBQ Atlas</span>);
  }

  if (updated) parts.push(<span key="upd">Last updated {updated}</span>);

  return (
    <p className="mt-6 text-xs text-text-muted">
      {parts.map((node, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1.5 text-text-muted/50">·</span>}
          {node}
        </span>
      ))}
    </p>
  );
}
