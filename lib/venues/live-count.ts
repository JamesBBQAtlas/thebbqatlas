/**
 * The ONE definition of a "live" venue (Part 9). Admin Listings counted raw
 * `status='approved'` (532) while the public site counts approved AND not
 * permanently-closed (529) — two definitions of "live" that contradicted on screen.
 * This is the single source of truth: a live venue is APPROVED and NOT permanently
 * closed. Pure — used by the public read filter and the admin breakdown alike.
 */
export interface VenueCountRow {
  status?: string | null;
  permanently_closed?: boolean | null;
}

/** A venue the public site shows: approved and not permanently closed. */
export function isLiveVenue(r: VenueCountRow): boolean {
  return r.status === "approved" && r.permanently_closed !== true;
}

export interface LiveVenueBreakdown {
  /** Approved AND not permanently closed — the public "live venues" number. */
  live: number;
  /** Approved but permanently closed (excluded from the public count). */
  closed: number;
  /** All approved rows (the raw admin figure). */
  approved: number;
}

/** Reconcile a set of rows into live / closed / approved, so admin can show the
 *  breakdown ("529 live · 3 permanently closed · 532 approved") instead of a raw
 *  count that contradicts the homepage. */
export function liveVenueBreakdown(rows: VenueCountRow[]): LiveVenueBreakdown {
  const approved = rows.filter((r) => r.status === "approved");
  const closed = approved.filter((r) => r.permanently_closed === true).length;
  return { approved: approved.length, closed, live: approved.length - closed };
}
