/**
 * S193 `s193/visuals-combat` (V08) — **REACH: THE REAL `DamageNumbers` KEEPS THE SHIPPED POP, ADDS THE SHAKE AND
 * SPARKLE ON TOP OF THE SHIPPED POP — AND STILL PRINTS EVERY HIT AND EVERY HEAL ON ITS OWN (R185-D, R190-I).**
 *
 * Driven through the real `DamageNumbers.sync` on a real world: a creature is hit and healed on one
 * frame, and the floaters it produces are inspected. Only Pixi's `Text` is faked (Node has no
 * canvas), with a `scale.set` that records, so the pop is visible to the test. The fx hooks are
 * installed with recording sinks, exactly what `fxRuntime.installFx` does in the game.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const scales: number[] = [];
vi.mock('pixi.js', () => {
  class Container {
    children: unknown[] = [];
    addChild(c: unknown): void { this.children.push(c); }
    removeChild(c: unknown): void { this.children = this.children.filter((x) => x !== c); }
  }
  class TextStyle { constructor(public o?: { fill?: number }) {} }
  class Text {
    text = ''; style: unknown = null; visible = true; alpha = 1; x = 0; y = 0;
    anchor = { set: (): void => {} }; position = { set: (): void => {} };
    scale = { set: (v: number): void => { scales.push(v); } };
    constructor(o?: { text?: string; style?: unknown }) { this.text = o?.text ?? ''; this.style = o?.style; }
    destroy(): void {}
  }
  return { Container, Text, TextStyle };
});

const { PLAYER_COLORS } = await import('../../constants.ts');
const { makeIdlePlayer } = await import('../../game/player.ts');
const { makeWorld } = await import('../../state/world.ts');
const { asCreatureId, makeCreature } = await import('../../state/creatures/creature.ts');
const { getCreatureConfig } = await import('../../state/creatures/voltkin-config.ts');
const { asPlayerId } = await import('../../types.ts');
const { DamageNumbers } = await import('../damageNumbers.ts');
const { recordingSink } = await import('./emitter.ts');
const { setFxHooks, setFxLegacyFlag } = await import('./fxState.ts');
const { FLOATER_HEAL_MOTES } = await import('./floaterFx.ts');
// ⭐ S194 T9 (coherence) — a hit now also lands a pop on the victim (`hitPopFx.ts`). These cases are about the
// HEAL SPARKLE, so they count the sparkle alone; the pop is asserted on its own in `hitPopReach.test.ts`.
const { isHitPopEmit } = await import('./hitPopFx.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sparkleOnly = (out: any[]): any[] => out.filter((e) => !isHitPopEmit(e));

/** The SHIPPED NameplateSCT pop (`damageNumbers.ts`), 0.5 → 2.0 → 1.0 over the first sixth of 45 frames. */
const POP = 45 / 6;
const shippedPop = (age: number): number => { const k = age / POP; return k >= 1 ? 1 : k < 0.5 ? 0.5 + 3 * k : 2 - 2 * (k - 0.5); };

/** Run `n` more frames with nothing new happening; returns the scale each live floater got, per frame. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function popTrace(dn: any, w: any, n: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i++) { scales.length = 0; dn.sync(w); out.push([...scales]); }
  return out;
}

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

afterEach(() => { setFxHooks(null); setFxLegacyFlag(false); scales.length = 0; });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scene(): { w: any; c: any } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = makeWorld(0);
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  w.matchPhase = 'FIGHT';
  const c = makeCreature(getCreatureConfig('t3Warband'), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: P0, pos: { x: 500, y: 500 }, targetPos: { x: 500, y: 500 },
    spawnedAtTick: 0, sourceSpawnerId: null,
  });
  w.creatures.set(c.id, c);
  return { w, c };
}

/** A frame where the unit takes `hit` and heals `heal`: returns the live floaters' texts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hitAndHeal(dn: any, w: any, c: any, hit: number, heal: number): string[] {
  dn.sync(w); // first sighting
  c.ehp = c.ehp - hit + heal;
  c.healedFifths = (c.healedFifths ?? 0) + heal;
  scales.length = 0;
  dn.sync(w);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return dn.live.map((f: any) => f.text.text);
}

describe('S193 V08 REACH — `DamageNumbers` with the rebuilt fx live', () => {
  it('R190-I holds: a hit AND a heal on one frame still print as TWO numbers', () => {
    const top = recordingSink();
    setFxHooks({ top, shade: recordingSink(), ground: recordingSink(), shock: { shock() {} } });
    const { w, c } = scene();
    const dn = new DamageNumbers();
    expect(hitAndHeal(dn, w, c, 12, 2).sort()).toEqual(['12', '2']);
  });

  it('⛔ the SHIPPED pop (0.5 → 2.0 → 1.0) is kept in fx mode, frame for frame — and the heal sparkles', () => {
    const top = recordingSink();
    setFxHooks({ top, shade: recordingSink(), ground: recordingSink(), shock: { shock() {} } });
    const { w, c } = scene();
    const dn = new DamageNumbers();
    hitAndHeal(dn, w, c, 12, 2);
    expect(scales.length, 'anti-vacuity').toBe(2);
    for (const s of scales) expect(s).toBeCloseTo(shippedPop(1), 9); // 0.9 at age 1
    expect(sparkleOnly(top.out).length, 'the heal sparkle reached the top layer').toBeGreaterThan(0);
    expect(sparkleOnly(top.out).length).toBeLessThanOrEqual(FLOATER_HEAL_MOTES * 2);
    const trace = popTrace(dn, w, 10);
    trace.forEach((frame, i) => {
      expect(frame.length).toBe(2);
      for (const s of frame) expect(s).toBeCloseTo(shippedPop(i + 2), 9);
    });
    expect(Math.max(...trace.flat()), 'it still punches toward 2.0 (the plan pop never passed 1.15)').toBeGreaterThan(1.9);
  });

  it('NEGATIVE: legacy keeps the shipped 0.5 → 2.0 → 1.0 pop and draws no sparkle', () => {
    const top = recordingSink();
    setFxHooks({ top, shade: recordingSink(), ground: recordingSink(), shock: { shock() {} } });
    setFxLegacyFlag(true);
    const { w, c } = scene();
    const dn = new DamageNumbers();
    hitAndHeal(dn, w, c, 12, 2);
    // Legacy at age 1: 0.5 + 3 × (1 / 7.5) = 0.9.
    expect(scales.length, 'anti-vacuity').toBe(2);
    for (const s of scales) expect(s).toBeCloseTo(0.9, 9);
    expect(top.out).toEqual([]);
  });

  it('a BIG hit judders ±2 px around the shipped path; a small hit does not move off it', () => {
    setFxHooks({ top: recordingSink(), shade: recordingSink(), ground: recordingSink(), shock: { shock() {} } });
    const { w, c } = scene();
    const dn = new DamageNumbers();
    dn.sync(w);
    c.ehp -= 120;
    dn.sync(w);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = (dn as any).live[0];
    const p = f.age / 45;
    const dx = f.text.x - (f.x + f.drift * p);
    const dy = f.text.y - (f.y - 23 * p);
    expect(Math.hypot(dx, dy)).toBeGreaterThan(0);
    expect(Math.abs(dx)).toBeLessThanOrEqual(2);
    expect(Math.abs(dy)).toBeLessThanOrEqual(2);
    const s2 = scene();
    const dn2 = new DamageNumbers();
    dn2.sync(s2.w);
    s2.c.ehp -= 12;
    dn2.sync(s2.w);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (dn2 as any).live[0];
    expect(g.text.x).toBeCloseTo(g.x + g.drift * (g.age / 45), 9);
  });

  it('a damage-only frame draws no sparkle (only heals sparkle)', () => {
    const top = recordingSink();
    setFxHooks({ top, shade: recordingSink(), ground: recordingSink(), shock: { shock() {} } });
    const { w, c } = scene();
    const dn = new DamageNumbers();
    expect(hitAndHeal(dn, w, c, 12, 0)).toEqual(['12']);
    expect(sparkleOnly(top.out)).toEqual([]);
    expect(top.out.length, 'S194 T9 — but the HIT lands its pop on the victim').toBeGreaterThan(0);
  });
});
