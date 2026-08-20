-- 082_backup_storage_objects.sql
-- Weekly independent backup — storage half (the actual uploaded photo/video FILES,
-- which live in Supabase Storage, NOT in the Postgres tables the DB export covers).
-- A tiny helper that returns a FLAT, recursive inventory of every stored object across
-- all buckets in one call, so the backup job doesn't have to walk folders. The job
-- mirrors these files to the same off-Cloudflare bucket, incrementally (immutable files
-- are copied once, then skipped), so it scales as uploads grow. Service-role only.

create or replace function public.backup_storage_objects()
returns table (bucket_id text, name text, size bigint, mimetype text, updated_at timestamptz)
language sql
stable
security definer
set search_path = storage, public, pg_catalog
as $$
  select
    o.bucket_id,
    o.name,
    coalesce((o.metadata->>'size')::bigint, 0) as size,
    o.metadata->>'mimetype' as mimetype,
    o.updated_at
  from storage.objects o
  order by o.bucket_id, o.name;
$$;

revoke all on function public.backup_storage_objects() from public, anon, authenticated;
grant execute on function public.backup_storage_objects() to service_role;

comment on function public.backup_storage_objects() is
  'Flat inventory of every Supabase Storage object (bucket, path, size, mimetype) for the weekly file backup. Service-role only.';
