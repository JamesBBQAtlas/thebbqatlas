-- ============================================================================
-- 008 · F-08 (Tier 1) — Storage security.
--   1. Path-scope the review-photos and submissions INSERT policies so a user
--      can only write into their own {uid}/… folder.
--   2. Drop the broad SELECT-list policies on the public buckets — public
--      object-URL access doesn't need a listing policy and it exposed listing.
--   3. Make the avatars bucket PRIVATE (served via signed URLs), with an
--      owner-scoped SELECT so a user can sign their own avatar.
-- ============================================================================

-- 1. Path-scoped uploads --------------------------------------------------------
DROP POLICY IF EXISTS "Auth upload review photos" ON storage.objects;
CREATE POLICY "Auth upload review photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'review-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Auth upload submissions" ON storage.objects;
CREATE POLICY "Auth upload submissions"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2. Drop broad listing SELECT policies ----------------------------------------
DROP POLICY IF EXISTS "Public read review photos" ON storage.objects;
DROP POLICY IF EXISTS "media bucket read"         ON storage.objects;
DROP POLICY IF EXISTS "avatars public read"       ON storage.objects;

-- 3. Avatars private + owner-scoped read ---------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'avatars';

DROP POLICY IF EXISTS "avatars own read" ON storage.objects;
CREATE POLICY "avatars own read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
