/**
 * SPARK — S167 — the tower art's DECISIONS, and the shipped sheets they are decisions about.
 *
 * What this file is FOR:
 *
 *   · ⛔ **THE ROW TABLES ARE ASSERTED AGAINST THE SHIPPED `-anim.json` FILES.** The two tiers have
 *     DIFFERENT row orders — a tier-3 sheet carries a `spawning` row between `intact` and `damaged`
 *     and a tier-9 sheet does not — so reading one with the other's indices draws the WRONG FRAME
 *     rather than none. No "did it render" test can see that, and neither can `tsc`.
 *   · **The 0.5 threshold is pinned to the CASTLE's**, so the board never grows two different
 *     answers to "when does my structure look like it is in trouble".
 *   · **`towerHpFrac`'s two easy-to-get-wrong cases** — a member that is GONE, and an empty ring.
 *     Both have a plausible wrong answer that renders a dying tower pristine.
 *   · **Every atlas path the resolver builds exists on disk.** A failed `Assets.load` here is
 *     silent by design and there is no procedural tower to fall back on, so a typo draws NOTHING —
 *     which is exactly the state the tier-3 tower art was in for two sessions.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_RACES } from '../state/races.ts';
import { PRIMITIVE_MAX_HP, T9_RELEASE_DELAY_TICKS } from '../constants.ts';
import { RACE_TOWER_IDS } from '../state/raceTowerIds.ts';
import { T9_TOWER_IDS } from '../state/t9BossIds.ts';
import { CASTLE_DAMAGED_BELOW } from './castleFrames.ts';
import {
  TOWER_CRUMBLE_FRAMES,
  TOWER_DESTROY_FRAMES,
  crumbleAlpha,
  crumbleFrameIndex,
  destroyAtlasBase,
  T3_TOWER_STATE_ROWS,
  T3_TOWER_SPRITE_PX,
  T9_TOWER_STATE_ROWS,
  T9_TOWER_SPRITE_PX,
  TOWER_DAMAGED_BELOW,
  TOWER_SPRITE_ANCHOR,
  type TowerState,
  towerArtForRecipe,
  towerHpFrac,
  towerStateForHp,
} from './towerFrames.ts';
import { asPrimitiveId, type PrimitiveId } from '../types.ts';

const PUBLIC = join(process.cwd(), 'public');
const STATES: readonly TowerState[] = ['intact', 'damaged', 'destroyed'];

describe('S167 — towerStateForHp: the same rule the castle uses', () => {
  it('cuts at 0.5, and at the CASTLE’s 0.5 — one visual language for every structure', () => {
    expect(TOWER_DAMAGED_BELOW).toBe(CASTLE_DAMAGED_BELOW);
    expect(towerStateForHp(1)).toBe('intact');
    expect(towerStateForHp(0.51)).toBe('intact');
    expect(towerStateForHp(0.5)).toBe('damaged'); // the boundary is EXCLUSIVE of intact
    expect(towerStateForHp(0.01)).toBe('damaged');
    expect(towerStateForHp(0)).toBe('destroyed');
  });

  it('⚠ a NEGATIVE or NaN fraction is rubble, never pristine', () => {
    /*
     * The comparison ORDER is the whole mechanism, copied from `castleStateForHp`. A structure that
     * renders as rubble because something upstream is broken is a far louder bug than one that
     * renders intact and hides it.
     */
    expect(towerStateForHp(-1)).toBe('destroyed');
    expect(towerStateForHp(Number.NaN)).toBe('destroyed');
  });
});

describe('S167 — towerHpFrac: the two cases with a plausible wrong answer', () => {
  const hpMap = (m: Record<number, number>) => (id: PrimitiveId): number | undefined => m[id as number];

  it('averages the ring', () => {
    const ids = [1, 2, 3].map(asPrimitiveId);
    expect(towerHpFrac(ids, hpMap({ 1: PRIMITIVE_MAX_HP, 2: PRIMITIVE_MAX_HP, 3: PRIMITIVE_MAX_HP }))).toBe(1);
    expect(towerHpFrac(ids, hpMap({ 1: PRIMITIVE_MAX_HP / 2, 2: PRIMITIVE_MAX_HP / 2, 3: PRIMITIVE_MAX_HP / 2 })))
      .toBeCloseTo(0.5, 6);
  });

  it('⛔ a member that is GONE counts as ZERO, not as absent', () => {
    /*
     * Skipping absent members is the plausible wrong answer, and it is badly wrong: a nine-ring with
     * six nodes destroyed would average the three survivors and render PRISTINE. "Half my tower is
     * missing" must read the same as "all of it is half gone".
     */
    const ids = [1, 2, 3, 4].map(asPrimitiveId);
    const frac = towerHpFrac(ids, hpMap({ 1: PRIMITIVE_MAX_HP, 2: PRIMITIVE_MAX_HP })); // 3 and 4 razed
    expect(frac).toBeCloseTo(0.5, 6);
    expect(towerStateForHp(frac)).toBe('damaged');
  });

  it('an EMPTY ring is 0, not 1 — a tower with no members is not a healthy tower', () => {
    expect(towerHpFrac([], hpMap({}))).toBe(0);
    expect(towerStateForHp(towerHpFrac([], hpMap({})))).toBe('destroyed');
  });

  it('over-max and negative HP are both clamped, so the fraction stays in 0..1', () => {
    const ids = [1, 2].map(asPrimitiveId);
    expect(towerHpFrac(ids, hpMap({ 1: PRIMITIVE_MAX_HP * 10, 2: PRIMITIVE_MAX_HP }))).toBe(1);
    expect(towerHpFrac(ids, hpMap({ 1: -500, 2: PRIMITIVE_MAX_HP }))).toBeCloseTo(0.5, 6);
  });
});

describe('S167 — towerArtForRecipe resolves both tiers and refuses everything else', () => {
  it('every race tower of both tiers resolves to its own race, tier and size', () => {
    for (const race of ALL_RACES) {
      const t3 = towerArtForRecipe(RACE_TOWER_IDS[race]);
      expect(t3, `${race} tier-3`).not.toBe(null);
      expect(t3!.race).toBe(race);
      expect(t3!.tier).toBe(3);
      expect(t3!.sizePx).toBe(T3_TOWER_SPRITE_PX);

      const t9 = towerArtForRecipe(T9_TOWER_IDS[race]);
      expect(t9, `${race} tier-9`).not.toBe(null);
      expect(t9!.race).toBe(race);
      expect(t9!.tier).toBe(9);
      expect(t9!.sizePx).toBe(T9_TOWER_SPRITE_PX);

      // The two tiers must never resolve to the same sheet.
      expect(t9!.atlasBase).not.toBe(t3!.atlasBase);
    }
  });

  it('returns null for every recipe that has no structure art', () => {
    for (const other of ['pentagram', 'goblinTower', 'lightningHub', 'voltkin', 'helga', 'stinkTower'] as const) {
      expect(towerArtForRecipe(other), other).toBe(null);
    }
  });

  it('the tier-9 tower is drawn BIGGER, because its ring is', () => {
    // A 3-ring at TRI_RING_R=34 is a ~68px footprint; a 9-ring at NINE_RING_R=64 is ~128px.
    expect(T9_TOWER_SPRITE_PX).toBeGreaterThan(T3_TOWER_SPRITE_PX);
  });

  it('the sprite is FOOT-anchored — the castle lesson that cost a capture', () => {
    expect(TOWER_SPRITE_ANCHOR).toEqual({ x: 0.5, y: 1 });
  });
});

describe('S167 — ⛔ the row tables agree with the SHIPPED sheets', () => {
  /*
   * The single highest-value assertion in this file. The two tiers have different row orders, and a
   * mismatch draws the WRONG FRAME — `spawning` where `damaged` belongs — which renders perfectly
   * and is wrong. Nothing else in the tree compares these numbers to the art.
   */
  it('tier-3: intact 0, damaged 2, destroyed 3 (row 1 is `spawning`)', () => {
    for (const race of ALL_RACES) {
      const art = towerArtForRecipe(RACE_TOWER_IDS[race])!;
      const p = join(PUBLIC, `${art.atlasBase}-anim.json`);
      expect(existsSync(p), p).toBe(true);
      const m = JSON.parse(readFileSync(p, 'utf8')) as { states: Record<string, { row: number }> };
      for (const s of STATES) {
        expect(m.states[s]?.row, `${race} t3 ${s}`).toBe(T3_TOWER_STATE_ROWS[s]);
      }
      // Anti-vacuity: the row this table deliberately SKIPS must actually be there.
      expect(m.states['spawning']?.row, `${race} t3 spawning`).toBe(1);
    }
  });

  it('tier-9: intact 0, damaged 1, destroyed 2 (no `spawning` row exists)', () => {
    for (const race of ALL_RACES) {
      const art = towerArtForRecipe(T9_TOWER_IDS[race])!;
      const p = join(PUBLIC, `${art.atlasBase}-anim.json`);
      expect(existsSync(p), p).toBe(true);
      const m = JSON.parse(readFileSync(p, 'utf8')) as { states: Record<string, { row: number }> };
      for (const s of STATES) {
        expect(m.states[s]?.row, `${race} t9 ${s}`).toBe(T9_TOWER_STATE_ROWS[s]);
      }
      expect(m.states['spawning'], `${race} t9 must have no spawning row`).toBeUndefined();
    }
  });

  it('every atlas PNG the resolver names is on disk, both tiers', () => {
    for (const race of ALL_RACES) {
      for (const id of [RACE_TOWER_IDS[race], T9_TOWER_IDS[race]]) {
        const art = towerArtForRecipe(id)!;
        expect(existsSync(join(PUBLIC, `${art.atlasBase}-atlas.png`)), `${art.atlasBase}-atlas.png`).toBe(true);
      }
    }
  });
});

describe('S167 — the CRUMBLE: the owner’s cinematic, and the clamps that keep it legal', () => {
  it('walks the destroy row start to end, and HOLDS the last frame', () => {
    expect(crumbleFrameIndex(0, 150, 12)).toBe(0);
    expect(crumbleFrameIndex(75, 150, 12)).toBe(6);
    /*
     * ⛔ THE TOP CLAMP IS THE ONE THAT MATTERS. `floor(1 * 12)` is 12 — one past the last index —
     * so an unclamped version reads a texture that does not exist on the very last frame of every
     * collapse. Holding frame 11 is also the right LOOK: the wreckage has settled.
     */
    expect(crumbleFrameIndex(150, 150, 12)).toBe(11);
    expect(crumbleFrameIndex(999, 150, 12)).toBe(11);
    expect(crumbleFrameIndex(-5, 150, 12)).toBe(0);
  });

  it('degenerate inputs do not throw or index off the end', () => {
    expect(crumbleFrameIndex(10, 0, 12)).toBe(0);
    expect(crumbleFrameIndex(10, 150, 0)).toBe(0);
  });

  it('stays FULLY OPAQUE for three quarters, then fades to nothing', () => {
    // The collapse is the thing the owner asked to be generated; fading throughout would waste it.
    expect(crumbleAlpha(0, 150)).toBe(1);
    expect(crumbleAlpha(112, 150)).toBe(1);
    expect(crumbleAlpha(150, 150)).toBe(0);
    expect(crumbleAlpha(131, 150)).toBeGreaterThan(0);
    expect(crumbleAlpha(131, 150)).toBeLessThan(1);
  });

  it('the whole sequence fits the owner’s 8-second budget at 60 Hz', () => {
    // 5 s standing (T9_RELEASE_DELAY_TICKS) + this collapse must clear 8 s total.
    expect((T9_RELEASE_DELAY_TICKS + TOWER_CRUMBLE_FRAMES) / 60).toBeLessThanOrEqual(8);
  });

  it('every destroy cinematic BOTH tiers name is on disk', () => {
    /*
     * The tier-3 six shipped in S165 with no accessor at all — not merely uncalled, unreachable.
     * This is the assertion that keeps either tier's cinematic from going missing again.
     */
    for (const race of ALL_RACES) {
      for (const tier of [3, 9] as const) {
        const base = destroyAtlasBase(race, tier);
        expect(existsSync(join(PUBLIC, `${base}-atlas.png`)), `${base}-atlas.png`).toBe(true);
        expect(existsSync(join(PUBLIC, `${base}-anim.json`)), `${base}-anim.json`).toBe(true);
        const m = JSON.parse(readFileSync(join(PUBLIC, `${base}-anim.json`), 'utf8')) as {
          states: Record<string, { row: number; frames: number }>;
        };
        expect(m.states['destroy']?.frames, `${base} frame count`).toBe(TOWER_DESTROY_FRAMES);
      }
    }
  });
});
