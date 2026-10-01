/**
 * SPARK — S182 — **A STAR'S OWN HEALTH, SCOPED TO THE SHAPE THE PLAYER BUILT.**
 *
 * One function, read by two consumers that must never disagree: the sim decides when the lightning
 * hub blows itself up, and the renderer decides which frame of its 24-frame damage ramp to draw. A
 * second copy of this arithmetic anywhere is the drift defect this repo is built around.
 *
 * ## ⭐⭐ R182-B (owner) — THE PERCENTAGE IS THE HUB'S OWN STAR, NOT ITS COMPONENT
 *
 * > *"A hub welded into a big lattice can reach thirty three percent on its own bonds. The sim still
 * > considers the wider structure healthy, but we don't care about that. If its own bonds are
 * > destroyed, then he will blow up. Neighbouring shapes are protecting it then, and it's fine."*
 *
 * ⛔ **THE DIVERGENCE FROM `damageConnector` IS DELIBERATE AND ACCEPTED. DO NOT "RECONCILE" IT.**
 * `state/damage.ts` reads `structurePoolFifths(comp.bondIds.size)` over the WHOLE connected
 * component, because that is what decides when a connector snaps. This reads the hub's OWN bonds,
 * because that is what the player built and what the art depicts. A hub welded into a lattice is
 * therefore, on purpose, a hub that detonates while the lattice around it is still healthy — and the
 * owner ruled that the lattice is protecting it, which is a good trade rather than a bug.
 *
 * ## ⭐ AND IT IS FREE TO COMPUTE — NO BFS, NO NEW FIELD, NO PROTOCOL BUMP
 *
 * ⚠ S189 C2 — THIS USED TO SAY *"for any LIVE hub, `world.primitives.get(anchor).bonds` **is** the
 * star's arms and nothing else"*, because `isStarAt` — then also the survival test — asserted
 * `hub.bonds.size === degree`. That exactness WAS the owner's S189 bug (a weld on the hub dissolved
 * the tower), so a live hub may now carry welds and the arms are read through `towerMembersAt`
 * (`ownStarBonds` below). Still no BFS, no new field and no protocol bump for THIS file: it is a
 * sort of the hub's own bonds.
 *
 * ⚠ **DETERMINISTIC ON BOTH PEERS, VERIFIED RATHER THAN ASSUMED.** `Primitive.bonds` is serialized
 * as an array (`save.ts:1802`) and rebuilt as a Set (`:1626`); `Bond.damageFifths` is on the wire
 * (`save.ts:1836`, additive-optional, emitted only when > 0; restored `:1665`) and hashed at both
 * sites (`stateHashFull.ts:278` union, `:547` projection). `damageFifths` are INTEGERS by
 * construction — `damageConnector` throws on a non-integer — so summing over a `Set` is exact and
 * order-independent. **No sort is needed for a SUM.** Anything ORDERED still needs an ascending-id
 * sort; `Map`/`Set` iteration deciding a player-visible outcome is the class of defect this codebase
 * spends most of its comments on.
 */
import { structurePoolFifths } from './stats.ts';
import type { BondId, PrimitiveId } from '../types.ts';
// S189 C2 — the tower's OWN arms, shared with the survival test and the ramp renderer.
import { liveTowerRecipeAt, towerMembersAt } from './towerMembers.ts';
import type { World } from './worldTypes.ts';

/**
 * ⭐⭐⭐ R182-A (owner) — **BELOW A THIRD, THE LIGHTNING HUB SELF-DESTRUCTS.**
 *
 * > *"From thirty two percent it will just get self destroyed, but it is a suicide drone building,
 * > so it makes sense. We won't do it for every building."*
 *
 * ⛔ **THE RAMP GENERALISES; THIS THRESHOLD DOES NOT.** It is earned by the hub being a
 * suicide-drone building, and the owner said so in the same breath he gave it. A future tower that
 * gets its own damage art gets the ramp for free and must NOT inherit this. `RampSpec.selfDestructs`
 * in `render/structureRamp.ts` is the opt-in, and it is opted into exactly once.
 *
 * ⭐ **ONE THIRD, AND IT IS THE SAME BOUNDARY AS THE ART.** The sheet is 24 frames and the death run
 * is its last 8 — 8/24 is exactly a third. So "the frame is ≥ 17" and "the health is below the
 * threshold" are not two numbers that must be kept in step; they are one test, and
 * `structureRamp.test.ts` asserts that they agree at every integer fifth of the pool.
 *
 * In fifths, against a five-armed hub's pool of 50: `banked ≥ 34` detonates, `banked ≤ 33` holds.
 */
export const STAR_SELFDESTRUCT_BELOW_FRAC = 1 / 3;

/**
 * ⭐⭐ S182 — **HOW LONG A DOOMED HUB STAYS IN THE WORLD SO ITS COLLAPSE CAN FINISH.**
 *
 * The ramp's last 8 frames (17→24) at `HUB_RAMP_TICKS_PER_FRAME` (**2** since S185) = **16 ticks**, 0.27 s at 60 Hz.
 * `structureRamp.test.ts` asserts this equals `rampDeathRunTicks(hubSpec)` so the sim's fuse and the
 * renderer's run cannot drift apart — they are the same eight frames counted from two sides.
 *
 * ⛔ IT LIVES HERE, NOT IN `render/structureRamp.ts`, BECAUSE THE SIM MAY NOT IMPORT FROM `render/`.
 * The dependency runs the other way: the renderer imports this module's threshold already.
 *
 * ⚠ **THE POLL IS THROTTLED, SO THE WRECK HOLDS ITS LAST FRAME FOR 6 TO 36 TICKS — NOT 6.** An
 * earlier version of this docblock pinned "the extra six ticks", which is the best case only, and a
 * wrong pinned number in this repo is worse than no number. The derivation:
 *
 *   · the COLLAPSE starts the instant health crosses the threshold, because the renderer re-reads
 *     `starHealthFrac` every frame — call that tick T;
 *   · the FUSE is lit at the next revalidation poll P ≥ T, and `P − T` is anywhere in `[0, 30)`;
 *   · the RAZE lands one poll after that, at `P + 30`.
 *
 * So raze − T ∈ [30, 60), the run itself needs 16, and the wreck therefore sits on frame 24 for
 * **14 to 44 ticks (0.23–0.73 s)** depending on where the crossing fell in the poll window.
 *
 * ⭐ THE GUARANTEE THAT MATTERS IS THE FLOOR, AND IT HOLDS: the minimum is 30 ≥ 16 — S185 made this floor SAFER, not riskier — so the run
 * ALWAYS completes before the raze. That is deliberately not "fixed" with a second finer-grained
 * poll — a settled ruin lingering a few extra frames is what a settled ruin should do.
 */
export const HUB_DEATH_RUN_TICKS = 16;

/**
 * PURE — the damage standing on `anchorId`'s OWN bonds, in fifths. `null` when there is no such
 * primitive (a stale id, or the hub was razed between the read and the call).
 */
export function starBankedFifths(world: World, anchorId: PrimitiveId): number | null {
  const arms = ownStarBonds(world, anchorId);
  if (arms === null) return null;
  let banked = 0;
  for (const bondId of arms) banked += world.bonds.get(bondId)?.damageFifths ?? 0;
  return banked;
}

/**
 * ⭐⭐ S189 C2 — PURE — **THE STAR'S OWN ARMS, WHICH `hub.bonds` NO LONGER IS.** `null` when the
 * anchor is gone.
 *
 * Until S189 a live hub's `bonds` WERE its arms, because `isStarAt` — which was also the survival
 * test — tore the tower down the moment anything bonded to the hub. S189 lets a tower stand with
 * shapes welded onto its hub (owner: *"as long as the existing tower, the shape is there … you can
 * connect to it"*), so `hub.bonds` now includes welds. R182-B says the percentage is the star the
 * player BUILT, and a weld is not that: its connector must neither pad the pool nor bank damage
 * against it, or a hub with a triangle welded to it would detonate on a different number than the
 * art it shows.
 *
 * So a LIVE tower is read through `towerMembersAt` — the same walk the sim's survival test and the
 * ramp renderer use, so the fuse and the frame cannot disagree about which connectors count. A
 * primitive that anchors no live tower is read on its raw bonds, which is exactly the pre-S189
 * reading: nothing but ignition could have made it a star, and ignition is exact.
 */
function ownStarBonds(world: World, anchorId: PrimitiveId): readonly BondId[] | null {
  const hub = world.primitives.get(anchorId);
  if (hub === undefined) return null;
  const recipe = liveTowerRecipeAt(world, anchorId);
  if (recipe !== null) {
    const own = towerMembersAt(world, recipe, anchorId);
    if (own !== null) return own.bonds;
  }
  return [...hub.bonds];
}

/**
 * PURE — what the hub's own star can absorb before its next arm snaps, in fifths.
 *
 * ⚠ READ FROM THE LIVE ARM COUNT, NEVER FROM THE RECIPE'S DEGREE CONSTANT. They are equal for a
 * whole star, and reading the live count is what keeps this correct for a hub that is mid-teardown,
 * and correct for the next star recipe that adopts the ramp without anyone having to remember to
 * pass its degree in. ⚠ S189 C2 — the live count is the star's OWN arms (`ownStarBonds`), no longer
 * `hub.bonds.size`: a weld on the hub is not an arm.
 */
export function starPoolFifths(world: World, anchorId: PrimitiveId): number | null {
  const arms = ownStarBonds(world, anchorId);
  if (arms === null) return null;
  return structurePoolFifths(arms.length);
}

/**
 * PURE — `anchorId`'s own star health as a fraction in 0..1, or `null` when it has no star.
 *
 * ⚠ **CLAMPED AT BOTH ENDS, AND THE TOP CLAMP IS NOT DECORATION.** A hub welded into a wider
 * component is judged by `damageConnector` against that component's LARGER pool, so its own five
 * bonds can legitimately carry more than 50 fifths before anything snaps. Unclamped that reads as
 * negative health and, through `rampFrameForHealth`, as a frame index past the end of the sheet.
 */
export function starHealthFrac(world: World, anchorId: PrimitiveId): number | null {
  const banked = starBankedFifths(world, anchorId);
  const pool = starPoolFifths(world, anchorId);
  if (banked === null || pool === null || pool <= 0) return null;
  return Math.max(0, Math.min(1, 1 - banked / pool));
}

/**
 * PURE — has this star fallen below the self-destruct threshold? `false` when it has no star, so a
 * missing hub can never be read as "detonate": the caller's own existence check stays the one that
 * decides, exactly as `towerStateForHp` puts the NaN case on the loud side rather than the silent one.
 */
export function starIsBelowSelfDestruct(world: World, anchorId: PrimitiveId): boolean {
  const frac = starHealthFrac(world, anchorId);
  return frac !== null && frac < STAR_SELFDESTRUCT_BELOW_FRAC;
}
