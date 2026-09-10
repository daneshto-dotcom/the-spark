/**
 * SPARK — S171 (owner R142, R171-A/B/C) — **THE RA RITUAL: FIVE COLUMNS, AND THEN HE DIES.**
 *
 * > *"he can summon the god RA to bring down columns of burning light (he is the god of sun
 * > afterall) that attacks with upto 15 atk and 15 pen per culumn. each column only lasts 2 sec
 * > cinematic and he launches like 5 of them one after another. he does that right before he dies -
 * > when he hits 1hp or about to die he stops does a cool attack form / ritual calling down the
 * > colums. he cant be killed while he is doing that but when the ultimate attack is finished then
 * > he dies."*
 *
 * ## THE STATE IS ONE OPTIONAL NUMBER, AND EVERYTHING ELSE IS DERIVED
 *
 * `raRitualUntilTick` is the only thing stored. From it:
 *   · **is he channelling?**   `tick < raRitualUntilTick`            (`isChannellingRa`)
 *   · **when did it start?**   `raRitualUntilTick - RA_RITUAL_TICKS`
 *   · **which column is up?**  `floor(elapsed / RA_COLUMN_TICKS)`
 *   · **where does it land?**  an integer hash of `(bossId, columnIndex)` around a boss who cannot
 *                              move, because he is mid-ritual
 *
 * ⛔ SO THERE IS NO SECOND FIELD, NO LEDGER AND NO PER-COLUMN BOOKKEEPING TO DESYNC. That is not
 * tidiness — it is the same discipline the Kraken's sonar earned its keep on: a host and a peer
 * reconstruct the identical five circles from one synced number, and a mid-ritual host migration can
 * neither skip a column nor fire one twice.
 *
 * ## WHERE THE COLUMNS FALL, AND WHY NOT ON PEOPLE
 *
 * R171-B describes a telegraph: *"it starts, like, a little shaded area, and it gets bigger and
 * bigger, and then it lands and kills everything in that circle that it lands on."* A telegraph is a
 * PROMISE — the circle you see is where it will hit. A column aimed at a unit would have to commit
 * its landing spot the moment the telegraph opens (or the promise is a lie), and committing five
 * positions means putting five of them on the wire.
 *
 * Falling in a deterministic ring around the Pharaoh costs nothing, keeps the promise exactly, and
 * reads correctly: Ra brings the sun down around his priest. The player's counterplay is to MOVE,
 * which is what the two-second telegraph is for.
 */

import {
  RA_COLUMN_ATK,
  RA_COLUMN_COUNT,
  RA_COLUMN_PEN,
  RA_COLUMN_RADIUS,
  RA_COLUMN_SPREAD,
  RA_COLUMN_TICKS,
  RA_RITUAL_TICKS,
} from '../constants.ts';
import { liveIdsOfType } from './bossSkills.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import { isChannellingRa } from './creatures/creature.ts';
import { removeCreature } from './creatures/creatureLifecycle.ts';
import { applyRadialDamage } from './damage.ts';
import { attackFifths, primitiveDamageForAtk } from './stats.ts';
import type { World } from './world.ts';

/**
 * ⭐ PURE — where column `k` of this boss's ritual lands.
 *
 * Exported so the RENDERER draws its telegraph at exactly the position the SIM will damage, from the
 * same function rather than from a re-implementation. A telegraph drawn a few pixels off the impact
 * is a lie the player learns not to trust, and two hand-written copies of one formula is how they
 * drift apart.
 *
 * Deterministic by construction: an integer hash of `(k, bossId)` — the same
 * `(k * 2654435761 + id * 40503) >>> 0` idiom the rot aura and the locust swarm use — and
 * `Math.round` on the way out, so both peers land on identical integers.
 */
export function raColumnPos(
  bossId: number,
  k: number,
  bossX: number,
  bossY: number,
): { x: number; y: number } {
  const h = (k * 2654435761 + bossId * 40503) >>> 0;
  const ang = ((h % 628) / 100);
  // `sqrt` keeps the five landings spread over the DISC rather than clustered at the centre — the
  // same correction the rot aura's bubbles needed, for the same reason.
  const dist = Math.sqrt(((h >>> 9) % 1000) / 1000) * RA_COLUMN_SPREAD;
  return {
    x: bossX + Math.round(Math.cos(ang) * dist),
    // Squashed vertically: the board is seen at an angle, matching every other ground effect.
    y: bossY + Math.round(Math.sin(ang) * dist * 0.62),
  };
}

/** The tick column `k` lands on, given when the ritual ends. */
export function raColumnImpactTick(raRitualUntilTick: number, k: number): number {
  return raRitualUntilTick - RA_RITUAL_TICKS + (k + 1) * RA_COLUMN_TICKS;
}

/**
 * ⭐⭐ **THE RITUAL.** Host-only. Lands whichever column is due this tick, and kills him when the
 * channel runs out.
 *
 * ⚠ NO CADENCE GUARD AND NO PHASE-SPREAD HERE, unlike every other boss runner — deliberately. The
 * other skills fire on a repeating clock and must not sync up across two bosses; this one runs off
 * an absolute per-boss deadline that was stamped when that boss died, so two Pharaohs are already
 * out of phase by construction unless they died on the very same tick, in which case they SHOULD
 * both be mid-ritual.
 */
export function runPharaohRitual(world: World): void {
  if (world.gameState !== 'PLAYING') return;

  for (const bossId of liveIdsOfType(world, T9_BOSS_TYPE.mummies)) {
    const boss = world.creatures.get(bossId);
    if (boss === undefined) continue;
    const until = boss.raRitualUntilTick;
    if (until === undefined) continue; // never entered the ritual

    /*
     * Which column, if any, lands on THIS tick. Derived, not counted: `elapsed` is a pure function
     * of the stored deadline and the current tick, so nothing has to be remembered between columns
     * and a snapshot applied mid-ritual resumes on the correct one.
     */
    const start = until - RA_RITUAL_TICKS;
    const elapsed = world.tick - start;
    const onColumnTick = elapsed > 0 && elapsed % RA_COLUMN_TICKS === 0;
    const k = onColumnTick ? elapsed / RA_COLUMN_TICKS - 1 : -1;

    /*
     * ⛔⛔ COLUMNS FIRE **BEFORE** THE DEATH CHECK, AND THE FIRST DRAFT HAD IT THE OTHER WAY ROUND.
     *
     * The fifth column lands on `until` — the very tick the channel expires — because five 2-second
     * columns fill the ritual exactly. `isChannellingRa` is `tick < until`, so on that tick he is no
     * longer channelling: an ordering that checked death first removed him and **swallowed his last
     * column entirely**. The ultimate would have been four columns and a corpse.
     *
     * Caught by the "exactly FIVE columns land" test, which is precisely why that test counts them
     * against real victims standing on each landing spot rather than counting calls. A weaker
     * assertion — "some columns landed", or a spy on `applyRadialDamage` — would have been green on
     * four.
     *
     * *"when the ultimate attack is finished then he dies"*: the attack finishes, and THEN he dies.
     * That is the owner's sentence in its literal order, and it is the order of these two blocks.
     */
    if (k >= 0 && k < RA_COLUMN_COUNT) {
      const pos = raColumnPos(bossId as unknown as number, k, boss.pos.x, boss.pos.y);
    /*
     * *"kills everything in that circle that it lands on."* — EVERYTHING, so no player is spared.
     * `sparePlayerId: null` is the same posture the zombie death blast takes, and it is his ruling
     * rather than my choice: a column of divine fire does not check whose banner you carry.
     *
     * `attackFifths(15,15)` = 300 fifths, which is more than double the largest pool in the game.
     */
      applyRadialDamage(
        world,
        pos.x,
        pos.y,
        RA_COLUMN_RADIUS,
        primitiveDamageForAtk(RA_COLUMN_ATK),
        attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN),
        'aura',
        null,
      );
    }

    /*
     * ⭐ THE END OF THE RITUAL IS THE DEATH. *"when the ultimate attack is finished then he dies."*
     *
     * ⚠ AND IT GOES THROUGH `removeCreature` LIKE EVERY OTHER REMOVAL. `isChannellingRa` is already
     * false on this tick (the deadline has passed), so the chokepoint lets him through — which is
     * exactly the behaviour wanted, and is why the guard is a predicate on TIME rather than a flag
     * somebody has to remember to clear. Nothing anywhere has to "end" the ritual.
     */
    if (!isChannellingRa(boss, world.tick)) removeCreature(world, bossId);
  }
}
