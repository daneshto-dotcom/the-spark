/**
 * SPARK — S192 T13 (owner playtest): **NEVER TARGET THE DEAD.**
 *
 * > *"creatures attacking a dead enemy … my spawn were attacking him, even though it was already dead
 * > … even dead tower … an enemy castle was destroyed, and instead of my … creatures going and
 * > attacking other towers or another's castle, they went back to the castle that's already
 * > destroyed."* — owner, S192
 *
 * Two defects (S192 research, reproduced there):
 *   1. THE FALLEN KEEP — `enemyCastleMarchPos` had no `castleHp` test. A unit walked to a ruin
 *      `enemyCastleInReach` refuses to strike, and milled there forever.
 *   2. THE CORPSE-IN-WAITING — under the S155 N1 deferral a unit killed earlier in the tick stays in
 *      `world.creatures`; every pick and hold could return it. ONE predicate now:
 *      `isLiveCreatureTarget` (live pool · not pending · targetable). No fade clause, by ruling.
 *
 * ## What is pinned
 *   · the arithmetic of the predicate, each of its four conditions alone;
 *   · REACH, through the real host tick: three seats, one keep fallen, a unit standing at the ruin
 *     marches on the LIVE keep and damages it (before: 26 px from the ruin after 1200 ticks);
 *   · every pick site skips a corpse-in-waiting nearer than a live enemy: the chokepoint, `pickNavUnit`
 *     acquire AND hold, a castle gun, the Voltkin chain hop, a defender's hold;
 *   · NEGATIVE: with every enemy keep fallen the march returns `null`; a LIVE enemy at the same
 *     distance is still picked (the predicate does not over-filter).
 *   The real-match REACH for the nav pick is `s191Perf.differential.test.ts`: through the real host
 *   tick, `pendingDeathReturned === 0` with `corpseAvoided` ≥ its floor (746 measured, S192).
 *   ⭐ MUTATION-TESTED (results in `S192_PROGRESS_units_ai.md`): dropping the `castleHp` skip turns the
 *   REACH march red; dropping the pending line from `isLiveCreatureTarget` turns the pick cases red
 *   AND the perf differential (reference ≠ real).
 */
import { describe, expect, it } from 'vitest';
import { FIGHT_PHASE_TICKS, PLAYER_COLORS } from '../../constants.ts';
import { castleAnchor } from '../gatherers/gatherer.ts';
import { enemyCastleMarchPos, findNearestEnemyCreatureFrom, pickNavUnit } from './creatureAI.ts';
import { isLiveCreatureTarget, makeCreature, type Creature, type CreatureType } from './creature.ts';
import { CREATURE_CONFIGS } from './voltkin-config.ts';
import { damageCreature } from './creatureLifecycle.ts';
import { voltkinChainFrom } from './voltkinChain.ts';
import { castleGunsTick, castleFiresOnTick } from '../castleGuns.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asCreatureId, asPlayerId, asSpawnerId, type CreatureId, type Vec2 } from '../../types.ts';
import type { Controls } from '../../input/controls.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const P2 = asPlayerId(2);
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

function board(seats: number): World {
  const w = makeWorld(0x713);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: seats === 2 ? '1v1' : 'bots',
    isHost: true,
    roster: Array.from({ length: seats }, (_, i) => ({ seat: i, color: PLAYER_COLORS[i]! })),
    botSeats: [],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  return w;
}

let nextId = 1;
function put(w: World, seat: number, pos: Vec2, type: CreatureType = 'goblinMelee'): Creature {
  const id = asCreatureId(Math.max(nextId++, w.nextCreatureId));
  w.nextCreatureId = (id as unknown as number) + 1;
  const c = makeCreature(CREATURE_CONFIGS[type], {
    id,
    ownerPlayerId: asPlayerId(seat),
    pos: { x: pos.x, y: pos.y },
    targetPos: { x: pos.x, y: pos.y },
    spawnedAtTick: w.tick,
    sourceSpawnerId: type === 'voltkin' ? null : asSpawnerId(1),
    clock: w,
  });
  w.creatures.set(c.id, c);
  return c;
}

/** Kill `id` the way the in-loop strike path does: lethal, DEFERRED to the sweep. */
function killDeferred(w: World, id: CreatureId): void {
  if (w.pendingCreatureDeaths === null) w.pendingCreatureDeaths = new Set();
  expect(damageCreature(w, id, 1_000_000, w.pendingCreatureDeaths)).toBe(true);
  expect(w.creatures.has(id), 'fixture: a corpse-in-waiting is still in the Map').toBe(true);
}

describe('S192 T13 — isLiveCreatureTarget, the arithmetic', () => {
  it('each of the three conditions alone makes a creature not a target', () => {
    const w = board(2);
    const c = put(w, 1, { x: 900, y: 500 });
    expect(isLiveCreatureTarget(w, c), 'a healthy unit is a target').toBe(true);
    c.ehp = 0;
    expect(isLiveCreatureTarget(w, c), 'zero pool').toBe(false);
    c.ehp = 1;
    expect(isLiveCreatureTarget(w, c), '1 fifth left is still alive').toBe(true);
    w.pendingCreatureDeaths = new Set([c.id]);
    expect(isLiveCreatureTarget(w, c), 'pending death').toBe(false);
    w.pendingCreatureDeaths = null;
    c.state = 'DESPAWNING';
    expect(isLiveCreatureTarget(w, c), 'a unit in its last second is still a target — "destroyed or respawned"').toBe(true);
    c.state = 'SEEKING';
    c.raRitualUntilTick = w.tick + 5;
    expect(isLiveCreatureTarget(w, c), 'between realities').toBe(false);
    c.raRitualUntilTick = w.tick; // strictly `<` — ended
    expect(isLiveCreatureTarget(w, c)).toBe(true);
    const cloud = put(w, 1, { x: 950, y: 500 }, 'locustCloud');
    expect(isLiveCreatureTarget(w, cloud), 'untargetable by type').toBe(false);
  });
});

describe('S192 T13 — the fallen keep', () => {
  it('⭐⭐ REACH, through the real host tick: a unit at a FALLEN keep marches on the LIVE one and damages it', () => {
    const w = board(3);
    expect(w.players.size, 'fixture: three seats').toBe(3);
    const fallen = castleAnchor(1, w.layout);
    const live = castleAnchor(2, w.layout);
    w.players.get(P1)!.castleHp = 0;
    const liveHp0 = w.players.get(P2)!.castleHp;
    expect(liveHp0).toBeGreaterThan(0);
    // Standing right beside the ruin — the nearest keep by far, which is what the old loop chose.
    // ⚠ The orc BOSS, not a goblin: the live keep's gun one-shots a goblin (7 fifths) on its approach
    // (measured: it reached y≈800 of 950 and died) — which would prove the march but not the strike.
    const g = put(w, 0, { x: fallen.x - 30, y: fallen.y + 30 }, 't9BossOrcs');
    const gid = g.id;
    const before = enemyCastleMarchPos(w, g);
    expect(before).toEqual({ x: live.x, y: live.y });
    const d = deps();
    const s = makeHostTickState(w);
    let hitLive = false;
    for (let t = 0; t < 1800 && !hitLive; t++) {
      runHostTick(w, d, s);
      if (w.players.get(P2)!.castleHp < liveHp0) hitLive = true;
      if (!w.creatures.has(gid)) break;
    }
    const after = w.creatures.get(gid);
    expect(hitLive, 'the live keep took damage').toBe(true);
    if (after !== undefined) {
      const dl = Math.hypot(after.pos.x - live.x, after.pos.y - live.y);
      const df = Math.hypot(after.pos.x - fallen.x, after.pos.y - fallen.y);
      expect(dl, 'it ended nearer the live keep than the ruin').toBeLessThan(df);
    }
  });

  it('the arithmetic: the nearest LIVE keep, lowest seat on a tie — never a fallen one', () => {
    const w = board(3);
    const g = put(w, 0, castleAnchor(1, w.layout));
    expect(enemyCastleMarchPos(w, g)).toEqual(castleAnchor(1, w.layout)); // live: it is the nearest
    w.players.get(P1)!.castleHp = 0;
    expect(enemyCastleMarchPos(w, g)).toEqual(castleAnchor(2, w.layout));
  });

  it('⛔ NEGATIVE — with every enemy keep fallen there is nowhere to march: null', () => {
    const w = board(3);
    w.players.get(P1)!.castleHp = 0;
    w.players.get(P2)!.castleHp = 0;
    const g = put(w, 0, { x: 900, y: 500 });
    expect(enemyCastleMarchPos(w, g)).toBeNull();
  });
});

describe('S192 T13 — every pick skips a corpse-in-waiting', () => {
  /** A seat-0 unit at x=600; a seat-1 corpse at 40 px; a live seat-1 unit at 100 px (the research repro). */
  function corpseBoard(): { w: World; me: Creature; corpse: Creature; liveOne: Creature } {
    const w = board(2);
    const me = put(w, 0, { x: 600, y: 500 });
    const corpse = put(w, 1, { x: 640, y: 500 });
    const liveOne = put(w, 1, { x: 700, y: 500 });
    killDeferred(w, corpse.id);
    return { w, me, corpse, liveOne };
  }

  it('the chokepoint (castle guns, defenders, the Voltkin): the live unit, not the body', () => {
    const { w, me, liveOne } = corpseBoard();
    expect(findNearestEnemyCreatureFrom(w, me.pos, P0, 300 * 300, me.id)).toBe(liveOne.id);
  });

  it('⛔ NEGATIVE — the predicate does not over-filter: without the kill, the nearer unit wins', () => {
    const w = board(2);
    const me = put(w, 0, { x: 600, y: 500 });
    const near = put(w, 1, { x: 640, y: 500 });
    put(w, 1, { x: 700, y: 500 });
    expect(findNearestEnemyCreatureFrom(w, me.pos, P0, 300 * 300, me.id)).toBe(near.id);
    expect(pickNavUnit(w, me, null, 220 * 220, 300 * 300)).toBe(near.id);
  });

  it('pickNavUnit: the acquire skips the body, and a lock ON the body is dropped, not held', () => {
    const { w, me, corpse, liveOne } = corpseBoard();
    expect(pickNavUnit(w, me, null, 220 * 220, 300 * 300)).toBe(liveOne.id);
    expect(pickNavUnit(w, me, corpse.id, 220 * 220, 300 * 300)).toBe(liveOne.id);
  });

  it('a castle gun shoots the live unit, not the body', () => {
    const w = board(2);
    const keep = castleAnchor(0, w.layout);
    const corpse = put(w, 1, { x: keep.x + 60, y: keep.y });
    const liveOne = put(w, 1, { x: keep.x + 150, y: keep.y });
    killDeferred(w, corpse.id);
    while (!castleFiresOnTick(0, w.tick)) w.tick++;
    const hp0 = liveOne.ehp;
    castleGunsTick(w);
    expect(liveOne.ehp, 'the live unit took the shot').toBeLessThan(hp0);
  });

  it('the Voltkin chain hops to the live unit, never onto the body', () => {
    const w = board(2);
    const volt = put(w, 0, { x: 400, y: 500 }, 'voltkin');
    const seed = put(w, 1, { x: 450, y: 500 });
    const corpse = put(w, 1, { x: 480, y: 500 });
    const liveOne = put(w, 1, { x: 520, y: 500 });
    killDeferred(w, corpse.id);
    const links = voltkinChainFrom(w, volt, { kind: 'creature', id: seed.id, pos: { ...seed.pos } });
    const ids = links.filter((l) => l.kind === 'creature').map((l) => l.id);
    expect(ids, 'no link lands on the body').not.toContain(corpse.id);
    expect(ids, 'anti-vacuity: the chain did hop to a live unit').toContain(liveOne.id);
  });

  it('⛔ by ruling, a TTL unit in its last second (DESPAWNING) is still picked — "Units are either destroyed or respawned"', () => {
    const w = board(2);
    const me = put(w, 0, { x: 600, y: 500 });
    const ending = put(w, 1, { x: 640, y: 500 }, 'voltkin');
    put(w, 1, { x: 700, y: 500 });
    ending.state = 'DESPAWNING';
    expect(findNearestEnemyCreatureFrom(w, me.pos, P0, 300 * 300, me.id)).toBe(ending.id);
  });

  it('a unit in ATTACKING on a victim killed this tick by someone else drops the commit (host tick)', () => {
    const w = board(2);
    const me = put(w, 0, { x: 600, y: 500 });
    const victim = put(w, 1, { x: 620, y: 500 });
    me.state = 'ATTACKING';
    me.ticksInState = 1;
    me.targetCreatureId = victim.id;
    killDeferred(w, victim.id);
    // One reducer tick of the creature FSM, on the deferred corpse.
    dispatch(w, { type: 'CREATURE_TICK', creatureId: me.id } as never);
    expect(me.targetCreatureId, 'the commit on a corpse was dropped').not.toBe(victim.id);
    void FIGHT_PHASE_TICKS;
  });
});
