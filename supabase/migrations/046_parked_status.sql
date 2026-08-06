-- A "parked" holding pen for non-venue pending accounts (experiences,
-- enthusiasts, a school James is courting) — better than rejecting (reads as
-- "no") or deleting (loses the relationship). Additive + idempotent. Parked rows
-- are non-public everywhere (public reads are status='approved' only) and hidden
-- from the Pending queue; they can be returned to Pending or approved later.
alter type moderation_status add value if not exists 'parked';
