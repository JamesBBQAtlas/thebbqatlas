-- #315 — user reviews are WRITTEN and MODERATED, with NO star rating ever
-- ("we never rank BBQ"). Make rating nullable so a review needs only a body; the
-- column stays for any future non-ranking use but the UI never collects a score.
ALTER TABLE reviews ALTER COLUMN rating DROP NOT NULL;
