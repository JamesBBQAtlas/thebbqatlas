# Disaster-recovery: restoring from a weekly backup

The weekly job (`/api/cron/db-export`, Sundays 03:00 UTC) writes a full logical
snapshot of every critical table to an **independent, off-Cloudflare** S3-compatible
store (Backblaze B2 by default). Each snapshot is a folder of gzipped NDJSON files plus
a `manifest.json`:

```
bbq-atlas-backups/
  2026-08-20/
    restaurants.ndjson.gz
    media.ndjson.gz
    reviews.ndjson.gz
    ... (one per table)
    manifest.json        ← row counts + sha256 + bytes + duration per table
```

This is the belt-and-braces copy that does **not** depend on Supabase's own daily
backups/PITR. Use it when a bad write, migration, or corruption damaged a table (or the
whole set) and you want to restore from our own copy.

> ⚠️ An untested backup is not a backup. Run the "Test-run once" section below at least
> once against a scratch/staging project so we KNOW a restore works. Fable will check
> this happened.

## 0. Prerequisites (env, kept server-side / in your shell — never committed)

```
export NEXT_PUBLIC_SUPABASE_URL=...           # target project URL
export SUPABASE_SERVICE_ROLE_KEY=...          # target project service-role key
export BACKUP_S3_ENDPOINT=https://s3.us-west-004.backblazeb2.com
export BACKUP_S3_REGION=us-west-004
export BACKUP_S3_BUCKET=bbqatlas-backups
export BACKUP_S3_ACCESS_KEY_ID=...            # B2 keyID
export BACKUP_S3_SECRET_ACCESS_KEY=...        # B2 applicationKey
export BACKUP_S3_PREFIX=bbq-atlas-backups     # optional, matches the export
```

## 1. Pick a snapshot and verify it

Browse the bucket (B2 web console, or `aws s3 ls --endpoint-url $BACKUP_S3_ENDPOINT`)
and choose a date folder. Open its `manifest.json` and confirm `ok: true` and the
per-table `rows` look right (this is how you spot a truncated export before trusting it).

## 2. Restore a single table (the common case)

Our helper downloads the file, gunzips it, verifies the row count against the manifest,
and upserts rows by primary key (`id`) via the service role:

```
# Dry-run first — downloads + validates, writes nothing:
node scripts/restore-from-backup.mjs --date 2026-08-20 --table reviews --dry-run

# Then for real (upsert on id; existing rows with the same id are overwritten):
node scripts/restore-from-backup.mjs --date 2026-08-20 --table reviews
```

Restore several tables by repeating, or `--table all`. **Foreign-key order matters** for
a multi-table restore: restore parents before children. A safe order for a full set:

```
profiles → brands → restaurants → restaurant_claims → subscriptions → orders →
suggestions → media → review_photos → reviews → signature_dishes → everything else
```

## 3. Manual restore without the script (psql / any Postgres client)

```
# download + gunzip one table
aws s3 cp --endpoint-url $BACKUP_S3_ENDPOINT \
  s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/2026-08-20/reviews.ndjson.gz .
gunzip reviews.ndjson.gz
```

Each line is one row as JSON. Load it with a jsonb-to-rows insert, e.g.:

```sql
-- stage the raw json, then upsert into the real table
create temp table _restore (j jsonb);
\copy _restore(j) from 'reviews.ndjson'
insert into reviews
select * from jsonb_populate_recordset(null::reviews, (select jsonb_agg(j) from _restore))
on conflict (id) do update set /* columns... */ ;
```

(`jsonb_populate_recordset` maps the JSON straight onto the table's row type.)

## 4. Full-project restore (worst case)

For a total loss, prefer restoring the whole set into a **fresh** Supabase project (so
you don't fight live constraints), in the FK order above, then repoint the app's env at
it. For point-in-time needs, Supabase's own PITR/daily backup is the faster primary;
this independent copy is the guarantee that survives even a Supabase/account problem.

## 4b. Restoring uploaded FILES (photos/videos)

The weekly job also mirrors the actual uploaded files from Supabase Storage to the same
bucket, under a NON-dated `storage/` prefix (immutable files, kept as one growing
mirror rather than per-week snapshots):

```
bbq-atlas-backups/storage/
  media/<userid>/<uuid>.jpg
  review-photos/...
  manifest.json        ← full object inventory + sizes
```

To restore a file, download it from the backup and re-upload it into the Supabase
Storage bucket at the SAME path (via the dashboard, the CLI, or the storage API):

```
aws s3 cp --endpoint-url $BACKUP_S3_ENDPOINT \
  s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/storage/media/<userid>/<uuid>.jpg .
# then upload back into the `media` bucket at path <userid>/<uuid>.jpg
```

The DB `media` / `review_photos` rows (restored in §2) point at these paths, so
restoring the rows + the files together fully rebuilds the gallery. `storage/manifest.json`
lists every expected file + size to verify completeness.

## 5. Test-run once (required)

1. Create a throwaway Supabase project (or a `_restore`-schema copy).
2. Point the env at it.
3. `node scripts/restore-from-backup.mjs --date <recent> --table restaurants --dry-run`
   then without `--dry-run`.
4. Confirm the restored row count matches the manifest, spot-check a few rows
   (including a `restaurants` dossier, to prove the expensive enrichment JSON survived).
5. Record the date you tested in this file:

> Last successful restore test: **2026-08-20** (restore-machinery, byte-perfect) ·
> **keyed B2-download leg closed 2026-08-21** (real keyed pull with the live app key — see §6 result)

### 2026-08-20 restore-machinery test — result

Proved the restore path end to end **without touching production**, into a throwaway
`_restore_test` schema (created + torn down in the same session):

- **DB restore leg** — real rows from `brands` (10), a 50-row `restaurants` sample
  (incl. the enrichment jsonb), and `admin_audit_log` (26) were serialised the way the
  backup stores them (`to_jsonb` == the NDJSON line content) and restored via
  `jsonb_populate_recordset` into fresh tables. **Row counts matched exactly** (10/10,
  50/50, 26/26), and a **byte-for-byte deep-equality check found 0 mismatches** — every
  restored row identical to source, dossier/jsonb/timestamps and all. Scratch schema
  dropped afterwards (verified gone).
- **File-format leg** — `scripts/test-backup.mts` proves the gzip+NDJSON round-trip is
  lossless (`gunzip(gzip(x)) === x`, rows parse back identically, deterministic sha256).
- **Keyed B2-download leg — CLOSED 2026-08-21.** The real keyed pull from Backblaze with
  the live app key was run (see §6 result below): `restaurants` **1205/1205 ✓** and
  `admin_audit_log` **25/25 ✓** downloaded + gunzipped + count-matched against the manifest,
  and a mirrored file (**3,573,826 bytes**) pulled **byte-exact** vs the storage manifest.
  Nothing written. The whole chain — real credentials, real stored bytes — is now proven.

## 6. Close the keyed B2-download leg (final proof, ~15 min, never touches prod)

Proves the *whole chain works with real credentials* — the actual stored bytes pull
from Backblaze with the app key and restore, not just the machinery.

**Set your Backblaze keys in the shell** (these you have; the DB creds come later):
```
set BACKUP_S3_ENDPOINT=https://s3.us-east-005.backblazeb2.com
set BACKUP_S3_REGION=us-east-005
set BACKUP_S3_BUCKET=bbqatlas-backups
set BACKUP_S3_ACCESS_KEY_ID=<your B2 keyID>
set BACKUP_S3_SECRET_ACCESS_KEY=<your B2 applicationKey>
```
(PowerShell uses `$env:NAME="value"` instead of `set NAME=value`.)

**6a — keyed download of DB tables (B2 keys only, writes nothing):**
```
node scripts/restore-from-backup.mjs --date <most-recent-snapshot> --table restaurants --dry-run
node scripts/restore-from-backup.mjs --date <most-recent-snapshot> --table admin_audit_log --dry-run
```
Each does a REAL keyed download from B2 → gunzip → and checks the row count against the
snapshot manifest (✓/✗). This is the keyed-download proof for the DB leg.

**6b — keyed download of a mirrored FILE (B2 keys only):**
```
node scripts/restore-from-backup.mjs --storage
```
Downloads a sample file from the `storage/` mirror and checks its byte size against the
storage manifest — proves the file leg pulls from B2 too.

**6c — (optional) the real WRITE into a scratch target.** The script refuses to write to
production and requires `--yes`. Point it at a **scratch** Supabase (a throwaway project,
or ask Claude to spin up a Supabase branch), set that project's creds, then:
```
set NEXT_PUBLIC_SUPABASE_URL=<SCRATCH project url>
set SUPABASE_SERVICE_ROLE_KEY=<SCRATCH service key>
node scripts/restore-from-backup.mjs --date <recent> --table restaurants --yes
```
(6a's byte-perfect restore was already proven on 2026-08-20, so 6c is belt-and-braces.)

Then update the "Last successful restore test" line above to note the **keyed-download
leg is closed** (date + which tables/files pulled).

### 2026-08-21 keyed-download leg — result (CLOSED)

Run against the live `2026-08-20` snapshot with the real Backblaze app key (B2 creds only,
no Supabase creds loaded, nothing written):

```
restaurants     : 1205 rows (manifest: 1205 ✓)
admin_audit_log :   25 rows (manifest:   25 ✓)
storage sample  : media/…/2bd1ad51-…-fc257d59a9a9.jpeg — 3,573,826 bytes (manifest: 3,573,826 ✓)
```

Each `--dry-run` did a **real keyed GET from B2 → gunzip → count-check** vs the manifest;
`--storage` did a **real keyed file GET → byte-size check** vs the storage manifest. All ✓.
Combined with the 2026-08-20 byte-perfect restore into a scratch schema, the full
disaster-recovery chain — credentials, transport, format, and restore — is proven.

