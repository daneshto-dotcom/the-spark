/**
 * SPARK — S160 P4b: **THE CASTLE SHOOTS BACK.**
 *
 * S154 gave the castle hit points and an elimination path; this is the half that makes them matter.
 * Until now a castle was a target that could not answer, and three places in `SPARK_RACES_SPEC.md`
 * already assumed otherwise — §W1-B ships *"per-race castle attack VFX"*, §7.3 lists *"the castle
 * guns"* among the acquisition paths that must learn the word "untargetable", and §11 files
 * *"whether castle attack shapes genuinely diverge"* as a balance question rather than as unbuilt
 * work. Neither §5.2 ("exists and fits") nor §5.3 ("does not exist") mentioned the weapon at all.
 *
 * ## The rulings this obeys
 *
 * ⛔ **NEAREST ENEMY IN RANGE — owner, 2026-09-02, superseding Q4's retaliation-only.** Recorded in
 * full at `CASTLE_FIRE_INTERVAL_TICKS`'s neighbours in `constants.ts`. The practical consequence
 * here is an absence: no attacker ledger, no `lastDamagedByTick`, nothing to serialize.
 *
 * ⛔ **STAT-IDENTICAL FOR EVERY RACE (R94/R117).** Nothing in this file reads `raceId`, and nothing
 * ever may. `castleGuns.test.ts` asserts that as a tripwire, because it is the single constraint most
 * likely to be broken by a well-meaning "just one small bonus" edit.
 *
 * ## Determinism, which is the whole reason this file is shaped the way it is
 *
 * · **No stored timer.** The schedule is `world.tick % interval === seat % interval` — a pure
 *   function of the tick and the seat index. Nothing to serialize, nothing to hash, nothing to
 *   diverge. See the constant's docblock for why a `nextFireTick` on `Player` would have been a
 *   mutable sim input hiding outside the wide oracle.
 * · **Seats are visited in EXPLICIT ID ORDER, never in `players` Map order.** Two castles can be in
 *   range of the same creature on the same tick, and then the order of the two `damageEntity` calls
 *   decides which one gets the kill. Letting Map iteration decide that is exactly how S155 N1 handed
 *   one seat every melee exchange for a whole match.
 * · **Acquisition is a total order**, inherited from `findNearestEnemyCreatureFrom`: squared
 *   distances, then an explicit creature-id compare on an exact tie.
 * · **No `world.effects` push.** A one-shot effect is lost ~5/6 of the time (effects are sampled at
 *   10 Hz, the renderer wipes them at 60). W1-B's per-race VFX re-derives the shot from synced state
 *   instead, which is what the derivable schedule above buys.
 */

import {
  CASTLE_ATK,
  CASTLE_ATTACK_RANGE,
  CASTLE_FIRE_INTERVAL_TICKS,
  CASTLE_PEN,
} from '../constants.ts';
import { attackFifths } from './stats.ts';
import { damageEntity } from './damage.ts';
import { findNearestEnemyCreatureFrom } from './creatures/creatureAI.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import type { World } from './worldTypes.ts';

/** The damage one castle shot deals, in fifths. Exported so tests and the HUD cannot drift from it. */
export function castleShotFifths(): number {
  return attackFifths(CASTLE_ATK, CASTLE_PEN);
}

/**
 * Is THIS seat's castle scheduled to fire on THIS tick? Pure, and exported so a renderer can
 * re-derive the shot for VFX without a wire field (see the file docblock).
 */
export function castleFiresOnTick(seat: number, tick: number): boolean {
  const i = CASTLE_FIRE_INTERVAL_TICKS;
  return tick % i === (((Math.trunc(seat) % i) + i) % i);
}

/**
 * Host-side, once per tick. A no-op outside FIGHT — the weapon arms at BUILD→FIGHT and stands down
 * at FIGHT→BUILD, which falls out of this gate rather than needing two phase-edge hooks.
 *
 * ⚠ A FALLEN CASTLE DOES NOT SHOOT. `castleHp <= 0` means the seat is out; letting it keep firing
 * would make elimination cosmetic.
 */
export function castleGunsTick(world: World): void {
  if (world.matchPhase !== 'FIGHT') return;

  // ⛔ EXPLICIT ID ORDER. See the docblock: `players` Map order must not decide which castle lands a
  // killing blow when two are in range of the same creature on the same tick.
  const seats = [...world.players.keys()].sort(
    (a, b) => (a as unknown as number) - (b as unknown as number),
  );

  const rangeSq = CASTLE_ATTACK_RANGE * CASTLE_ATTACK_RANGE;
  const amount = castleShotFifths();

  for (const playerId of seats) {
    const player = world.players.get(playerId);
    if (player === undefined) continue;
    if (player.castleHp <= 0) continue; // eliminated — see above
    const seat = playerId as unknown as number;
    if (!castleFiresOnTick(seat, world.tick)) continue;

    const from = castleAnchor(seat, world.layout);
    const targetId = findNearestEnemyCreatureFrom(world, from, playerId, rangeSq);
    if (targetId === null) continue;

    // `'defender'` rather than a new source literal: the castle IS a defensive emplacement, and
    // `DamageSource` is attribution-only (`damageEntity` does `void source`), so a new arm would be
    // a wire-adjacent type change for no behaviour.
    damageEntity(world, { kind: 'creature', id: targetId }, amount, 'defender');
  }
}
