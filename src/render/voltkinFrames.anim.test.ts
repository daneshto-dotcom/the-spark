/**
 * SPARK — S83 P3 atlas-animation mapping tests.
 *
 * `currentAnimCell` is the pure (state, ticksInState, killCount, worldTick,
 * isMoving, manifest) -> {clip, frame} mapping behind the real-animation
 * upgrade. These tests pin:
 *   - loop cadence (12 fps = 5 ticks/frame, worldTick-keyed, no restart pop)
 *   - one-shot windows glued to the LOCKED FSM constants (charge spans the
 *     wind-up, zap APEX lands exactly on VOLTKIN_ATTACK_FIRE_TICK)
 *   - despawn one-shots fit the 60-tick window without overrun
 *   - form-swap boundaries identical to the legacy schedule so
 *     `flashIntensity` stays valid unchanged
 *
 * S107 P3: the on-disk "production manifest drift guard" subtest was removed
 * along with its atlas pipeline (public/godly/voltkin/anim/* + the legacy
 * frame PNGs + scripts/build-voltkin-atlas.py) — the S106 procedural Pixi.Graphics
 * rig replaced both the bitmap-frame AND the atlas render paths, so neither asset
 * is loaded at runtime. The pure `currentAnimCell` mapping is retained + tested
 * against the inline manifest `M` (the canonical spec) below.
 */
import { describe, expect, it } from 'vitest';
import {
  ANIM_TICKS_PER_FRAME,
  currentAnimCell,
  flashIntensity,
  isLionClip,
  type VoltkinAnimManifest,
  type VoltkinClipKey,
} from './voltkinFrames.ts';
import {
  CREATURE_DESPAWNING_TICKS,
  VOLTKIN_ATTACK_FIRE_TICK,
  VOLTKIN_ATTACK_CHARGE_ENGAGE_TICK,
} from '../state/creatures/creature.ts';

/** Canonical manifest spec for the pure currentAnimCell mapping (S107 P3: this
 * inline manifest replaced the deleted on-disk voltkin-anim.json as the source). */
const M: VoltkinAnimManifest = {
  cell: 256,
  cols: 8,
  atlas: 'voltkin-atlas.png',
  clips: {
    walk: { start: 0, len: 8, kind: 'loop', nativeFacing: -1 },
    idle: { start: 8, len: 8, kind: 'loop' },
    charge: { start: 16, len: 10, kind: 'oneshot' },
    zap: { start: 26, len: 6, kind: 'oneshot', apex: 2 },
    hurt: { start: 32, len: 12, kind: 'oneshot' },
    victory: { start: 44, len: 12, kind: 'oneshot' },
  },
};

describe('currentAnimCell — loops', () => {
  it('SEEKING moving plays the walk loop at 5 ticks/frame keyed on worldTick', () => {
    for (let tick = 0; tick < 120; tick++) {
      const cell = currentAnimCell('SEEKING', tick % 60, 0, tick, true, M);
      expect(cell.clip).toBe('walk');
      expect(cell.frame).toBe(Math.floor(tick / ANIM_TICKS_PER_FRAME) % 8);
    }
  });

  it('SEEKING still plays the idle loop', () => {
    const cell = currentAnimCell('SEEKING', 7, 0, 305, false, M);
    expect(cell.clip).toBe('idle');
    expect(cell.frame).toBe(Math.floor(305 / ANIM_TICKS_PER_FRAME) % 8);
  });

  it('loop frame is worldTick-keyed: re-entering SEEKING does not restart the gait', () => {
    // Same worldTick, different ticksInState -> same frame (no restart pop).
    const a = currentAnimCell('SEEKING', 0, 0, 423, true, M);
    const b = currentAnimCell('SEEKING', 59, 0, 423, true, M);
    expect(a).toEqual(b);
  });
});

describe('currentAnimCell — ATTACKING one-shots glued to LOCKED constants', () => {
  it('pre-windup is idle, charge engages at the engage tick, zap APEX at FIRE tick', () => {
    expect(currentAnimCell('ATTACKING', VOLTKIN_ATTACK_CHARGE_ENGAGE_TICK - 1, 0, 0, false, M).clip)
      .toBe('idle');
    const first = currentAnimCell('ATTACKING', VOLTKIN_ATTACK_CHARGE_ENGAGE_TICK, 0, 0, false, M);
    expect(first).toEqual({ clip: 'charge', frame: 0 });
    const fire = currentAnimCell('ATTACKING', VOLTKIN_ATTACK_FIRE_TICK, 0, 0, false, M);
    expect(fire).toEqual({ clip: 'zap', frame: M.clips.zap.apex });
  });

  it('charge wind-up walks monotonically through the whole clip, clamped to len-1', () => {
    let prev = -1;
    for (let t = VOLTKIN_ATTACK_CHARGE_ENGAGE_TICK; t < VOLTKIN_ATTACK_FIRE_TICK; t++) {
      const cell = currentAnimCell('ATTACKING', t, 0, 0, false, M);
      expect(cell.clip).toBe('charge');
      expect(cell.frame).toBeGreaterThanOrEqual(prev);
      expect(cell.frame).toBeLessThanOrEqual(M.clips.charge.len - 1);
      prev = cell.frame;
    }
    expect(prev).toBe(M.clips.charge.len - 1); // full clip consumed
  });

  it('recovery plays zap follow-through (apex..end) then settles to idle at release', () => {
    const apex = M.clips.zap.apex ?? 0;
    let prev = apex;
    for (let t = VOLTKIN_ATTACK_FIRE_TICK + 1; t < 45; t++) {
      const cell = currentAnimCell('ATTACKING', t, 0, 0, false, M);
      expect(cell.clip).toBe('zap');
      expect(cell.frame).toBeGreaterThanOrEqual(prev);
      prev = cell.frame;
    }
    expect(prev).toBe(M.clips.zap.len - 1);
    expect(currentAnimCell('ATTACKING', 45, 0, 0, false, M).clip).toBe('idle');
  });
});

describe('currentAnimCell — SPAWNING + DESPAWNING', () => {
  it('SPAWNING holds the zap apex (lion continuity) then settles into idle at t=30', () => {
    expect(currentAnimCell('SPAWNING', 0, 0, 0, false, M))
      .toEqual({ clip: 'zap', frame: M.clips.zap.apex });
    expect(currentAnimCell('SPAWNING', 29, 0, 0, false, M).clip).toBe('zap');
    expect(currentAnimCell('SPAWNING', 30, 0, 0, false, M).clip).toBe('idle');
  });

  it('DESPAWNING plays victory (kills) / hurt (no kills) exactly across the window', () => {
    for (const [kills, clip] of [[1, 'victory'], [0, 'hurt']] as const) {
      expect(currentAnimCell('DESPAWNING', 0, kills, 0, false, M))
        .toEqual({ clip, frame: 0 });
      const lastTick = CREATURE_DESPAWNING_TICKS - 1;
      const end = currentAnimCell('DESPAWNING', lastTick, kills, 0, false, M);
      expect(end.clip).toBe(clip);
      expect(end.frame).toBe(M.clips[clip as VoltkinClipKey].len - 1);
    }
  });
});

describe('form-swap boundaries match flashIntensity (legacy parity)', () => {
  it('chibi<->lion clip transitions land exactly on the flash moments', () => {
    // Walk every (state, tick) pair the FSM can render and assert: the clip
    // form CHANGES across a tick boundary iff flashIntensity fires 1.0 there.
    const states = [
      { state: 'SPAWNING' as const, span: 60 },
      { state: 'ATTACKING' as const, span: 60 },
    ];
    for (const { state, span } of states) {
      for (let t = 1; t < span; t++) {
        const prev = currentAnimCell(state, t - 1, 0, 1000 + t - 1, false, M);
        const curr = currentAnimCell(state, t, 0, 1000 + t, false, M);
        const formSwap = isLionClip(prev.clip) !== isLionClip(curr.clip);
        const flashes = flashIntensity(state, t) === 1.0;
        expect(formSwap, `${state} t=${t}`).toBe(flashes);
      }
    }
  });
});

// S107 P3 — structural self-consistency of the canonical inline manifest M
// (replaces the deleted on-disk voltkin-anim.json drift-guard; same assertions,
// now against the spec the mapping is actually tested with).
describe('manifest spec is structurally consistent', () => {
  it('M satisfies every mapping assumption', () => {
    const keys: VoltkinClipKey[] = ['walk', 'idle', 'charge', 'zap', 'hurt', 'victory'];
    for (const k of keys) {
      const c = M.clips[k];
      expect(c, k).toBeDefined();
      expect(c.len, k).toBeGreaterThan(0);
      expect(c.start, k).toBeGreaterThanOrEqual(0);
    }
    // No cell overlap between clips; all cells fit the atlas grid.
    const ranges = keys.map((k) => M.clips[k]).sort((a, b) => a.start - b.start);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].start).toBeGreaterThanOrEqual(ranges[i - 1].start + ranges[i - 1].len);
    }
    const apex = M.clips.zap.apex ?? 0;
    expect(apex).toBeGreaterThanOrEqual(0);
    expect(apex).toBeLessThan(M.clips.zap.len);
    expect(M.clips.walk.nativeFacing).toBe(-1);
    // Despawn one-shots fit the 60-tick window at 12 fps native.
    expect(M.clips.hurt.len * ANIM_TICKS_PER_FRAME).toBeLessThanOrEqual(CREATURE_DESPAWNING_TICKS);
    expect(M.clips.victory.len * ANIM_TICKS_PER_FRAME).toBeLessThanOrEqual(CREATURE_DESPAWNING_TICKS);
  });
});
