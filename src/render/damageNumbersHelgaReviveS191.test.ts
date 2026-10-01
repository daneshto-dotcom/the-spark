/**
 * SPARK — S191 (`s189/weld` census) — **A HELGA REVIVED BEFORE THE RENDERER SAW HER DIE IS NOT HEALED.**
 *
 * R190-J keeps a killed Helga's record (`'DORMANT'`, `ehp = null`) and `reviveDormantHelgas` wakes the
 * SAME record at a phase edge. `DamageNumbers.syncStructures` watches her pool under the key `d:<id>`
 * (S182). When a sync lands between the kill and the revive, the key vanishes (the kill prints) and the
 * revive is a first sighting (nothing prints) — correct. When no sync lands between them — a kill and
 * a revive inside ONE host render frame, or inside ONE 10 Hz snapshot gap on a client — the watch saw
 * "damaged" and then "full": before S191 it printed a GREEN heal of the difference and no kill at all.
 *
 * Driven through the real host tick: a real hall, a real kill (`damageEntity`) and the real
 * FIGHT→BUILD edge (`runHostTick` → `reviveDormantHelgas`), with NO `sync` between the kill and the edge.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Container { children: unknown[] = []; addChild(c: unknown): void { this.children.push(c); } removeChild(): void {} }
  class TextStyle { constructor(public o?: { fill?: number }) {} }
  class Text {
    text = ''; style: unknown = null; visible = true; alpha = 1;
    anchor = { set: (): void => {} }; position = { set: (): void => {} }; scale = { set: (): void => {} };
    constructor(o?: { text?: string; style?: unknown }) { this.text = o?.text ?? ''; this.style = o?.style; }
    destroy(): void {}
  }
  return { Container, Text, TextStyle };
});

const { PRIMITIVE_MAX_HP, SparkType } = await import('../constants.ts');
const { dispatch, makeWorld } = await import('../state/world.ts');
const { makeHostTickState, runHostTick } = await import('../state/hostTick.ts');
const { runGodlyMatcherCore } = await import('../state/godlyMatcherCore.ts');
const { Spawner, DEFAULT_SPAWNER_CONFIG } = await import('../game/spawner.ts');
const { makeGameStateExtras } = await import('../state/gameState.ts');
const { mulberry32 } = await import('../state/rng.ts');
const { damageEntity } = await import('../state/damage.ts');
const { asBondId, asPlayerId, asPrimitiveId } = await import('../types.ts');
const { DamageNumbers } = await import('./damageNumbers.ts');
await import('../state/godlyRecipes/registerAll.ts');

const P0 = asPlayerId(0);
const GREEN = 0x2fbf3f;
/* eslint-disable @typescript-eslint/no-explicit-any */

function deps(): any {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} },
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  };
}

function tick(w: any, st: any, n: number): void {
  const d = deps();
  const cursor = { lastMatcherTick: -1 };
  for (let i = 0; i < n; i++) {
    runGodlyMatcherCore(w, cursor);
    runHostTick(w, d, st);
    w.effects.length = 0;
  }
}

function worldWithHelgaInFight(): { w: any; st: any } {
  const w: any = makeWorld(0x5191);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.creatures.clear();
  const st = makeHostTickState(w);
  const color = w.players.get(P0).color;
  const mk = (type: number, x: number, y: number): any => {
    const id = asPrimitiveId(w.nextPrimitiveId++);
    const p = {
      id, type, placerColor: color, placedBy: P0, createdTick: w.tick, pos: { x, y }, prevPos: { x, y },
      bonds: new Set(), ownerColor: color, lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
    };
    w.primitives.set(id, p);
    return p;
  };
  const hub = mk(SparkType.Triangle, 500, 300);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = mk(i % 2 === 0 ? SparkType.Spiral : SparkType.Circle, 500 + Math.cos(a) * 40, 300 + Math.sin(a) * 40);
    const bid = asBondId(w.nextBondId++);
    w.bonds.set(bid, { id: bid, aId: hub.id, bId: leaf.id, a: hub, b: leaf, restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick });
    hub.bonds.add(bid);
    leaf.bonds.add(bid);
  }
  w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: 500, y: 300 }, bondCount: 6 });
  tick(w, st, 2);
  crossPhase(w, st); // → FIGHT
  return { w, st };
}

function crossPhase(w: any, st: any): void {
  const from = w.matchPhase;
  w.phaseEndsAtTick = w.tick + 1;
  tick(w, st, 3);
  expect(w.matchPhase).not.toBe(from);
}

const helga = (w: any): any => [...w.defenders.values()].find((d: any) => d.kind === 'princess');
type Floater = { text: string; green: boolean };
const floaters = (dn: unknown): Floater[] =>
  ((dn as { live: { text: { text: string; style: { o?: { fill?: number } } } }[] }).live ?? [])
    .map((f) => ({ text: f.text.text, green: f.text.style?.o?.fill === GREEN }));

describe('⭐ S191 census — a Helga killed and revived inside one render frame', () => {
  it('prints the KILL, not a green heal, when no sync saw her DORMANT', () => {
    const { w, st } = worldWithHelgaInFight();
    const dn = new DamageNumbers();
    const h = helga(w);
    const full = h.ehp as number;
    dn.sync(w); // the watch sees her at full
    damageEntity(w, { kind: 'defender', id: h.id }, 12, 'creature', null);
    dn.sync(w); // the watch sees her dented: a red 12
    expect(floaters(dn).map((f) => f.text), 'control: a dent prints its swing').toContain('12');
    const before = floaters(dn).length;

    // ONE frame: the killing blow AND the FIGHT→BUILD edge that revives her, no sync in between.
    const KILL = 300; // a swing bigger than what she has left, so the swing and the remainder differ
    expect(damageEntity(w, { kind: 'defender', id: h.id }, KILL, 'creature', null)).toBe(true);
    expect(helga(w).state).toBe('DORMANT');
    crossPhase(w, st); // → BUILD: the edge revives her
    expect(helga(w).state, 'revived on the same record').toBe('IDLE');
    expect(helga(w).ehp).toBe(full);
    dn.sync(w);

    const out = floaters(dn).slice(before);
    expect(out.filter((f) => f.green), 'nothing healed her — no green number').toEqual([]);
    expect(out.map((f) => f.text), 'the killing blow is the number, as a vanish would print it').toEqual([String(KILL)]);

    // And the new life is watched from scratch: the next sync prints nothing.
    const n = floaters(dn).length;
    dn.sync(w);
    expect(floaters(dn).length, 'no second number for the same revive').toBe(n);
  });

  it('control — a sync that DOES see her DORMANT prints the kill once and nothing on the revive', () => {
    const { w, st } = worldWithHelgaInFight();
    const dn = new DamageNumbers();
    const h = helga(w);
    dn.sync(w);
    const before = floaters(dn).length;
    expect(damageEntity(w, { kind: 'defender', id: h.id }, 300, 'creature', null)).toBe(true);
    dn.sync(w); // sees her DORMANT → the key vanishes → the kill prints
    crossPhase(w, st);
    dn.sync(w); // the revive is a first sighting
    const out = floaters(dn).slice(before);
    expect(out.map((f) => f.text)).toEqual(['300']);
    expect(out.some((f) => f.green)).toBe(false);
  });
});
