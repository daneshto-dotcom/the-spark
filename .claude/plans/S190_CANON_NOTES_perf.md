# S190 — s190/perf canon notes (for the merge owner; this branch does NOT edit SPARK_CANON.md)

## No canon number moved
s190/perf is a pure performance change. No stat, pool, damage, cadence, range or protocol value was
touched; `src/canon.test.ts` and `SPARK_CANON.md` are untouched. `PROTOCOL_VERSION` stays 50 — nothing
serialized or on the wire changed, and `bondTargetIndex.differential.test.ts` proves the sim's
targeting outputs and `hashWorldStateFull` are byte-identical to master 554dbd7.

## If the canon records targeting mechanics, these are the facts this branch relied on (all unchanged)
- Structure-target bond scan: nearest bond MIDPOINT by squared distance, lower BondId on an exact tie.
- `enemyOnly` (chewer, drone, structure-attackers via `structureTargets`): nearest set = bonds with
  NEITHER endpoint of the owner's colour (S162 tightening). Voltkin (`enemyOnly: false`): nearest
  bond with EITHER endpoint foreign, else nearest own bond.
- FFA spread (enemy-only callers, ≥2 victims): `mix32(creatureId, sourceSpawnerId) % (n+1)`, slot 0 =
  score leader (lowest seat on a tie), slots 1..n = victims ascending.

## ⚠ A TARGETING FINDING — REPORTED, NOT FIXED (s189/units owns targeting behaviour)
**The FFA spread bypasses the S162 enemy-only tightening.**
`spreadEnemyTarget` (creatureAI.ts) builds its victim list and its per-victim scan over
`isEnemyBondWithColor` — the NON-strict OR predicate — while the enemy-only nearest set is strict.
So for a chewer / drone / structure-attacker, whenever the spread engages:
  1. a MIXED bond (one endpoint the owner's colour) can be returned by the per-victim scan, i.e. the
     exact "my own creature destroys my own tower" chain S162 closed at the nearest-bond step;
  2. a mixed bond whose `primA` is the owner's own shape puts the OWNER into its own victim list, which
     can also switch the spread on in a match with only one real enemy.
Reachability depends on whether mixed bonds occur in live play. Measured on a real four-seat bots match
to the end of wave 5: 0 mixed bonds in 1 493 samples, 0 of 9 994 enemy-only scans touched the
scanner's own colour — LATENT there; human play not measured. Any fix changes targeting outputs, so it needs a ruling and belongs to the targeting
owner, not to a perf branch — the reference fixture (`bondTargetReference.fixtures.ts`) must change
FIRST if it is fixed, then the index.
