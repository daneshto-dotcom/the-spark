/**
 * SPARK — S171 (owner R171-E) — **HEALTH BARS.**
 *
 * The bar is easy to draw and easy to draw *wrong*, and the wrong versions all look fine in a
 * screenshot. Each test below pins one of the four faults the design had to avoid:
 *
 *   1. HIDING AT FULL HEALTH — the defect in the pips this replaces, and literally the owner's
 *      complaint: a healthy Kraken drew nothing, so there was no pool to compare against;
 *   2. COVERING ONLY SOME TYPES — the pips were gated on `GOBLIN_KINDS` and missed three;
 *   3. AN ENCODING THAT INVERTS HIS COMPARISON — see the `sqrt`/absolute-fill test, which is the
 *      one that would have shipped a plausible-looking lie;
 *   4. NOT SCALING — flat pixel sizes tuned on a goblin put a boss's readout inside its chest.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { drawHealthBars } from './healthBar.ts';
import { beginConcealmentFrame } from './concealment.ts';
import { getCreatureConfig, CREATURE_CONFIGS } from '../state/creatures/voltkin-config.ts';
import { unitPoolFifths } from '../state/stats.ts';
import type { CreatureType } from '../state/creatures/creature.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asPlayerId, type CreatureId } from '../types.ts';

/** ⚠ A REAL Vec2, not null: `computeVisionSources` dereferences the cursor whenever fog is
 *  active, so `null` throws rather than meaning "no cursor". Parked far from the fog test's
 *  subject so it contributes no vision there. */
const CURSOR = { x: 200, y: 200 };

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

/** Records `rect(x, y, w, h)` calls so bar geometry can be measured rather than eyeballed. */
class G {
  readonly rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  rect(x: number, y: number, w: number, h: number): this {
    this.rects.push({ x, y, w, h });
    return this;
  }
  fill(): this { return this; }
  stroke(): this { return this; }
  circle(): this { return this; }
  moveTo(): this { return this; }
  lineTo(): this { return this; }
  clear(): this { this.rects.length = 0; return this; }
}

function twoSeat(): World {
  const world = makeWorld(0);
  world.isHost = true;
  world.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  world.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  world.matchPhase = 'FIGHT';
  world.phaseEndsAtTick = world.tick + 1_000_000;
  return world;
}

let spawner = 3000;
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

/** Draw and return the two rects (track, fill) belonging to the single creature on the board. */
function barOf(world: World): { track: { x: number; y: number; w: number; h: number }; fillW: number } {
  const g = new G();
  beginConcealmentFrame(world, CURSOR);
  drawHealthBars(g as never, world);
  expect(g.rects.length, 'a bar is exactly one track plus one fill').toBe(2);
  return { track: g.rects[0]!, fillW: g.rects[1]!.w };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 R171-E — fault 1: it must be visible at FULL health', () => {
  it('⭐⭐ a completely undamaged unit still draws its bar', () => {
    /*
     * THE WHOLE COMPLAINT. The pips this replaces returned early on `remaining >= hpPoints`, so a
     * healthy Kraken drew nothing at all and there was no pool to compare. If this test ever goes
     * red because someone re-added a "no clutter" early-out, that IS the regression.
     */
    const world = twoSeat();
    spawn(world, 't9BossNagas', P1, 500);
    const { track, fillW } = barOf(world);
    expect(track.w).toBeGreaterThan(0);
    expect(fillW, 'full health ⇒ the fill spans the whole track').toBeCloseTo(track.w, 5);
  });

  it('⭐ and it shrinks as damage lands', () => {
    const world = twoSeat();
    const id = spawn(world, 't9BossNagas', P1, 500);
    const full = barOf(world).fillW;
    world.creatures.get(id)!.ehp = Math.floor(world.creatures.get(id)!.ehp / 4);
    const hurt = barOf(world).fillW;
    expect(hurt).toBeLessThan(full);
    expect(barOf(world).track.w, 'the TRACK does not move — only the fill').toBeCloseTo(
      full, 5,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 R171-E — fault 2: EVERY type, not just the goblin family', () => {
  it('⭐⭐ every CreatureType in the table draws a bar', () => {
    // The pips reached 20 of 23. This is the assertion that keeps it at 23 — and it is the same
    // "coverage over the whole table" shape that caught the direwolf drawing nothing.
    for (const type of Object.keys(CREATURE_CONFIGS) as CreatureType[]) {
      const world = twoSeat();
      spawn(world, type, P1, 500);
      const g = new G();
      beginConcealmentFrame(world, CURSOR);
      drawHealthBars(g as never, world);
      expect(g.rects.length, `${type} must draw a health bar`).toBe(2);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 R171-E — fault 3: the encoding must not invert his own comparison', () => {
  it('⭐⭐ THE ASK: a healthy boss reads as visibly more health than a healthy chewer', () => {
    const boss = twoSeat();
    spawn(boss, 't9BossNagas', P1, 500);
    const chewer = twoSeat();
    spawn(chewer, 'chewer', P1, 500);
    expect(
      barOf(boss).track.w,
      '"how the fuck do I know if your Kraken has so much more health" — this is the answer',
    ).toBeGreaterThan(barOf(chewer).track.w * 1.8);
  });

  it('⭐⭐ AND FILLS ARE COMPARABLE ACROSS UNITS — the trap in the obvious version', () => {
    /*
     * ⛔ THE BUG THIS PREVENTS, spelled out because it would have looked completely fine:
     * if the track is sized by MAX and then filled by a PERCENTAGE, a Kraken at ~10 % draws a
     * shorter fill than a healthy goblin — even though 10 % of 132 fifths is 13 and the goblin's
     * whole pool is 7-16. The picture would say the goblin is tougher when they are comparable.
     *
     * Filling in the same absolute units the track uses keeps it honest: equal remaining pools
     * draw equal fills, whatever unit they belong to.
     */
    const goblinPool = unitPoolFifths(
      getCreatureConfig('goblinMelee').hp,
      getCreatureConfig('goblinMelee').def,
    );

    const boss = twoSeat();
    const bossId = spawn(boss, 't9BossNagas', P1, 500);
    boss.creatures.get(bossId)!.ehp = goblinPool; // a boss worn down to a goblin's worth of health

    const goblin = twoSeat();
    spawn(goblin, 'goblinMelee', P1, 500);

    expect(
      barOf(boss).fillW,
      'equal remaining pools must draw equal fills, regardless of who owns them',
    ).toBeCloseTo(barOf(goblin).fillW, 5);
  });

  it('⛔ the fill can never exceed its own track', () => {
    // `span()` has a floor, so without the clamp a nearly-dead unit draws a fill LONGER than its
    // track — which reads as overheal and is impossible in this game.
    const world = twoSeat();
    const id = spawn(world, 'chewer', P1, 500);
    world.creatures.get(id)!.ehp = 1;
    const { track, fillW } = barOf(world);
    expect(fillW).toBeLessThanOrEqual(track.w);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 R171-E — fault 4: it scales, and it stays THIN', () => {
  it('⭐ a boss bar is thicker than a chewer bar — "the big Kraken will have a big health bar"', () => {
    const boss = twoSeat();
    spawn(boss, 't9BossNagas', P1, 500);
    const chewer = twoSeat();
    spawn(chewer, 'chewer', P1, 500);
    expect(barOf(boss).track.h).toBeGreaterThan(barOf(chewer).track.h);
  });

  it('⛔ but REALLY THIN is the requirement, and it holds even on a boss', () => {
    // He said "really thin" twice. A bar that grew into a slab on the biggest unit would satisfy
    // the scaling sentence and break the emphatic one.
    const world = twoSeat();
    spawn(world, 't9BossNagas', P1, 500);
    expect(barOf(world).track.h).toBeLessThan(5);
  });

  it('⭐ the bar sits ABOVE the unit, and higher above a bigger one', () => {
    const boss = twoSeat();
    spawn(boss, 't9BossNagas', P1, 500, 500);
    const chewer = twoSeat();
    spawn(chewer, 'chewer', P1, 500, 500);
    const bossY = barOf(boss).track;
    const chewerY = barOf(chewer).track;
    expect(bossY.y).toBeLessThan(500);            // above the feet
    expect(bossY.y).toBeLessThan(chewerY.y); // and clear of a taller sprite
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 R171-E — it must not leak position through the fog', () => {
  it('⛔ a CONCEALED enemy draws no bar', () => {
    /*
     * A 60 px bar floating over blackness is a bigger tell than the sprite it belongs to — the same
     * leak the boss auras had to fix in S170. Fog is BUILD-only, so that is the phase under test.
     */
    /*
     * ⚠ THE FIXTURE HAS THREE PRECONDITIONS AND MISSING ANY ONE PASSES THE TEST FOR THE WRONG
     * REASON. `fogActive` is `isNetworked(world) && gameState === 'PLAYING' && matchPhase ===
     * 'BUILD'` (fog is BUILD-only, owner R62), and `beginConcealmentFrame` reads `localPlayerId` to
     * know whose side you are on. My first draft set only the phase, so the fog was inert and two
     * rects were drawn — which looked like a leak in the renderer and was a hole in the fixture.
     */
    const world = twoSeat();
    world.gameMode = '1v1';
    world.gameState = 'PLAYING';
    world.matchPhase = 'BUILD';
    world.localPlayerId = P0;
    spawn(world, 't9BossNagas', P1, 4000, 4000); // far from anything of P0's
    const g = new G();
    beginConcealmentFrame(world, CURSOR);
    drawHealthBars(g as never, world);
    expect(g.rects.length, 'nothing may be drawn for an enemy you cannot see').toBe(0);
  });
});
