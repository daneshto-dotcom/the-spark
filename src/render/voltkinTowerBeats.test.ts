/**
 * SPARK — S176 P2: the Voltkin TV's two frame-driven beats.
 *
 * ⛔ WHY THESE EXIST. The owner photographed the emergence and said *"it's stuck in that image ...
 * it's not generating the whole video loop of him coming out."* It was not stuck: `spawning` was a
 * single still at `framesPerState: 1`, held for the entire 60-tick spawn window. There was no
 * sequence. These tests pin that both beats now ADVANCE, and that they advance against the SHIPPED
 * manifest rather than an inline fixture — the mistake `voltkinFrames.ts` made for nine sessions.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  TV_CRITICAL_TICKS,
  TV_DESTRUCTION_TICKS,
  TV_EXPLOSION_TICKS,
  tvDestructionRow,
  tvEmergenceRow,
} from './voltkinTowerRenderer.ts';
import { CREATURE_SPAWN_TICKS } from '../state/creatures/creature.ts';

interface Manifest { states: Record<string, { row: number; frames: number; ticksPerFrame: number }> }
const manifest = JSON.parse(
  readFileSync('public/art/voltkin-tv/voltkin-tv-anim.json', 'utf8'),
) as Manifest;

describe('the shipped TV sheet', () => {
  it('carries all six panels, at six distinct rows', () => {
    const rows = ['intact', 'spawning', 'damaged', 'critical', 'explosion', 'destroyed'];
    for (const r of rows) expect(manifest.states[r], `row ${r} missing`).toBeDefined();
    expect(new Set(rows.map((r) => manifest.states[r]!.row)).size).toBe(6);
  });

  it('ships critical and explosion, which S175 left on disk', () => {
    expect(manifest.states.critical).toBeDefined();
    expect(manifest.states.explosion).toBeDefined();
  });
});

describe('tvEmergenceRow', () => {
  it('holds the TV before he comes through it, then bursts', () => {
    expect(tvEmergenceRow(0)).toBe('intact');
    expect(tvEmergenceRow(11)).toBe('intact');
    expect(tvEmergenceRow(12)).toBe('spawning');
  });

  it('ACTUALLY ADVANCES across the spawn window — the owner\'s "stuck in that image"', () => {
    const seen = new Set<string>();
    for (let t = 0; t < CREATURE_SPAWN_TICKS; t++) seen.add(tvEmergenceRow(t));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('is still bursting at the end of the spawn window, never back to intact mid-emergence', () => {
    expect(tvEmergenceRow(CREATURE_SPAWN_TICKS - 1)).toBe('spawning');
  });
});

describe('tvDestructionRow', () => {
  /*
   * ⛔ S178 — RE-PINNED, NOT RELAXED, AND NOW DERIVED FROM THE CONSTANTS IT GUARDS. These read
   * `18` and `36` as literals, so widening the beats (18 -> 36 and 18 -> 48, so a twelve-frame row
   * has time to actually play) turned them red. That is the guard working. Deriving the boundary
   * from `TV_CRITICAL_TICKS` / `TV_EXPLOSION_TICKS` means the next re-dial cannot half-land: the
   * windows move and this test moves with them, while still asserting the ORDER and the EDGES.
   */
  it('plays critical, then explosion, then settles on ruins', () => {
    expect(tvDestructionRow(0)).toBe('critical');
    expect(tvDestructionRow(TV_CRITICAL_TICKS - 1)).toBe('critical');
    expect(tvDestructionRow(TV_CRITICAL_TICKS)).toBe('explosion');
    expect(tvDestructionRow(TV_CRITICAL_TICKS + TV_EXPLOSION_TICKS - 1)).toBe('explosion');
    expect(tvDestructionRow(TV_CRITICAL_TICKS + TV_EXPLOSION_TICKS)).toBe('destroyed');
  });

  /*
   * ⛔⛔ S178 SECOND PASS — **THIS ASSERTION WAS THE FIRST PASS'S OWN MISTAKE, WRITTEN DOWN.**
   *
   * It required `frames × ticksPerFrame === window` for `critical` and `explosion`, on the belief
   * that they were twelve-frame rows needing time to play. A pixel diff of the shipped PNG says
   * otherwise: on `intact`, `damaged`, `critical` and `explosion` all twelve cells are BYTE-IDENTICAL
   * (absolute difference from frame 0 is exactly zero for all eleven), and `atlas-specs.json`
   * declares them `still:`. There is no animation in those rows to make room for — so the assertion
   * was enforcing dead air, and the widened windows it justified held two frozen pictures on screen
   * for 1.4 s before the one genuinely animated row began.
   *
   * The real invariant is about the rows that DO move: `destroyed` must fit inside the hold it is
   * given, or the one animation in the death sequence is cut off. That is what is pinned now.
   */
  it('the ANIMATED destruction row fits inside its hold — the rest are stills, deliberately', () => {
    const ruins = manifest.states.destroyed;
    expect(ruins).toBeDefined();
    expect(
      ruins.frames * ruins.ticksPerFrame,
      'the ruins clip must finish inside TV_RUINS_HOLD_TICKS or the collapse is cut off',
    ).toBeLessThanOrEqual(TV_DESTRUCTION_TICKS - TV_CRITICAL_TICKS - TV_EXPLOSION_TICKS);
  });

  it('HOLDS ruins forever — a destroyed tower must never loop back into exploding', () => {
    const ruins = TV_CRITICAL_TICKS + TV_EXPLOSION_TICKS;
    for (const t of [ruins, ruins + 64, 10_000, 1_000_000]) expect(tvDestructionRow(t)).toBe('destroyed');
  });

  it('visits all three beats, and every row it names exists on the sheet', () => {
    const seen = new Set<string>();
    const past = TV_CRITICAL_TICKS + TV_EXPLOSION_TICKS + 8;
    for (let t = 0; t < past; t++) seen.add(tvDestructionRow(t));
    expect(seen).toEqual(new Set(['critical', 'explosion', 'destroyed']));
    for (const r of seen) expect(manifest.states[r]).toBeDefined();
  });
});
