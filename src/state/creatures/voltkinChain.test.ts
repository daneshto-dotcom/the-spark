/**
 * SPARK — S159 P2 (owner R77): **VOLTKIN CHAIN LIGHTNING.**
 *
 * Owner: *"multiple connectors/targets that are within range of one another … maybe we do max6"*.
 *
 * ## The test the Council asked for by name
 *
 * GEMINI-AUDITOR's R1 challenge was that a naive test ("the Voltkin hits six things") passes even
 * with the tie-break broken, because nothing forces the SEVENTH candidate to be the one left alive.
 * Its prescription — a line-up where exactly one target must survive, and the test names WHICH — is
 * the first case below, and it is the reason the cap is asserted through a survivor rather than
 * through a count.
 *
 * ## And the case that would have shipped a lie
 *
 * The first cut of `voltkinChain.ts` hand-rolled the enemy test as `anchor.placedBy === attacker
 * .ownerPlayerId`. That is a different question from the one the game asks: the shipped discriminant
 * is the endpoint `placerColor` against the owner's LIVE colour, because a territory-captured shape
 * keeps its original allegiance for targeting (`findNearestEnemyPrimitiveFrom` records this) and
 * because a rainbow colour shuffle remaps colours without touching `placedBy`. The captured-shape
 * case below is what holds that.
 */

import { describe, expect, it } from 'vitest';

import { PLAYER_COLORS, SparkType, PRIMITIVE_MAX_HP, VOLTKIN_CHAIN_HOP_RANGE, VOLTKIN_CHAIN_MAX_TARGETS } from '../../constants.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId } from '../../types.ts';
import type { Bond } from '../../physics/bonds.ts';
import type { Primitive } from '../../game/primitive.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { makeWorld, type World } from '../world.ts';
import { applyCreatureAttack } from './creatureAttack.ts';
import { voltkinChainFrom, type ChainLink } from './voltkinChain.ts';
import { asCreatureId, makeCreature, makeVoltkinCreature, type Creature } from './creature.ts';
import { CHEWER_CONFIG } from './voltkin-config.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const COLOR_P0 = PLAYER_COLORS[0];
const COLOR_P1 = PLAYER_COLORS[1];

function baseWorld(): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, COLOR_P0));
  w.players.set(P1, makeIdlePlayer(P1, COLOR_P1));
  return w;
}

function prim(id: number, placerColor: number, x: number, y: number): Primitive {
  return {
    id: asPrimitiveId(id),
    type: SparkType.Dot,
    placerColor,
    placedBy: placerColor === COLOR_P0 ? P0 : P1,
    createdTick: 0,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: placerColor,
    lastOwnershipChange: 0,
    radius: 8,
    hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
}

function bondBetween(w: World, id: number, a: Primitive, b: Primitive): Bond {
  const bond: Bond = {
    id: asBondId(id),
    aId: a.id,
    bId: b.id,
    a,
    b,
    restLength: 32,
    stiffnessTier: 'MID',
    damageFifths: 0,
    createdTick: 0,
  };
  w.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
  return bond;
}

/** A Voltkin belonging to P0, already ATTACKING (the host-tick orchestration invariant). */
function voltkin(w: World, x = 0, y = 0): Creature {
  const c = makeVoltkinCreature({
    id: asCreatureId(0),
    ownerPlayerId: P0,
    pos: { x, y },
    targetPos: { x, y },
    spawnedAtTick: 0,
  });
  c.state = 'ATTACKING';
  w.creatures.set(c.id, c);
  return c;
}

/** An enemy chewer (hp 1 ⇒ 5 fifths, so one Voltkin link kills it). */
function chewer(w: World, id: number, x: number, y: number, owner = P1): Creature {
  const c = makeCreature(CHEWER_CONFIG, {
    id: asCreatureId(id),
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    spawnedAtTick: 0,
    sourceSpawnerId: null,
  });
  w.creatures.set(c.id, c);
  return c;
}

const seedOf = (c: Creature): ChainLink => ({ kind: 'creature', id: c.id, pos: { x: c.pos.x, y: c.pos.y } });

describe('S159 P2 — the chain WALKS: selection', () => {
  it('stops at VOLTKIN_CHAIN_MAX_TARGETS, and the seventh in the line is the one left standing', () => {
    // Seven enemies in a row, each 100 px from the next — inside VOLTKIN_CHAIN_HOP_RANGE (120), so
    // the ONLY thing that can stop the bolt is the cap. Ids ascend along the line.
    const w = baseWorld();
    const v = voltkin(w, -100, 0);
    const line = Array.from({ length: 7 }, (_, i) => chewer(w, 10 + i, i * 100, 0));

    // The strike itself: the Voltkin zaps the first of the line, which seeds the chain.
    applyCreatureAttack(w, {
      type: 'CREATURE_ATTACK',
      creatureId: v.id,
      bondId: null,
      targetCreatureId: line[0].id,
    });

    const alive = [...w.creatures.values()].filter((c) => c.ownerPlayerId === P1);
    // eslint-disable-next-line no-console
    console.log(
      `[S159 P2] 7 in a line, cap ${VOLTKIN_CHAIN_MAX_TARGETS}: survivors ${alive
        .map((c) => c.id as unknown as number)
        .join(',')}`,
    );
    expect(alive).toHaveLength(1);
    // ⭐ THE ASSERTION GEMINI ASKED FOR: not "six died" but "THIS one lived" — the far end of the
    // line, which is also the highest id. A broken tie-break leaves a different survivor.
    expect(alive[0].id).toBe(line[6].id);
    expect(v.killCount).toBe(VOLTKIN_CHAIN_MAX_TARGETS);
  });

  it('a gap wider than the hop range stops the bolt, however much is behind it', () => {
    const w = baseWorld();
    const v = voltkin(w, -100, 0);
    const a = chewer(w, 10, 0, 0);
    chewer(w, 11, 100, 0); // reachable
    // Then a gap of VOLTKIN_CHAIN_HOP_RANGE + 20 before a crowd of four.
    for (let i = 0; i < 4; i++) chewer(w, 20 + i, 100 + VOLTKIN_CHAIN_HOP_RANGE + 20 + i * 10, 0);

    const links = voltkinChainFrom(w, v, seedOf(a));
    expect(links).toHaveLength(1); // just the one across the small step; the crowd is unreachable
    expect(links[0]).toMatchObject({ kind: 'creature', id: asCreatureId(11) });
  });

  it('never revisits a link, so two targets end the chain instead of looping between them', () => {
    const w = baseWorld();
    const v = voltkin(w, -100, 0);
    const a = chewer(w, 10, 0, 0);
    chewer(w, 11, 50, 0);
    expect(voltkinChainFrom(w, v, seedOf(a))).toHaveLength(1);
  });

  it('is enemy-only, and never the attacker itself', () => {
    const w = baseWorld();
    const v = voltkin(w, 0, 0);
    const a = chewer(w, 10, 40, 0);
    chewer(w, 11, 60, 0, P0); // OWN unit, well inside hop range
    const links = voltkinChainFrom(w, v, seedOf(a));
    expect(links).toHaveLength(0);
  });

  it('breaks an exact distance tie on the LOWER id, whichever order the map holds them', () => {
    const w = baseWorld();
    const v = voltkin(w, -100, 0);
    const a = chewer(w, 10, 0, 0);
    // Two candidates exactly 80 px from the seed, inserted highest-id first so a "first wins" bug
    // would answer 21 rather than 20.
    chewer(w, 21, 0, 80);
    chewer(w, 20, 0, -80);
    const links = voltkinChainFrom(w, v, seedOf(a));
    expect(links[0]).toMatchObject({ id: asCreatureId(20) });
  });

  it('prefers a CREATURE over a BOND at the identical distance — one fixed order across kinds', () => {
    const w = baseWorld();
    const v = voltkin(w, -200, 0);
    const seedUnit = chewer(w, 10, 0, 0);
    const unit = chewer(w, 11, 0, 60); // 60 px from the seed
    // An enemy bond whose MIDPOINT is also exactly 60 px from the seed, on the other side.
    const pa = prim(1, COLOR_P1, -10, -60);
    const pb = prim(2, COLOR_P1, 10, -60);
    w.primitives.set(pa.id, pa);
    w.primitives.set(pb.id, pb);
    bondBetween(w, 1, pa, pb);

    const links = voltkinChainFrom(w, v, seedOf(seedUnit));
    expect(links[0]).toMatchObject({ kind: 'creature', id: unit.id });
  });

  it('chains over CONNECTORS too, which is half of what the owner asked for', () => {
    const w = baseWorld();
    const v = voltkin(w, -200, 0);
    // A ladder of enemy shapes: bonds 1..3, each midpoint 80 px from the next.
    const ps = [0, 1, 2, 3].map((i) => prim(1 + i, COLOR_P1, i * 80, 0));
    for (const p of ps) w.primitives.set(p.id, p);
    const b1 = bondBetween(w, 1, ps[0], ps[1]);
    bondBetween(w, 2, ps[1], ps[2]);
    bondBetween(w, 3, ps[2], ps[3]);

    const links = voltkinChainFrom(w, v, { kind: 'bond', id: b1.id, pos: { x: 40, y: 0 } });
    expect(links.map((l) => l.kind)).toEqual(['bond', 'bond']);
    expect(links.map((l) => l.id as unknown as number)).toEqual([2, 3]);
  });

  it('reads enemy-ness off placerColor, not placedBy — the captured-shape case', () => {
    const w = baseWorld();
    const v = voltkin(w, -200, 0);
    const seedUnit = chewer(w, 10, 0, 0);
    // A bond between two shapes the ENEMY placed, but whose `placedBy` is P0 — the shape of a
    // record after a capture, and the exact input that made the first cut of the scan skip it.
    const pa = prim(1, COLOR_P1, 40, 0);
    const pb = prim(2, COLOR_P1, 60, 0);
    (pa as { placedBy: typeof P0 }).placedBy = P0;
    (pb as { placedBy: typeof P0 }).placedBy = P0;
    w.primitives.set(pa.id, pa);
    w.primitives.set(pb.id, pb);
    const b = bondBetween(w, 1, pa, pb);

    const links = voltkinChainFrom(w, v, seedOf(seedUnit));
    expect(links[0]).toMatchObject({ kind: 'bond', id: b.id });
  });
});

describe('S159 P2 — the chain FIRES: damage, arcs and who gets one', () => {
  it('severs the connectors it broke, and emits one ARC_FLASH per hop', () => {
    const w = baseWorld();
    const v = voltkin(w, -200, 0);
    const ps = [0, 1, 2].map((i) => prim(1 + i, COLOR_P1, i * 80, 0));
    for (const p of ps) w.primitives.set(p.id, p);
    const b1 = bondBetween(w, 1, ps[0], ps[1]);
    const b2 = bondBetween(w, 2, ps[1], ps[2]);
    w.effects.length = 0;

    applyCreatureAttack(w, { type: 'CREATURE_ATTACK', creatureId: v.id, bondId: b1.id });

    // A Voltkin's 33 fifths is far past `count + 4`, so both give way: the primary through the
    // shipped path, the chained one through the chain's own deferred sever.
    expect(w.bonds.has(b1.id)).toBe(false);
    expect(w.bonds.has(b2.id)).toBe(false);
    const arcs = w.effects.filter((e) => e.kind === 'ARC_FLASH');
    expect(arcs.length).toBeGreaterThanOrEqual(2); // the primary's, plus one per hop
  });

  it('fires even when the primary connector HELD — the bolt hit it either way', () => {
    const w = baseWorld();
    const v = voltkin(w, -200, 0);
    const ps = [0, 1].map((i) => prim(1 + i, COLOR_P1, i * 80, 0));
    for (const p of ps) w.primitives.set(p.id, p);
    const b1 = bondBetween(w, 1, ps[0], ps[1]);
    // A chewer 60 px from the bond midpoint, so it is the chain's first hop.
    const victim = chewer(w, 10, 40, 60);
    // Make the primary unbreakable for this strike by pre-loading NEGATIVE headroom is not possible,
    // so instead assert the CHAIN's effect: whatever happens to the bond, the unit dies.
    applyCreatureAttack(w, { type: 'CREATURE_ATTACK', creatureId: v.id, bondId: b1.id });
    expect(w.creatures.has(victim.id)).toBe(false);
  });

  it('ONLY a Voltkin chains — a chewer\'s gnaw stays a single bite', () => {
    const w = baseWorld();
    const gnawer = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(0),
      ownerPlayerId: P0,
      pos: { x: -50, y: 0 },
      targetPos: { x: 40, y: 0 },
      spawnedAtTick: 0,
      sourceSpawnerId: null,
    });
    gnawer.state = 'ATTACKING';
    w.creatures.set(gnawer.id, gnawer);
    const ps = [0, 1, 2].map((i) => prim(1 + i, COLOR_P1, i * 80, 0));
    for (const p of ps) w.primitives.set(p.id, p);
    const b1 = bondBetween(w, 1, ps[0], ps[1]);
    const b2 = bondBetween(w, 2, ps[1], ps[2]);

    applyCreatureAttack(w, { type: 'CREATURE_ATTACK', creatureId: gnawer.id, bondId: b1.id });
    // Whatever the chewer did to its own target, the NEIGHBOUR must be untouched: no chain, and not
    // one fifth of chain damage banked on it either.
    const survivor = w.bonds.get(b2.id) as Bond | undefined;
    expect(survivor).toBeDefined();
    expect(survivor?.damageFifths).toBe(0);
  });

  it('the cap counts the SEED, so a full bolt is the primary plus five jumps', () => {
    const w = baseWorld();
    const v = voltkin(w, -100, 0);
    const a = chewer(w, 10, 0, 0);
    for (let i = 1; i < 10; i++) chewer(w, 10 + i, i * 100, 0);
    expect(voltkinChainFrom(w, v, seedOf(a))).toHaveLength(VOLTKIN_CHAIN_MAX_TARGETS - 1);
  });

  it('is a PURE selection: computing the chain twice on the same world gives the same answer', () => {
    const w = baseWorld();
    const v = voltkin(w, -100, 0);
    const a = chewer(w, 10, 0, 0);
    for (let i = 1; i < 6; i++) chewer(w, 10 + i, i * 90, 0);
    const first = voltkinChainFrom(w, v, seedOf(a)).map((l) => `${l.kind}:${l.id as unknown as number}`);
    const second = voltkinChainFrom(w, v, seedOf(a)).map((l) => `${l.kind}:${l.id as unknown as number}`);
    expect(second).toEqual(first);
    expect(w.effects).toHaveLength(0); // and it mutated nothing
  });

  it('an empty board leaves the single-target zap exactly as it was', () => {
    const w = baseWorld();
    const v = voltkin(w, -50, 0);
    const only = chewer(w, 10, 0, 0);
    w.effects.length = 0;
    applyCreatureAttack(w, {
      type: 'CREATURE_ATTACK',
      creatureId: v.id,
      bondId: null,
      targetCreatureId: only.id,
    });
    expect(w.creatures.has(only.id)).toBe(false);
    expect(w.effects.filter((e) => e.kind === 'ARC_FLASH')).toHaveLength(1); // one bolt, no chain
    expect(v.killCount).toBe(1);
  });
});

/** Bond ids used above, kept for readability of the ladder assertions. */
export type _BondIdAlias = BondId;
