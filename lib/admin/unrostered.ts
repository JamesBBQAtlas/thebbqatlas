/**
 * The ONE predicate for "a chain detected but not yet rostered" — the Build-roster
 * backlog. Used by BOTH the "Chains to roster" filter chip and the `?unrostered=1`
 * deep-link, so the chip and the deep-link can never select different sets (that
 * divergence is exactly what Part B fixes). Pure + unit-tested.
 *
 * Definition: a chain CANDIDATE that is a TOP-LEVEL row (not a branch, not a seed),
 * NOT yet rostered, AND has ZERO branch children. Once its roster is built (it has
 * children, or chain_rostered_at is set) it drops off the backlog.
 */
export interface UnrosteredChainVenue {
  id: string;
  chainCandidate: boolean;
  chainRostered: boolean;
  chainSeed: boolean;
  chainParentId: string | null;
}

/** The set of parent ids that already have at least one branch child. */
export function parentIdsWithChildren(
  venues: { chainParentId: string | null }[]
): Set<string> {
  const s = new Set<string>();
  for (const v of venues) if (v.chainParentId) s.add(v.chainParentId);
  return s;
}

/** True when this venue is a chain candidate whose roster hasn't been built. */
export function isUnrosteredChain(
  v: UnrosteredChainVenue,
  withChildren: Set<string>
): boolean {
  return (
    v.chainCandidate &&
    !v.chainRostered &&
    !v.chainSeed &&
    !v.chainParentId &&
    !withChildren.has(v.id)
  );
}
