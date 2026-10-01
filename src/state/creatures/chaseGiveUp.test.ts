/**
 * SPARK — S192 T6 (owner playtest): **DON'T CHASE WHAT YOU CAN'T CATCH.**
 *
 * > *"there's like a … electric drone … flies across. Then they turn around to chase him … going back
 * > and forth, not doing anything … they ignore it if it's like way too quick for them to actually
 * > catch up."* — owner, S192
 *
 * Research Option 1 (`cannotCatch`, `creatureAI.ts`): a quarry that cannot strike a unit, is faster than
 * `CHASE_GIVEUP_SPEED_RATIO` (1.25, ⚠ MINE) × the chaser, and is beyond the chaser's reach +
 * `CHASE_GIVEUP_SLACK_PX` (20, ⚠ MINE) is neither acquired nor held.
 *
 * ## What is pinned
 *   · the arithmetic over the real configs (who gives up on whom);
 *   · REACH, through the real host tick: a unit marching on the enemy keep with one enemy drone crossing
 *     its path loses (almost) none of its advance (−42.9 % / −43.0 % before the fix on this repro, 0.0 %
 *     after; the research's own board measured −40 % / −59 %);
 *   · NEGATIVE: a drone INSIDE the chaser's reach is still picked; a chewer next to a melee goblin is
 *     still chased; a quarry that can strike (an archer — R184-A) is never skipped, held or acquired.
 *   ⭐ MUTATION-TESTED: `cannotCatch` returning false turns the REACH (both units) and the arithmetic cases red.
 */
import { describe, expect, it } from 'vitest';
import {
  CHASE_GIVEUP_SLACK_PX,
  CHASE_GIVEUP_SPEED_RATIO,
  GOBLIN_UNIT_ACQUIRE_RADIUS,
  GOBLIN_UNIT_LEASH_RADIUS,
  PLAYER_COLORS,
} from '../../constants.ts';
import { castleAnchor } from '../gatherers/gatherer.ts';
import { engageRange, pickNavUnit } from './creatureAI.ts';
import { makeCreature, type Creature, type CreatureType } from './creature.ts';
import { CREATURE_CONFIGS, isNonCombatantType } from './voltkin-config.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asCreatureId, asPlayerId, asSpawnerId, type Vec2 } from '../../types.ts';
import type { Controls } from '../../input/controls.ts';

const ACQ = GOBLIN_UNIT_ACQUIRE_RADIUS * GOBLIN_UNIT_ACQUIRE_RADIUS;
const LEASH = GOBLIN_UNIT_LEASH_RADIUS * GOBLIN_UNIT_LEASH_RADIUS;
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

function board(): World {
  const w = makeWorld(0x76);
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
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  return w;
}

function put(w: World, seat: number, type: CreatureType, pos: Vec2, targetPos: Vec2 = pos): Creature {
  const id = asCreatureId(w.nextCreatureId++);
  const c = makeCreature(CREATURE_CONFIGS[type], {
    id,
    ownerPlayerId: asPlayerId(seat),
    pos: { x: pos.x, y: pos.y },
    targetPos: { x: targetPos.x, y: targetPos.y },
    // A drone is born NOW: back-dating it would expire its fuse on the first tick (it detonates).
    spawnedAtTick: type === 'lightningDrone' ? w.tick : w.tick - 1000,
    sourceSpawnerId: type === 'voltkin' ? null : asSpawnerId(1),
    clock: w,
  });
  c.state = 'SEEKING';
  w.creatures.set(c.id, c);
  return c;
}

/**
 * The research repro, rebuilt: a seat-0 unit marches east on seat 1's keep; one seat-1 drone appears
 * 260 px ahead and 120 px off-axis and flies WEST past it, toward seat 0's base, at the drone's measured
 * cruise speed (3.92 px/tick, S192 research). Returns how far east the unit got.
 *
 * ⚠ THE DRONE'S FLIGHT IS SCRIPTED, AND ONLY THE DRONE'S. A drone with no enemy connector to home on
 * idles at its hub (`s191/owner` stock), so an unscripted one never crosses anything; and the castle
 * emitter births units mid-run that the marcher would stop to fight. Both would measure something other
 * than "a drone flew past". The marcher itself runs on the unmodified host tick.
 */
const DRONE_CRUISE_PX_PER_TICK = 3.92;
function advance(type: CreatureType, withDrone: boolean, ticks: number): { dx: number; lockedTicks: number } {
  const w = board();
  const start = { x: 600, y: 540 };
  const u = put(w, 0, type, start, castleAnchor(1, w.layout));
  const drone = withDrone ? put(w, 1, 'lightningDrone', { x: start.x + 260, y: start.y - 120 }, castleAnchor(0, w.layout)) : null;
  const d = deps();
  const s = makeHostTickState(w);
  let lockedTicks = 0;
  for (let t = 0; t < ticks; t++) {
    if (drone !== null && w.creatures.has(drone.id)) {
      const x = start.x + 260 - DRONE_CRUISE_PX_PER_TICK * t;
      const y = start.y - 120 + 0.4 * t;
      drone.prevPos.x = x + DRONE_CRUISE_PX_PER_TICK; drone.prevPos.y = y - 0.4;
      drone.pos.x = x; drone.pos.y = y;
    }
    runHostTick(w, d, s);
    for (const id of [...w.creatures.keys()]) if (id !== u.id && id !== drone?.id) w.creatures.delete(id);
    const me = w.creatures.get(u.id);
    if (me === undefined) break;
    if (me.targetCreatureId !== null) lockedTicks++;
  }
  const me = w.creatures.get(u.id);
  return { dx: me === undefined ? NaN : me.pos.x - start.x, lockedTicks };
}

describe('S192 T6 — the arithmetic over the real configs', () => {
  it('the drone and the chewer are the non-combatants; nobody else is', () => {
    const nonCombatants = (Object.keys(CREATURE_CONFIGS) as CreatureType[]).filter(isNonCombatantType).sort();
    expect(nonCombatants).toEqual(['chewer', 'lightningDrone']);
    expect(CHASE_GIVEUP_SPEED_RATIO).toBe(1.25);
    expect(CHASE_GIVEUP_SLACK_PX).toBe(20);
  });

  it('a drone just beyond reach is dropped by every structure-attacker; a chewer only by the slowest', () => {
    const w = board();
    const drone = CREATURE_CONFIGS.lightningDrone.maxAccel;
    const chewer = CREATURE_CONFIGS.chewer.maxAccel;
    for (const type of ['goblinMelee', 'goblinShield', 'goblinArcher', 't3Bat', 't9BossOrcs'] as CreatureType[]) {
      const me = put(w, 0, type, { x: 600, y: 540 });
      const reach = engageRange(CREATURE_CONFIGS[type]) + CHASE_GIVEUP_SLACK_PX;
      // Beyond reach + slack, and inside the 220 px acquire radius (the archer's is 218).
      const at = Math.max(200, Math.floor(reach) + 1);
      expect(at, `fixture: ${at} px is inside the acquire radius`).toBeLessThanOrEqual(GOBLIN_UNIT_ACQUIRE_RADIUS);
      const q = put(w, 1, 'lightningDrone', { x: 600 + at, y: 540 });
      expect(drone).toBeGreaterThan(CREATURE_CONFIGS[type].maxAccel * 1.25);
      expect(pickNavUnit(w, me, null, ACQ, LEASH), `${type} acquires a passing drone`).toBeNull();
      expect(pickNavUnit(w, me, q.id, ACQ, LEASH), `${type} holds a passing drone`).toBeNull();
      w.creatures.delete(q.id);
      const ch = put(w, 1, 'chewer', { x: 600 + at, y: 540 });
      const shouldChase = chewer <= CREATURE_CONFIGS[type].maxAccel * 1.25;
      expect(pickNavUnit(w, me, null, ACQ, LEASH) === ch.id, `${type} vs chewer`).toBe(shouldChase);
      w.creatures.delete(ch.id);
      w.creatures.delete(me.id);
    }
  });
});

describe('S192 T6 — negatives', () => {
  it('a drone INSIDE your reach is still picked ("maybe they target it if it\'s around them")', () => {
    const w = board();
    const me = put(w, 0, 'goblinMelee', { x: 600, y: 540 });
    const reach = engageRange(CREATURE_CONFIGS.goblinMelee);
    const q = put(w, 1, 'lightningDrone', { x: 600 + reach, y: 540 });
    expect(pickNavUnit(w, me, null, ACQ, LEASH)).toBe(q.id);
    expect(pickNavUnit(w, me, q.id, ACQ, LEASH)).toBe(q.id);
  });

  it('a chewer 200 px from a melee goblin is still chased (120 ≤ 119 × 1.25)', () => {
    const w = board();
    const me = put(w, 0, 'goblinMelee', { x: 600, y: 540 });
    const q = put(w, 1, 'chewer', { x: 800, y: 540 });
    expect(pickNavUnit(w, me, null, ACQ, LEASH)).toBe(q.id);
  });

  it('⛔ R184-A untouched: a quarry that can strike — the archer — is acquired and held at any speed or range', () => {
    const w = board();
    const boss = put(w, 0, 't9BossVampires', { x: 600, y: 540 });
    const archer = put(w, 1, 'goblinArcher', { x: 800, y: 540 });
    expect(pickNavUnit(w, boss, null, ACQ, LEASH)).toBe(archer.id);
    archer.pos.x = 880; // beyond acquire, inside leash: the retaliation chase is HELD
    expect(pickNavUnit(w, boss, archer.id, ACQ, LEASH)).toBe(archer.id);
  });
});

describe('S192 T6 — REACH, through the real host tick: one passing drone no longer costs the advance', () => {
  // BEFORE, measured on THIS repro with `cannotCatch` forced false (S192): goblinMelee 904 → 517 px
  // (−42.9 %, 129 ticks locked on the drone), t9BossOrcs 957 → 545 px (−43.0 %, 129 ticks). The research's
  // own repro (a different board) measured −40 % / −59 %. AFTER: 0.0 % for both, 0 ticks locked.
  for (const [type, beforeLoss] of [['goblinMelee', 0.429], ['t9BossOrcs', 0.43]] as const) {
    it(`${type}: ${Math.round(beforeLoss * 100)} % of the advance lost before the fix; now under 10 %`, () => {
      const TICKS = 500;
      const clean = advance(type, false, TICKS);
      const drone = advance(type, true, TICKS);
      const loss = 1 - drone.dx / clean.dx;
      console.log(`[S192 T6] ${type}: no drone ${clean.dx.toFixed(0)} px, one drone ${drone.dx.toFixed(0)} px, loss ${(loss * 100).toFixed(1)} %, ticks locked ${drone.lockedTicks}`);
      expect(clean.dx, 'anti-vacuity: the unit really marched').toBeGreaterThan(300);
      expect(loss).toBeLessThan(0.1);
    });
  }
});
