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
import { tvDestructionRow, tvEmergenceRow } from './voltkinTowerRenderer.ts';
import { CREATURE_SPAWN_TICKS } from '../state/creatures/creature.ts';

interface Manifest { states: Record<string, { row: number; frames: number }> }
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
  it('plays critical, then explosion, then settles on ruins', () => {
    expect(tvDestructionRow(0)).toBe('critical');
    expect(tvDestructionRow(17)).toBe('critical');
    expect(tvDestructionRow(18)).toBe('explosion');
    expect(tvDestructionRow(35)).toBe('explosion');
    expect(tvDestructionRow(36)).toBe('destroyed');
  });

  it('HOLDS ruins forever — a destroyed tower must never loop back into exploding', () => {
    for (const t of [36, 100, 10_000, 1_000_000]) expect(tvDestructionRow(t)).toBe('destroyed');
  });

  it('visits all three beats, and every row it names exists on the sheet', () => {
    const seen = new Set<string>();
    for (let t = 0; t < 60; t++) seen.add(tvDestructionRow(t));
    expect(seen).toEqual(new Set(['critical', 'explosion', 'destroyed']));
    for (const r of seen) expect(manifest.states[r]).toBeDefined();
  });
});
