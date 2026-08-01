import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Append-only editorial/status audit trail for venues (content_audit). One row
 * per changed tracked field, written at the mutation points. Best-effort — an
 * audit-write failure must never break the operation it records.
 */
export type AuditSource = "ai_enrichment" | "manual_edit" | "roster" | "import" | "system" | "operator";

export interface AuditOpts {
  source: AuditSource;
  changedBy?: string | null;
  note?: string | null;
}

export interface FieldChange {
  field: string;
  old: unknown;
  new: unknown;
}

/**
 * Tracked restaurants columns → logical field key. EDITORIAL + STATUS only:
 * we deliberately do NOT audit high-churn machine columns (geocode cache,
 * enrichment_cost counters, view counts, etc.).
 */
export const TRACKED_COLUMNS: Record<string, string> = {
  name: "name",
  description: "description",
  hook: "hook",
  style: "style",
  address: "address",
  city: "city",
  country: "country",
  instagram_handle: "instagram",
  website: "website",
  hero_image_url: "hero_image",
  is_featured: "is_featured",
  permanently_closed: "permanently_closed",
  status: "published",
  chain_parent_id: "chain",
  flagship_unset: "flagship",
};

/** Loose equality for audit diffing (handles null/undefined + JSON structures). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if ((a === null || a === undefined || a === "") && (b === null || b === undefined || b === "")) return true;
  try {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  } catch {
    return false;
  }
}

async function insertRows(
  db: SupabaseClient,
  restaurantId: string,
  changes: FieldChange[],
  opts: AuditOpts
): Promise<void> {
  const rows = changes
    .filter((c) => !sameValue(c.old, c.new))
    .map((c) => ({
      restaurant_id: restaurantId,
      field: c.field,
      old_value: c.old === undefined ? null : c.old,
      new_value: c.new === undefined ? null : c.new,
      source: opts.source,
      changed_by: opts.changedBy ?? null,
      note: opts.note ?? null,
    }));
  if (!rows.length) return;
  try {
    await db.from("content_audit").insert(rows);
  } catch {
    /* best-effort telemetry */
  }
}

/**
 * Diff a proposed patch against the row's prior values and audit every changed
 * TRACKED column. `before` should include the tracked columns (select them).
 */
export async function auditFromPatch(
  db: SupabaseClient,
  restaurantId: string,
  before: Record<string, unknown> | null,
  patch: Record<string, unknown>,
  opts: AuditOpts
): Promise<void> {
  const changes: FieldChange[] = [];
  for (const col of Object.keys(TRACKED_COLUMNS)) {
    if (!(col in patch)) continue;
    changes.push({ field: TRACKED_COLUMNS[col], old: before ? before[col] ?? null : null, new: patch[col] ?? null });
  }
  await insertRows(db, restaurantId, changes, opts);
}

/** One explicit change (e.g. a flagship/chain link, a publish). */
export async function auditField(
  db: SupabaseClient,
  restaurantId: string,
  field: string,
  oldValue: unknown,
  newValue: unknown,
  opts: AuditOpts
): Promise<void> {
  await insertRows(db, restaurantId, [{ field, old: oldValue, new: newValue }], opts);
}

/** A venue creation — one provenance row (keeps the 623 import lean). */
export async function auditCreated(
  db: SupabaseClient,
  restaurantId: string,
  summary: { name?: string | null; city?: string | null; status?: string | null },
  opts: AuditOpts
): Promise<void> {
  await insertRows(
    db,
    restaurantId,
    [{ field: "created", old: null, new: { name: summary.name ?? null, city: summary.city ?? null, status: summary.status ?? null } }],
    opts
  );
}
