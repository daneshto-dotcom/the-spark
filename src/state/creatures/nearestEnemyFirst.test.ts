/**
 * ⭐⭐ S193 P3-2 (owner) — **A CREATURE GOES FOR THE NEAREST ENEMY, NOT A HASH-CHOSEN ONE.** (canon §5c)
 *
 * > *"The orcs that are underneath me directly, that are against me … they're not attacking me. They're
 * > going all the way diagonally to attack the Nagas … Is it because he has more points, he's stronger,
 * > or what? … simple creatures should target the nearest enemy spawn right around them first."*
 *
 * Before: `structureTargets` took its connector from `findNearestBondTarget(…, true)`, whose FFA spread
 * picks the VICTIM seat by `mix32(id, sourceSpawnerId) % (n + 1)` with an extra slot for the SCORE
 * LEADER. Measured on this board: 9 of 25 orcs walked past him to the far seats, 16 of 25 once the
 * diagonal seat led on points.
 *
 * REACH: the real host tick, 4P, FIGHT — seat 3's army (bottom-left, the orcs) with one building each
 * for seat 0 (directly above them), seat 1 (diagonal) and seat 2. Every creature's `targetBondId` is the
 * one the real fan-out assigned.
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
import { castleAnchor } from '../gatherers/gatherer.ts';
import { enemyCastleMarchPos, findNearestBondTarget, nearestStrictEnemyBond, structureTargets } from './creatureAI.ts';
import { referenceNearestStrictEnemyBond, referenceStructureTargets } from './bondTargetReference.fixtures.ts';
import { findNearestEnemyPrimitiveFrom } from './creatureAI.ts';

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

function building(w: World, seat: number, x: number, y: number): BondId {
  const a = prim(w, asPlayerId(seat), x, y);
  const b = prim(w, asPlayerId(seat), x + 40, y);
  const id = asBondId(w.nextBondId++);
  w.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick });
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

function fourPlayerFight(): World {
  const w = makeWorld(0x3a2);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })), botSeats: [1, 2, 3],
  });
  expect(w.layout).toBe('QUADRANTS_4P');
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  w.primitives.clear();
  w.bonds.clear();
  return w;
}

/** An army of `seat`, 24 units around `at`, two types, distinct spawner ids so the old hash spread them. */
function army(w: World, seat: number, at: { x: number; y: number }): void {
  for (let i = 0; i < 24; i++) {
    dispatch(w, {
      type: 'SPAWN_CREATURE', creatureType: i % 2 ? 't3Warband' : 'goblinMelee', ownerPlayerId: asPlayerId(seat),
      pos: { x: at.x + (i % 6) * 20, y: at.y + Math.floor(i / 6) * 20 }, targetPos: { ...at },
      sourceSpawnerId: (9000 + i * 7) as never,
    });
  }
}

function victimTally(w: World, seat: number): Map<number, number> {
  const tally = new Map<number, number>();
  for (const c of w.creatures.values()) {
    if ((c.ownerPlayerId as unknown as number) !== seat || c.targetBondId === null) continue;
    // Only the army this test spawned — a unit the castle emits from the far corner has its own nearest.
    if (((c.sourceSpawnerId ?? 0) as unknown as number) < 9000) continue;
    const v = w.primitives.get(w.bonds.get(c.targetBondId)!.aId)!.placedBy as unknown as number;
    tally.set(v, (tally.get(v) ?? 0) + 1);
  }
  return tally;
}

describe('⭐⭐ S193 P3-2 — the orcs below him attack HIM, whoever leads on points', () => {
  for (const leader of [null, 0, 1, 2]) {
    it(`REACH: seat 3's army → seat 0's building 380 px away, never the diagonal 1370 px away (leader ${String(leader)})`, () => {
      const w = fourPlayerFight();
      const near = building(w, 0, 300, 420); // directly above the orcs — him
      building(w, 1, 1600, 420); // the nagas, diagonal
      building(w, 2, 1600, 700);
      if (leader !== null) w.scoreByPlayer.set(asPlayerId(leader), 500);
      army(w, 3, { x: 260, y: 760 });
      // Anti-vacuity: the OLD rule (the spread, still live for chewers) sends some of this very army elsewhere.
      const oldPicks = [...w.creatures.values()].map((c) => findNearestBondTarget(w, c, true));
      expect(oldPicks.some((b) => b !== near), 'the spread really is engaged on this board').toBe(true);
      const d = deps();
      const st = makeHostTickState(w);
      for (let t = 0; t < 150; t++) runHostTick(w, d, st);
      const tally = victimTally(w, 3);
      const total = [...tally.values()].reduce((a, b) => a + b, 0);
      expect(total, 'anti-vacuity: the army really is seeking a building').toBe(24);
      expect(Object.fromEntries(tally)).toEqual({ 0: total });
    });
  }

  it('⭐ SYMMETRIC: every seat’s army goes to the enemy building nearest IT, on all four quarters', () => {
    // One building per seat, 330 px in from its own castle on the diagonal toward the centre. Each army
    // stands in its own quarter beside the border with its clockwise neighbour, so that neighbour's
    // building is nearest — and the FARTHEST enemy is made the score leader, the old spread's favourite.
    const site = (s: number): { x: number; y: number } => {
      const a = castleAnchor(s, 'QUADRANTS_4P');
      return { x: a.x + (a.x < 960 ? 230 : -270), y: a.y + (a.y < 540 ? 230 : -230) };
    };
    const armyAt = [{ x: 880, y: 120 }, { x: 1700, y: 440 }, { x: 965, y: 960 }, { x: 260, y: 560 }];
    for (let seat = 0; seat < 4; seat++) {
      const w = fourPlayerFight();
      const at = armyAt[seat]!;
      const d2 = (s: number): number => { const p = site(s); return (p.x + 20 - (at.x + 50)) ** 2 + (p.y - (at.y + 30)) ** 2; };
      const enemies = [0, 1, 2, 3].filter((s) => s !== seat).sort((x, y) => d2(x) - d2(y));
      expect(enemies[0], `seat ${seat}: the board is built so the clockwise neighbour is nearest`).toBe((seat + 1) % 4);
      for (const s of enemies) building(w, s, site(s).x, site(s).y);
      w.scoreByPlayer.set(asPlayerId(enemies[2]!), 900);
      army(w, seat, at);
      const oldPicks = [...w.creatures.values()].map((c) => findNearestBondTarget(w, c, true));
      const nearBond = [...w.bonds.values()].find((b) => (w.primitives.get(b.aId)!.placedBy as unknown as number) === enemies[0])!.id;
      expect(oldPicks.some((b) => b !== nearBond), `seat ${seat}: anti-vacuity — the spread was engaged`).toBe(true);
      const d = deps();
      const st = makeHostTickState(w);
      let checked = 0;
      for (let t = 0; t < 150; t++) {
        runHostTick(w, d, st);
        // EVERY creature, EVERY tick (castle-emitted ones included): its connector is the enemy
        // connector nearest ITS OWN position — brute force, `(distSq, id)`.
        for (const c of w.creatures.values()) {
          if (c.targetBondId === null || c.type === 'chewer' || c.type === 'lightningDrone' || c.type === 'voltkin') continue;
          let best: BondId | null = null;
          let bd = Infinity;
          for (const [id, b] of w.bonds) {
            if (w.primitives.get(b.aId)!.placedBy === c.ownerPlayerId || w.primitives.get(b.bId)!.placedBy === c.ownerPlayerId) continue;
            const dd = (c.pos.x - (b.a.pos.x + b.b.pos.x) * 0.5) ** 2 + (c.pos.y - (b.a.pos.y + b.b.pos.y) * 0.5) ** 2;
            if (dd < bd || (dd === bd && best !== null && id < best)) { bd = dd; best = id; }
          }
          expect(c.targetBondId, `seat ${seat} tick ${t} creature ${String(c.id)}`).toBe(best);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(24 * 100);
      const tally = victimTally(w, seat);
      const total = [...tally.values()].reduce((x, y) => x + y, 0);
      expect(total, `seat ${seat}: anti-vacuity`).toBe(24);
      expect(Object.fromEntries(tally), `seat ${seat}`).toEqual({ [enemies[0]!]: total });
    }
  });

  it('then a CASTLE: with no enemy building left, the army marches on the nearest LIVE enemy keep', () => {
    const w = fourPlayerFight();
    army(w, 3, { x: 260, y: 760 });
    const c = [...w.creatures.values()][0]!;
    expect(enemyCastleMarchPos(w, c)).toEqual(castleAnchor(0, w.layout)); // seat 0, directly above
    w.players.get(asPlayerId(0))!.castleHp = 0; // T13 — a fallen keep is skipped
    const next = enemyCastleMarchPos(w, c)!;
    expect(next).not.toEqual(castleAnchor(0, w.layout));
    const d1 = (next.x - c.pos.x) ** 2 + (next.y - c.pos.y) ** 2;
    for (const s of [1, 2]) {
      const a = castleAnchor(s, w.layout);
      expect(d1).toBeLessThanOrEqual((a.x - c.pos.x) ** 2 + (a.y - c.pos.y) ** 2);
    }
  });

  it('TOTAL ORDER: two enemy connectors at exactly the same distance → the lower bond id, whatever the Map order', () => {
    const w = fourPlayerFight();
    army(w, 3, { x: 500, y: 800 });
    const c = [...w.creatures.values()][0]!;
    // Mirror two buildings about the creature's x: identical squared distances to their midpoints.
    const far = building(w, 1, c.pos.x + 300 - 20, c.pos.y - 300);
    const nearIdLater = building(w, 0, c.pos.x - 300 - 20, c.pos.y - 300);
    expect(far < nearIdLater).toBe(true);
    expect(nearestStrictEnemyBond(w, c)).toBe(far);
    expect(referenceNearestStrictEnemyBond(w, c)).toBe(far);
    // reinsert in reverse Map order — the answer does not move
    const entries = [...w.bonds.entries()].reverse();
    w.bonds.clear();
    for (const [k, v] of entries) w.bonds.set(k, v);
    expect(nearestStrictEnemyBond(w, c)).toBe(far);
  });

  it('the production ladder and the readable reference agree on every creature', () => {
    const w = fourPlayerFight();
    building(w, 0, 300, 420);
    building(w, 1, 1600, 420);
    building(w, 2, 1600, 700);
    prim(w, asPlayerId(1), 900, 700); // a lone shape too
    w.scoreByPlayer.set(asPlayerId(1), 500);
    army(w, 3, { x: 260, y: 760 });
    army(w, 2, { x: 1100, y: 800 });
    for (const c of w.creatures.values()) {
      expect(structureTargets(w, c)).toEqual(referenceStructureTargets(w, c, findNearestEnemyPrimitiveFrom));
    }
  });

  it('negative — the CHEWER keeps its FFA spread (its own branch, not this ruling)', () => {
    const w = fourPlayerFight();
    const near = building(w, 0, 300, 420);
    building(w, 1, 1600, 420);
    building(w, 2, 1600, 700);
    for (let i = 0; i < 24; i++) {
      dispatch(w, {
        type: 'SPAWN_CREATURE', creatureType: 'chewer', ownerPlayerId: asPlayerId(3),
        pos: { x: 260 + (i % 6) * 20, y: 760 + Math.floor(i / 6) * 20 }, targetPos: { x: 300, y: 800 },
        sourceSpawnerId: (9000 + i * 7) as never,
      });
    }
    const picks = [...w.creatures.values()].map((c) => findNearestBondTarget(w, c, true));
    expect(picks.some((b) => b !== near), 'a chewer can still be spread to a far victim').toBe(true);
  });
});
