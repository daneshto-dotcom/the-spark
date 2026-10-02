/**
 * SPARK — S194 (T8): the archer's arrow lands on the tick the sim strikes, RAGED OR CALM.
 *
 * `hostTick`'s fire check reads `ragedFireTick(attackFireTick, c)` (S188): under the cycle's rage latch
 * the strike lands at ticksInState 15, not 30. `creatureProjectile.resolveShotIn` read the bare config
 * fire tick, so a raged archer's arrow flew on the calm clock and never showed a landing at all.
 *
 * ⚠ LATENT IN PRODUCTION: goblins never rage (S187; `isOrcRacialCreatureType`), and the archer and bat
 * rider are the only throwers. The rage here is FORCED on the creature (`enraged = true`), which is the
 * only way to put a thrower on the raged clock today — the FSM then latches `attackCycleRaged` on its
 * own, and everything after that is the real `runHostTick`.
 *
 * REACH: per tick, the ticks on which the building's bank rises (the sim's strikes) must be EXACTLY the
 * ticks on which the drawn arrow is at t = 1 (the picture's landings), and a raged archer banks exactly
 * twice a calm one. Negative: a calm archer is unchanged (lands at the config fire tick).
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType, WARLORD_RAGE_MULTIPLIER, phaseDurationTicks } from '../constants.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asCreatureId, makeCreature, ragedFireTick, type Creature } from '../state/creatures/creature.ts';
import { GOBLIN_ARCHER_CONFIG } from '../state/creatures/voltkin-config.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from '../state/rng.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import type { Controls } from '../input/controls.ts';
import type { Primitive } from '../game/primitive.ts';
import { asBondId, asPlayerId, asPrimitiveId, asSpawnerId, type BondId, type PlayerId } from '../types.ts';
import { projectileFireTick, resolveProjectileImpact, resolveProjectileShot } from './creatureProjectile.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const FIRE = GOBLIN_ARCHER_CONFIG.attackFireTick;

function twoSeat(): World {
  const w = makeWorld(0x194f);
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

function archer(w: World, owner: PlayerId, x: number, y: number): Creature {
  const c = makeCreature(GOBLIN_ARCHER_CONFIG, {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { x, y }, targetPos: { x, y },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  w.creatures.set(c.id, c);
  return c;
}

function addShape(w: World, owner: PlayerId, x: number, y: number): Primitive {
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const seat = owner as unknown as number;
  const p = {
    id, type: SparkType.Square, placerColor: PLAYER_COLORS[seat]!, placedBy: owner, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set<BondId>(), ownerColor: PLAYER_COLORS[seat]!,
    lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  } as unknown as Primitive;
  w.primitives.set(id, p);
  return p;
}
let nextBond = 19400;
/** TWENTY connectors (pool 500 each) so nothing breaks in the window and drains the bank. */
function building(w: World, owner: PlayerId, x: number, y: number, n: number): BondId[] {
  let prev = addShape(w, owner, x, y);
  const out: BondId[] = [];
  for (let i = 1; i <= n; i++) {
    const next = addShape(w, owner, x + 32 * i, y);
    const id = asBondId(nextBond++);
    w.bonds.set(id, { id, aId: prev.id, bId: next.id, a: prev, b: next, restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0 } as never);
    prev.bonds.add(id);
    next.bonds.add(id);
    out.push(id);
    prev = next;
  }
  return out;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

interface Run { banked: number; strikes: number[]; landings: number[]; impacts: number[]; fireTicksSeen: number[] }

/** Drive the real host tick; after each tick, read what the renderer would draw from the same state. */
function run(raged: boolean, n = 600): Run {
  const w = twoSeat();
  const bonds = building(w, P1, 500, 300, 20);
  const a = archer(w, P0, 440, 300);
  a.ehp = 10_000; // hold it on the board; this measures the swing clock, nothing else
  if (raged) a.enraged = true; // ⚠ FORCED — no shipping writer rages a goblin (see the docblock)
  const d = deps();
  const st = makeHostTickState(w);
  const bank = (): number => bonds.reduce((s, b) => s + (w.bonds.get(b)?.damageFifths ?? 0), 0);
  const out: Run = { banked: 0, strikes: [], landings: [], impacts: [], fireTicksSeen: [] };
  let before = bank();
  for (let i = 0; i < n; i++) {
    // Only the archer and the building: the castles emit units that the archer would rightly turn on
    // (units first), and a strike on a unit does not show in the building's bank.
    for (const id of [...w.creatures.keys()]) if (id !== a.id) w.creatures.delete(id);
    runHostTick(w, d, st);
    const now = bank();
    if (now > before) out.strikes.push(w.tick);
    before = now;
    const c = w.creatures.get(a.id);
    if (c === undefined) continue;
    const shot = resolveProjectileShot(w, c);
    if (shot !== null && shot.t === 1) {
      out.landings.push(w.tick);
      out.fireTicksSeen.push(c.ticksInState);
    }
    if (resolveProjectileImpact(w, c) !== null && c.ticksInState === projectileFireTick(c) + 1) out.impacts.push(w.tick);
  }
  expect(bonds.every((b) => w.bonds.has(b)), 'fixture: nothing broke, so nothing was drained').toBe(true);
  out.banked = bank();
  return out;
}

describe('S194 T8 — the arrow lands on the sim’s strike tick, raged or calm (REACH through runHostTick)', () => {
  it('a CALM archer: every strike is a landing and every landing a strike, at the config fire tick', () => {
    const r = run(false);
    expect(r.strikes.length, 'fixture: the calm archer strikes the building').toBeGreaterThan(3);
    expect(r.landings).toEqual(r.strikes);
    expect(new Set(r.fireTicksSeen)).toEqual(new Set([FIRE]));
    // The impact puff starts the tick after each landing.
    expect(r.impacts).toEqual(r.strikes.map((t) => t + 1).filter((t) => t <= r.strikes[r.strikes.length - 1]! + 1));
  });

  it('⭐ a RAGED archer: the arrow lands on the halved fire tick, on exactly the ticks the sim strikes', () => {
    const r = run(true);
    expect(r.strikes.length, 'fixture: the raged archer strikes the building').toBeGreaterThan(3);
    expect(r.landings, 'every strike has a landing and no landing is a miss').toEqual(r.strikes);
    expect(new Set(r.fireTicksSeen)).toEqual(new Set([ragedFireTick(FIRE, { attackCycleRaged: true })]));
    expect(r.impacts.length, 'one impact puff per strike').toBe(r.strikes.length);
  });

  it('⭐ and the raged archer strikes on a cycle half as long, for the same fifths a strike', () => {
    // A cycle is the cadence in ATTACKING plus the one SEEKING tick of the FSM's bounce: 60 + 1 calm,
    // 30 + 1 raged (`attackCadenceTicks / WARLORD_RAGE_MULTIPLIER`). Measured, not assumed.
    const calm = run(false);
    const raged = run(true);
    const gaps = (r: Run): Set<number> => new Set(r.strikes.slice(1).map((t, i) => t - r.strikes[i]!));
    const cadence = GOBLIN_ARCHER_CONFIG.attackCadenceTicks;
    expect(gaps(calm)).toEqual(new Set([cadence + 1]));
    expect(gaps(raged)).toEqual(new Set([cadence / WARLORD_RAGE_MULTIPLIER + 1]));
    expect(calm.banked / calm.strikes.length, 'one strike, the same fifths').toBe(raged.banked / raged.strikes.length);
    expect(raged.strikes.length).toBeGreaterThanOrEqual(calm.strikes.length * WARLORD_RAGE_MULTIPLIER - 1);
  });

  it('negative: projectileFireTick is the config tick when calm, and halved only under the cycle latch', () => {
    const w = twoSeat();
    const a = archer(w, P0, 0, 0);
    expect(projectileFireTick(a)).toBe(FIRE);
    a.enraged = true; // the live bit alone does not move this cycle's clock — the latch does (S188 F3)
    expect(projectileFireTick(a)).toBe(FIRE);
    a.attackCycleRaged = true;
    expect(projectileFireTick(a)).toBe(FIRE / WARLORD_RAGE_MULTIPLIER);
  });
});
