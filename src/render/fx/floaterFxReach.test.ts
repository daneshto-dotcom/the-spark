/**
 * S193 `s193/visuals-combat` (V08) — **REACH: THE REAL `DamageNumbers` USES THE NEW POP, SHAKE AND
 * SPARKLE — AND STILL PRINTS EVERY HIT AND EVERY HEAL ON ITS OWN (R185-D, R190-I).**
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
const { FLOATER_POP_FROM, FLOATER_HEAL_MOTES } = await import('./floaterFx.ts');

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

  it('the pop starts near 0.6 (not the legacy 0.5 → 2.0 punch), and the heal sparkles', () => {
    const top = recordingSink();
    setFxHooks({ top, shade: recordingSink(), ground: recordingSink(), shock: { shock() {} } });
    const { w, c } = scene();
    const dn = new DamageNumbers();
    hitAndHeal(dn, w, c, 12, 2);
    // age 1 of a 7.5-frame pop: between 0.6 and 1.15, nowhere near the legacy 0.5 + 3/7.5 = 0.9 path's later 2.0.
    expect(scales.length, 'anti-vacuity').toBe(2);
    for (const s of scales) { expect(s).toBeGreaterThan(FLOATER_POP_FROM); expect(s).toBeLessThan(1.15); }
    expect(top.out.length, 'the heal sparkle reached the top layer').toBeGreaterThan(0);
    expect(top.out.length).toBeLessThanOrEqual(FLOATER_HEAL_MOTES * 2);
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

  it('a damage-only frame draws no sparkle (only heals sparkle)', () => {
    const top = recordingSink();
    setFxHooks({ top, shade: recordingSink(), ground: recordingSink(), shock: { shock() {} } });
    const { w, c } = scene();
    const dn = new DamageNumbers();
    expect(hitAndHeal(dn, w, c, 12, 0)).toEqual(['12']);
    expect(top.out).toEqual([]);
  });
});
