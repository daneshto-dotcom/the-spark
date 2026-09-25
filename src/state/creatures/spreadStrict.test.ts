/**
 * ⛔ S191 C-6 — **THE FFA SPREAD NEVER HANDS A CREATURE A MIXED BOND.** (canon §5b · the owner's S162 rule)
 *
 * The enemy-only nearest scan has used the STRICT set since S162 (neither endpoint the creature's own
 * seat's colour), because a MIXED bond — a weld between your shape and an enemy's — is part of YOUR
 * structure: chewing it drops your own tower's degree, breaks its recipe and, for a hub, fires
 * `STRUCTURE_SELFDESTRUCT` (*"my own creature destroy my own tower"*, S161). The FFA spread that runs
 * right after it built its victims over the OR set, so with two or more enemy seats it could still
 * pick the mixed bond — keyed to the enemy seat whose shape is `primA`, or even to the creature's OWN
 * seat when `primA` is its own shape.
 *
 * REACH: the real host tick, in FIGHT, with 40 of seat 0's chewers seeking beside a structure of seat
 * 0's welded to a structure of seat 1's, plus a seat-2 structure so the spread engages. Every tick,
 * every chewer's `targetBondId` — assigned by the real fan-out through `findNearestBondTarget` — is
 * checked against the two welds.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../../game/spawner.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Controls } from '../../input/controls.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PlayerId } from '../../types.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { mulberry32 } from '../rng.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { findNearestBondTarget } from './creatureAI.ts';
import { referenceFindNearestBondTarget } from './bondTargetReference.fixtures.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const P2 = asPlayerId(2);

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function prim(w: World, seat: PlayerId, x: number, y: number): Primitive {
  const color = w.players.get(seat)!.color;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const p: Primitive = {
    id, type: SparkType.Square, placerColor: color, placedBy: seat, createdTick: w.tick,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: color,
    lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, p);
  return p;
}

/** `a` is the bond's `primA` — which is what the old spread keyed a victim on. */
function link(w: World, a: Primitive, b: Primitive): BondId {
  const id = asBondId(w.nextBondId++);
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  w.bonds.set(id, {
    id, aId: a.id, bId: b.id, a, b,
    restLength: Math.sqrt(dx * dx + dy * dy), stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick,
  });
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

/** A three-seat FFA board: seat 0's structure welded to seat 1's, and a seat-2 structure far off. */
function weldedBoard(): { w: World; welds: BondId[]; strict: BondId[]; strictP1: BondId; strictP2: BondId } {
  const w = makeWorld(0x191c6);
  w.gameState = 'TITLE';
  const roster = [0, 1, 2].map((seat) => ({ seat, color: PLAYER_COLORS[seat]! }));
  dispatch(w, { type: 'START_GAME', mode: 'bots', isHost: true, roster, botSeats: [1, 2] });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  // Seat 0's pair and seat 1's pair, welded twice: once with seat 1's shape as `primA`, once with
  // seat 0's. Both welds sit nearer the chewers than either seat-1 or seat-2 strict bond.
  const o1 = prim(w, P0, 900, 300);
  const o2 = prim(w, P0, 900, 340);
  link(w, o1, o2);
  const e1 = prim(w, P1, 940, 300);
  const e2 = prim(w, P1, 940, 340);
  const e3 = prim(w, P1, 1100, 300);
  const e4 = prim(w, P1, 1100, 340);
  const welds = [link(w, e1, o1), link(w, o2, e2)];
  const nearP1 = link(w, e1, e2);
  const strictP1 = link(w, e3, e4);
  const f1 = prim(w, P2, 1400, 700);
  const f2 = prim(w, P2, 1440, 700);
  const strictP2 = link(w, f1, f2);
  return { w, welds, strict: [nearP1, strictP1, strictP2], strictP1, strictP2 };
}

function spawnChewers(w: World, count: number): void {
  for (let i = 0; i < count; i++) {
    dispatch(w, {
      type: 'SPAWN_CREATURE', creatureType: 'chewer', ownerPlayerId: P0,
      pos: { x: 880 + (i % 8) * 6, y: 260 + Math.floor(i / 8) * 6 }, targetPos: { x: 900, y: 320 },
      sourceSpawnerId: (7000 + i * 13) as never,
    });
  }
}

describe('⛔ S191 C-6 — the FFA spread uses the STRICT enemy predicate', () => {
  it('⭐ REACH: forty chewers seeking beside a welded mixed-colour structure never target either weld', () => {
    const { w, welds } = weldedBoard();
    spawnChewers(w, 40);
    const d = deps();
    const st = makeHostTickState(w);
    const onWeld = new Set<number>();
    let targeted = 0;
    for (let t = 0; t < 240; t++) {
      runHostTick(w, d, st);
      for (const c of w.creatures.values()) {
        if (c.type !== 'chewer' || c.targetBondId === null) continue;
        targeted++;
        if (welds.includes(c.targetBondId)) onWeld.add(c.id as unknown as number);
      }
    }
    expect(targeted, 'anti-vacuity: the chewers really were assigned targets').toBeGreaterThan(0);
    expect([...onWeld], 'pre-fix: the spread handed chewers a weld of their own structure').toEqual([]);
    for (const b of welds) expect(w.bonds.has(b), 'and both welds still stand').toBe(true);
  });

  it('the scan itself: with the spread engaged, every chewer gets a STRICT bond — and the reference agrees', () => {
    const { w, welds, strict, strictP2 } = weldedBoard();
    spawnChewers(w, 40);
    let spreadToP2 = 0;
    for (const c of w.creatures.values()) {
      const got = findNearestBondTarget(w, c, true);
      expect(got).toBe(referenceFindNearestBondTarget(w, c, true));
      expect(welds).not.toContain(got);
      if (got === strictP2) spreadToP2++;
      expect(got !== null && strict.includes(got), 'a strict bond, always').toBe(true);
    }
    // Anti-vacuity: the nearest strict bond is seat 1's, so any chewer sent at seat 2's far bond was
    // sent there by the spread — it really is engaged on this board.
    expect(spreadToP2).toBeGreaterThan(0);
  });

  it('negative — a Voltkin (enemyOnly: false) is untouched: its OR set may still pick a weld', () => {
    const { w, welds } = weldedBoard();
    dispatch(w, {
      type: 'SPAWN_CREATURE', creatureType: 'voltkin', ownerPlayerId: P0,
      pos: { x: 920, y: 300 }, targetPos: { x: 920, y: 300 }, sourceSpawnerId: null,
    });
    const v = [...w.creatures.values()].find((c) => c.type === 'voltkin')!;
    expect(welds).toContain(findNearestBondTarget(w, v, false));
  });
});
