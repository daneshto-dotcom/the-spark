# S195 PROGRESS — s195/fight-wipe (the "half my build exploded at the whistle" hunt)

NEXT STEP: write `src/state/entropyFightWipe.test.ts` — build the owner's 1v2 wave-8 board (seat 0 Nagas vs seats 1+2), cross the FIGHT whistle through `runHostTick`, measure connectors/shapes/towers lost (H1), hub chain (H2), phase-edge hooks (H3), 1v2 team check (H4).

## Reading done (verified in tree, f7cc2100)
- `entropy.ts`: per-connector roll `min(50%, 0.1%×(n−10))`, ONCE at the BUILD→FIGHT edge (`hostTick.ts` FIGHT arm, the only `applyEntropyTax` call site), severs via `applySeverBond` cause `'entropy'`.
- `severBond.ts` → `severSplit` (`game/structure.ts:107`): a non-cycle cut deletes the SMALLER side (tie → newer side). `applySeverTopology` → `razePrimitives(del, [bond, ...delBonds], razeOrphans=true)`.
- Hub self-destruct: `hostTick.ts:~925` fires when the hub's RECIPE breaks (spawner revalidation, runs every tick incl. BUILD) → `STRUCTURE_SELFDESTRUCT` ladder 120 fifths split by distance over ENEMY targets only (`planHubBlast`: `isEnemySeat`/`sameTeam` on every arm — owner and team spared), plus `razePrimitives(ownStar)`.
- FIGHT-edge hooks (`hostTick.ts:457–622`): `bankCarriedSparksAtPhaseEdge` (both edges), `monsterWaveSpawned=0`, `applyEntropyTax`, `reviveDormantHelgas`. BUILD-edge only: `removeEndgameMonsters`, wave++, draft, princess sweep, Helga revive, `standDownDefenders`, bag refill, `releaseShelteredGatherers`, `clearScorchedEarthAtBuild`, `recallArmies`, `resummonVoltkins`.
- info-ui (b3e490cd, s195/info-ui) already ships `ENTROPY %` + `~N lost/fight` = n × chance (snaps only, no split multiplier) → SEAM, not a build.
