-- 082_claim_revoked_status.sql
-- Prompt 2 acceptance #3 — ownership REVOKE. A previously-approved claim can be revoked
-- by an admin, which removes the owner's edit rights immediately (ownsVenue only counts
-- status='approved'). We add a distinct 'revoked' value to the shared moderation_status
-- enum so a revoked claim is visibly different from a never-approved 'rejected' one.
-- Idempotent; adding an enum value is backward-compatible (no existing code must handle
-- it — only the revoke action ever sets it, and only on restaurant_claims).

alter type moderation_status add value if not exists 'revoked';
