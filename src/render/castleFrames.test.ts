/**
 * SPARK — S161 W1-B. The castle art's CONTRACTS, as opposed to its pixels.
 *
 * ⭐ EVERY TEST HERE EXISTS BECAUSE THE THING IT PINS SPANS TWO FILES THAT CANNOT SEE EACH OTHER.
 * The row order lives in a JSON spec and in a TypeScript Record; the damage threshold lives in
 * `castleFrames.ts` and in a `Graphics` call inside the renderer; the atlas paths live in a Record
 * and on disk. `tsc` cannot check any of those pairs, so a rename or a retune breaks the game
 * silently and only shows up as a castle that draws the wrong state — or nothing at all.
 *
 * ⚠ WHAT THIS FILE DOES NOT DO IS LOOK AT THE ART. It cannot: a green suite is not evidence for
 * render work (the S147 FIGHT-banner lesson, quoted in W1-B's own exit gate). The captured frame is
 * the other half and it is not automatable here.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  CASTLE_ATLAS_BASE,
  CASTLE_DAMAGED_BELOW,
  CASTLE_SPRITE_ANCHOR,
  CASTLE_SPRITE_PX,
  CASTLE_STATE_ROWS,
  castleStateForHp,
  type CastleAtlasManifest,
  type CastleState,
} from './castleFrames.ts';
import { ALL_RACES } from '../state/races.ts';
import { CASTLE_FIRE_INTERVAL_TICKS, KEEP_H, KEEP_W } from '../constants.ts';
import { castleFiresOnTick, ticksSinceCastleShot } from '../state/castleGuns.ts';
import { CASTLE_SHOT_VFX_TICKS } from './raceMotifs.ts';

const PUBLIC = 'public';
/** `/art/castles/castle-x` in the browser is `public/art/castles/castle-x` on disk. */
const onDisk = (base: string): string => join(PUBLIC, base.replace(/^\//, ''));

describe('castleStateForHp', () => {
  it('is intact only ABOVE the threshold, so a castle at exactly half is already wounded', () => {
    expect(castleStateForHp(1)).toBe('intact');
    expect(castleStateForHp(0.51)).toBe('intact');
    expect(castleStateForHp(CASTLE_DAMAGED_BELOW)).toBe('damaged');
    expect(castleStateForHp(0.25)).toBe('damaged');
  });

  it('stays damaged for any sliver of health, and is destroyed only at zero', () => {
    expect(castleStateForHp(0.001)).toBe('damaged');
    expect(castleStateForHp(0)).toBe('destroyed');
  });

  it('resolves OVER-DAMAGE (a negative fraction) to destroyed, not back to intact', () => {
    // damageEntity can drive castleHp below zero, so hpFrac genuinely arrives negative.
    expect(castleStateForHp(-0.4)).toBe('destroyed');
    expect(castleStateForHp(-99)).toBe('destroyed');
  });

  it('resolves NaN to destroyed — the loud failure, not the quiet one', () => {
    expect(castleStateForHp(Number.NaN)).toBe('destroyed');
  });
});

describe('the art threshold and the HP bar agree', () => {
  /*
   * ⛔ THIS IS THE POINT OF THE WHOLE FILE. The bar recolours green→amber at `hpFrac > 0.5` inside a
   * `Graphics` call in gathererRenderer.ts; the sprite turns at CASTLE_DAMAGED_BELOW here. Nothing
   * connects them but intent, so retuning one leaves a castle whose bar says "hurt" and whose
   * building says "pristine".
   */
  const SRC = readFileSync('src/render/gathererRenderer.ts', 'utf8');

  it('the bar\'s amber boundary is the same number as CASTLE_DAMAGED_BELOW', () => {
    expect(CASTLE_DAMAGED_BELOW).toBe(0.5);
    // ⚠ ASSERTS A CODE SHAPE, NOT A BARE NUMBER. Stripping the comments first is what stops this
    // matching the docblock that EXPLAINS the boundary — this repo has shipped five bindings that
    // read their own documentation instead of the code.
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain('hpFrac > 0.5 ? 0x6ee07a');
    // The control assertion: prove the strip did not empty the haystack.
    expect(code).toContain('drawRaceKeepFallback(');
  });
});

describe('CASTLE_ATLAS_BASE', () => {
  it('covers every race exactly once, with no duplicate path', () => {
    const keys = Object.keys(CASTLE_ATLAS_BASE).sort();
    expect(keys).toEqual([...ALL_RACES].sort());
    const paths = Object.values(CASTLE_ATLAS_BASE);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('ships both files for every race — the atlas AND its manifest', () => {
    for (const race of ALL_RACES) {
      const base = onDisk(CASTLE_ATLAS_BASE[race]);
      expect(existsSync(`${base}-atlas.png`), `${race} atlas`).toBe(true);
      expect(existsSync(`${base}-anim.json`), `${race} manifest`).toBe(true);
    }
  });

  it('files under /art/castles/ and NOT under /godly/, which means something else', () => {
    for (const race of ALL_RACES) {
      expect(CASTLE_ATLAS_BASE[race].startsWith('/art/castles/')).toBe(true);
    }
  });
});

describe('the shipped manifests match the TypeScript contract', () => {
  const manifests = ALL_RACES.map((race) => ({
    race,
    m: JSON.parse(
      readFileSync(`${onDisk(CASTLE_ATLAS_BASE[race])}-anim.json`, 'utf8'),
    ) as CastleAtlasManifest,
  }));

  it('every race declares exactly the three states, on the rows CASTLE_STATE_ROWS claims', () => {
    for (const { race, m } of manifests) {
      expect(Object.keys(m.states).sort(), race).toEqual(['damaged', 'destroyed', 'intact']);
      for (const state of Object.keys(CASTLE_STATE_ROWS) as CastleState[]) {
        expect(m.states[state]?.row, `${race}/${state} row`).toBe(CASTLE_STATE_ROWS[state]);
      }
    }
  });

  it('every state is a single frame — these are conditions, not animations', () => {
    for (const { race, m } of manifests) {
      for (const [state, st] of Object.entries(m.states)) {
        expect(st.frames, `${race}/${state}`).toBe(1);
      }
    }
  });

  it('every race uses the SAME square cell, which is what makes six atlases comparable', () => {
    // Each atlas is measured independently (its own union bbox), so the shared cell is the only
    // thing keeping a spire and a reef fort at the same scale on the same board.
    for (const { race, m } of manifests) {
      expect(m.cellW, `${race} cellW`).toBe(256);
      expect(m.cellH, `${race} cellH`).toBe(256);
    }
  });

  it('every castle is foot-anchored to the bottom of its cell', () => {
    for (const { race, m } of manifests) {
      expect(m.footAnchor.x, `${race}`).toBe(0.5);
      expect(m.footAnchor.y, `${race}`).toBeGreaterThan(0.98);
    }
  });
});

describe('the sprite sits on the keep box it replaces', () => {
  it('is anchored bottom-centre, so scaling it grows the castle upward from the ground', () => {
    expect(CASTLE_SPRITE_ANCHOR).toEqual({ x: 0.5, y: 1 });
  });

  it('overhangs the click target without dwarfing it', () => {
    // The box is 74 x 58 and does not move — isPointInKeep reads those. A sprite far larger than
    // the thing you click would break the "click what you see" contract; far smaller and the art
    // would float inside an invisible box.
    expect(CASTLE_SPRITE_PX).toBeGreaterThan(KEEP_W);
    expect(CASTLE_SPRITE_PX).toBeLessThan(KEEP_W * 2);
    expect(CASTLE_SPRITE_PX).toBeGreaterThan(KEEP_H);
  });
});

describe('ticksSinceCastleShot is the same schedule as the gun', () => {
  it('reads zero on exactly the ticks castleFiresOnTick fires, across a full interval', () => {
    for (const seat of [0, 1, 2, 3, 5, 41]) {
      let fired = 0;
      for (let tick = 0; tick < CASTLE_FIRE_INTERVAL_TICKS * 2; tick++) {
        const zero = ticksSinceCastleShot(seat, tick) === 0;
        expect(zero, `seat ${seat} tick ${tick}`).toBe(castleFiresOnTick(seat, tick));
        if (zero) fired++;
      }
      // Anti-vacuity: the identity above is trivially true if neither ever fires.
      expect(fired, `seat ${seat} fired`).toBe(2);
    }
  });

  it('stays inside [0, interval) for negative ticks and negative seats', () => {
    for (const seat of [-3, 0, 7]) {
      for (const tick of [-241, -1, 0, 1, 5000]) {
        const v = ticksSinceCastleShot(seat, tick);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(CASTLE_FIRE_INTERVAL_TICKS);
      }
    }
  });

  it('the VFX cannot still be on screen when the next shot leaves', () => {
    // Otherwise a castle would read as permanently firing rather than as firing on a cadence.
    expect(CASTLE_SHOT_VFX_TICKS).toBeLessThan(CASTLE_FIRE_INTERVAL_TICKS);
  });
});
