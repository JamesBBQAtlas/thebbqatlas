-- 077_claim_hardening.sql
-- Claim Venue (Build Prompt 2a) — harden the existing restaurant_claims flow.
-- Idempotent + additive. No data change.
--
--  1. SECURITY: the insert RLS policy allowed a user to insert a claim at ANY
--     status for themselves — i.e. self-approve (insert status='approved'). Tighten
--     it so a user can only ever create a PENDING claim for their own account. The
--     admin approve/reject path runs via the service-role client (bypasses RLS), so
--     this doesn't affect moderation.
--  2. Decision provenance: who decided a claim, when, and the reason (for a reject).
--  3. Ownership lookup index on (restaurant_id, user_id, status) for userOwnsVenue().

-- 1 — self-approve guard.
drop policy if exists "own claims insert" on restaurant_claims;
create policy "own claims insert" on restaurant_claims
  for insert to authenticated
  with check (auth.uid() = user_id and status = 'pending');

-- 2 — decision provenance.
alter table restaurant_claims add column if not exists decided_by    uuid references auth.users(id);
alter table restaurant_claims add column if not exists decided_at    timestamptz;
alter table restaurant_claims add column if not exists decision_note text;

-- 3 — ownership lookup index.
create index if not exists restaurant_claims_owner_idx
  on restaurant_claims (restaurant_id, user_id, status);

comment on column restaurant_claims.decided_by is 'Admin who approved/rejected this claim (Build Prompt 2a).';
comment on column restaurant_claims.decision_note is 'Admin reason on reject (shown to no one but admins).';
