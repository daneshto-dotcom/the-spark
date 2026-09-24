/**
 * SPARK — S189 C3 (owner playtest): **THE VOLTKIN GOES FOR THE ENEMY'S BUILDINGS, ANYWHERE ON THE
 * BOARD, BEFORE IT EVER TOUCHES ITS OWN.**
 *
 * Owner, S189, playing his brother: *"Vulcan [Voltkin] attacks his own buildings … instead of going
 * to the right to my zone and starting to attack my buildings, and I had lots of them, he just
 * started attacking the buildings around him."* He ACCEPTS own-building attacks only once every enemy
 * building is gone — which is the shipped `bestEnemyId ?? bestOwnId` fallback in
 * `findNearestBondTarget`, a documented Voltkin feature (R8), not a defect.
 *
 * ## WHAT S189 MEASURED, AND WHY THIS FILE IS A GUARD RATHER THAN A FIX
 *
 * ⛔ THE REPORTED BEHAVIOUR DOES NOT REPRODUCE IN THE SIM, and every path was run rather than read:
 *   · the bond scan (`findNearestBondTarget`) keeps the own-bond candidate strictly as a FALLBACK —
 *     an enemy bond 1100 px away beats an own bond 30 px away;
 *   · the chain hops (`voltkinChainFrom`) and the creature scan are enemy-only;
 *   · the FULL production summon path — a seat stamps the Voltkin blueprint, the matcher fires, the
 *     tick-domain cinematic schedules `pendingCreatureSpawn`, `SPAWN_CREATURE` mints it, FIGHT opens —
 *     hands the Voltkin to the STAMPING seat and walks it across the board to the other seat's towers.
 *
 * So the Voltkin can only "attack the buildings around him" through its fallback, which needs EVERY
 * bond on the board to read as its owner's colour (`isEnemyBondWithColor` compares `placerColor` to
 * the owner's live `player.color`). That is an OWNERSHIP question upstream of targeting — a seat or a
 * colour attributed to the wrong player — and it is reported to the merge owner as such (see
 * `.claude/plans/S189_PROGRESS_units.md`, C3). Changing the targeting to "fix" it would be fixing the
 * wrong layer, and would silently remove a fallback the owner has accepted.
 *
 * What this file does instead is make the owner's rule impossible to break quietly: the brother's
 * layout through the real host tick (own bonds take ZERO damage while any enemy bond stands), the
 * real summon path (ownership lands on the stamping seat), the zero-enemy fallback (still allowed),
 * and a pure preference case that was MUTATION-TESTED — replacing the fallback with "nearest bond of
 * either owner" turns it and the host-tick case red.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType, phaseDurationTicks } from '../../constants.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PlayerId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import { asCreatureId, makeCreature } from './creature.ts';
import { VOLTKIN_CONFIG } from './voltkin-config.ts';
import { bondMidpoint, findNearestBondTarget } from './creatureAI.ts';
import { voltkinChainFrom } from './voltkinChain.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import type { Controls } from '../../input/controls.ts';
import { applyBuildBlueprint } from '../blueprintBuild.ts';
import { stampRefusalAt } from '../blueprintLegality.ts';
import {
  makeWorkerCinematicState,
  runGodlyMatcherCore,
  tickWorkerCinematics,
} from '../godlyMatcherCore.ts';
import { blueprintBill } from '../blueprints.ts';
import { makeCastleBank } from '../castleBank.ts';
import type { GodlyId } from '../godlyRecipes/types.ts';
// ⚠ SIDE-EFFECT IMPORTS, REQUIRED — the recipe registry is populated by each module's tail call to
// `registerRecipe` (see `blueprintBuild.test.ts`). Without them the summon path never ignites and the
// ownership case would pass vacuously on an empty board.
import '../godlyRecipes/voltkin.ts';
import '../godlyRecipes/stinkTower.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function twoSeat(): World {
  // START_GAME mints both seats AND the layout, exactly as `buildingTargeting.test.ts` does.
  const w = makeWorld(0xc3);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: '1v1',
    isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0] },
      { seat: 1, color: PLAYER_COLORS[1] },
    ],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  return w;
}

function addShape(w: World, owner: PlayerId, x: number, y: number): Primitive {
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const seat = owner as unknown as number;
  const p = {
    id, type: SparkType.Square,
    placerColor: PLAYER_COLORS[seat]!, placedBy: owner, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set<BondId>(),
    ownerColor: PLAYER_COLORS[seat]!, lastOwnershipChange: 0,
    radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  } as unknown as Primitive;
  w.primitives.set(id, p);
  return p;
}

let nextBond = 7100;
function connect(w: World, a: Primitive, b: Primitive): BondId {
  const id = asBondId(nextBond++);
  w.bonds.set(id, {
    id, aId: a.id, bId: b.id, a, b,
    restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0,
  } as never);
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

/** A building of `n` connectors in a row — the same sturdy fixture `buildingTargeting.test.ts` uses. */
function building(w: World, owner: PlayerId, x: number, y: number, n: number): BondId[] {
  let prev = addShape(w, owner, x, y);
  const out: BondId[] = [];
  for (let i = 1; i <= n; i++) {
    const next = addShape(w, owner, x + 32 * i, y);
    out.push(connect(w, prev, next));
    prev = next;
  }
  return out;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

/** Through the REAL reducer, so the Voltkin is built exactly the way production builds it. */
function spawnVoltkin(w: World, owner: PlayerId, x: number, y: number) {
  dispatch(w, {
    type: 'SPAWN_CREATURE',
    creatureType: 'voltkin',
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
  } as never);
  const v = [...w.creatures.values()].find((c) => c.type === 'voltkin' && c.ownerPlayerId === owner);
  if (v === undefined) throw new Error('fixture: SPAWN_CREATURE did not mint a Voltkin');
  return v;
}

function touched(w: World, bonds: readonly BondId[]): number {
  return bonds.filter((b) => !w.bonds.has(b) || w.bonds.get(b)!.damageFifths > 0).length;
}

/** The brother's board: a Voltkin beside its OWN two buildings, the enemy's six across the field. */
function brothersBoard(): { w: World; own: BondId[]; enemy: BondId[] } {
  const w = twoSeat();
  const own = [...building(w, P0, 300, 400, 4), ...building(w, P0, 300, 600, 4)];
  const enemy: BondId[] = [];
  for (let k = 0; k < 6; k++) enemy.push(...building(w, P1, 1400, 200 + k * 120, 4));
  return { w, own, enemy };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('S189 C3 — the Voltkin prefers ENEMY buildings anywhere over its own', () => {
  it('⭐ PREFERENCE: an enemy connector 1100 px away beats an own connector 30 px away', () => {
    const { w, own, enemy } = brothersBoard();
    const v = makeCreature(VOLTKIN_CONFIG, {
      id: asCreatureId(1), ownerPlayerId: P0,
      pos: { x: 330, y: 430 }, targetPos: { x: 330, y: 430 },
      spawnedAtTick: 0, sourceSpawnerId: null, clock: w,
    });
    // Sanity on the fixture, or the case below proves nothing: an own bond really IS nearer.
    const d2 = (b: BondId) => {
      const m = bondMidpoint(w.bonds.get(b)!);
      return (m.x - v.pos.x) ** 2 + (m.y - v.pos.y) ** 2;
    };
    const nearestOwn = Math.min(...own.map(d2));
    const nearestEnemy = Math.min(...enemy.map(d2));
    expect(nearestOwn).toBeLessThan(nearestEnemy / 100);

    const pick = findNearestBondTarget(w, v); // the Voltkin default: enemyOnly = false
    expect(pick).not.toBeNull();
    expect(enemy).toContain(pick);
  });

  it('⭐⭐ HIS BOARD, THROUGH THE REAL HOST TICK: it crosses to the enemy and never damages its own', () => {
    const { w, own, enemy } = brothersBoard();
    const v = spawnVoltkin(w, P0, 360, 500);
    const d = deps();
    const s = makeHostTickState(w);
    let ownTargetTicks = 0;
    let maxX = v.pos.x;
    // The Voltkin's whole 20 s FIGHT life (VOLTKIN_CONFIG.lifetimeTicks = 1200) plus its fade.
    for (let t = 0; t < VOLTKIN_CONFIG.lifetimeTicks + 200; t++) {
      runHostTick(w, d, s);
      const c = w.creatures.get(v.id);
      if (c === undefined) break;
      if (c.targetBondId !== null && own.includes(c.targetBondId)) ownTargetTicks += 1;
      if (c.pos.x > maxX) maxX = c.pos.x;
    }
    // ⛔ THE OWNER'S RULE: while any enemy building stands, not one tick aimed at its own, and not
    // one fifth of damage on its own connectors (it is the only attacker on this board).
    expect(ownTargetTicks).toBe(0);
    expect(touched(w, own)).toBe(0);
    // ⭐ AND IT ACTUALLY WENT: it crossed the field to the enemy's buildings and hit them.
    expect(maxX).toBeGreaterThan(1200);
    expect(touched(w, enemy)).toBeGreaterThan(0);
  });

  it('⭐ THE CHAIN NEVER JUMPS ONTO ITS OWN — a bolt seeded beside its own buildings stays enemy-only', () => {
    const w = twoSeat();
    const own = building(w, P0, 500, 500, 4);
    const enemy = building(w, P1, 500, 540, 4); // 40 px away — inside VOLTKIN_CHAIN_HOP_RANGE
    const v = makeCreature(VOLTKIN_CONFIG, {
      id: asCreatureId(2), ownerPlayerId: P0,
      pos: { x: 520, y: 520 }, targetPos: { x: 520, y: 520 },
      spawnedAtTick: 0, sourceSpawnerId: null, clock: w,
    });
    const seedBond = enemy[0]!;
    const links = voltkinChainFrom(w, v, {
      kind: 'bond', id: seedBond, pos: bondMidpoint(w.bonds.get(seedBond)!),
    });
    expect(links.length).toBeGreaterThan(0); // the fixture must actually produce a chain
    for (const link of links) {
      if (link.kind === 'bond') expect(own).not.toContain(link.id);
    }
  });

  it('⭐⭐ THE REAL SUMMON PATH: the stamping seat owns its Voltkin, and it walks to the OTHER seat', () => {
    const w = twoSeat();
    w.matchPhase = 'BUILD';
    w.phaseEndsAtTick = w.tick + 100_000;

    const legal = (pid: PlayerId, id: GodlyId): Array<{ x: number; y: number }> => {
      const out: Array<{ x: number; y: number }> = [];
      for (let x = 150; x <= 1770; x += 60) {
        for (let y = 150; y <= 900; y += 60) {
          if (stampRefusalAt(w, { x, y }, pid, id) === null) out.push({ x, y });
        }
      }
      return out;
    };
    const fund = (pid: PlayerId, id: GodlyId): void => {
      const bank = w.castleBanks.get(pid) ?? makeCastleBank();
      for (const [type, count] of blueprintBill(id)) {
        bank[type as number] = (bank[type as number] ?? 0) + count;
      }
      w.castleBanks.set(pid, bank);
    };
    const stamp = (pid: PlayerId, id: GodlyId, at: { x: number; y: number }): void => {
      fund(pid, id);
      applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: pid, blueprintId: id, centre: at } as never);
    };

    // Seat 1 builds the Voltkin in its own zone.
    const site = legal(P1, 'voltkin')[0];
    expect(site).toBeDefined();
    stamp(P1, 'voltkin', site!);
    w.tick += 1; // the matcher's cursor scan is strict `<` on the emitting tick
    const fired = runGodlyMatcherCore(w, { lastMatcherTick: 0 });
    expect(fired?.godlyId).toBe('voltkin');
    expect(fired?.triggererPlayerId).toBe(P1);

    // Both seats then build: seat 1 beside its Voltkin, seat 0 in its own zone.
    const ownOf = (pid: PlayerId) => new Set(
      [...w.bonds.values()]
        .filter((b) => w.primitives.get(b.aId)?.placedBy === pid)
        .map((b) => b.id),
    );
    for (const at of legal(P0, 'stinkTower').filter((_, i) => i % 7 === 0).slice(0, 4)) {
      if (stampRefusalAt(w, at, P0, 'stinkTower') === null) stamp(P0, 'stinkTower', at);
    }
    for (const at of legal(P1, 'stinkTower')) {
      if (Math.hypot(at.x - site!.x, at.y - site!.y) > 400) continue;
      if (stampRefusalAt(w, at, P1, 'stinkTower') === null) stamp(P1, 'stinkTower', at);
      if (ownOf(P1).size > 12) break;
    }
    const p0Bonds = ownOf(P0);
    const p1Bonds = ownOf(P1);
    expect(p0Bonds.size).toBeGreaterThan(0);
    expect(p1Bonds.size).toBeGreaterThan(0);

    // The tick-domain cinematic schedules the spawn; the host tick mints it.
    const cs = makeWorkerCinematicState();
    const d = deps();
    const s = makeHostTickState(w);
    for (let t = 0; t < 600 && ![...w.creatures.values()].some((c) => c.type === 'voltkin'); t++) {
      tickWorkerCinematics(w, cs);
      runHostTick(w, d, s);
    }
    const v = [...w.creatures.values()].find((c) => c.type === 'voltkin');
    expect(v).toBeDefined();
    expect(v!.ownerPlayerId).toBe(P1);

    // FIGHT: every target it takes is seat 0's while seat 0 has buildings.
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
    let aimedAtEnemy = 0;
    for (let t = 0; t < 600; t++) {
      runHostTick(w, d, s);
      const c = w.creatures.get(v!.id);
      if (c === undefined) break;
      if (c.targetBondId !== null) {
        expect(p1Bonds.has(c.targetBondId)).toBe(false);
        if (p0Bonds.has(c.targetBondId)) aimedAtEnemy += 1;
      }
    }
    expect(aimedAtEnemy).toBeGreaterThan(0);
  });

  it('negative — with ZERO enemy buildings it may take its own (the fallback he accepts)', () => {
    const w = twoSeat();
    const own = building(w, P0, 300, 400, 4);
    const v = makeCreature(VOLTKIN_CONFIG, {
      id: asCreatureId(3), ownerPlayerId: P0,
      pos: { x: 330, y: 430 }, targetPos: { x: 330, y: 430 },
      spawnedAtTick: 0, sourceSpawnerId: null, clock: w,
    });
    expect(own).toContain(findNearestBondTarget(w, v));
    // …and the chewer's `enemyOnly` scan on the same board still refuses it, so the fallback stays
    // a Voltkin feature and nothing else inherits it.
    expect(findNearestBondTarget(w, v, true)).toBeNull();
  });
});
