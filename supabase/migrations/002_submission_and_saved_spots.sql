-- Run once in Supabase SQL Editor (post-launch schema update)

-- Submission improvements: multi-style, contact fields
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS styles TEXT[];
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS instagram_handle TEXT;

-- Backfill styles from existing style column
UPDATE submissions SET styles = ARRAY[style::text] WHERE styles IS NULL;

-- Saved spots: explicit RLS policies (fixes insert/delete reliability)
DROP POLICY IF EXISTS "Users manage own saved spots" ON saved_spots;

CREATE POLICY "Users read own saved spots" ON saved_spots
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own saved spots" ON saved_spots
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own saved spots" ON saved_spots
  FOR DELETE USING (auth.uid() = user_id);

-- Allow anonymous submissions (contact_email provided)
DROP POLICY IF EXISTS "Users insert submissions" ON submissions;
CREATE POLICY "Anyone insert submissions" ON submissions
  FOR INSERT WITH CHECK (
    submitted_by IS NULL OR auth.uid() = submitted_by
  );