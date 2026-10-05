/**
 * SPARK — ⭐⭐ S195 B-9 (owner, RULED): **THE PENCIL CHEWER GNAWS THE KEEP WHEN THERE IS NOTHING ELSE.**
 *
 * > *"he attacks all the towers, and then when there's nothing, then he goes to the keep."* — owner, S195
 *
 * S194 T8 found it walked there, sat in ATTACKING and landed NOTHING (pinned at 0 in `chewerDroneTargets`).
 * The hold is `creatureLifecycle.ts`'s chewer arm (`onKeep`); the strike was always `applyCreatureAttack`'s
 * castle arm. Pinned here:
 *   · the ARITHMETIC — a bite is the chewer's own ladder number, `attackFifths(1, 2)` = 7, and the keep's
 *     base DEF leaves it at 7 (`castleDamageAfterDefence`);
 *   · REACH through the real `runHostTick` — parked on the keep with no enemy connector it lands exactly one
 *     bite per `CHEW_INTERVAL_TICKS`, on the keep's pool (2500, the one off-ladder exception);
 *   · NEGATIVE — the keep is LAST: a chewer gnawing the keep lets go the moment an enemy connector exists;
 *   · and `chewerDroneTargets.test.ts` holds the priority negative (a standing building → the keep untouched).
 * ⭐ MUTATION-TESTED (progress file): removing the `onKeep` hold turns the REACH case red (0 bites).
 */
import { describe, expect, it } from 'vitest';
import { CASTLE_MAX_HP, CHEWER_ATK, CHEWER_PEN, CHEW_INTERVAL_TICKS, PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType, phaseDurationTicks } from '../../constants.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asCreatureId, makeCreature, type Creature } from './creature.ts';
import { getCreatureConfig } from './voltkin-config.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { castleAnchor } from '../gatherers/gatherer.ts';
import { castleDamageAfterDefence } from '../castleUpgrades.ts';
import { attackFifths } from '../stats.ts';
import type { Controls } from '../../input/controls.ts';
import type { Primitive } from '../../game/primitive.ts';
import { asBondId, asPlayerId, asPrimitiveId, asSpawnerId, type BondId, type PlayerId } from '../../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const BIG = 1_000_000;
const BITE = attackFifths(CHEWER_ATK, CHEWER_PEN);

function twoSeat(): World {
  const w = makeWorld(0x195b9);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  return w;
}
function chewerAt(w: World, x: number, y: number): Creature {
  const c = makeCreature(getCreatureConfig('chewer'), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: P0, pos: { x, y }, targetPos: { x, y },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900), clock: w,
  });
  c.ehp = BIG; // the castle gun (300 px, every 4 s) would otherwise fell a 5-fifth chewer mid-measurement
  c.state = 'SEEKING'; // past the materialise window, so the bite count below is exact from tick 1
  w.creatures.set(c.id, c);
  return c;
}
function shape(w: World, o: PlayerId, x: number, y: number): Primitive {
  const color = w.players.get(o)!.color;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const p = {
    id, type: SparkType.Square, placerColor: color, placedBy: o, createdTick: 0, pos: { x, y }, prevPos: { x, y },
    bonds: new Set<BondId>(), ownerColor: color, lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  } as unknown as Primitive;
  w.primitives.set(id, p);
  return p;
}
function building(w: World, o: PlayerId, x: number, y: number, n: number): BondId[] {
  let prev = shape(w, o, x, y);
  const out: BondId[] = [];
  for (let i = 1; i <= n; i++) {
    const next = shape(w, o, x + 32 * i, y);
    const id = asBondId(w.nextBondId++);
    w.bonds.set(id, { id, aId: prev.id, bId: next.id, a: prev, b: next, restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0 } as never);
    prev.bonds.add(id);
    next.bonds.add(id);
    out.push(id);
    prev = next;
  }
  return out;
}
const deps = (): HostTickDeps => ({
  spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
  controls: { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls,
  botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
}) as unknown as HostTickDeps;

function run(w: World, ticks: number, d = deps(), st = makeHostTickState(w)): void {
  for (let i = 0; i < ticks; i++) runHostTick(w, d, st);
}

describe('S195 B-9 — the arithmetic', () => {
  it('⭐ a bite is the chewer\'s own ladder number, 7 fifths, and the keep\'s base DEF leaves it at 7', () => {
    expect(BITE).toBe(7);
    expect(castleDamageAfterDefence(BITE, twoSeat().players.get(P1)!.castleUpgrades)).toBe(BITE);
    expect(CASTLE_MAX_HP).toBe(2500); // the one off-ladder pool it gnaws
    expect(CHEW_INTERVAL_TICKS).toBe(60);
  });
});

describe('S195 B-9 — REACH through runHostTick', () => {
  it('⭐⭐ parked on the enemy keep with nothing to chew, it lands exactly one bite per CHEW_INTERVAL_TICKS on the keep', () => {
    const w = twoSeat();
    const a = castleAnchor(1, w.layout);
    const me = chewerAt(w, a.x, a.y);
    const hp0 = w.players.get(P1)!.castleHp;
    // Tick 1 engages (ticksInState 0); the k-th bite lands when ticksInState reaches k × 60, i.e. on tick 60k + 1.
    const N = 6 * CHEW_INTERVAL_TICKS + 1;
    run(w, N);
    const c = w.creatures.get(me.id)!;
    expect(c.state, 'HELD in ATTACKING on the keep — the S194 bounce is gone').toBe('ATTACKING');
    expect(c.targetBondId).toBeNull();
    expect(c.chewProgress, 'the gnaw counter advances on the keep too').toBe(6);
    expect(hp0 - w.players.get(P1)!.castleHp, 'six bites of 7').toBe(6 * BITE);
    // Every bite also drew its graphite dust AT THE KEEP (host-local effect, Layer 7).
    const bites = w.effects.filter((e) => e.kind === 'CHEW_BITE' && e.creatureId === me.id);
    expect(bites.length).toBeGreaterThan(0);
    for (const b of bites) expect(b.kind === 'CHEW_BITE' && b.pos).toEqual({ x: a.x, y: a.y });
  });

  it('negative — a TEAMMATE\'s keep is never gnawed (the castle predicate is team-aware)', () => {
    const w = twoSeat();
    (w as { teams?: readonly number[] }).teams = [0, 0];
    const a = castleAnchor(1, w.layout);
    const me = chewerAt(w, a.x, a.y);
    const hp0 = w.players.get(P1)!.castleHp;
    run(w, 3 * CHEW_INTERVAL_TICKS + 1);
    expect(w.players.get(P1)!.castleHp).toBe(hp0);
    expect(w.creatures.get(me.id)!.state).not.toBe('ATTACKING');
  });

  it('⛔ THE KEEP IS LAST — a chewer gnawing the keep lets go the moment an enemy connector exists', () => {
    const w = twoSeat();
    const a = castleAnchor(1, w.layout);
    const me = chewerAt(w, a.x, a.y);
    const d = deps();
    const st = makeHostTickState(w);
    run(w, CHEW_INTERVAL_TICKS + 1, d, st); // one bite landed; it is gnawing
    const hpAfterOne = w.players.get(P1)!.castleHp;
    expect(w.creatures.get(me.id)!.state).toBe('ATTACKING');
    // The enemy has a building again, far away across the board.
    const bonds = building(w, P1, 300, 200, 4);
    run(w, 2 * CHEW_INTERVAL_TICKS, d, st);
    expect(w.players.get(P1)!.castleHp, 'no further bite on the keep').toBe(hpAfterOne);
    const c = w.creatures.get(me.id)!;
    expect(c.targetBondId !== null && bonds.includes(c.targetBondId), 'it took the connector instead').toBe(true);
  });

  it('control — a fallen keep is not gnawed (nothing swings at nothing)', () => {
    const w = twoSeat();
    const a = castleAnchor(1, w.layout);
    w.players.get(P1)!.castleHp = 0;
    const me = chewerAt(w, a.x, a.y);
    run(w, 2 * CHEW_INTERVAL_TICKS + 1);
    expect(w.players.get(P1)!.castleHp).toBe(0);
    expect(w.creatures.get(me.id)!.chewProgress).toBe(0);
  });
});
