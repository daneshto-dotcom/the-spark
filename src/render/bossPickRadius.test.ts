/**
 * SPARK — S181: **THE CLICK TARGET SCALES WITH THE SPRITE, AND THE ART PINS THE RATIO.**
 *
 * Owner, S181 playtest: *"characters and towers aren't clickable everywhere. Like Vlad, I had to
 * click on his knees to open his character sheet. That's stupid. You should be able to open it
 * anywhere on him."*
 *
 * `CREATURE_PICK_DIST` (34 px) was flat for every creature while a boss draws ~2.56x a grunt, so the
 * clickable disc sat around a boss's feet-anchored centre — the knees. `creatureDrawnSizeRatio` is
 * the fix, and this file is what stops it drifting back:
 *
 *   1. the ratio is asserted against the REAL atlas cell heights on disk, so re-authoring a sheet at
 *      a different cell turns this red instead of silently shrinking the click target again;
 *   2. the per-type expectations are spelled out, so a new boss cannot inherit a grunt's hitbox.
 *
 * ⚠ CELL HEIGHT, NOT WIDTH, IS THE MEASURE — and that is a real finding rather than a preference.
 * The shipped widths vary by POSE (the Kraken's sheet is 536 wide for its tentacles, the scarab 285,
 * the bat 208) while every unit sheet is 200 tall and every boss sheet is 320 tall. Height is the
 * dimension the art pipeline actually holds constant, so height is what may be divided.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_RACES } from '../state/races.ts';
import { T9_BOSS_TYPE } from '../state/t9BossIds.ts';
import {
  T9_BOSS_ATLAS_CELL_RATIO,
  T9_BOSS_SPRITE_SCALE_MUL,
  DIREWOLF_SPRITE_SCALE_MUL,
  creatureDrawnSizeRatio,
  creatureSpriteScaleMul,
} from './towerFrames.ts';

const BOSS_DIR = join(process.cwd(), 'public', 'art', 'race-tier9-bosses');
const UNIT_DIR = join(process.cwd(), 'public', 'art', 'race-units');

function cellHeights(dir: string): { file: string; cellH: number }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('-anim.json'))
    .map((f) => {
      const j = JSON.parse(readFileSync(join(dir, f), 'utf-8')) as { cellH: number };
      return { file: f, cellH: j.cellH };
    });
}

describe('S181 — T9_BOSS_ATLAS_CELL_RATIO is pinned to the shipped art, not asserted by hand', () => {
  it('every boss sheet is authored at ONE cell height, and every unit sheet at one too', () => {
    const bosses = cellHeights(BOSS_DIR);
    const units = cellHeights(UNIT_DIR);
    expect(bosses.length).toBeGreaterThan(0);
    expect(units.length).toBeGreaterThan(0);
    expect(new Set(bosses.map((b) => b.cellH)).size).toBe(1);
    expect(new Set(units.map((u) => u.cellH)).size).toBe(1);
  });

  it('boss cell height / unit cell height IS the constant the pick radius multiplies by', () => {
    const bossH = cellHeights(BOSS_DIR)[0]?.cellH ?? 0;
    const unitH = cellHeights(UNIT_DIR)[0]?.cellH ?? 0;
    expect(bossH / unitH).toBe(T9_BOSS_ATLAS_CELL_RATIO);
  });

  it('the widths deliberately do NOT divide cleanly — the reason this test reads height', () => {
    // Guards the docblock's own claim. If the pipeline ever normalises widths this goes red and the
    // comment above should be re-read rather than the assertion flipped.
    const widths = readdirSync(BOSS_DIR)
      .filter((f) => f.endsWith('-anim.json'))
      .map((f) => (JSON.parse(readFileSync(join(BOSS_DIR, f), 'utf-8')) as { cellW: number }).cellW);
    expect(new Set(widths).size).toBeGreaterThan(1);
  });
});

describe('S181 — creatureDrawnSizeRatio: a boss no longer inherits a grunt hitbox', () => {
  it('a grunt is the 1x baseline', () => {
    expect(creatureDrawnSizeRatio('goblinMelee')).toBe(1);
    expect(creatureDrawnSizeRatio('goblinArcher')).toBe(1);
    expect(creatureSpriteScaleMul('goblinMelee')).toBe(1);
  });

  it('a T9 boss combines BOTH factors — the cell and the sprite multiplier', () => {
    const expected = T9_BOSS_ATLAS_CELL_RATIO * T9_BOSS_SPRITE_SCALE_MUL;
    // Vlad is the VAMPIRES boss: the type ids are per-race, not per-name (`T9_BOSS_TYPE`).
    expect(creatureDrawnSizeRatio('t9BossVampires')).toBe(expected);
    expect(expected).toBeCloseTo(2.56, 5);
  });

  it('the direwolf is scaled by its sprite multiplier ALONE — it borrows a unit-size cell', () => {
    expect(creatureDrawnSizeRatio('direwolf')).toBe(DIREWOLF_SPRITE_SCALE_MUL);
  });

  it('⛔ EVERY boss is bigger than a grunt — the guard against one being missed', () => {
    // Enumerated from ALL_RACES through the shipped table rather than hand-listed, so a seventh
    // race cannot be added without this guard covering its boss too.
    for (const race of ALL_RACES) {
      expect(creatureDrawnSizeRatio(T9_BOSS_TYPE[race])).toBeGreaterThan(1);
    }
  });
});
