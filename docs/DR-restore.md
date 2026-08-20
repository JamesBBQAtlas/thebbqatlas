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

## 5. Test-run once (required)

1. Create a throwaway Supabase project (or a `_restore`-schema copy).
2. Point the env at it.
3. `node scripts/restore-from-backup.mjs --date <recent> --table restaurants --dry-run`
   then without `--dry-run`.
4. Confirm the restored row count matches the manifest, spot-check a few rows
   (including a `restaurants` dossier, to prove the expensive enrichment JSON survived).
5. Record the date you tested in this file:

> Last successful restore test: _______________ (by ________)
