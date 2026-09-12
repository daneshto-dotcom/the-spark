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

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KEEP_H, PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { BAR_LIFT, drawHealthBars } from './healthBar.ts';
import { castleBarTopY } from './gathererRenderer.ts';
import { CASTLE_SPRITE_PX } from './castleFrames.ts';
import { beginConcealmentFrame } from './concealment.ts';
import { getCreatureConfig, CREATURE_CONFIGS } from '../state/creatures/voltkin-config.ts';
import { structureDefenceFifths, unitPoolFifths } from '../state/stats.ts';
import { T3_TOWER_SPRITE_PX, T9_TOWER_SPRITE_PX } from './towerFrames.ts';
import { attackFifths, connectorCapacityFifths } from '../state/stats.ts';
import { CHEWER_ATK, CHEWER_PEN } from '../constants.ts';
import type { CreatureType } from '../state/creatures/creature.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import {
  asBondId,
  asPlayerId,
  asPrimitiveId,
  asSpawnerId,
  type BondId,
  type CreatureId,
  type PlayerId,
  type PrimitiveId,
} from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Bond } from '../physics/bonds.ts';

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

  it('⛔ SUPERSEDED S172 — the fill is a FRACTION now, and cross-unit compare moved to the track', () => {
    /*
     * ⛔⛔ THIS TEST USED TO ASSERT THE OPPOSITE, AND THE PROPERTY IT ASSERTED IS WHY THE BAR WAS
     * BROKEN. It required "equal remaining pools draw equal fills, whatever unit they belong to" —
     * an ABSOLUTE fill, sized by the same `span()` as the track. Two consequences followed:
     *   · `span()`'s 9 px floor bound the FILL as well as the track, so every unit with a pool
     *     ≤ 7.01 fifths drew a permanently full bar — six unit types, frozen;
     *   · and where it did move, the sqrt made half health draw 71 % of the track.
     * The owner played it and said: *"they don't seem to decrease. The creatures just die ... Now
     * it's just a freaking artistic thing. It doesn't really have a function."*
     *
     * ⭐ WHOSE RULE WAS IT. Not his. The sibling test above quotes him — *"how the fuck do I know
     * if your Kraken has so much more health"* — but that sentence is about the TRACK, which is
     * unchanged and still sqrt-scaled by max pool. Absolute-fill was an S171 inference with no
     * ruling behind it. He approved the replacement directly in the S172 batch PDR: *"the fill
     * becomes honest, so 50 % health draws a 50 % bar instead of 71 %"*.
     *
     * ⭐ AND THE PROPERTY IT PROTECTED IS NOT LOST, IT MOVED. Comparing two units' REMAINING health
     * is now the job of the floating damage numbers (S172 P3), which print the real fifths. The bar
     * answers "how much of ITS OWN health does this creature have left", which is what he asked a
     * health bar to do. The track still answers "who has the bigger pool".
     */
    const goblinPool = unitPoolFifths(
      getCreatureConfig('goblinMelee').hp,
      getCreatureConfig('goblinMelee').def,
    );

    const boss = twoSeat();
    const bossId = spawn(boss, 't9BossNagas', P1, 500);
    boss.creatures.get(bossId)!.ehp = goblinPool; // a boss worn down to a goblin's worth of health
    const bossBar = barOf(boss);

    const goblin = twoSeat();
    spawn(goblin, 'goblinMelee', P1, 500);
    const goblinBar = barOf(goblin);

    // The boss is nearly dead and the goblin is untouched, so the FRACTIONS must say exactly that.
    expect(bossBar.fillW / bossBar.track.w, 'a boss on its last legs reads as nearly empty')
      .toBeLessThan(0.15);
    expect(goblinBar.fillW / goblinBar.track.w, 'an untouched goblin reads as full')
      .toBeCloseTo(1, 5);
    // ⭐ The cross-unit signal that DOES survive, and the one he actually asked for.
    expect(bossBar.track.w, 'the boss still owns the longer track')
      .toBeGreaterThan(goblinBar.track.w);
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

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 R171-E (2nd pass) — above the head, and as wide as the creature', () => {
  /** Draw with a supplied sprite box, the way the goblin renderer does in production. */
  function barWithSprite(world: World, w: number, h: number) {
    const g = new G();
    beginConcealmentFrame(world, CURSOR);
    drawHealthBars(g as never, world, () => ({ w, h }));
    expect(g.rects.length).toBe(2);
    return { track: g.rects[0]!, fillW: g.rects[1]!.w };
  }

  it('⭐⭐ the bar is AT LEAST as wide as the creature it labels', () => {
    // *"make them longer (at least the length of the creatures width that it represents)"*.
    const world = twoSeat();
    spawn(world, 'chewer', P1, 500, 500); // a tiny pool, so the pool-derived length is the floor
    const wide = barWithSprite(world, 120, 40);
    expect(wide.track.w, 'a 120px creature must not wear a 9px bar').toBeGreaterThanOrEqual(120);
  });

  it('⭐⭐ it sits ABOVE the sprite, not on it', () => {
    /*
     * The owner's screenshot showed a bar drawn across a creature's body. Sprites are FOOT-anchored,
     * so the top of a creature standing at y is `y - spriteHeight` — a flat lift lands inside
     * anything taller than the number it was tuned against.
     */
    const world = twoSeat();
    spawn(world, 'chewer', P1, 500, 500);
    const SPRITE_H = 80;
    const bar = barWithSprite(world, 60, SPRITE_H);
    expect(bar.track.y, 'must clear the top of an 80px sprite standing at y=500')
      .toBeLessThan(500 - SPRITE_H);
  });

  it('⭐ a taller creature pushes its bar higher', () => {
    const world = twoSeat();
    spawn(world, 'chewer', P1, 500, 500);
    expect(barWithSprite(world, 60, 140).track.y).toBeLessThan(barWithSprite(world, 60, 40).track.y);
  });

  it('⛔ widening to the sprite does NOT make a healthy unit look damaged', () => {
    /*
     * The trap in "just make the track longer": if the TRACK grows to the sprite while the FILL
     * keeps its pool-derived length, every wide creature reads as permanently half-dead. Both are
     * scaled by the same factor, so full health still fills the whole track.
     */
    const world = twoSeat();
    spawn(world, 'chewer', P1, 500, 500);
    const bar = barWithSprite(world, 200, 40);
    expect(bar.fillW, 'undamaged ⇒ the fill spans the whole widened track').toBeCloseTo(bar.track.w, 5);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('S172 (owner) — fault 5: THE FILL MUST ACTUALLY MOVE, ON EVERY UNIT', () => {
  /*
   * ⛔ THE TEST THAT WAS MISSING, AND WHY ITS ABSENCE SHIPPED A COSMETIC BAR.
   *
   * S171 had exactly one shrink assertion — "and it shrinks as damage lands" — and it spawned a
   * `t9BossNagas`, whose 132-fifth pool sits 19× above the `BAR_MIN_W` floor. It passed. Meanwhile
   * every unit BELOW the floor (pool ≤ 7.01 fifths) drew a fill pinned to its own track at all
   * health levels, and the owner watched six unit types die behind a bar that never moved:
   * *"they don't seem to decrease. The creatures just die."*
   *
   * The companion coverage test ("every CreatureType draws a bar") could not catch it either,
   * because it only asserts a bar EXISTS. Existence was never the defect.
   *
   * ⭐ So the rule this file now enforces is the one the feature is actually for: not "a bar is
   * drawn", but "the bar RESPONDS", for every type in the table.
   */
  const ALL = Object.keys(CREATURE_CONFIGS) as CreatureType[];

  it('⭐⭐ THE OWNER COMPLAINT: a damaged unit draws a strictly shorter fill — every type', () => {
    for (const type of ALL) {
      const world = twoSeat();
      const id = spawn(world, type, P1, 500);
      const full = barOf(world).fillW;
      const c = world.creatures.get(id)!;
      c.ehp = Math.max(1, Math.floor(c.ehp / 2));
      expect(barOf(world).fillW, `${type}: the fill must shrink when the unit is damaged`)
        .toBeLessThan(full);
    }
  });

  it('⭐⭐ and it is PROPORTIONAL — half the pool is half the bar, on every type', () => {
    /*
     * The `sqrt` that used to size the fill made half health draw 71 % of the track and a tenth
     * draw 32 %. A readout that under-reports damage by that much is a decoration, which is the
     * owner's other word for what he was looking at. LINEAR, or it is not a readout.
     */
    for (const type of ALL) {
      const cfg = getCreatureConfig(type);
      const max = unitPoolFifths(cfg.hp, cfg.def);
      for (const frac of [0.75, 0.5, 0.25]) {
        const world = twoSeat();
        const id = spawn(world, type, P1, 500);
        world.creatures.get(id)!.ehp = Math.round(max * frac);
        const bar = barOf(world);
        expect(bar.fillW / bar.track.w, `${type} at ${frac * 100}% pool`)
          .toBeCloseTo(Math.round(max * frac) / max, 2);
      }
    }
  });

  it('⛔ THE SIX THAT WERE FROZEN — named, because they are the ones he watched', () => {
    /*
     * Every one of these has a whole pool at or under the 7.01-fifth threshold where the old
     * `span()` floor bound BOTH the track and the fill to 9 px. They are also the most numerous
     * units in the game, which is why the defect was so visible in play.
     */
    for (const type of ['goblinMelee', 'goblinHound', 'goblinArcher', 'raceUnit', 'locustCloud', 'chewer'] as CreatureType[]) {
      const cfg = getCreatureConfig(type);
      const world = twoSeat();
      const id = spawn(world, type, P1, 500);
      const full = barOf(world).fillW;
      world.creatures.get(id)!.ehp = 1;
      const nearlyDead = barOf(world).fillW;
      expect(nearlyDead, `${type} (pool ${unitPoolFifths(cfg.hp, cfg.def)}) must not draw a full bar at 1 fifth`)
        .toBeLessThan(full * 0.5);
    }
  });

  it('⭐ the TRACK still encodes max pool — the sqrt survives where it belongs', () => {
    /*
     * The fix must not cost the property the sqrt was there for. Owner R171-E: *"the big Kraken
     * will have a big health bar"*. LENGTH is still the cross-unit comparison; only the FILL
     * changed. A boss's track stays visibly longer than a chewer's.
     */
    const boss = twoSeat();
    spawn(boss, 't9BossNagas', P1, 500);
    const chewer = twoSeat();
    spawn(chewer, 'chewer', P1, 500);
    expect(barOf(boss).track.w, 'a boss track is longer than a chewer track')
      .toBeGreaterThan(barOf(chewer).track.w);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('S172 (owner) — fault 6: A BAR DRAWN INSIDE THE CREATURE IS A BAR HE CANNOT SEE', () => {
  /*
   * ⛔ THE SECOND HALF OF THE OWNER'S COMPLAINT, AND THE HALF THE FILL FIX DID NOT TOUCH.
   * *"Vlad died without his health going down. I think none of them, their health bars move."*
   * Vlad takes ~30 s to die, so his pool WAS draining and the fill WAS correct. The bar was
   * simply drawn in the wrong place.
   *
   * `drawHealthBars` is called from GoblinRenderer and was handed GoblinRenderer.sprites as its
   * only size lookup — a map populated behind `if (!GOBLIN_KINDS.has(c.type)) continue`. Every
   * boss, tier-3 unit, Voltkin, direwolf and chewer therefore measured `null`, fell back to
   * FALLBACK_SPRITE_H = 26, and on a large sprite the bar landed INSIDE THE BODY.
   *
   * ⭐ These are SOURCE-TEXT assertions on purpose. The defect was a missing WIRE between two
   * renderers, not arithmetic — no unit test of healthBar.ts could ever have caught it, which is
   * exactly why it survived S171's second pass. What must stay true is that the wire exists.
   */
  const read = (rel: string): string =>
    readFileSync(new URL(rel, import.meta.url), 'utf8');

  it('⛔⛔ main.ts WIRES CreatureRenderer into the health-bar size lookup', () => {
    expect(
      read('../main.ts'),
      'without this line every non-goblin bar is drawn at the 26 px fallback, inside the sprite',
    ).toMatch(/goblinRenderer\.setExtraSpriteBox\(/);
  });

  it('⭐ CreatureRenderer exposes the measured box the lookup needs', () => {
    expect(read('./creatureRenderer.ts')).toMatch(/spriteBoxOf\(id: CreatureId\)/);
  });

  it('⭐ and GoblinRenderer actually FALLS THROUGH to it rather than returning null', () => {
    expect(read('./goblinRenderer.ts')).toMatch(/this\.extraSpriteBox\?\.\(id\)/);
  });

  it('⭐⭐ a measured sprite lifts the bar clear of it — the fallback would not', () => {
    // A boss-sized 120 px sprite must push the bar far above where the 26 px fallback puts it.
    const world = twoSeat();
    spawn(world, 't9BossNagas', P1, 500, 500);
    const g = new G();
    beginConcealmentFrame(world, CURSOR);
    drawHealthBars(g as never, world, () => ({ w: 90, h: 120 }));
    const measured = g.rects[0]!.y;
    const g2 = new G();
    beginConcealmentFrame(world, CURSOR);
    drawHealthBars(g2 as never, world, () => null); // the pre-S172 behaviour
    expect(measured, 'the measured box must sit HIGHER (smaller y) than the fallback')
      .toBeLessThan(g2.rects[0]!.y);
    expect(g.rects[0]!.w, 'and at least as wide as the sprite').toBeGreaterThanOrEqual(90);
  });
});
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⭐⭐ S173 (owner) — **TOWER HEALTH BARS, DERIVED FROM THE CONNECTORS.**
 *
 * > *"all towers should have health bars ... we should know how much health they have and how much
 * > they take before they get destroyed, before their first connector dies."*
 *
 * The S172 session shipped Helga's bar and left towers out, because the defender loop skips anything
 * whose config has `unitStats === null` — and owner R75 gives a tower no pool of its own. So these
 * tests pin the DERIVATION rather than a stored field, and each one guards a way it could be wrong
 * while still looking plausible on screen:
 *
 *   1. it must appear AT ALL, and at the right MAX — `structureDefenceFifths(n)`, the function that
 *      already existed with zero production callers;
 *   2. connector damage must SHORTEN THE FILL — the S172 lesson, where six unit types shipped a bar
 *      that was mathematically incapable of moving;
 *   3. losing a connector must SHORTEN THE TRACK — capacity is `n + 4` per connector and falls with
 *      `n`, which is owner R76's intended cascade, not a rendering bug;
 *   4. ONE bar per STRUCTURE — a pool belongs to a component, so two towers welded into one lattice
 *      share one bar rather than drawing two identical overlapping ones;
 *   5. it must not leak an enemy tower's position through the fog.
 */
describe('S173 (owner) — a tower carries the bar of the STRUCTURE that builds it', () => {
  /** A 3-shape chain owned by P0 ⇒ 2 connectors, the smallest structure with any durability. */
  function towerWorld(owner = P0, x0 = 500): { world: World; bondIds: BondId[] } {
    const world = twoSeat();
    const mk = (id: number, x: number): Primitive => {
      const p: Primitive = {
        id: asPrimitiveId(id),
        type: SparkType.Dot,
        placerColor: PLAYER_COLORS[0]!,
        placedBy: owner,
        createdTick: 0,
        pos: { x, y: x0 },
        prevPos: { x, y: x0 },
        bonds: new Set(),
        ownerColor: PLAYER_COLORS[0]!,
        lastOwnershipChange: 0,
        radius: 8,
        hp: PRIMITIVE_MAX_HP,
        origin: null,
      };
      world.primitives.set(p.id, p);
      return p;
    };
    const join = (id: number, a: Primitive, b: Primitive): BondId => {
      const bond: Bond = {
        id: asBondId(id),
        aId: a.id,
        bId: b.id,
        a,
        b,
        restLength: 32,
        stiffnessTier: 'MID',
        damageFifths: 0,
        createdTick: 0,
      };
      world.bonds.set(bond.id, bond);
      a.bonds.add(bond.id);
      b.bonds.add(bond.id);
      return bond.id;
    };
    const a = mk(1, x0);
    const b = mk(2, x0 + 32);
    const c = mk(3, x0 + 64);
    const bondIds = [join(10, a, b), join(11, b, c)];
    addTower(world, 1, a.id, owner);
    return { world, bondIds };
  }

  /**
   * ⚠ A SPAWNER, NOT A DEFENDER, AND THAT IS THE POINT. `world.defenders` holds only the turret and
   * the stink tower with a null pool; the GOBLIN TOWER the owner screenshotted is a
   * `world.creatureSpawners` entry, as are the pentagram, the lightning hub, the six race towers and
   * the six tier-9 boss towers. A fix that covered only defenders would have shipped bars on two
   * tower kinds and called the job done.
   */
  function addTower(world: World, id: number, anchor: PrimitiveId, owner: PlayerId, recipeId = 'goblinTower'): void {
    world.creatureSpawners.set(asSpawnerId(id), {
      id: asSpawnerId(id),
      ownerPlayerId: owner,
      anchorPrimitiveId: anchor,
      recipeId: recipeId as never,
      nextSpawnTick: 0,
      lastValidatedTick: 0,
      spawnedCount: 0,
      ignitedAtTick: 0,
    });
  }

  function bars(world: World): Array<{ x: number; y: number; w: number; h: number }> {
    const g = new G();
    beginConcealmentFrame(world, CURSOR);
    drawHealthBars(g as never, world);
    return g.rects;
  }

  it('⭐⭐ THE ASK: a tower draws a bar at all, and it is FULL while undamaged', () => {
    const { world } = towerWorld();
    const rects = bars(world);
    expect(rects.length, 'one track plus one fill').toBe(2);
    const track = rects[0]!;
    const fill = rects[1]!;
    // Undamaged ⇒ the fill spans the whole track. This is fault 1 from the S171 pips, which hid
    // while healthy: a full tower must still SHOW its pool so it can be compared against.
    expect(fill.w).toBeCloseTo(track.w, 6);
    expect(track.w).toBeGreaterThan(0);
  });

  it('⭐ the MAX is structureDefenceFifths(connectors) — the function that had no caller', () => {
    const { world, bondIds } = towerWorld();
    const n = bondIds.length;
    expect(n).toBe(2);
    // 2 connectors ⇒ capacity 2+4 = 6 fifths each ⇒ 12 fifths total.
    expect(structureDefenceFifths(n)).toBe(12);

    // Spend exactly half the pool and the fill must read exactly half.
    const half = structureDefenceFifths(n) / 2;
    world.bonds.get(bondIds[0]!)!.damageFifths = half;
    const rects = bars(world);
    const track = rects[0]!;
    const fill = rects[1]!;
    expect(fill.w / track.w).toBeCloseTo(0.5, 6);
  });

  it('⭐⭐ connector damage SHORTENS THE FILL — the S172 defect, on a tower this time', () => {
    const { world, bondIds } = towerWorld();
    const before = bars(world)[1]!.w;
    world.bonds.get(bondIds[0]!)!.damageFifths = 3;
    const after = bars(world)[1]!.w;
    expect(after, 'a damaged tower must read as damaged').toBeLessThan(before);
  });

  it('⛔ losing a connector SHORTENS THE TRACK — R76 cascade, not a rendering bug', () => {
    const { world, bondIds } = towerWorld();
    const wide = bars(world)[0]!.w;
    // Break one connector: the component keeps the anchor but drops to 1 bond, so per-connector
    // capacity falls from 6 to 5 AND the count halves — the pool drops 12 → 5.
    const bond = world.bonds.get(bondIds[1]!)!;
    world.bonds.delete(bond.id);
    // ⚠ Bond.a / Bond.b are PhysicsBody, NOT Primitive — the adjacency set lives on the primitive,
    // so the detach has to go back through world.primitives by id. tsc caught this; vitest did not,
    // because the test passed either way.
    world.primitives.get(bond.aId)?.bonds.delete(bond.id);
    world.primitives.get(bond.bId)?.bonds.delete(bond.id);
    const narrow = bars(world)[0]!.w;
    expect(narrow, 'a smaller structure is a smaller pool, so a shorter TRACK').toBeLessThan(wide);
  });

  it('⭐⭐ ONE bar per STRUCTURE — two towers on one lattice do not draw two', () => {
    const { world } = towerWorld();
    // A second tower anchored on a DIFFERENT member of the SAME component. The pool is shared, so
    // drawing per-tower would paint two identical overlapping bars and imply two healths.
    addTower(world, 2, asPrimitiveId(3), P0);
    expect(world.creatureSpawners.size).toBe(2);
    expect(bars(world).length, 'still exactly one track plus one fill').toBe(2);
  });

  it('⛔ a lone shape has no connectors, so it has no bar to draw', () => {
    const world = twoSeat();
    const p: Primitive = {
      id: asPrimitiveId(1),
      type: SparkType.Dot,
      placerColor: PLAYER_COLORS[0]!,
      placedBy: P0,
      createdTick: 0,
      pos: { x: 500, y: 500 },
      prevPos: { x: 500, y: 500 },
      bonds: new Set(),
      ownerColor: PLAYER_COLORS[0]!,
      lastOwnershipChange: 0,
      radius: 8,
      hp: PRIMITIVE_MAX_HP,
      origin: null,
    };
    world.primitives.set(p.id, p);
    addTower(world, 1, p.id, P0);
    expect(bars(world).length, 'no connectors ⇒ no durability ⇒ nothing to show').toBe(0);
  });

  /*
   * ⛔⛔ THE REGRESSION GUARD THE FIRST PASS DID NOT HAVE, and the owner found the gap by playing:
   * "You said the towers have health bars, but I dont see them having health bars. Look. The
   * zombies have. Towers dont."
   *
   * The bar WAS being drawn - every test above passed - but at FALLBACK_SPRITE_H = 26 above a
   * FOOT-ANCHORED building 84 px tall, which put it 6 px INSIDE the pyramid. The S172 Helga bug,
   * reproduced verbatim by me one session later. "Is a bar drawn?" was the wrong question;
   * "is it drawn where a human can see it?" is the one that catches this.
   */
  /*
   * ⛔⛔ S174 (owner, THIRD report) — **"ABOVE" WAS NEVER THE ASSERTION THIS NEEDED.**
   *
   * > *"the towers have their health in the middle of them ... it is there, it's just way too up, and
   * > it is like behind the other tower ... You take the HIGHEST POINT and you put a bar over it.
   * > Not a meter above."*
   *
   * The two tests below shipped GREEN over the bug he is reporting, and the reason is worth naming:
   * they asserted `track.y < spriteTop` — a ONE-SIDED bound, satisfied by the correct lift and
   * equally by a lift of any size whatsoever. S173 passed `art.sizePx` as the rise where the geometry
   * wants `art.sizePx * 0.5` (the building is foot-anchored at `cy + sizePx*0.5`, so its roof is only
   * HALF a sprite above the centroid), the bar floated 42 px too high on a tier-3 and 75 px on a
   * tier-9, and both of these still passed because 42 px too high is still "above".
   *
   * ⭐ SO THEY ARE PINNED ON BOTH SIDES NOW, against `BAR_LIFT` itself rather than a literal — the
   * gap may be retuned, the RELATIONSHIP may not. "Way too up" is a failing test from here on.
   */
  it('⛔⛔ a tier-3 tower bar clears the roof by exactly BAR_LIFT — not less, and NOT MORE', () => {
    const { world } = towerWorld();
    world.creatureSpawners.clear();
    addTower(world, 1, asPrimitiveId(1), P0, 't3TowerMummies' as never);
    const track = bars(world)[0]!;
    // towerRenderer foot-anchors at cy + sizePx*0.5, so the building's TOP is sizePx/2 above the
    // ring centroid. T3_TOWER_SPRITE_PX = 84 => 42 px up.
    const centroidY = 500;
    const spriteTopY = centroidY - T3_TOWER_SPRITE_PX / 2;
    expect(track.y, 'the bar must sit above the pyramid, not inside it').toBeLessThan(spriteTopY);
    expect(spriteTopY - track.y, '"not a meter above" — the gap is BAR_LIFT, not half a building')
      .toBeCloseTo(BAR_LIFT, 6);
  });

  it('⛔⛔ a tier-9 boss tower is 150 px tall and its bar clears THAT roof by the same gap', () => {
    const { world } = towerWorld();
    world.creatureSpawners.clear();
    addTower(world, 1, asPrimitiveId(1), P0, 't9TowerMummies' as never);
    const track = bars(world)[0]!;
    const spriteTopY = 500 - T9_TOWER_SPRITE_PX / 2;
    expect(track.y).toBeLessThan(spriteTopY);
    expect(spriteTopY - track.y, 'the 150 px boss gets the same gap as the 84 px pyramid')
      .toBeCloseTo(BAR_LIFT, 6);
  });

  it('⛔ the gap does NOT grow with the building — a tier-9 bar is not further up than a tier-3', () => {
    /*
     * The failure mode in one assertion. Passing `sizePx` where `sizePx * 0.5` belongs overshoots by
     * HALF THE BUILDING, so the error scales with the art: 42 px on a tier-3, 75 px on a tier-9. A
     * test comparing the two GAPS catches that whatever either absolute number happens to be.
     */
    const t3 = towerWorld().world;
    t3.creatureSpawners.clear();
    addTower(t3, 1, asPrimitiveId(1), P0, 't3TowerMummies' as never);
    const t9 = towerWorld().world;
    t9.creatureSpawners.clear();
    addTower(t9, 1, asPrimitiveId(1), P0, 't9TowerMummies' as never);
    const gap3 = (500 - T3_TOWER_SPRITE_PX / 2) - bars(t3)[0]!.y;
    const gap9 = (500 - T9_TOWER_SPRITE_PX / 2) - bars(t9)[0]!.y;
    expect(gap9, 'a bigger building must not wear its bar further out in space').toBeCloseTo(gap3, 6);
  });

  it('⛔⛔ AND THE CASTLE AGREES — "not traversing the middle like the castle"', () => {
    /*
     * His sentence compares the two bars, so the test has to as well. `castleBarTopY` is the castle's
     * half of the arithmetic: the sprite is FOOT-anchored at the keep box's foot (`y + KEEP_H/2`) and
     * rises CASTLE_SPRITE_PX, so its roof is at `y + KEEP_H/2 − CASTLE_SPRITE_PX`. The shipped bar sat
     * at `top − 7 = y − KEEP_H/2 − 7`, which is 31 px BELOW that roof — straight through the spires,
     * exactly what he photographed.
     */
    const anchorY = 500;
    const castleRoofY = anchorY + KEEP_H / 2 - CASTLE_SPRITE_PX;
    expect(castleBarTopY(anchorY, true)).toBeLessThan(castleRoofY);
    expect(castleRoofY - castleBarTopY(anchorY, true), 'the same gap a tower bar gets')
      .toBeCloseTo(BAR_LIFT, 6);
    // ⚠ AND THE LOAD-FAILURE KEEP IS THE OTHER HALF. With no atlas the castle IS the box, so its
    // highest point is the box's top — a bar 38 px above that would be "a meter above" nothing.
    expect(castleBarTopY(anchorY, false)).toBeCloseTo(anchorY - KEEP_H / 2 - BAR_LIFT, 6);
  });

  it('a tower bar is at least as WIDE as the building it labels (R171-E)', () => {
    const { world } = towerWorld();
    world.creatureSpawners.clear();
    addTower(world, 1, asPrimitiveId(1), P0, 't3TowerMummies' as never);
    const track = bars(world)[0]!;
    // A 15 px bar over an 84 px pyramid reads as a scratch; his standing rule is that the bar is
    // at least the width of the thing it represents.
    expect(track.w).toBeGreaterThanOrEqual(T3_TOWER_SPRITE_PX);
  });

  /*
   * OWNER, SECOND PASS: "it will be moving when its being hit. You know? Like, losing health.
   * Remember the issue we had last time that you made health bars for the creatures, but then it
   * didnt move. They would just, like, die. It needs to actually reflect the HP. Needs to be
   * consistent."
   *
   * That is the S172 frozen-fill defect, and this pins the tower against it with REAL damage rather
   * than a hand-set field: bite the same connector with a real chewer hit and the bar must shrink on
   * EVERY bite, never sit still and then vanish.
   *
   * MEASURED, and it is a MECHANIC fact rather than a readout one: a chewer bites for
   * attackFifths(CHEWER_ATK=1, CHEWER_PEN=2) = 1 x (5+2) = 7 fifths, and a 3-shape race-tower ring
   * has connectorCapacityFifths(3) = 7. So one bite severs one connector of the SMALLEST tower
   * exactly. A bigger lattice moves smoothly (n=12 => capacity 16 => three bites per connector);
   * a 3-ring genuinely dies in three. The bar is telling the truth about a thin structure - if
   * towers should be tougher that is a ruling on connectorCapacityFifths, not on this file.
   */
  it('the bar MOVES on every real hit - it never sits still and then vanishes', () => {
    const { world, bondIds } = towerWorld();
    const bite = attackFifths(CHEWER_ATK, CHEWER_PEN);
    expect(bite, 'a chewer bite, in fifths').toBe(7);

    const widths: number[] = [bars(world)[1]!.w];
    // Bite the SAME connector repeatedly, below its capacity, so nothing severs and the movement
    // under test is the fill itself rather than the topology changing underneath it.
    const cap = connectorCapacityFifths(bondIds.length);
    const bond = world.bonds.get(bondIds[0]!)!;
    for (let i = 1; i * 1 < cap; i++) {
      bond.damageFifths = i; // one fifth at a time: the finest movement the encoding can show
      widths.push(bars(world)[1]!.w);
    }
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!, `the bar must shrink at step ${i}, not sit still`).toBeLessThan(widths[i - 1]!);
    }
    expect(widths.length, 'several observable steps before anything severs').toBeGreaterThan(3);
  });

  it('⛔ a CONCEALED enemy tower draws no bar — it must not leak position through the fog', () => {
    /*
     * ⚠ THE SAME THREE-PRECONDITION FIXTURE HOLE THE CREATURE FOG TEST ABOVE RECORDS, and I fell
     * into it exactly as its comment predicts: setting only the phase leaves `fogActive` false
     * (`isNetworked(world) && gameState === 'PLAYING' && matchPhase === 'BUILD'`), the fog is inert,
     * two rects are drawn, and it reads as a renderer leak rather than a hole in the test.
     * The structure is also built FAR from anything of P0's, because the spawner disc and the
     * cursor are both permanent vision sources.
     */
    const { world } = towerWorld(P1, 4000);
    world.gameMode = '1v1';
    world.gameState = 'PLAYING';
    world.localPlayerId = P0;
    world.matchPhase = 'BUILD'; // R62: nothing is concealed during FIGHT
    const rects = bars(world);
    expect(rects.length, 'an enemy tower outside vision is not drawn at all').toBe(0);
  });
});
