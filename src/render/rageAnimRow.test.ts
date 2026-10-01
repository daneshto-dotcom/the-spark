/**
 * SPARK — S191 round 2 (RAGE-3) — **THE ATTACK ROW PLAYS AT THE SPEED OF THE SWING THE SIM IS RUNNING.**
 *
 * The sim latches a cycle's rage on its first tick (`Creature.attackCycleRaged`, deploy #2 F3): a rage
 * edge mid-swing changes nothing until the next cycle. The renderer read the LIVE `enraged` bit for every
 * row, so at every rage edge the attack row jumped — a calm 60-tick swing drawn at the raged 3 ticks a
 * frame finishes at half-length and holds its last frame; a raged 30-tick swing drawn calm is cut off
 * halfway. BLOOD FRENZY makes those edges routine for a whole army.
 *
 * The rule: the ATTACK row reads the cycle latch; walk and idle (movement) keep the live bit, exactly as
 * the sim does (movement reads `rageMultiplier`, the swing reads `attackCycleMultiplier`).
 *
 * ⚠ PURE: no renderer runs under vitest (canon §7b), so this pins the one function `syncSprite` asks.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { animTicksPerFrame, animRageForRow } from './goblinRenderer.ts';
import { attackCycleMultiplier, rageMultiplier } from '../state/creatures/creature.ts';

describe('S191 R2 RAGE-3 — which rage bit sets each row’s frame rate', () => {
  it('⛔ the ATTACK row reads the cycle latch, not the live bit — both edges', () => {
    // calm → rage mid-swing: the sim finishes THIS swing calm, so must the drawing
    expect(animRageForRow('attack', true, false)).toBe(false);
    // rage → calm mid-swing: the sim finishes this swing raged
    expect(animRageForRow('attack', false, true)).toBe(true);
    expect(animRageForRow('attack', true, true)).toBe(true);
    expect(animRageForRow('attack', false, false)).toBe(false);
  });

  it('walk and idle keep the LIVE bit — movement is not latched', () => {
    for (const row of ['walk', 'idle']) {
      expect(animRageForRow(row, true, false), row).toBe(true);
      expect(animRageForRow(row, false, true), row).toBe(false);
    }
  });

  it('⭐ the attack row and the sim’s swing therefore always share one multiplier', () => {
    for (const enraged of [false, true]) {
      for (const attackCycleRaged of [false, true]) {
        const drawn = 6 / animTicksPerFrame(6, animRageForRow('attack', enraged, attackCycleRaged));
        expect(drawn, `enraged ${enraged}, latch ${attackCycleRaged}`).toBe(attackCycleMultiplier({ attackCycleRaged }));
        const walked = 6 / animTicksPerFrame(6, animRageForRow('walk', enraged, attackCycleRaged));
        expect(walked).toBe(rageMultiplier({ enraged }));
      }
    }
  });

  it('syncSprite asks it for the frame rate, with the creature’s latch passed from both call sites', () => {
    const src = readFileSync(new URL('./goblinRenderer.ts', import.meta.url), 'utf8');
    expect(src).toContain('animTicksPerFrame(st?.ticksPerFrame ?? 6, animRageForRow(name, enraged, attackCycleRaged))');
    const calls = src.match(/this\.syncSprite\([^\n]*\)/g) ?? [];
    expect(calls.length, 'the two call sites').toBe(2);
    for (const c of calls) expect(c, c).toContain('c.attackCycleRaged === true');
  });
});
