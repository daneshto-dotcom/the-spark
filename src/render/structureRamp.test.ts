/**
 * SPARK — S182: **THE DAMAGE RAMP'S ARITHMETIC, AND THE ONE COINCIDENCE THAT HOLDS IT TOGETHER.**
 *
 * The owner gave four rows of a table (100 % → 1, 50 % → 12, 34 % → 16, below 33 % → 17..24) and a
 * threshold in the same breath. The valuable assertion is not the four rows — it is that the
 * THRESHOLD and the FRAME BOUNDARY are the same test, at every reachable health value rather than at
 * the four he happened to name. If they ever stop agreeing, the hub detonates on a frame that still
 * shows it standing, or stands on a frame that shows it in pieces.
 */
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
  rampFrameForHealth,
  rampSpecFor,
  type RampSpec,
} from './structureRamp.ts';
import { STAR_SELFDESTRUCT_BELOW_FRAC } from '../state/structureStarHealth.ts';
import { TOWER_DAMAGED_BELOW } from './towerFrames.ts';
import { structurePoolFifths } from '../state/stats.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';

const HUB = rampSpecFor('lightningHub' as GodlyId)!;

describe('the registry', () => {
  it('⛔ holds exactly ONE entry — the owner ruled one tower at a time', () => {
    // *"We're gonna do this one at a time ... Currently you're just gonna focus on the lightning
    // hub. I will present them one after another."* Adding the second is HIS call, not a tidy-up.
    expect(RAMP_SPECS.map((s) => s.recipeId)).toEqual(['lightningHub']);
  });

  it('every spec\'s rows add up to its frame count', () => {
    for (const spec of RAMP_SPECS) {
      const total = spec.rows.reduce((n, r) => n + r.count, 0);
      expect(total, `${spec.recipeId} rows vs frames`).toBe(spec.frames);
    }
  });

  it('returns null for a recipe with no ramp art — the other twelve towers are untouched', () => {
    expect(rampSpecFor('laserTurret' as GodlyId)).toBeNull();
    expect(rampSpecFor('pentagram' as GodlyId)).toBeNull();
    expect(rampSpecFor('t3TowerOrcs' as GodlyId)).toBeNull();
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
    // ⚠ `buildingTint` already switches green→amber at this same 0.5, so the health bar and the art
    // agree for free. A second constant here is how they would drift apart.
    expect(rampFrameForHealth(TOWER_DAMAGED_BELOW, HUB.frames)).toBe(12);
    expect(rampCell(12, HUB)).toEqual({ state: 'damage', col: 11 });
  });

  it('a spec that does not self-destruct has no death run', () => {
    const plain: RampSpec = { ...HUB, selfDestructBelow: null };
    expect(rampDeathFirstFrame(plain)).toBeNull();
    expect(rampDeathRunTicks(plain)).toBe(0);
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
