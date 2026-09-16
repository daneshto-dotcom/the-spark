/**
 * SPARK — S179 (owner) — **A SHAPE THAT WAS REMOVED PRINTS NOTHING. ONLY A HIT PRINTS A NUMBER.**
 *
 * Playing S179, mid-session:
 *
 * > *"Creatures attacking each other with a basic creature. He has a total damage output of six on
 * > each other. But then he attacks a building. And it shows 56 freaking damage. Why? It's the same
 * > system for buildings and for people. Like literally. When someone attacks a building it should
 * > look like it's the same damage."*
 *
 * ⛔ NOTHING DEALT 56, AND THAT IS THE WHOLE BUG. `DamageNumbers` prints a vanished pool's
 * REMAINDER — *"what it had left when last seen is the damage that finished it"* — which is right
 * for a killing blow and a lie for a shape the raze contract took because its connector gave way.
 * Measured before the fix, a two-shape structure whose bond was severed printed **"56"** and
 * **"70"**: two numbers for two hits that never happened.
 *
 * ⚠ HONEST SCOPE. `World.razedNotKilled` is host-local and deliberately NOT on the wire (a new
 * required field would earn a PROTOCOL_VERSION bump, and he has ruled against bumping for
 * convenience — *"Nobody cares. They'll just figure it out."*). A peer watching someone else's
 * structure come apart still diffs its own snapshot and can still print the remainder. The host —
 * which is who is playing in every solo and vs-bots match — is fixed.
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

const { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType, GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN } =
  await import('../constants.ts');
const { makeIdlePlayer } = await import('../game/player.ts');
const { makeWorld } = await import('../state/world.ts');
const { razePrimitives } = await import('../state/razePrimitives.ts');
const { damageEntity, damageConnector } = await import('../state/damage.ts');
const { attackFifths } = await import('../state/stats.ts');
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

describe('S179 — removed is not killed', () => {
  it('⭐⭐ HIS BUG — a structure coming apart prints NO number for the shapes it takes', () => {
    const w = twoSeat();
    const a = shape(w, 400, 400, 56); // the state he described: already chewed down from 70
    const b = shape(w, 432, 400);
    const bond = connect(w, a, b);

    const dn = new DamageNumbers();
    dn.sync(w);
    const before = printed(dn).length;

    // the connector gives way — the shared raze contract takes both orphaned shapes
    razePrimitives(w, [a.id, b.id], [bond], true);
    dn.sync(w);

    expect(printed(dn).slice(before), 'nothing hit them, so nothing prints').toEqual([]);
  });

  it('⛔ NOT VACUOUS — a shape genuinely KILLED by a hit still prints its number', () => {
    // S172 owner ruling: *"Always damage should be visible"* — including the last hit.
    const w = twoSeat();
    const a = shape(w, 400, 400);
    const b = shape(w, 432, 400);
    connect(w, a, b); // bonded, so it keeps the full 70 pool

    const swing = attackFifths(GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN);
    a.hp = swing; // one swing from death — set BEFORE the baseline sync, see below

    const dn = new DamageNumbers();
    /*
     * ⚠ THE WATCH MUST SEE THE PRE-KILL POOL. The vanish sweep prints the LAST OBSERVED value, so
     * moving `hp` between two syncs makes it print the stale 70 and says nothing about the fix. The
     * first draft of this test did exactly that and reported a false failure.
     */
    dn.sync(w);
    const before = printed(dn).length;

    damageEntity(w, { kind: 'primitive', id: a.id }, swing, 'creature');
    dn.sync(w);

    expect(printed(dn).slice(before), 'the killing blow is still shown').toContain(String(swing));
  });

  it('⭐ an ORPHAN dragged down by a real kill still prints nothing — only the victim does', () => {
    /*
     * The precise case: the shape that was hit DID die of damage and prints; its partner, left with
     * no connectors and taken by the same raze, was never touched and must stay silent.
     */
    const w = twoSeat();
    const a = shape(w, 400, 400);
    const b = shape(w, 432, 400);
    connect(w, a, b);

    const swing = attackFifths(GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN);
    a.hp = swing; // set BEFORE the baseline sync so the watch holds the pre-kill pool

    const dn = new DamageNumbers();
    dn.sync(w);
    const before = printed(dn).length;

    damageEntity(w, { kind: 'primitive', id: a.id }, swing, 'creature');
    dn.sync(w);

    const nums = printed(dn).slice(before);
    expect(w.primitives.has(b.id), 'fixture: the orphan really was taken too').toBe(false);
    expect(nums, 'exactly one number — the hit, not the orphan is 70').toEqual([String(swing)]);
  });

  it('⭐⭐ HIS RULE — EVERY swing on a connector prints the SAME number a unit would', () => {
    /*
     * *"Make sure that a hit on a connector and a hit on a unit shows the same number and it's the
     * same number output."*
     *
     * ⛔ MEASURED BEFORE THE FIX: chewing a 3-connector triangle printed 12, NOTHING, 12, NOTHING.
     * The number is inferred by diffing `Bond.damageFifths`, which counts UP — and the hit that
     * fills the structure pool makes `damageConnector` SPEND it across the component, so every
     * counter DROPS and a falling rising-pool prints nothing. The one swing that actually broke a
     * connector was the one swing he could not see.
     */
    const w = twoSeat();
    const a = shape(w, 400, 400);
    const b = shape(w, 432, 400);
    const c = shape(w, 416, 428);
    const b1 = connect(w, a, b); connect(w, b, c); connect(w, c, a);

    const swing = attackFifths(GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN);
    const dn = new DamageNumbers();
    dn.sync(w);

    const perSwing: string[][] = [];
    let seen = 0;
    for (let i = 0; i < 4; i++) {
      damageConnector(w, b1, swing);
      dn.sync(w);
      const all = printed(dn);
      perSwing.push(all.slice(seen));
      seen = all.length;
    }

    expect(
      perSwing,
      'four swings, four numbers, every one of them the swing itself',
    ).toEqual([[String(swing)], [String(swing)], [String(swing)], [String(swing)]]);
  });

  it('⭐ the list is per-FRAME and wiped by the consumer, like `effects`', () => {
    const w = twoSeat();
    const a = shape(w, 400, 400);
    const b = shape(w, 432, 400);
    const bond = connect(w, a, b);
    const dn = new DamageNumbers();
    dn.sync(w);

    razePrimitives(w, [a.id, b.id], [bond], true);
    expect(w.razedNotKilled.length, 'the reducer wrote it').toBeGreaterThan(0);
    dn.sync(w);
    expect(w.razedNotKilled.length, 'the consumer wiped it').toBe(0);
  });
});
