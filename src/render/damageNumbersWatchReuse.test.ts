/**
 * S196 (joiner-lag, R196-P1) — the structure watch is updated IN PLACE, with keys built once per id.
 * `syncStructures` runs every frame over every shape and connector; on a wave-10 joiner it was allocating a
 * key string, a watch object, a repair object and an ends tuple per entity per frame. These pin that it no
 * longer does, AND that every number it printed before is still printed (same hit, same heal, same kill).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Container { children: unknown[] = []; addChild(c: unknown): void { this.children.push(c); } removeChild(): void {} }
  class TextStyle { constructor(public o?: unknown) {} }
  class Text {
    text = ''; style: unknown = null; visible = true; alpha = 1;
    anchor = { set: (): void => {} }; position = { set: (): void => {} }; scale = { set: (): void => {} };
    constructor(o?: { text?: string; style?: unknown }) { this.text = o?.text ?? ''; this.style = o?.style; }
    destroy(): void {}
  }
  return { Container, Text, TextStyle };
});

const { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } =
  await import('../constants.ts');
const { makeIdlePlayer } = await import('../game/player.ts');
const { makeWorld } = await import('../state/world.ts');
const { asBondId, asPlayerId, asPrimitiveId } = await import('../types.ts');
const { DamageNumbers } = await import('./damageNumbers.ts');

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function twoSeat(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = makeWorld(0);
  w.isHost = true;
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  return w;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shape(w: any, x: number, y: number, hp = PRIMITIVE_MAX_HP): any {
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const p = {
    id, type: SparkType.Square, placerColor: PLAYER_COLORS[1]!, placedBy: P1, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: PLAYER_COLORS[1]!,
    lastOwnershipChange: 0, radius: 9, hp, origin: null,
  };
  w.primitives.set(id, p);
  return p;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function connect(w: any, a: any, b: any): ReturnType<typeof asBondId> {
  const id = asBondId(w.nextBondId++);
  w.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0 });
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

const printed = (dn: unknown): string[] =>
  ((dn as { live: { text: { text: string } }[] }).live ?? []).map((f) => f.text.text);

describe('S196 — structure watch: reused entries, same numbers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const watch = (dn: unknown): Map<string, any> => (dn as { watchedStruct: Map<string, unknown> }).watchedStruct as never;

  it('REACH: frame after frame the same watch object and the same key string are reused', () => {
    const w = twoSeat();
    const a = shape(w, 400, 400);
    const b = shape(w, 432, 400);
    const bond = connect(w, a, b);
    const dn = new DamageNumbers();
    dn.sync(w);
    const keys0 = [...watch(dn).keys()];
    const entries0 = [...watch(dn).values()];
    const ends0 = watch(dn).get(`b:${bond}`).ends;
    for (let f = 0; f < 5; f++) { a.pos.x += 1; w.tick++; dn.sync(w); }
    const keys1 = [...watch(dn).keys()];
    expect(keys1).toEqual(keys0);
    keys1.forEach((k, i) => expect(k).toBe(keys0[i]));
    // shapes and connectors (the per-entity hot loops); castles are four keys and keep their own path
    [...watch(dn).values()].forEach((e, i) => { if (/^[pb]:/.test(keys1[i]!)) expect(e, `entry ${keys1[i]}`).toBe(entries0[i]); });
    expect(keys1.filter((k) => /^[pb]:/.test(k))).toHaveLength(3);
    expect(watch(dn).get(`b:${bond}`).ends, 'the ends tuple is reused while the ends hold').toBe(ends0);
    expect(watch(dn).get(`p:${a.id}`).x, 'and the reused entry still follows the shape').toBe(405);
  });

  it('a hit on a shape and a chewed connector still print, through the reused entries', () => {
    const w = twoSeat();
    const a = shape(w, 400, 400);
    const b = shape(w, 432, 400);
    const bond = connect(w, a, b);
    const dn = new DamageNumbers();
    dn.sync(w);
    dn.sync(w);
    const before = printed(dn).length;
    a.hp -= 12;
    w.bonds.get(bond).damageFifths += 9;
    dn.sync(w);
    const got = printed(dn).slice(before);
    expect(got).toContain('12');
    expect(got).toContain('9');
    // NEGATIVE: an unchanged frame prints nothing more
    const n = printed(dn).length;
    dn.sync(w);
    expect(printed(dn).length).toBe(n);
  });

  it('a mass clear (epoch) drops the watch AND the key caches, and prints nothing', () => {
    const w = twoSeat();
    shape(w, 400, 400);
    const dn = new DamageNumbers();
    dn.sync(w);
    expect((dn as unknown as { primKeys: Map<unknown, unknown> }).primKeys.size).toBe(1);
    const before = printed(dn).length;
    w.primitives.clear();
    w.structureWatchEpoch++;
    dn.sync(w);
    expect(printed(dn).length).toBe(before);
    expect((dn as unknown as { primKeys: Map<unknown, unknown> }).primKeys.size).toBe(0);
  });
});
