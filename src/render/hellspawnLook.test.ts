/**
 * SPARK — S188 — HELLSPAWN's demonic look is DERIVED from synced state and reaches the real chewer
 * renderer: a seat holding `demons.l5` draws its chewers in the demonic palette, a split child is
 * drawn smaller, and every other seat's chewer is the unchanged pencil puppet.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application, Container } from 'pixi.js';
import { asCreatureId, asSpawnerId } from '../types.ts';
import type { World } from '../state/world.ts';
import { resetConcealmentForTest } from './concealment.ts';
import { DEMON_BODY, hellspawnScale, isDemonicSeat } from './hellspawnLook.ts';

class G {
  readonly fills: number[] = [];
  readonly ellipses: number[][] = [];
  private self(): this { return this; }
  moveTo(): this { return this.self(); }
  lineTo(): this { return this.self(); }
  quadraticCurveTo(): this { return this.self(); }
  circle(): this { return this.self(); }
  ellipse(...a: number[]): this { this.ellipses.push(a); return this; }
  rect(): this { return this.self(); }
  poly(): this { return this.self(); }
  closePath(): this { return this.self(); }
  fill(o: { color: number }): this { this.fills.push(o.color); return this; }
  stroke(): this { return this.self(); }
  clear(): this { return this.self(); }
  destroy(): void {}
}
let last: G;
vi.mock('pixi.js', () => ({
  Graphics: class { constructor() { last = new G(); return last as unknown as object; } },
  Container: class { addChild(): void {} },
  Application: class {},
}));

const { ChewerRenderer } = await import('./chewerRenderer.ts');
const PENCIL_BODY = 0xe9e7df;

function world(seat: { raceId?: string; draftPicks?: string[] }, gen?: 1 | 2): World {
  const creatures = new Map([[asCreatureId(5), {
    id: asCreatureId(5), type: 'chewer', ownerPlayerId: 0, pos: { x: 300, y: 300 }, prevPos: { x: 300, y: 300 },
    targetPos: { x: 400, y: 300 }, targetBondId: null, targetCreatureId: null, targetPrimitiveId: null,
    state: 'SEEKING', ticksInState: 0, killCount: 0, ehp: 5, spawnedAtTick: 0, despawnAtTick: 1e9,
    sourceSpawnerId: asSpawnerId(7), chewProgress: 0, ...(gen !== undefined ? { hellspawnGen: gen } : {}),
  }]]);
  const players = new Map([[0, { color: 0xff4d4d, avatarPos: { x: 0, y: 0 }, ...seat }]]);
  return { tick: 30, gameState: 'PLAYING', creatures, players, primitives: new Map(), bonds: new Map(), effects: [] } as unknown as World;
}

function draw(w: World): G {
  const r = new ChewerRenderer(
    { stage: { addChild: () => undefined } } as unknown as Application,
    { addChild: () => undefined } as unknown as Container,
  );
  r.sync(w);
  return last;
}

describe('HELLSPAWN look — the predicate', () => {
  it('is true only for a DEMON seat whose level-5 pick is racial', () => {
    const p = (raceId: string, draftPicks: string[]) => new Map([[0, { raceId, draftPicks }]]) as never;
    expect(isDemonicSeat(p('demons', ['hp', 'racial']), 0)).toBe(true);
    expect(isDemonicSeat(p('demons', ['racial', 'hp']), 0)).toBe(false); // level 0 only
    expect(isDemonicSeat(p('zombies', ['hp', 'racial']), 0)).toBe(false); // another race
    expect(isDemonicSeat(p('demons', ['hp']), 0)).toBe(false); // has not reached level 5
    expect(isDemonicSeat(new Map([[0, { color: 1 }]]) as never, 0), 'a partial seat record').toBe(false);
    expect(isDemonicSeat(new Map() as never, 0)).toBe(false);
  });

  it('children shrink by generation', () => {
    expect(hellspawnScale(undefined)).toBe(1);
    expect(hellspawnScale(1)).toBeLessThan(1);
    expect(hellspawnScale(2)).toBeLessThan(hellspawnScale(1));
  });
});

describe('HELLSPAWN look — it reaches the real chewer renderer', () => {
  beforeEach(() => { resetConcealmentForTest(); });

  it('a HELLSPAWN seat’s chewer is drawn in the demonic body colour', () => {
    const g = draw(world({ raceId: 'demons', draftPicks: ['hp', 'racial'] }));
    expect(g.fills).toContain(DEMON_BODY);
    expect(g.fills).not.toContain(PENCIL_BODY);
  });

  it('any other seat’s chewer is the unchanged pencil puppet', () => {
    const g = draw(world({ raceId: 'demons', draftPicks: ['hp', 'hp'] }));
    expect(g.fills).toContain(PENCIL_BODY);
    expect(g.fills).not.toContain(DEMON_BODY);
  });

  it('a split child is demonic by its own generation, and drawn smaller', () => {
    const whole = draw(world({ raceId: 'demons', draftPicks: ['hp', 'racial'] }));
    const g2 = draw(world({ raceId: 'demons', draftPicks: ['hp', 'racial'] }, 2));
    expect(g2.fills).toContain(DEMON_BODY);
    // The chewer's ground shadow is its LAST ellipse (the owner marker is drawn before it, fixed-size),
    // and its radius is a pure function of the body radius.
    expect(g2.ellipses.at(-1)![2]!).toBeLessThan(whole.ellipses.at(-1)![2]!);
  });
});
