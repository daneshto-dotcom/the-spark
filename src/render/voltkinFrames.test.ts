/**
 * SPARK — Voltkin frame-selector unit tests (S36 P2).
 *
 * Pure-function coverage of `currentFrameKey` + `currentSpriteUrl` +
 * `isLionForm` + `flashIntensity` + URL/key invariants. No Pixi mocks —
 * functions take only primitive state + numeric ticks + killCount.
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_FRAME_KEYS,
  FLASH_SCALE_AMPLITUDE,
  FLASH_TINT,
  IDLE_CYCLE_TICKS,
  VOLTKIN_ATTACK_CADENCE_TICKS,
  VOLTKIN_FRAME_URLS,
  type VoltkinFrameKey,
  currentFrameKey,
  currentSpriteUrl,
  flashIntensity,
  isLionForm,
} from './voltkinFrames.ts';
import { VOLTKIN_ATTACK_FIRE_TICK } from '../state/creatures/creature.ts';

describe('VOLTKIN_FRAME_URLS', () => {
  it('contains 6 unique sprites', () => {
    const urls = Object.values(VOLTKIN_FRAME_URLS);
    expect(urls.length).toBe(6);
    expect(new Set(urls).size).toBe(6);
  });

  it('all URLs point to /godly/voltkin/sprites/', () => {
    for (const url of Object.values(VOLTKIN_FRAME_URLS)) {
      expect(url.startsWith('/godly/voltkin/sprites/')).toBe(true);
    }
  });

  it('ALL_FRAME_KEYS matches Object.keys(VOLTKIN_FRAME_URLS)', () => {
    expect([...ALL_FRAME_KEYS].sort()).toEqual(
      Object.keys(VOLTKIN_FRAME_URLS).sort(),
    );
  });
});

describe('currentFrameKey — SPAWNING', () => {
  it('ticks 0-29: zap (lion-form cinematic continuity)', () => {
    for (const tick of [0, 1, 5, 15, 29]) {
      expect(currentFrameKey('SPAWNING', tick, 0)).toBe('zap');
    }
  });

  it('ticks 30-59: idle1 (chibi-form settled)', () => {
    for (const tick of [30, 31, 45, 59]) {
      expect(currentFrameKey('SPAWNING', tick, 0)).toBe('idle1');
    }
  });
});

describe('currentFrameKey — SEEKING', () => {
  it('ticks 0 to IDLE_CYCLE_TICKS-1: idle1', () => {
    expect(currentFrameKey('SEEKING', 0, 0)).toBe('idle1');
    expect(currentFrameKey('SEEKING', IDLE_CYCLE_TICKS - 1, 0)).toBe('idle1');
  });

  it('ticks IDLE_CYCLE_TICKS to 2*IDLE_CYCLE_TICKS-1: idle2', () => {
    expect(currentFrameKey('SEEKING', IDLE_CYCLE_TICKS, 0)).toBe('idle2');
    expect(currentFrameKey('SEEKING', 2 * IDLE_CYCLE_TICKS - 1, 0)).toBe('idle2');
  });

  it('ticks 2*IDLE_CYCLE_TICKS to 3*IDLE_CYCLE_TICKS-1: idle1 (cycle wraps)', () => {
    expect(currentFrameKey('SEEKING', 2 * IDLE_CYCLE_TICKS, 0)).toBe('idle1');
    expect(currentFrameKey('SEEKING', 3 * IDLE_CYCLE_TICKS - 1, 0)).toBe('idle1');
  });

  it('alternation continues for many cycles without drift', () => {
    for (let cycle = 0; cycle < 10; cycle += 1) {
      const tickFirstHalf = cycle * IDLE_CYCLE_TICKS;
      const expected: VoltkinFrameKey = cycle % 2 === 0 ? 'idle1' : 'idle2';
      expect(currentFrameKey('SEEKING', tickFirstHalf, 0)).toBe(expected);
    }
  });
});

describe('currentFrameKey — ATTACKING', () => {
  it('ticks 0-14: idle1 (pre-windup)', () => {
    for (const tick of [0, 5, 14]) {
      expect(currentFrameKey('ATTACKING', tick, 0)).toBe('idle1');
    }
  });

  it('ticks 15-29: charge (windup, lion materializes)', () => {
    for (const tick of [15, 20, 29]) {
      expect(currentFrameKey('ATTACKING', tick, 0)).toBe('charge');
    }
  });

  it(`tick ${VOLTKIN_ATTACK_FIRE_TICK} (FIRE_TICK): zap (the strike)`, () => {
    expect(currentFrameKey('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK, 0)).toBe('zap');
  });

  it('ticks 31-44: charge (recovery hold)', () => {
    for (const tick of [31, 37, 44]) {
      expect(currentFrameKey('ATTACKING', tick, 0)).toBe('charge');
    }
  });

  it('ticks 45-59: idle1 (cooldown, settles back)', () => {
    for (const tick of [45, 50, 59]) {
      expect(currentFrameKey('ATTACKING', tick, 0)).toBe('idle1');
    }
  });

  it('covers every tick of the cadence with no undefined gaps', () => {
    for (let t = 0; t < VOLTKIN_ATTACK_CADENCE_TICKS; t += 1) {
      const key = currentFrameKey('ATTACKING', t, 0);
      expect(ALL_FRAME_KEYS).toContain(key);
    }
  });
});

describe('currentFrameKey — DESPAWNING', () => {
  it('killCount > 0: victory', () => {
    for (const killCount of [1, 2, 5, 99]) {
      expect(currentFrameKey('DESPAWNING', 0, killCount)).toBe('victory');
      expect(currentFrameKey('DESPAWNING', 30, killCount)).toBe('victory');
      expect(currentFrameKey('DESPAWNING', 59, killCount)).toBe('victory');
    }
  });

  it('killCount === 0: hurt', () => {
    expect(currentFrameKey('DESPAWNING', 0, 0)).toBe('hurt');
    expect(currentFrameKey('DESPAWNING', 30, 0)).toBe('hurt');
    expect(currentFrameKey('DESPAWNING', 59, 0)).toBe('hurt');
  });

  it('frame is independent of ticksInState during DESPAWNING', () => {
    const ticks = [0, 1, 30, 59];
    const keysAtKill0 = ticks.map((t) => currentFrameKey('DESPAWNING', t, 0));
    const keysAtKill1 = ticks.map((t) => currentFrameKey('DESPAWNING', t, 1));
    // All four ticks at killCount=0 should be the same key (hurt)
    expect(new Set(keysAtKill0).size).toBe(1);
    // All four ticks at killCount=1 should be the same key (victory)
    expect(new Set(keysAtKill1).size).toBe(1);
  });
});

describe('currentSpriteUrl — returns string URL from VOLTKIN_FRAME_URLS', () => {
  it('SPAWNING t=0: zap URL', () => {
    expect(currentSpriteUrl('SPAWNING', 0, 0)).toBe(VOLTKIN_FRAME_URLS.zap);
  });

  it('SEEKING t=0: idle1 URL', () => {
    expect(currentSpriteUrl('SEEKING', 0, 0)).toBe(VOLTKIN_FRAME_URLS.idle1);
  });

  it('ATTACKING fire-tick: zap URL', () => {
    expect(currentSpriteUrl('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK, 0)).toBe(
      VOLTKIN_FRAME_URLS.zap,
    );
  });

  it('DESPAWNING with kills: victory URL', () => {
    expect(currentSpriteUrl('DESPAWNING', 0, 3)).toBe(VOLTKIN_FRAME_URLS.victory);
  });

  it('DESPAWNING with no kills: hurt URL', () => {
    expect(currentSpriteUrl('DESPAWNING', 0, 0)).toBe(VOLTKIN_FRAME_URLS.hurt);
  });
});

describe('isLionForm', () => {
  it('zap is lion', () => { expect(isLionForm('zap')).toBe(true); });
  it('charge is lion', () => { expect(isLionForm('charge')).toBe(true); });
  it('idle1 is chibi', () => { expect(isLionForm('idle1')).toBe(false); });
  it('idle2 is chibi', () => { expect(isLionForm('idle2')).toBe(false); });
  it('hurt is chibi', () => { expect(isLionForm('hurt')).toBe(false); });
  it('victory is chibi', () => { expect(isLionForm('victory')).toBe(false); });
});

describe('flashIntensity — form-swap detection', () => {
  it('SPAWNING t=30: full flash (lion -> chibi morph)', () => {
    expect(flashIntensity('SPAWNING', 30)).toBe(1.0);
  });

  it('SPAWNING t=31: half flash (decay)', () => {
    expect(flashIntensity('SPAWNING', 31)).toBe(0.5);
  });

  it('SPAWNING t=32: no flash', () => {
    expect(flashIntensity('SPAWNING', 32)).toBe(0);
  });

  it('SPAWNING t=29: no flash (still in lion phase)', () => {
    expect(flashIntensity('SPAWNING', 29)).toBe(0);
  });

  it('ATTACKING t=15: full flash (chibi -> lion ignite)', () => {
    expect(flashIntensity('ATTACKING', 15)).toBe(1.0);
  });

  it('ATTACKING t=16: half flash (decay)', () => {
    expect(flashIntensity('ATTACKING', 16)).toBe(0.5);
  });

  it('ATTACKING t=45: full flash (lion -> chibi recover)', () => {
    expect(flashIntensity('ATTACKING', 45)).toBe(1.0);
  });

  it('ATTACKING t=46: half flash (decay)', () => {
    expect(flashIntensity('ATTACKING', 46)).toBe(0.5);
  });

  it('ATTACKING t=30 (FIRE_TICK): NO flash (lion -> lion, ARC_FLASH carries punch)', () => {
    expect(flashIntensity('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK)).toBe(0);
  });

  it('SEEKING: never flashes (chibi <-> chibi alternation)', () => {
    for (const tick of [0, 1, IDLE_CYCLE_TICKS, IDLE_CYCLE_TICKS + 1, 119, 120]) {
      expect(flashIntensity('SEEKING', tick)).toBe(0);
    }
  });

  it('DESPAWNING: never flashes (chibi -> chibi)', () => {
    for (const tick of [0, 1, 30, 59]) {
      expect(flashIntensity('DESPAWNING', tick)).toBe(0);
    }
  });

  it('flash fires EXACTLY on form-swap ticks — empirical sync check', () => {
    // Walk every (state, tick) pair and assert flash fires iff isLionForm
    // changes from the prior tick. Catches drift between flashIntensity
    // constants and currentFrameKey form-swap boundaries.
    const states: ('SPAWNING' | 'ATTACKING')[] = ['SPAWNING', 'ATTACKING'];
    for (const state of states) {
      for (let t = 1; t < VOLTKIN_ATTACK_CADENCE_TICKS; t += 1) {
        const prev = currentFrameKey(state, t - 1, 0);
        const curr = currentFrameKey(state, t, 0);
        const isFormSwap = isLionForm(prev) !== isLionForm(curr);
        const intensity = flashIntensity(state, t);
        if (isFormSwap) {
          expect(intensity).toBe(1.0);
        } else {
          // Flash can be 0 (no transition) or 0.5 (decay tick from prior swap).
          // For prev-tick NOT a form-swap, current intensity should not be 1.0.
          expect(intensity).not.toBe(1.0);
        }
      }
    }
  });
});

describe('FLASH_TINT + FLASH_SCALE_AMPLITUDE constants', () => {
  it('FLASH_TINT is cyan-bright (0x66FFFF)', () => {
    expect(FLASH_TINT).toBe(0x66ffff);
  });

  it('FLASH_SCALE_AMPLITUDE positive and modest (< 0.25)', () => {
    expect(FLASH_SCALE_AMPLITUDE).toBeGreaterThan(0);
    expect(FLASH_SCALE_AMPLITUDE).toBeLessThan(0.25);
  });
});
