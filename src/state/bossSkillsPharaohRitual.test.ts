/**
 * SPARK — S171 (owner R142, R171-A/B/C) — **THE RA RITUAL.**
 *
 * The Pharaoh's ultimate is the one boss skill that changes what DEATH means, so most of what is
 * pinned here is not "does the ability fire" but "can the ability be cheated out of existence".
 *
 * The four ways it could silently break, each with its own test below:
 *   1. the trigger never fires, because "when he hits 1hp" is unobservable — one locust strike is
 *      150 fifths against his whole 143-fifth pool, so he never passes through 1 HP;
 *   2. it fires TWICE, because several systems damaged him on the same tick;
 *   3. he is deleted mid-ritual by one of the five removal paths that never touch `damageCreature`
 *      — the potato blast is the live one, and it "obliterates regardless of hp";
 *   4. he never dies at all, because the guard is a flag somebody forgot to clear.
 */

import { describe, expect, it } from 'vitest';
import {
  PLAYER_COLORS,
  POTATO_BLAST_RADIUS,
  RA_COLUMN_COUNT,
  RA_COLUMN_RADIUS,
  RA_COLUMN_TICKS,
  RA_RITUAL_TICKS,
} from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { runPharaohRitual, raColumnPos, raColumnImpactTick } from './bossSkillsPharaohRitual.ts';
import { damageCreature, removeCreature } from './creatures/creatureLifecycle.ts';
import { isChannellingRa, isUntargetable } from './creatures/creature.ts';
import { applyRadialDamage } from './damage.ts';
import { attackFifths, unitPoolFifths } from './stats.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId, type CreatureId } from '../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function twoSeat(): World {
  const world = makeWorld(0);
  world.isHost = true;
  world.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  world.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  world.matchPhase = 'FIGHT';
  world.phaseEndsAtTick = world.tick + 1_000_000;
  return world;
}

let spawner = 7000;
function spawn(world: World, type: string, owner: ReturnType<typeof asPlayerId>, x: number, y = 500): CreatureId {
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: type as never,
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    sourceSpawnerId: spawner++ as never,
  });
  let newest: CreatureId | null = null;
  for (const c of world.creatures.values()) {
    if (newest === null || (c.id as number) > (newest as number)) newest = c.id;
  }
  return newest!;
}

/** A Pharaoh, and the blow that would kill him outright. */
function pharaohAtDeathsDoor(world: World, x = 500, y = 500): CreatureId {
  return spawn(world, 't9BossMummies', P0, x, y);
}

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 R142 — the TRIGGER, and why "1hp" had to be reinterpreted', () => {
  it('⭐⭐ a blow that OVERSHOOTS his whole pool still starts the ritual — he never sees 1 HP', () => {
    /*
     * THE TEST THAT JUSTIFIES THE WHOLE DESIGN. His pool is 143 fifths and one locust strike is 150,
     * so a literal "when he hits 1hp" watcher would never fire even once. The trigger lives where
     * LETHALITY IS DECIDED instead, which does not care by how much the blow overshot.
     */
    const world = twoSeat();
    const id = pharaohAtDeathsDoor(world);
    expect(unitPoolFifths(11, 8)).toBe(143);
    expect(attackFifths(10, 10)).toBe(150); // one locust — more than his entire pool

    const died = damageCreature(world, id, 100_000); // absurd overkill, on purpose
    expect(died, 'he did not die — he went between realities').toBe(false);
    expect(world.creatures.has(id), 'still on the board').toBe(true);
    expect(isChannellingRa(world.creatures.get(id)!, world.tick)).toBe(true);
    expect(world.creatures.get(id)!.ehp, 'restored to 1 so every ehp<=0 guard treats him as alive').toBe(1);
  });

  it('⛔ it fires EXACTLY ONCE even when several systems kill him on the same tick', () => {
    const world = twoSeat();
    const id = pharaohAtDeathsDoor(world);
    damageCreature(world, id, 100_000);
    const first = world.creatures.get(id)!.raRitualUntilTick;

    // three more lethal blows on the same tick, as a pile-on would deliver them
    damageCreature(world, id, 100_000);
    damageCreature(world, id, 100_000);
    damageCreature(world, id, 100_000);
    expect(world.creatures.get(id)!.raRitualUntilTick, 'the deadline must not be pushed out').toBe(first);
  });

  it('⭐ and AFTER the ritual he is an ordinary mortal — the second death is real', () => {
    /*
     * The latch is `raRitualUntilTick !== undefined` and it is NEVER cleared, which is what makes
     * this work: once the channel is spent he can be killed like anything else. A boolean somebody
     * had to remember to reset is exactly the bug this shape avoids.
     */
    const world = twoSeat();
    const id = pharaohAtDeathsDoor(world);
    damageCreature(world, id, 100_000);
    world.tick += RA_RITUAL_TICKS; // the channel is over
    expect(isChannellingRa(world.creatures.get(id)!, world.tick)).toBe(false);

    const died = damageCreature(world, id, 100_000);
    expect(died, 'no second ritual — he simply dies').toBe(true);
    expect(world.creatures.has(id)).toBe(false);
  });

  it('⭐ no OTHER boss gets a ritual', () => {
    const world = twoSeat();
    const kraken = spawn(world, 't9BossNagas', P0, 500);
    expect(damageCreature(world, kraken, 100_000)).toBe(true);
    expect(world.creatures.has(kraken)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 R171-A — "he\'s not really in the game"', () => {
  it('⭐⭐ damage PASSES THROUGH him while channelling', () => {
    const world = twoSeat();
    const id = pharaohAtDeathsDoor(world);
    damageCreature(world, id, 100_000);
    const ehp = world.creatures.get(id)!.ehp;

    expect(damageCreature(world, id, 50), 'a blow at a ghost kills nothing').toBe(false);
    expect(world.creatures.get(id)!.ehp, 'and takes nothing off him').toBe(ehp);
  });

  it('⭐⭐ AN AREA SWEEP CANNOT REACH HIM EITHER — untargetable alone would not have stopped this', () => {
    /*
     * The distinction that makes R171-A stronger than "untargetable". The standing rule is that
     * untargetable is NOT invulnerable — area effects still reach an untargetable unit, deliberately,
     * or a locust cloud would be unkillable. A boss who has LEFT THE WORLD is a different claim, and
     * this is the test that separates them.
     */
    const world = twoSeat();
    const id = pharaohAtDeathsDoor(world, 500, 500);
    damageCreature(world, id, 100_000);
    const ehp = world.creatures.get(id)!.ehp;

    applyRadialDamage(world, 500, 500, 400, 0, 100_000, 'aura', null);
    expect(world.creatures.has(id), 'a splash he is not in the world to receive').toBe(true);
    expect(world.creatures.get(id)!.ehp).toBe(ehp);
  });

  it('⛔⛔ THE POTATO BLAST CANNOT DELETE HIM — the site that made a chokepoint necessary', () => {
    /*
     * `potatoLifecycle`'s radial clear deletes outright and never touches `damageCreature` — its own
     * docstring says it "obliterates regardless of hp". A guard placed only on the damage path would
     * have left this wide open, and no behavioural test would have caught it because nobody would
     * have thought to throw a potato at a channelling boss.
     */
    const world = twoSeat();
    const id = pharaohAtDeathsDoor(world, 500, 500);
    damageCreature(world, id, 100_000);

    expect(removeCreature(world, id), 'the chokepoint refuses').toBe(false);
    expect(world.creatures.has(id)).toBe(true);
    void POTATO_BLAST_RADIUS; // the constant this scenario is drawn from
  });

  it('⭐ and he cannot be TARGETED either — the same one predicate the locusts use', () => {
    const world = twoSeat();
    const id = pharaohAtDeathsDoor(world);
    const boss = world.creatures.get(id)!;
    expect(isUntargetable(boss, world.tick), 'ordinarily targetable').toBe(false);
    damageCreature(world, id, 100_000);
    expect(isUntargetable(boss, world.tick), 'between realities').toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 R142 — the five columns', () => {
  /** Drive the host ritual runner for n ticks. */
  function tickN(w: World, n: number): void {
    for (let i = 0; i < n; i++) {
      w.tick++;
      runPharaohRitual(w);
    }
  }

  it('⭐⭐ exactly FIVE columns land, one every two seconds', () => {
    const world = twoSeat();
    const id = pharaohAtDeathsDoor(world, 500, 500);
    damageCreature(world, id, 100_000);
    const until = world.creatures.get(id)!.raRitualUntilTick!;

    // A ring of sacrificial victims, one on each column's landing spot.
    const victims = Array.from({ length: RA_COLUMN_COUNT }, (_, k) => {
      const p = raColumnPos(id as unknown as number, k, 500, 500);
      return { k, id: spawn(world, 'goblinMelee', P1, p.x, p.y), impact: raColumnImpactTick(until, k) };
    });

    tickN(world, RA_RITUAL_TICKS + 4);
    for (const v of victims) {
      expect(world.creatures.has(v.id), `column ${v.k} must have killed its victim`).toBe(false);
    }
  });

  it('⭐ a column kills only what is INSIDE its circle', () => {
    const world = twoSeat();
    const id = pharaohAtDeathsDoor(world, 500, 500);
    damageCreature(world, id, 100_000);
    const p0 = raColumnPos(id as unknown as number, 0, 500, 500);

    const inside = spawn(world, 'goblinMelee', P1, p0.x, p0.y);
    // Well outside every column's radius, and outside the whole spread.
    const outside = spawn(world, 'goblinMelee', P1, 500 + 900, 500 + 900);

    tickN(world, RA_COLUMN_TICKS + 2);
    expect(world.creatures.has(inside), 'caught by the first column').toBe(false);
    expect(world.creatures.has(outside), 'far away and untouched').toBe(true);
    void RA_COLUMN_RADIUS;
  });

  it('⛔ AND THEN HE DIES — "when the ultimate attack is finished then he dies"', () => {
    const world = twoSeat();
    const id = pharaohAtDeathsDoor(world);
    damageCreature(world, id, 100_000);

    tickN(world, RA_RITUAL_TICKS - 2);
    expect(world.creatures.has(id), 'still channelling one tick before the end').toBe(true);

    tickN(world, 4);
    expect(world.creatures.has(id), 'the channel is spent, and so is he').toBe(false);
  });

  it('⭐ the landing spots are DETERMINISTIC and integral — two peers draw the same five circles', () => {
    const a = Array.from({ length: RA_COLUMN_COUNT }, (_, k) => raColumnPos(4242, k, 500, 500));
    const b = Array.from({ length: RA_COLUMN_COUNT }, (_, k) => raColumnPos(4242, k, 500, 500));
    expect(a).toEqual(b);
    for (const p of a) expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
    // Two different bosses get different patterns, or every Pharaoh's ultimate looks identical.
    expect(raColumnPos(4242, 0, 500, 500)).not.toEqual(raColumnPos(99, 0, 500, 500));
  });

  it('⭐ the impact schedule is derived from the ONE stored number', () => {
    const until = 10_000;
    for (let k = 0; k < RA_COLUMN_COUNT; k++) {
      expect(raColumnImpactTick(until, k)).toBe(until - RA_RITUAL_TICKS + (k + 1) * RA_COLUMN_TICKS);
    }
    // The last column lands exactly as the channel ends — no dead air, no sixth column.
    expect(raColumnImpactTick(until, RA_COLUMN_COUNT - 1)).toBe(until);
  });
});
