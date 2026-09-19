/**
 * SPARK — S182: **THE DAMAGE RAMP'S ARITHMETIC, AND THE ONE COINCIDENCE THAT HOLDS IT TOGETHER.**
 *
 * The owner gave four rows of a table (100 % → 1, 50 % → 12, 34 % → 16, below 33 % → 17..24) and a
 * threshold in the same breath. The valuable assertion is not the four rows — it is that the
 * THRESHOLD and the FRAME BOUNDARY are the same test, at every reachable health value rather than at
 * the four he happened to name. If they ever stop agreeing, the hub detonates on a frame that still
 * shows it standing, or stands on a frame that shows it in pieces.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HUB_ART_PX,
  HUB_RAMP_TICKS_PER_FRAME,
  HUB_SPRITE_PX,
  HUB_SUBJECT_FILL,
  RAMP_SPECS,
  advanceRampCursor,
  rampCell,
  rampDeathFirstFrame,
  rampDeathRunTicks,
  rampAnchorAtPoint,
  rampFrameForHealth,
  rampMembersAt,
  rampHealthFrac,
  rampSpecFor,
  rampTargetFrame,
  shouldStartGhost,
  type RampSpec,
} from './structureRamp.ts';
import {
  HUB_DEATH_RUN_TICKS, STAR_SELFDESTRUCT_BELOW_FRAC, starHealthFrac,
} from '../state/structureStarHealth.ts';
import { TOWER_DAMAGED_BELOW } from './towerFrames.ts';
import { structurePoolFifths } from '../state/stats.ts';
import { FOOTPRINT_MARGIN, blueprintFor, blueprintRadius } from '../state/blueprints.ts';
import { asBondId, asPrimitiveId } from '../types.ts';
import type { World } from '../state/world.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';

const HUB = rampSpecFor('lightningHub' as GodlyId)!;

describe('the registry', () => {
  it('⭐ S183 — holds the FIVE towers the owner has presented, in the order he sent them', () => {
    // S182 was one, by ruling: *"We're gonna do this one at a time ... Currently you're just gonna
    // focus on the lightning hub. I will present them one after another."* He then played the
    // pilot — *"very well done with the lightning hub"* — and sent four more sheets.
    expect(RAMP_SPECS.map((s) => s.recipeId))
      .toEqual(['lightningHub', 'goblinTower', 'laserTurret', 'pentagram', 'helga']);
  });

  /**
   * ⛔⛔ **R182-A DID NOT RIDE ALONG WITH THE RAMP, AND THIS IS THE TEST THAT KEEPS IT THAT WAY.**
   *
   * > *"From thirty two percent it will just get self destroyed, but it is a suicide drone
   * > building, so it makes sense. **We won't do it for every building.**"*
   *
   * A generalised renderer quietly generalising a BALANCE threshold is exactly how that ruling
   * would leak: `selfDestructBelow` is one field on a table whose whole point is that tower six
   * costs a copy-pasted row. Copying the hub's row wholesale turns this red.
   */
  it('⛔ EXACTLY ONE tower self-destructs, and it is the hub — R182-A does not generalise', () => {
    const opted = RAMP_SPECS.filter((s) => s.selfDestructBelow !== null);
    expect(opted.map((s) => s.recipeId)).toEqual(['lightningHub']);
    expect(opted[0]!.selfDestructBelow).toBe(STAR_SELFDESTRUCT_BELOW_FRAC);
    for (const spec of RAMP_SPECS) {
      if (spec.recipeId === 'lightningHub') continue;
      expect(spec.selfDestructBelow, `${spec.recipeId} must not inherit the fuse`).toBeNull();
      // …and the consequence that actually reaches the screen: no death-run short-circuit.
      expect(rampDeathFirstFrame(spec), `${spec.recipeId} death run`).toBeNull();
      expect(rampDeathRunTicks(spec), `${spec.recipeId} death ticks`).toBe(0);
      // At 1 % health a doomed HUB aims at the last frame; these four only track their health.
      expect(rampTargetFrame(0.01, spec)).toBe(rampFrameForHealth(0.01, spec.frames));
    }
  });

  it('every spec\'s rows add up to its frame count', () => {
    for (const spec of RAMP_SPECS) {
      const total = spec.rows.reduce((n, r) => n + r.count, 0);
      expect(total, `${spec.recipeId} rows vs frames`).toBe(spec.frames);
    }
  });

  /**
   * ⭐ **EVERY SIZE AND EVERY CONNECTOR COUNT RE-DERIVED FROM `blueprints.ts`.** The constants in
   * `structureRamp.ts` are literals, the way `HUB_ART_PX` is, so that the renderer does not import
   * the blueprint registry at runtime for a number that never changes mid-match. This is the other
   * half of that bargain: a recipe retune — a hub degree, a ring circumradius — turns a test red
   * instead of silently leaving a building the wrong size on a footprint that moved.
   *
   * ⛔ THE PENTAGRAM IS THE CASE THIS EXISTS FOR. Its `RING_R` is 40 where every star's `STAR_R`
   * is 44, so it is genuinely the smaller building — the same "one radius reused at a different n"
   * trap `blueprints.ts` spends three docblocks on.
   */
  it('⭐ every spec\'s connector count and sprite size are derived from its blueprint', () => {
    for (const spec of RAMP_SPECS) {
      const bp = blueprintFor(spec.recipeId);
      expect(bp, `no blueprint for ${spec.recipeId}`).toBeDefined();
      expect(spec.connectors, `${spec.recipeId} connectors`).toBe(bp.bonds.length);
      // The footprint ladder: box = 1.2 x the shape's own diameter, art = box x the measured fill.
      const footprint = 2 * (blueprintRadius(spec.recipeId) - FOOTPRINT_MARGIN);
      expect(spec.spritePx, `${spec.recipeId} box vs footprint`)
        .toBeCloseTo(footprint * 1.2, -0.5);
      expect(spec.artPx).toBeLessThan(spec.spritePx);
    }
  });

  it('returns null for a recipe with no ramp art — the towers still on the old path', () => {
    expect(rampSpecFor('stinkTower' as GodlyId)).toBeNull();
    expect(rampSpecFor('voltkin' as GodlyId)).toBeNull();
    expect(rampSpecFor('t3TowerOrcs' as GodlyId)).toBeNull();
  });

  it('⭐ the four S183 towers really are reachable by `rampSpecFor`, by their REAL recipe id', () => {
    // ⚠ HELGA's recipe id is `helga`, not `princessHelga`; the atlas is `helga-tower`, not `helga`.
    // Getting either wrong ships a table row that no structure in the world can ever match — the
    // silent-sparse-map failure `RAMP_SPECS` is a list to avoid.
    for (const id of ['goblinTower', 'laserTurret', 'pentagram', 'helga'] as const) {
      const spec = rampSpecFor(id as GodlyId);
      expect(spec, `rampSpecFor('${id}')`).not.toBeNull();
      expect(spec!.frames).toBe(24);
    }
    expect(rampSpecFor('helga' as GodlyId)!.atlasBase).toBe('/art/helga-tower/helga-tower');
  });
});

describe('rampFrameForHealth — the owner\'s own table', () => {
  it.each([
    [1.0, 1, 'pristine'],
    [0.5, 12, 'the damaged plate'],
    [0.34, 16, 'barely standing, repairable'],
    [0.33, 17, 'the death run has begun'],
    [0.0, 24, 'rubble'],
  ])('health %s → frame %i (%s)', (frac, frame) => {
    expect(rampFrameForHealth(frac, HUB.frames)).toBe(frame);
  });

  it('is monotonic and never leaves the sheet, across the whole range', () => {
    let prev = 0;
    for (let i = 100; i >= 0; i--) {
      const f = rampFrameForHealth(i / 100, HUB.frames);
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(HUB.frames);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(prev).toBe(HUB.frames);
  });

  it('NaN and under-zero resolve to the LAST frame, the towerStateForHp convention', () => {
    // A structure drawn as rubble because something upstream broke is a louder bug than one drawn
    // pristine — the same comparison order `towerStateForHp` documents.
    expect(rampFrameForHealth(Number.NaN, HUB.frames)).toBe(HUB.frames);
    expect(rampFrameForHealth(-1, HUB.frames)).toBe(HUB.frames);
    expect(rampFrameForHealth(2, HUB.frames)).toBe(1);
  });
});

describe('⭐⭐ the threshold and the frame boundary are ONE test', () => {
  it('frame ≥ deathFirstFrame ⟺ below the self-destruct threshold, at EVERY integer fifth', () => {
    /*
     * ⛔ THIS IS THE ASSERTION THE FOUR-ROW TABLE CANNOT MAKE. A five-armed hub's pool is 50 fifths
     * and damage arrives in whole fifths, so these 51 values are every health a live hub can hold.
     * Walking them proves the equivalence rather than sampling it.
     */
    const pool = structurePoolFifths(5);
    expect(pool).toBe(50);
    const death = rampDeathFirstFrame(HUB)!;
    for (let banked = 0; banked <= pool; banked++) {
      const frac = 1 - banked / pool;
      const detonates = frac < STAR_SELFDESTRUCT_BELOW_FRAC;
      const onDeathRun = rampFrameForHealth(frac, HUB.frames) >= death;
      expect(onDeathRun, `banked ${banked}/${pool} (frac ${frac.toFixed(3)})`).toBe(detonates);
    }
  });

  it('the boundary lands at banked 34 — the measured balance change', () => {
    // Today the hub dies when its star BREAKS (banked reaches the pool, 50). Under R182-A it dies at
    // 34. That is 3 melee-goblin swings instead of 5, and 5 chewer bites instead of 8.
    const pool = structurePoolFifths(5);
    const detonatesAt = (b: number) => 1 - b / pool < STAR_SELFDESTRUCT_BELOW_FRAC;
    expect(detonatesAt(33)).toBe(false);
    expect(detonatesAt(34)).toBe(true);
    expect(Math.ceil(34 / 12)).toBe(3); // melee goblin, attackFifths(2,1) = 12
    expect(Math.ceil(34 / 7)).toBe(5); // pencil chewer
    expect(Math.ceil(50 / 12)).toBe(5); // what it costs TODAY, for the contrast
    expect(Math.ceil(50 / 7)).toBe(8);
  });

  it('the death run is 8 of 24 frames — exactly the third the threshold names', () => {
    const death = rampDeathFirstFrame(HUB)!;
    expect(death).toBe(17);
    expect(HUB.frames - death + 1).toBe(8);
    expect((HUB.frames - death + 1) / HUB.frames).toBeCloseTo(STAR_SELFDESTRUCT_BELOW_FRAC, 10);
  });

  it('reuses TOWER_DAMAGED_BELOW rather than minting a second "damaged" number', () => {
    // `buildingTint` switches green→amber at this same 0.5, so the two use ONE threshold. A second
    // constant here is how they would drift apart. ⚠ See the case below for the part of this that
    // an earlier version of this comment got WRONG.
    expect(rampFrameForHealth(TOWER_DAMAGED_BELOW, HUB.frames)).toBe(12);
    expect(rampCell(12, HUB)).toEqual({ state: 'damage', col: 11 });
  });

  it('⛔ BUT THE HEALTH BAR AND THE ART DISAGREE ON A WELDED HUB — measured, and it is not free', () => {
    /*
     * ⛔⛔ THE CLAIM THIS REPLACES WAS FALSE. The S182 brief, and the first version of the comment
     * above, said the bar and the art "agree for free" because they share `TOWER_DAMAGED_BELOW`.
     * They share the THRESHOLD; they do not share the DENOMINATOR, and that is what decides.
     *
     *   `healthBar.ts:421` reads `structureDefenceFifths(n)` over the whole COMPONENT.
     *   The ramp reads `structurePoolFifths(hub.bonds.size)` over the hub's OWN STAR (R182-B).
     *
     * For a STANDALONE hub those are the same five connectors and the two do agree. Weld ONE
     * friendly shape onto one leaf and the component becomes six:
     *
     *   banked 34  ->  bar 34/66 = 48 % remaining (green-amber, "it is fine")
     *              ->  art 34/50 = 32 % remaining (frame 17, the death run, and it detonates)
     *
     * ⭐ THE OWNER RULED STAR-SCOPED, SO THE **BAR** IS THE ONE THAT SHOULD FOLLOW — but that is a
     * change to every structure's bar, not to the hub, so it is NOT made here. It is recorded in
     * `SPARK_CANON.md` §9 as an open question for him. This case exists so the disagreement is a
     * measured, asserted fact rather than a sentence someone can quietly delete.
     */
    const banked = 34;
    const starPool = structurePoolFifths(5); // the hub's own five arms
    const weldedComponentPool = structurePoolFifths(6); // + one hand-placed neighbour
    const artFrac = 1 - banked / starPool;
    const barFrac = 1 - banked / weldedComponentPool;

    expect(artFrac).toBeLessThan(STAR_SELFDESTRUCT_BELOW_FRAC); // the art says: dead
    expect(barFrac).toBeGreaterThan(TOWER_DAMAGED_BELOW * 0.9); // the bar says: nearly half full
    expect(rampFrameForHealth(artFrac, HUB.frames)).toBeGreaterThanOrEqual(rampDeathFirstFrame(HUB)!);
    expect(rampFrameForHealth(barFrac, HUB.frames)).toBeLessThan(rampDeathFirstFrame(HUB)!);
  });

  it('a spec that does not self-destruct has no death run', () => {
    const plain: RampSpec = { ...HUB, selfDestructBelow: null };
    expect(rampDeathFirstFrame(plain)).toBeNull();
    expect(rampDeathRunTicks(plain)).toBe(0);
  });
});

describe('⭐⭐⭐ S182 — a DOOMED structure aims at the LAST frame, not at the frame its health names', () => {
  it('above the threshold it simply tracks health', () => {
    expect(rampTargetFrame(1, HUB)).toBe(1);
    expect(rampTargetFrame(0.5, HUB)).toBe(12);
    expect(rampTargetFrame(0.34, HUB)).toBe(16);
  });

  it('⛔ BELOW the threshold it jumps its TARGET to the end, so the collapse plays for everyone', () => {
    /*
     * The defect this closes: `rampFrameForHealth(0.30)` is 17 — the FIRST frame of the death run —
     * so a doomed hub parked on 17 and the other seven frames were reachable ONLY through the
     * client-local ghost. A peer that had reloaded, or a joiner who arrived a moment earlier, had no
     * ghost record and watched the building vanish with no destruction at all.
     */
    expect(rampFrameForHealth(0.3, HUB.frames)).toBe(17); // what it would have parked on
    expect(rampTargetFrame(0.3, HUB)).toBe(HUB.frames); // what it aims at now
    expect(rampTargetFrame(0.01, HUB)).toBe(HUB.frames);
    expect(rampTargetFrame(0, HUB)).toBe(HUB.frames);
  });

  it('a structure with NO self-destruct is untouched by this', () => {
    const plain: RampSpec = { ...HUB, selfDestructBelow: null };
    expect(rampTargetFrame(0.3, plain)).toBe(rampFrameForHealth(0.3, plain.frames));
    expect(rampTargetFrame(0, plain)).toBe(plain.frames); // 0 health is the last frame either way
  });

  it('⭐ the sim fuse and the renderer run are the SAME eight frames, counted from two sides', () => {
    // ⛔ If these ever disagree the hub is razed mid-collapse again. `HUB_DEATH_RUN_TICKS` is what
    // `hostTick` holds a doomed hub in the world for; `rampDeathRunTicks` is how long the art needs.
    expect(HUB_DEATH_RUN_TICKS).toBe(rampDeathRunTicks(HUB));
    expect(HUB_DEATH_RUN_TICKS).toBe(8 * HUB_RAMP_TICKS_PER_FRAME);
  });
});

describe('⛔⛔ S182 — "not drawn" is NOT "destroyed" (shouldStartGhost)', () => {
  const base = {
    drawnThisFrame: false, stillInWorld: false, alreadyGhosting: false,
    hasLastPosition: true, inFight: true,
  };

  it('a structure that really left the world plays its collapse', () => {
    expect(shouldStartGhost(base)).toBe(true);
  });

  it('⛔ a FOGGED or still-loading structure does NOT — the defect this closes', () => {
    /*
     * The draw loop skips for three PRESENTATION reasons that are not death: behind the fog, atlas
     * still loading, texture not cut. The first version of the sweep turned every undrawn sprite
     * into a corpse, so an enemy hub walking out of vision played its whole collapse — and played it
     * again on every vision drop. `stillInWorld` is what separates the two questions.
     */
    expect(shouldStartGhost({ ...base, stillInWorld: true })).toBe(false);
  });

  it('a structure being DRAWN never ghosts', () => {
    expect(shouldStartGhost({ ...base, drawnThisFrame: true })).toBe(false);
    expect(shouldStartGhost({ ...base, drawnThisFrame: true, stillInWorld: true })).toBe(false);
  });

  it('it does not start twice', () => {
    expect(shouldStartGhost({ ...base, alreadyGhosting: true })).toBe(false);
  });

  it('a deliberate SCRAP in BUILD is not a destruction', () => {
    expect(shouldStartGhost({ ...base, inFight: false })).toBe(false);
  });

  it('a structure that was never drawn has nowhere to play out', () => {
    expect(shouldStartGhost({ ...base, hasLastPosition: false })).toBe(false);
  });
});

describe('rampCell — frame to atlas row/column', () => {
  it('walks the two rows in frame order', () => {
    expect(rampCell(1, HUB)).toEqual({ state: 'damage', col: 0 });
    expect(rampCell(12, HUB)).toEqual({ state: 'damage', col: 11 });
    expect(rampCell(13, HUB)).toEqual({ state: 'collapse', col: 0 });
    expect(rampCell(24, HUB)).toEqual({ state: 'collapse', col: 11 });
  });

  it('clamps at both ends rather than reading a cell that does not exist', () => {
    expect(rampCell(0, HUB)).toEqual({ state: 'damage', col: 0 });
    expect(rampCell(-5, HUB)).toEqual({ state: 'damage', col: 0 });
    expect(rampCell(999, HUB)).toEqual({ state: 'collapse', col: 11 });
  });

  it('every frame maps to a real column of a real row', () => {
    const byState = new Map(HUB.rows.map((r) => [r.state, r.count]));
    for (let f = 1; f <= HUB.frames; f++) {
      const { state, col } = rampCell(f, HUB);
      expect(byState.has(state), `frame ${f} state ${state}`).toBe(true);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThan(byState.get(state)!);
    }
  });
});

describe('⭐⭐⭐ R182-D — the ramp PLAYS THROUGH, it never snaps', () => {
  it('a one-shot kill plays all 24 frames, and takes about a second', () => {
    /*
     * *"If he destroys a whole structure in one hit, within like one second it looks like a whole
     * structure got destroyed."* Vlad deals 150 fifths against a 50 pool, so the target is frame 24
     * on the very tick he swings — and the cursor still walks every frame between.
     */
    let cursor = { frame: 1, sinceTick: 0 };
    const seen: number[] = [cursor.frame];
    let tick = 0;
    while (cursor.frame < HUB.frames && tick < 1000) {
      tick++;
      const next = advanceRampCursor(cursor, HUB.frames, tick, HUB);
      if (next.frame !== cursor.frame) seen.push(next.frame);
      cursor = next;
    }
    expect(seen).toEqual(Array.from({ length: 24 }, (_, i) => i + 1)); // no frame skipped
    expect(tick).toBe((HUB.frames - 1) * HUB_RAMP_TICKS_PER_FRAME); // 69 ticks ≈ 1.15 s
    expect(tick / 60).toBeLessThan(1.5);
  });

  it('a small hit plays a SHORT run — "the more damage is done, the more it looks like a video"', () => {
    let cursor = { frame: 1, sinceTick: 0 };
    let tick = 0;
    while (cursor.frame < 4 && tick < 1000) {
      tick++;
      cursor = advanceRampCursor(cursor, 4, tick, HUB);
    }
    expect(cursor.frame).toBe(4);
    expect(tick).toBe(3 * HUB_RAMP_TICKS_PER_FRAME);
  });

  it('⭐ advances by += so a late observation does not shorten the next frame', () => {
    // The anti-drift idiom the spawner cadence uses. Observed at tick 30 having last stepped at 0,
    // the cursor takes the ten steps it is owed and keeps its phase — it does not reset to "now".
    const cursor = advanceRampCursor({ frame: 1, sinceTick: 0 }, 24, 30, HUB);
    expect(cursor.frame).toBe(1 + 30 / HUB_RAMP_TICKS_PER_FRAME);
    expect(cursor.sinceTick).toBe((cursor.frame - 1) * HUB_RAMP_TICKS_PER_FRAME);
    // …and a step that lands mid-frame keeps the remainder rather than discarding it.
    const off = advanceRampCursor({ frame: 1, sinceTick: 0 }, 24, 31, HUB);
    expect(off.sinceTick).toBe(30);
  });

  it('holds its frame between steps rather than stuttering', () => {
    const a = advanceRampCursor({ frame: 5, sinceTick: 10 }, 24, 11, HUB);
    expect(a).toEqual({ frame: 5, sinceTick: 10 });
    const b = advanceRampCursor({ frame: 5, sinceTick: 10 }, 24, 13, HUB);
    expect(b.frame).toBe(6);
  });

  it('never overshoots its target', () => {
    const cursor = advanceRampCursor({ frame: 2, sinceTick: 0 }, 5, 900, HUB);
    expect(cursor.frame).toBe(5);
  });

  it('a REPAIR snaps back instead of playing the sheet in reverse', () => {
    // FIX is BUILD-only, instantaneous and total. Winding the ramp backwards would read as the
    // wreck un-burning; the owner's play-through ruling is about taking damage.
    const cursor = advanceRampCursor({ frame: 20, sinceTick: 0 }, 1, 7, HUB);
    expect(cursor).toEqual({ frame: 1, sinceTick: 7 });
  });
});

describe('the sprite size is stated as ART and converted to a BOX', () => {
  it('HUB_SPRITE_PX is derived from HUB_ART_PX and the measured fill, not picked', () => {
    // ⛔ The S178 Voltkin lesson: a sprite BOX is not the art. 150 was "tier-9 parity" and made the
    // TV the tallest thing on the board because 150 is a box whose art fills 68–91 % of it.
    expect(HUB_SPRITE_PX).toBe(Math.round(HUB_ART_PX / HUB_SUBJECT_FILL));
    expect(HUB.spritePx).toBe(HUB_SPRITE_PX);
  });

  it('the hub draws between a tier-3 and a tier-9 building, which is what a 6-shape structure is', () => {
    // Derived from the FOOTPRINT ladder, as T3_TOWER_SPRITE_PX / T9_TOWER_SPRITE_PX already are:
    // a hub star spans 2 × STAR_R = 88 px, against a tier-3 ring's 68 and a tier-9 ring's 128.
    const drawn = HUB_SPRITE_PX * HUB_SUBJECT_FILL;
    expect(drawn).toBeGreaterThan(67); // a tier-3 tower's 84 box at ~0.8 fill
    expect(drawn).toBeLessThan(111); // the measured tier-9 median
  });
});

/**
 * SPARK — S183 — **THE HEALTH THE RAMP DRAWS FROM, AND THE CRUMBLE RULE THE OWNER CORRECTED.**
 *
 * Two things are asserted here and they pull in opposite directions on purpose:
 *
 *  · `rampHealthFrac` must be `starHealthFrac` EXACTLY for a star, because the hub's sim-side fuse
 *    reads one and its art reads the other, and R182-B rules what "its own bonds" means. A second
 *    copy of that arithmetic drifting is the defect `structureStarHealth.ts` exists to prevent;
 *  · it must nonetheless read ZERO for a structure that has lost a connector, which
 *    `starHealthFrac` does NOT do — it re-prices against the smaller live pool.
 */
const HUB_A = asPrimitiveId(1);

/** A hub with `n` bonds carrying `banked` fifths in total. */
function starWorld(n: number, banked: number): World {
  const bondIds = Array.from({ length: n }, (_, i) => asBondId(i + 1));
  const per = Math.floor(banked / n);
  const rem = banked - per * n;
  const bonds = new Map(bondIds.map((id, i) => [id, { damageFifths: per + (i === 0 ? rem : 0) }]));
  return {
    primitives: new Map([[HUB_A, { bonds: new Set(bondIds) }]]),
    bonds,
  } as unknown as World;
}

describe('S183 — rampHealthFrac IS starHealthFrac for a star, at every integer fifth', () => {
  for (const spec of RAMP_SPECS) {
    if (spec.shape !== 'star') continue;
    it(`${spec.recipeId}: ${structurePoolFifths(spec.connectors)} fifths, one assertion each`, () => {
      const pool = structurePoolFifths(spec.connectors);
      for (let banked = 0; banked <= pool; banked++) {
        const world = starWorld(spec.connectors, banked);
        const sim = starHealthFrac(world, HUB_A);
        const art = rampHealthFrac(spec.connectors, banked, spec);
        expect(sim, `banked ${banked}`).not.toBeNull();
        expect(art, `banked ${banked} of ${pool} on ${spec.recipeId}`).toBeCloseTo(sim!, 12);
      }
    });
  }
});

describe('S183 — the crumble rule (owner: the connectors come back when it hits ZERO)', () => {
  /**
   * > *"It does not come back when the building starts dying so you can still repair it. No —
   * > because you can see the tower is damaged … The connectors come back when the tower is being
   * > destroyed, like when it hits zero health and you can see it crumble and fall."*
   */
  it('⛔ a structure missing a connector reads ZERO, whatever damage the survivors carry', () => {
    for (const spec of RAMP_SPECS) {
      expect(rampHealthFrac(spec.connectors - 1, 0, spec), `${spec.recipeId} snapped, undamaged`)
        .toBe(0);
      expect(rampFrameForHealth(rampHealthFrac(spec.connectors - 1, 0, spec), spec.frames))
        .toBe(spec.frames);
    }
  });

  /**
   * ⛔⛔ **THE DEFECT THIS RULE CLOSES, WHICH IS ONLY REACHABLE ON A TOWER WITHOUT THE FUSE.**
   *
   * `damageConnector` SPENDS the pool when it snaps an arm, draining every survivor to pay for it.
   * Priced against the LIVE connector count, a goblin tower would read 36/36 (frame 24, rubble)
   * and then, the same tick, 0 banked over a 3-connector pool — **frame 1, pristine** — and stand
   * there looking brand new for the 0-30 ticks before the re-validation poll removes it. The hub
   * never reaches this because it detonates at a third; the four S183 towers all do.
   */
  it('⛔ the post-snap DRAIN cannot flick a tower back to pristine', () => {
    const goblin = rampSpecFor('goblinTower' as GodlyId)!;
    const pool = structurePoolFifths(goblin.connectors);
    // The hit that breaks the fourth connector: banked reaches the pool, frame 24.
    expect(rampFrameForHealth(rampHealthFrac(goblin.connectors, pool, goblin), goblin.frames))
      .toBe(goblin.frames);
    // The same tick, post-drain: 3 connectors, 0 banked. The LIVE-pool reading would be frame 1.
    expect(rampHealthFrac(3, 0, goblin)).toBe(0);
    const naive = 1 - 0 / structurePoolFifths(3);
    expect(rampFrameForHealth(naive, goblin.frames)).toBe(1); // …which is the defect, demonstrated
  });

  it('a whole, undamaged structure of every shape reads 1 and draws frame 1', () => {
    for (const spec of RAMP_SPECS) {
      expect(rampHealthFrac(spec.connectors, 0, spec), spec.recipeId).toBe(1);
      expect(rampTargetFrame(rampHealthFrac(spec.connectors, 0, spec), spec)).toBe(1);
    }
  });

  it('⭐ the pentagram is priced over all FIVE of its connectors, not its anchor\'s two', () => {
    // Its anchor has degree 2 (every node of a closed 5-cycle does), so an anchor-scoped pool
    // would be structurePoolFifths(2) = 14 and the ring would read as rubble a third of the way
    // through its real 50. `shape: 'ring'` is what makes the renderer hand this the whole cycle.
    const penta = rampSpecFor('pentagram' as GodlyId)!;
    expect(penta.shape).toBe('ring');
    expect(structurePoolFifths(penta.connectors)).toBe(50);
    expect(structurePoolFifths(2)).toBe(14);
    expect(rampHealthFrac(5, 25, penta)).toBeCloseTo(0.5, 12);
  });

  it('a non-finite banked total reads as rubble, not as health', () => {
    expect(rampHealthFrac(HUB.connectors, Number.NaN, HUB)).toBe(0);
  });

  /**
   * ⭐⭐ **THE OTHER HALF OF THE OWNER'S CORRECTION: THE SHAPES STAY HIDDEN WHILE IT IS HURT.**
   *
   * Cover is published from the member walk, so "does a damaged tower still hide its shapes" is
   * the same question as "does the walk still return them". At half health it must return every
   * member and every connector — the full cover set — while the ART reads frame 12, the damaged
   * plate. *"You can see the tower is damaged. You can just click the tower and repair it. You
   * don't have to see the connectors."*
   */
  it('⭐ a half-dead tower still publishes its FULL cover set, and draws frame 12', () => {
    const goblin = rampSpecFor('goblinTower' as GodlyId)!;
    const pool = structurePoolFifths(goblin.connectors); // 36
    const world = structureWorld({
      spawners: [{ id: 7, recipeId: 'goblinTower', anchor: 1 }],
      prims: [[1, 0, 0], [2, 0, -44], [3, 44, 0], [4, 0, 44], [5, -44, 0]],
      bonds: [[1, 1, 2], [2, 1, 3], [3, 1, 4], [4, 1, 5]],
    });
    world.bonds.get(asBondId(1))!.damageFifths = pool / 2;
    const at = rampMembersAt(world, asPrimitiveId(1), goblin)!;
    expect(at.members).toHaveLength(5); // every shape still covered
    expect(at.bonds).toHaveLength(4); // every connector still covered
    expect(at.bankedFifths).toBe(pool / 2);
    const frac = rampHealthFrac(at.bonds.length, at.bankedFifths, goblin);
    expect(frac).toBeCloseTo(0.5, 12);
    expect(rampFrameForHealth(frac, goblin.frames)).toBe(12); // the damaged plate
  });
});

/**
 * SPARK — S183 — ⛔⛔ **AN INVISIBLE TOWER MUST STILL BE A REPAIRABLE ONE.**
 *
 * FIX and SCRAP are reached by clicking a structure. `controls.ts` tries the tower ART BOX first
 * and falls back to a scan of each member shape's own ~10 px radius — and this branch just made
 * those member shapes invisible under five buildings. `towerAnchorAtPoint` covers the race towers
 * only (*"pentagram / goblin tower / lightning hub draw no building"*, and it walks
 * `creatureSpawners`, so never a defender), so without `rampAnchorAtPoint` the five ramp towers
 * would be clickable only on invisible dots.
 *
 * ⚠ THE BRIEF ASSUMED THIS PATH ALREADY COVERED THEM. It did not. That is why the test is here.
 */
function structureWorld(opts: {
  readonly spawners?: readonly { id: number; recipeId: string; anchor: number }[];
  readonly defenders?: readonly { id: number; recipeId: string; anchor: number }[];
  /** [id, x, y] per shape. */
  readonly prims: readonly (readonly [number, number, number])[];
  /** [id, aId, bId] per connector. */
  readonly bonds: readonly (readonly [number, number, number])[];
}): World {
  const prims = new Map(opts.prims.map(([id, x, y]) => [
    asPrimitiveId(id),
    { id: asPrimitiveId(id), pos: { x, y }, bonds: new Set<ReturnType<typeof asBondId>>() },
  ]));
  const bonds = new Map(opts.bonds.map(([id, a, b]) => {
    prims.get(asPrimitiveId(a))!.bonds.add(asBondId(id));
    prims.get(asPrimitiveId(b))!.bonds.add(asBondId(id));
    return [asBondId(id), {
      id: asBondId(id),
      aId: asPrimitiveId(a),
      bId: asPrimitiveId(b),
      a: prims.get(asPrimitiveId(a)),
      b: prims.get(asPrimitiveId(b)),
      damageFifths: 0,
      createdTick: 0,
    }];
  }));
  return {
    primitives: prims,
    bonds,
    creatureSpawners: new Map((opts.spawners ?? []).map((s) => [s.id, {
      id: s.id, recipeId: s.recipeId, anchorPrimitiveId: asPrimitiveId(s.anchor),
    }])),
    defenders: new Map((opts.defenders ?? []).map((d) => [d.id, {
      id: d.id, recipeId: d.recipeId, anchorPrimitiveId: asPrimitiveId(d.anchor),
    }])),
  } as unknown as World;
}

/** A 4-armed goblin-tower star centred on the origin, `STAR_R` 44 out. */
function goblinStar(): World {
  return structureWorld({
    spawners: [{ id: 7, recipeId: 'goblinTower', anchor: 1 }],
    prims: [[1, 0, 0], [2, 0, -44], [3, 44, 0], [4, 0, 44], [5, -44, 0]],
    bonds: [[1, 1, 2], [2, 1, 3], [3, 1, 4], [4, 1, 5]],
  });
}

describe('S183 — rampAnchorAtPoint: the FIX / SCRAP click box for a hidden tower', () => {
  const GOBLIN = rampSpecFor('goblinTower' as GodlyId)!;

  it('⭐ a click on the BODY of a goblin tower resolves to its anchor', () => {
    const world = goblinStar();
    expect(rampAnchorAtPoint(world, 0, 0)).toBe(asPrimitiveId(1));
    expect(rampAnchorAtPoint(world, 0, -GOBLIN.artPx * 0.4)).toBe(asPrimitiveId(1));
    expect(rampAnchorAtPoint(world, GOBLIN.artPx * 0.4, -10)).toBe(asPrimitiveId(1));
  });

  /*
   * ⛔⛔ S183 MERGE OWNER — **THE BAND THIS SUITE NEVER TESTED IS THE BAND THAT WAS BROKEN.**
   *
   * `place()` is `sprite.y = cy + artPx*0.5 + (1 - footY)*spritePx` against a BOTTOM anchor, so the
   * art straddles the centroid: top at `cy - 0.5*artPx`, ground line at `cy + 0.5*artPx`. The first
   * version of `rampAnchorAtPoint` accepted `[cy - artPx, cy + 0.175*artPx]` — derived from a
   * docblock sentence rather than from `place()` — which missed the bottom 32 px of every goblin
   * tower and accepted 50 px of empty sky above it.
   *
   * This suite was GREEN over that, because it asserted a hit at `-0.6*artPx` (ten pixels above the
   * top of the drawing) and misses only far outside. A mechanical test can still test the wrong
   * geometry if the geometry came from prose. These cases walk the FOOT, which is the widest and
   * most natural part of a tower to click and the part a player actually aims at.
   */
  it('⛔ the FOOT of the tower is clickable — the half of the art BELOW the centroid', () => {
    const world = goblinStar();
    const half = GOBLIN.artPx * 0.5;
    for (const frac of [0.2, 0.35, 0.49]) {
      expect(rampAnchorAtPoint(world, 0, half * frac * 2)).toBe(asPrimitiveId(1));
    }
    // and the drawn extremes, just inside each edge of the art
    expect(rampAnchorAtPoint(world, 0, half - 1)).toBe(asPrimitiveId(1));
    expect(rampAnchorAtPoint(world, 0, -half + 1)).toBe(asPrimitiveId(1));
  });

  it('⛔ and NOT outside the drawn art — empty sky above, empty ground below', () => {
    const world = goblinStar();
    const half = GOBLIN.artPx * 0.5;
    expect(rampAnchorAtPoint(world, 0, half + 1)).toBeNull();
    expect(rampAnchorAtPoint(world, 0, -half - 1)).toBeNull();
    expect(rampAnchorAtPoint(world, 0, GOBLIN.artPx)).toBeNull();
    expect(rampAnchorAtPoint(world, 0, -GOBLIN.artPx * 1.5)).toBeNull();
    expect(rampAnchorAtPoint(world, GOBLIN.artPx, 0)).toBeNull();
  });

  it('⭐ a DEFENDER is reachable — the collection no publish site could see before S183', () => {
    const world = structureWorld({
      defenders: [{ id: 3, recipeId: 'laserTurret', anchor: 1 }],
      prims: [[1, 300, 300], [2, 300, 256], [3, 344, 300], [4, 300, 344],
        [5, 256, 300], [6, 331, 331], [7, 269, 269]],
      bonds: [[1, 1, 2], [2, 1, 3], [3, 1, 4], [4, 1, 5], [5, 1, 6], [6, 1, 7]],
    });
    expect(rampAnchorAtPoint(world, 300, 290)).toBe(asPrimitiveId(1));
  });

  it('⭐ a PENTAGRAM resolves through its ring, not through its anchor\'s two arms', () => {
    // A closed 5-cycle at RING_R 40 around (0,0). Its anchor is an arbitrary ring node, so the
    // centroid is only right if the walk took the whole cycle.
    const R = 40;
    const pts = Array.from({ length: 5 }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      return [i + 1, Math.round(Math.cos(a) * R), Math.round(Math.sin(a) * R)] as const;
    });
    const world = structureWorld({
      spawners: [{ id: 2, recipeId: 'pentagram', anchor: 1 }],
      prims: pts,
      bonds: [[1, 1, 2], [2, 2, 3], [3, 3, 4], [4, 4, 5], [5, 5, 1]],
    });
    const at = rampMembersAt(world, asPrimitiveId(1), rampSpecFor('pentagram' as GodlyId)!)!;
    expect(at.members).toHaveLength(5);
    expect(at.bonds).toHaveLength(5);
    expect(at.cx).toBeCloseTo(0, 0);
    expect(at.cy).toBeCloseTo(0, 0);
    expect(rampAnchorAtPoint(world, 0, -20)).toBe(asPrimitiveId(1));
  });

  it('⛔ the star walk on a pentagram would find only TWO arms — which is why shape exists', () => {
    const R = 40;
    const pts = Array.from({ length: 5 }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      return [i + 1, Math.round(Math.cos(a) * R), Math.round(Math.sin(a) * R)] as const;
    });
    const world = structureWorld({
      spawners: [{ id: 2, recipeId: 'pentagram', anchor: 1 }],
      prims: pts,
      bonds: [[1, 1, 2], [2, 2, 3], [3, 3, 4], [4, 4, 5], [5, 5, 1]],
    });
    const asStar = rampMembersAt(
      world, asPrimitiveId(1), { ...rampSpecFor('pentagram' as GodlyId)!, shape: 'star' },
    )!;
    expect(asStar.bonds).toHaveLength(2); // the defect the 'ring' shape avoids, demonstrated
  });

  it('returns null when nothing is there, and for a structure with no ramp art', () => {
    expect(rampAnchorAtPoint(structureWorld({ prims: [], bonds: [] }), 0, 0)).toBeNull();
    const stink = structureWorld({
      defenders: [{ id: 1, recipeId: 'stinkTower', anchor: 1 }],
      prims: [[1, 0, 0], [2, 0, -44], [3, 38, 22], [4, -38, 22]],
      bonds: [[1, 1, 2], [2, 1, 3], [3, 1, 4]],
    });
    expect(rampAnchorAtPoint(stink, 0, 0)).toBeNull();
  });
});

/*
 * ⭐⭐ S183 (owner) — **THE DEFENDER SPRITES DRAW BEHIND THEIR OWN BUILDING, AND NOTHING ELSE CAN
 * SEE THAT.** Pixi z-order is `addChild` order, so it is decided purely by the sequence of `new
 * XRenderer(...)` calls in `main.ts`. No renderer runs under vitest (they need a live Pixi app), so
 * every behavioural test in this repo is blind to it: Helga drew ON TOP of her own hall with the
 * whole suite green.
 *
 * > *"They're just fade out and one layer below. They're not over the tower, but behind and kind of
 * > phased out. So you can kind of count how many sprites you have there. But the tower is the main
 * > thing that is visible."*
 *
 * ⚠ THIS IS A SOURCE-TEXT GUARD AND IT PROVES ONLY THAT THE ORDER EXISTS, not that the layers
 * render that way — the honest limit this project keeps re-learning. It is still worth having,
 * because the ONLY way to break the ruling is to move one of these three lines, and that is exactly
 * what this catches. A renderer added to `fogHiddenLayer` between them is the case it cannot see.
 */
describe('S183 — the unit sprites are constructed BEFORE the ramp buildings, so they draw behind', () => {
  it('⛔ turret and princess both precede structureRampRenderer in main.ts', () => {
    const src = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    const at = (needle: string): number => {
      const i = src.indexOf(needle);
      expect(i, `${needle} not found in main.ts`).toBeGreaterThan(-1);
      return i;
    };
    const turret = at('new TurretRenderer(');
    const princess = at('new PrincessRenderer(');
    const ramp = at('new StructureRampRenderer(');
    expect(turret, 'the laser turret rig must draw behind its building').toBeLessThan(ramp);
    expect(princess, 'Helga must draw behind her hall').toBeLessThan(ramp);
  });
});
