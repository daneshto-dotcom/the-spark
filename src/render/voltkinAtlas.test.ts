/**
 * SPARK — S176 P1: the Voltkin's sheet selectors.
 *
 * ⛔ WHAT THIS IS GUARDING, AND IT IS NOT THE ARITHMETIC. The Voltkin went nine sessions with a full
 * atlas mapping written down in `voltkinFrames.ts` and NOTHING behind it — retired in S107, kept as a
 * "tested spec", tested against an inline manifest that no shipped file had to match. The tests were
 * green the entire time he was two stills. So these assertions are deliberately driven by the SHIPPED
 * manifest on disk, not by a literal: a spec whose fixture is hand-written cannot notice that the
 * thing it describes does not exist.
 *
 * ⚠ AND THE FRAME COUNT IS PINNED ON PURPOSE. The owner's S176 ruling was that 12 frames reads as
 * choppy ("moving from one stance to another too quickly"), and 20 is a CEILING set by an 8192 px
 * texture limit, not a preference. A future session raising it will fail here and read why.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { voltkinAtlasFrame, voltkinAtlasRow, type VoltkinRow } from './creatureRenderer.ts';
import { VOLTKIN_ATTACK_CADENCE_TICKS, type CreatureState } from '../state/creatures/creature.ts';

interface Manifest {
  cellW: number;
  cellH: number;
  footAnchor: { x: number; y: number };
  states: Record<string, { row: number; frames: number; ticksPerFrame: number }>;
}
const manifest = JSON.parse(
  readFileSync('public/godly/voltkin/anim/voltkin-anim.json', 'utf8'),
) as Manifest;

const ROWS: readonly VoltkinRow[] = ['idle', 'walk', 'attack', 'die'];

describe('the shipped Voltkin sheet', () => {
  it('carries all four rows the renderer asks for, at distinct row indices', () => {
    for (const r of ROWS) expect(manifest.states[r], `row ${r} missing from the shipped sheet`).toBeDefined();
    const indices = ROWS.map((r) => manifest.states[r]!.row);
    expect(new Set(indices).size).toBe(ROWS.length);
  });

  it('is 20 frames per state — the owner S176 ruling, and the texture-ceiling cap', () => {
    for (const r of ROWS) expect(manifest.states[r]!.frames, `row ${r}`).toBe(20);
  });

  it('stays inside the 8192px conservative WebGL texture ceiling', () => {
    const maxFrames = Math.max(...ROWS.map((r) => manifest.states[r]!.frames));
    expect(maxFrames * manifest.cellW).toBeLessThanOrEqual(8192);
  });

  it('anchors at the feet, which is what the ground marker at creature.pos assumes', () => {
    expect(manifest.footAnchor.y).toBeGreaterThan(0.9);
  });

  it('plays the attack row across exactly the attack cadence, so a swing is never cut off', () => {
    const a = manifest.states.attack!;
    expect(a.frames * a.ticksPerFrame).toBe(VOLTKIN_ATTACK_CADENCE_TICKS);
  });
});

describe('voltkinAtlasRow', () => {
  it('maps every FSM state to a row that exists on the sheet', () => {
    const states: CreatureState[] = ['SPAWNING', 'SEEKING', 'ATTACKING', 'DESPAWNING'];
    for (const s of states) {
      for (const moving of [true, false]) {
        expect(manifest.states[voltkinAtlasRow(s, moving)]).toBeDefined();
      }
    }
  });

  it('walks only while actually moving, and idles when still', () => {
    expect(voltkinAtlasRow('SEEKING', true)).toBe('walk');
    expect(voltkinAtlasRow('SEEKING', false)).toBe('idle');
  });

  it('draws the strike and the corpse regardless of motion', () => {
    expect(voltkinAtlasRow('ATTACKING', true)).toBe('attack');
    expect(voltkinAtlasRow('ATTACKING', false)).toBe('attack');
    expect(voltkinAtlasRow('DESPAWNING', true)).toBe('die');
  });

  it('draws idle while SPAWNING — the emergence is the TV renderer\'s beat, not the creature\'s', () => {
    expect(voltkinAtlasRow('SPAWNING', false)).toBe('idle');
  });
});

describe('voltkinAtlasFrame', () => {
  const meta = (r: VoltkinRow) => manifest.states[r]!;

  it('LOOPS idle and walk off worldTick, so a SEEKING re-entry never restarts the gait', () => {
    for (const r of ['idle', 'walk'] as const) {
      const { frames, ticksPerFrame } = meta(r);
      const period = frames * ticksPerFrame;
      // ticksInState is deliberately varied and must not matter for a loop.
      expect(voltkinAtlasFrame(r, 0, 0, frames, ticksPerFrame)).toBe(0);
      expect(voltkinAtlasFrame(r, 999, period, frames, ticksPerFrame)).toBe(0);
      expect(voltkinAtlasFrame(r, 7, ticksPerFrame, frames, ticksPerFrame)).toBe(1);
    }
  });

  it('ONE-SHOTS attack and die off ticksInState, and HOLDS the last frame', () => {
    for (const r of ['attack', 'die'] as const) {
      const { frames, ticksPerFrame } = meta(r);
      expect(voltkinAtlasFrame(r, 0, 12345, frames, ticksPerFrame)).toBe(0);
      expect(voltkinAtlasFrame(r, ticksPerFrame, 12345, frames, ticksPerFrame)).toBe(1);
      // ⛔ the whole point: a modulo here would LOOP A CORPSE.
      const past = frames * ticksPerFrame * 10;
      expect(voltkinAtlasFrame(r, past, 0, frames, ticksPerFrame)).toBe(frames - 1);
    }
  });

  it('never returns an out-of-range index for any tick, in any row', () => {
    for (const r of ROWS) {
      const { frames, ticksPerFrame } = meta(r);
      for (let t = 0; t < 400; t++) {
        const i = voltkinAtlasFrame(r, t, t, frames, ticksPerFrame);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(frames);
      }
    }
  });

  it('survives a degenerate manifest rather than indexing into nothing', () => {
    expect(voltkinAtlasFrame('idle', 5, 5, 0, 4)).toBe(0);
    expect(voltkinAtlasFrame('idle', 5, 5, 4, 0)).toBeGreaterThanOrEqual(0);
  });
});
