/**
 * SPARK — S192 T6 (owner playtest, REFINED): **CHASE A DRONE SMARTLY — NEVER ACROSS THE MAP.**
 *
 * > *"I didn't say ignore drones or pencil chewers all the time. It just has to be smart … if you can
 * > acquire the drone or a pencil chewer before he reaches his target, or if … the target is not too
 * > far from you, so you're still in your zone, then you shouldn't ignore them … I already destroyed
 * > his army, so I'm approaching to attack his buildings. But then one of his buildings produces a
 * > drone … my creatures are changing a target to his drone, and they're basically chasing down till
 * > the middle of the map, where they lose track of him, and then they go back to attack … a
 * > never-ending cycle."* — owner, S192
 *
 * `cannotCatch` (`creatureAI.ts`): a FAST NON-COMBATANT (drone / chewer, faster than 1.25 × the chaser,
 * ⚠ MINE) is engaged when it is within reach + 20 px (⚠ MINE), OR inside the chaser's own zone, OR an
 * intercept is feasible; otherwise it is neither acquired nor held — so it cannot be re-acquired until
 * one of those holds again (no ping-pong, no memory).
 *
 * ## What is pinned
 *   · HIS SCENARIO, through the real host tick: an orc-boss army razing seat 1's towers while seat 1's
 *     REAL lightning hub emits drones at seat 0's base. It razes the towers, never chases a drone into the
 *     middle of the map, drops each drone at the edge of its reach, and never re-takes one from outside it;
 *   · a drone inside the chaser's OWN zone is engaged (home defence), at a distance it would drop abroad;
 *   · an intercept: the same drone at the same distance is engaged when its path runs past the chaser
 *     and dropped when it flies straight away;
 *   · the arithmetic over the real configs; the advance-loss table (scripted drone, enemy ground);
 *   · NEGATIVES: inside reach still picked; a chewer still chased by a melee goblin; R184-A — a boss
 *     still takes and holds an archer; HELGA still engages a passing drone (the rule is `pickNavUnit`'s).
 *   ⭐ MUTATION-TESTED (`cannotCatch → false`): the scenario, the arithmetic, the intercept-away and the
 *   advance cases go red; dropping the zone arm turns the home case red; dropping the intercept arm turns
 *   the intercept-past case red. ⭐ S193: dropping the CHASER-at-home clause (real side only, or real AND
 *   reference) turns the HOME-means-both case, the three border REACH cases and the oracle's abroad/home
 *   case red (5). Results in `S192_PROGRESS_units_ai.md`.
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
import { engageRange, pickNavUnit, STANDOFF_ENGAGE_FRACTION } from './creatureAI.ts';
import { REFERENCE_STANDOFF_ENGAGE_FRACTION } from './navUnitReference.fixtures.ts';
import { makeCreature, type Creature, type CreatureType } from './creature.ts';
import { CREATURE_CONFIGS, isNonCombatantType } from './voltkin-config.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asCreatureId, asPlayerId, asSpawnerId, type CreatureId, type Vec2 } from '../../types.ts';
import type { Controls } from '../../input/controls.ts';
import { applyBuildBlueprint } from '../blueprintBuild.ts';
import { stampRefusalAt } from '../blueprintLegality.ts';
import { runGodlyMatcherCore } from '../godlyMatcherCore.ts';
import { blueprintBill } from '../blueprints.ts';
import { makeCastleBank } from '../castleBank.ts';
import { zoneOf } from '../zones.ts';
import { makeDefender } from '../defenders/defender.ts';
import { applyDefenderTick } from '../defenders/defenderLifecycle.ts';
import { asDefenderId, asPrimitiveId } from '../../types.ts';
// ⚠ SIDE-EFFECT IMPORT, REQUIRED — the recipes register themselves; without it nothing ignites.
import '../godlyRecipes/registerAll.ts';

const ACQ = GOBLIN_UNIT_ACQUIRE_RADIUS * GOBLIN_UNIT_ACQUIRE_RADIUS;
const LEASH = GOBLIN_UNIT_LEASH_RADIUS * GOBLIN_UNIT_LEASH_RADIUS;
const P0 = asPlayerId(0);
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

function board(phase: 'BUILD' | 'FIGHT' = 'FIGHT'): World {
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
  w.matchPhase = phase;
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

/** Stamp + ignite `blueprint` for `seat` at the legal site nearest `near` (production reducer + matcher). */
function stamp(w: World, seat: number, blueprint: string, near: Vec2): Vec2 {
  const P = asPlayerId(seat);
  let site: Vec2 | null = null;
  for (let r = 0; r < 400 && site === null; r += 10) {
    for (let a = 0; a < 16 && site === null; a++) {
      const p = { x: Math.round(near.x + Math.cos((a * Math.PI) / 8) * r), y: Math.round(near.y + Math.sin((a * Math.PI) / 8) * r) };
      if (stampRefusalAt(w, p, P, blueprint as never) === null) site = p;
    }
  }
  if (site === null) throw new Error(`fixture: no legal ${blueprint} site near ${near.x},${near.y}`);
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill(blueprint as never)) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P, blueprintId: blueprint, centre: site } as never);
  w.tick += 1;
  runGodlyMatcherCore(w, { lastMatcherTick: 0 });
  return site;
}

describe('S192 T6 — the arithmetic over the real configs', () => {
  it('the drone and the chewer are the non-combatants; nobody else is; the two numbers are 1 (S195 N11, was 1.25) and 20', () => {
    const nonCombatants = (Object.keys(CREATURE_CONFIGS) as CreatureType[]).filter(isNonCombatantType).sort();
    expect(nonCombatants).toEqual(['chewer', 'lightningDrone']);
    expect(CHASE_GIVEUP_SPEED_RATIO).toBe(1);
    expect(CHASE_GIVEUP_SLACK_PX).toBe(20);
    // ⭐ S195 N11 — HIS CASE: the scarab (105) vs the chewer (120) is 1.14 — inside the old 1.25 slack, so the
    // three engage conditions never ran for it; at 1 the chewer is a FAST quarry for a scarab, and for the
    // melee goblin (119) too, while the t3Bat (168) still simply runs it down.
    expect(CREATURE_CONFIGS.t3Scarab.maxAccel).toBe(105);
    expect(CREATURE_CONFIGS.chewer.maxAccel).toBeGreaterThan(CREATURE_CONFIGS.t3Scarab.maxAccel * CHASE_GIVEUP_SPEED_RATIO);
    expect(CREATURE_CONFIGS.chewer.maxAccel).toBeLessThanOrEqual(CREATURE_CONFIGS.t3Scarab.maxAccel * 1.25);
    expect(CREATURE_CONFIGS.chewer.maxAccel).toBeGreaterThan(CREATURE_CONFIGS.goblinMelee.maxAccel * CHASE_GIVEUP_SPEED_RATIO);
    expect(CREATURE_CONFIGS.chewer.maxAccel).toBeLessThanOrEqual(CREATURE_CONFIGS.t3Bat.maxAccel * CHASE_GIVEUP_SPEED_RATIO);
  });

  it('ABROAD, a pathless drone just beyond reach is dropped by every structure-attacker; a chewer by everyone slower than it (S195 N11)', () => {
    const w = board();
    const at0 = { x: 1300, y: 200 }; // seat 1's half: enemy ground for a seat-0 chaser
    expect(zoneOf(at0, w.layout)).toBe(1);
    const drone = CREATURE_CONFIGS.lightningDrone.maxAccel;
    const chewer = CREATURE_CONFIGS.chewer.maxAccel;
    for (const type of ['goblinMelee', 'goblinShield', 'goblinArcher', 't3Bat', 't9BossOrcs'] as CreatureType[]) {
      const me = put(w, 0, type, at0);
      const reach = engageRange(CREATURE_CONFIGS[type]) + CHASE_GIVEUP_SLACK_PX;
      const at = Math.max(200, Math.floor(reach) + 1); // beyond reach + slack, inside the 220 acquire radius
      expect(at).toBeLessThanOrEqual(GOBLIN_UNIT_ACQUIRE_RADIUS);
      const q = put(w, 1, 'lightningDrone', { x: at0.x + at, y: at0.y });
      expect(drone).toBeGreaterThan(CREATURE_CONFIGS[type].maxAccel * CHASE_GIVEUP_SPEED_RATIO);
      expect(pickNavUnit(w, me, null, ACQ, LEASH), `${type} acquires a pathless drone abroad`).toBeNull();
      expect(pickNavUnit(w, me, q.id, ACQ, LEASH), `${type} holds a pathless drone abroad`).toBeNull();
      w.creatures.delete(q.id);
      const ch = put(w, 1, 'chewer', { x: at0.x + at, y: at0.y });
      const shouldChase = chewer <= CREATURE_CONFIGS[type].maxAccel * CHASE_GIVEUP_SPEED_RATIO;
      expect(pickNavUnit(w, me, null, ACQ, LEASH) === ch.id, `${type} vs chewer`).toBe(shouldChase);
      w.creatures.delete(ch.id);
      w.creatures.delete(me.id);
    }
  });
});

describe('S192 T6 — his three engage conditions', () => {
  it('⭐ HOME: a drone inside the chaser\'s OWN zone is engaged at a distance it would drop abroad', () => {
    const w = board();
    const home = { x: 500, y: 200 };
    expect(zoneOf(home, w.layout)).toBe(0);
    const me = put(w, 0, 'goblinMelee', home);
    const q = put(w, 1, 'lightningDrone', { x: home.x + 200, y: home.y }); // pathless, 200 px, in zone 0
    expect(zoneOf(q.pos, w.layout)).toBe(0);
    expect(pickNavUnit(w, me, null, ACQ, LEASH)).toBe(q.id);
    expect(pickNavUnit(w, me, q.id, ACQ, LEASH)).toBe(q.id);
  });

  it('⭐ S193 HOME means BOTH of you are home: a unit abroad by the border does not take a drone that crossed into its zone', () => {
    const w = board();
    const abroad = { x: 1000, y: 200 }; // 40 px into seat 1's half
    expect(zoneOf(abroad, w.layout)).toBe(1);
    const me = put(w, 0, 'goblinMelee', abroad);
    const reach = engageRange(CREATURE_CONFIGS.goblinMelee) + CHASE_GIVEUP_SLACK_PX;
    for (const dx of [88, 150, 202]) {
      expect(dx).toBeGreaterThan(reach); // arithmetic: every band is beyond reach + slack
      const q = put(w, 1, 'lightningDrone', { x: abroad.x - dx, y: abroad.y }); // pathless, in zone 0
      expect(zoneOf(q.pos, w.layout)).toBe(0);
      expect(pickNavUnit(w, me, null, ACQ, LEASH), `acquire at -${dx}`).toBeNull();
      expect(pickNavUnit(w, me, q.id, ACQ, LEASH), `hold at -${dx}`).toBeNull();
      w.creatures.delete(q.id);
    }
    // NEGATIVE — the same drone 150 px away with the unit standing at home is engaged (home defence).
    me.pos.x = 900;
    const q = put(w, 1, 'lightningDrone', { x: 750, y: abroad.y });
    expect(zoneOf(me.pos, w.layout)).toBe(0);
    expect(pickNavUnit(w, me, null, ACQ, LEASH)).toBe(q.id);
  });

  it('⭐ INTERCEPT: abroad, the same drone at the same distance is engaged when its path runs past you, dropped when it flies away', () => {
    const w = board();
    const at0 = { x: 1300, y: 200 };
    const me = put(w, 0, 'goblinMelee', at0);
    // 200 px east, heading west for seat 0's base: its path runs straight past the goblin.
    const past = put(w, 1, 'lightningDrone', { x: at0.x + 200, y: at0.y + 30 }, { x: 300, y: at0.y + 30 });
    expect(pickNavUnit(w, me, null, ACQ, LEASH), 'cut it off').toBe(past.id);
    w.creatures.delete(past.id);
    // 200 px east, heading further EAST: the goblin can never get ahead of it.
    const away = put(w, 1, 'lightningDrone', { x: at0.x + 200, y: at0.y + 30 }, { x: 1880, y: at0.y + 30 });
    expect(pickNavUnit(w, me, null, ACQ, LEASH), 'it is leaving — let it go').toBeNull();
    expect(pickNavUnit(w, me, away.id, ACQ, LEASH), 'and a lock on it is dropped').toBeNull();
  });

  it('⭐⭐ S195 N11 — HOME is not enough any more: a MOVING drone at home beyond reach is engaged only if it can be cut off', () => {
    const w = board();
    const home = { x: 500, y: 200 };
    const me = put(w, 0, 'goblinMelee', home);
    // 200 px east of the goblin, flying further EAST (toward the border): nobody at home can get ahead of it.
    const away = put(w, 1, 'lightningDrone', { x: home.x + 200, y: home.y + 30 }, { x: 940, y: home.y + 30 });
    expect(zoneOf(away.pos, w.layout)).toBe(0);
    expect(pickNavUnit(w, me, null, ACQ, LEASH), 'S192/S193 engaged this on "home" alone; N11 asks whether it can be caught').toBeNull();
    expect(pickNavUnit(w, me, away.id, ACQ, LEASH), 'and a lock on it is dropped').toBeNull();
    w.creatures.delete(away.id);
    // The same drone flying WEST past the goblin is cut off — intercept feasible, engaged.
    const past = put(w, 1, 'lightningDrone', { x: home.x + 200, y: home.y + 30 }, { x: 100, y: home.y + 30 });
    expect(pickNavUnit(w, me, null, ACQ, LEASH)).toBe(past.id);
    w.creatures.delete(past.id);
    // ⛔ A quarry GOING NOWHERE at home is not getting away — a chewer gnawing a connector of mine, 200 px off,
    // is still engaged (the HOME case above pins the same for a pathless drone).
    const gnawing = put(w, 1, 'chewer', { x: home.x + 200, y: home.y });
    expect(pickNavUnit(w, me, null, ACQ, LEASH)).toBe(gnawing.id);
    expect(pickNavUnit(w, me, gnawing.id, ACQ, LEASH)).toBe(gnawing.id);
  });

  it('inside reach a drone is always picked and held ("maybe they target it if it\'s around them")', () => {
    const w = board();
    const at0 = { x: 1300, y: 200 };
    const me = put(w, 0, 'goblinMelee', at0);
    const reach = engageRange(CREATURE_CONFIGS.goblinMelee);
    const q = put(w, 1, 'lightningDrone', { x: at0.x + reach, y: at0.y }, { x: 1880, y: at0.y });
    expect(pickNavUnit(w, me, null, ACQ, LEASH)).toBe(q.id);
    expect(pickNavUnit(w, me, q.id, ACQ, LEASH)).toBe(q.id);
  });
});

describe('S192 T6 — negatives', () => {
  it('⭐ S195 N11 (RE-PINNED) — a chewer 200 px from a melee goblin, flying AWAY abroad, is let go (120 > 119 × 1); a t3Bat still runs it down', () => {
    const w = board();
    const me = put(w, 0, 'goblinMelee', { x: 1300, y: 200 });
    const q = put(w, 1, 'chewer', { x: 1500, y: 200 }, { x: 1880, y: 200 });
    expect(pickNavUnit(w, me, null, ACQ, LEASH), 'S192 chased this (ratio 1.25); N11 lets it go').toBeNull();
    // …but one flying PAST the goblin is cut off (intercept), and the bat (168 > 120) simply catches it.
    q.targetPos.x = 300;
    expect(pickNavUnit(w, me, null, ACQ, LEASH)).toBe(q.id);
    q.targetPos.x = 1880;
    const bat = put(w, 0, 't3Bat', { x: 1300, y: 240 });
    expect(pickNavUnit(w, bat, null, ACQ, LEASH)).toBe(q.id);
  });

  it('⛔ R184-A untouched: a quarry that can strike — the archer — is acquired and held, abroad and fleeing', () => {
    const w = board();
    const boss = put(w, 0, 't9BossVampires', { x: 1300, y: 200 });
    const archer = put(w, 1, 'goblinArcher', { x: 1500, y: 200 }, { x: 1880, y: 200 });
    expect(pickNavUnit(w, boss, null, ACQ, LEASH)).toBe(archer.id);
    archer.pos.x = 1580; // beyond acquire, inside leash: the retaliation chase is HELD
    expect(pickNavUnit(w, boss, archer.id, ACQ, LEASH)).toBe(archer.id);
  });

  it('⭐ HELGA still engages a passing drone — "that\'s the whole point of Helga" (the rule is pickNavUnit\'s only)', () => {
    const w = board();
    const anchor = { x: 500, y: 300 };
    w.primitives.set(asPrimitiveId(9001), { id: asPrimitiveId(9001), pos: { ...anchor }, prevPos: { ...anchor } } as never);
    const d = makeDefender({
      id: asDefenderId(1), kind: 'princess', ownerPlayerId: P0, anchorPrimitiveId: asPrimitiveId(9001),
      recipeId: 'helga', pos: { ...anchor }, registeredAtTick: 0,
    });
    d.nextFireTick = 0;
    w.defenders.set(d.id, d);
    // A drone 300 px from her hall (inside her 380 px leash, far beyond her 40 px slap), flying past.
    const q = put(w, 1, 'lightningDrone', { x: anchor.x + 300, y: anchor.y }, { x: 100, y: anchor.y });
    applyDefenderTick(w, { type: 'DEFENDER_TICK', defenderId: d.id } as never);
    expect(d.targetCreatureId).toBe(q.id);
    expect(d.state).toBe('WALK');
  });

  it('the perf reference spells the rule out longhand with the live standoff fraction', () => {
    expect(REFERENCE_STANDOFF_ENGAGE_FRACTION).toBe(STANDOFF_ENGAGE_FRACTION);
  });
});

describe('S192 T6 — REACH, through the real host tick', () => {
  it('⭐⭐ HIS SCENARIO: an army razing his towers while his hub emits drones never chases one across the map', () => {
    const w = board('BUILD');
    stamp(w, 1, 'lightningHub', { x: 1760, y: 120 });
    stamp(w, 1, 'stinkTower', { x: 1150, y: 330 });
    stamp(w, 1, 'stinkTower', { x: 1400, y: 420 });
    const first = stamp(w, 1, 'stinkTower', { x: 1250, y: 520 });
    stamp(w, 0, 'stinkTower', { x: 500, y: 800 }); // something at home for his drones to fly at
    expect(w.creatureSpawners.size, 'fixture: the hub is a live spawner').toBe(1);
    w.matchPhase = 'FIGHT';
    const army: CreatureId[] = [];
    for (let i = 0; i < 4; i++) {
      army.push(put(w, 0, 't9BossOrcs', { x: first.x - 140 + 20 * i, y: first.y + 15 * i }, first).id);
    }
    const reach = engageRange(CREATURE_CONFIGS.t9BossOrcs) + CHASE_GIVEUP_SLACK_PX;
    const d = deps();
    const s = makeHostTickState(w);
    const prev = new Map<CreatureId, CreatureId | null>();
    const dropped = new Set<string>();
    let lockedTicks = 0;
    let dronesSeen = 0;
    let farReacquires = 0;
    let maxDropDist = 0;
    let minXWhileLocked = Infinity;
    let towersFellAt = -1;
    const seenDrones = new Set<CreatureId>();
    for (let t = 0; t < 1500; t++) {
      runHostTick(w, d, s);
      w.effects.length = 0;
      for (const c of w.creatures.values()) if (c.type === 'lightningDrone' && c.ownerPlayerId !== P0) seenDrones.add(c.id);
      if (towersFellAt < 0 && ![...w.defenders.values()].some((x) => x.kind === 'stinkTower' && x.ownerPlayerId !== P0)) towersFellAt = t;
      for (const id of army) {
        const c = w.creatures.get(id);
        if (c === undefined) continue;
        const was = prev.get(id) ?? null;
        const now = c.targetCreatureId;
        const q = now === null ? undefined : w.creatures.get(now);
        if (q?.type === 'lightningDrone') {
          lockedTicks++;
          minXWhileLocked = Math.min(minXWhileLocked, c.pos.x);
          const dist = Math.hypot(q.pos.x - c.pos.x, q.pos.y - c.pos.y);
          if (was !== now && dropped.has(`${id}:${now}`) && dist > reach + 5) farReacquires++;
        }
        if (was !== null && was !== now) {
          const old = w.creatures.get(was);
          if (old?.type === 'lightningDrone') {
            dropped.add(`${id}:${was}`);
            if (old.state !== 'DESPAWNING') maxDropDist = Math.max(maxDropDist, Math.hypot(old.pos.x - c.pos.x, old.pos.y - c.pos.y));
          }
        }
        prev.set(id, now);
      }
    }
    dronesSeen = seenDrones.size;
    console.log(`[S192 T6 scenario] drones ${dronesSeen}, ticks locked on a drone ${lockedTicks}, far re-acquires ${farReacquires}, max drop distance ${maxDropDist.toFixed(0)} (reach+slack ${reach.toFixed(0)}), min x while locked ${minXWhileLocked.toFixed(0)}, towers fell at ${towersFellAt}`);
    expect(dronesSeen, 'anti-vacuity: his hub really emitted drones').toBeGreaterThanOrEqual(2);
    expect(towersFellAt, 'the army razed his towers').toBeGreaterThanOrEqual(0);
    // ⛔ THE CYCLE: once let go, a drone is never taken again from outside reach.
    expect(farReacquires).toBe(0);
    // Never chased toward the middle of the map. MEASURED (S192, this board): with `cannotCatch` forced
    // false the army chased drones to x = 1158; with the rule it never locks one west of x = 1329.
    expect(minXWhileLocked).toBeGreaterThan(1250);
    // MEASURED (S192): 1550 ticks locked on drones before the fix (1 far re-acquire); 231 after; 284 with
    // the S193 home clause (min x while locked 1305) — the run's drone timing shifts, still far under 600.
    expect(lockedTicks).toBeLessThan(600);
    // (`maxDropDist` is logged, not asserted: a lock also ends when the unit commits to a STRUCTURE strike,
    // at any distance — so it measures the FSM as much as this rule.)
  });

  /**
   * ⭐ S193 audit — the auditor's repro, through the real host tick: a seat-0 unit abroad by the border
   * (x 1000, the border at 960) while a seat-1 drone flies WEST into seat 0's zone, 88–202 px from it.
   * Old rule (quarry-only home test): it took the drone and turned back, 2–4 pickups a drone. Now it is
   * never locked on a drone farther than reach + slack. The drone's flight is scripted (see `advance`).
   */
  for (const type of ['goblinMelee', 't9BossOrcs', 't3Bat'] as const) {
    it(`⭐ S193 REACH — ${type} abroad by the border never picks up a drone that crossed into its zone beyond reach`, () => {
      const reach = engageRange(CREATURE_CONFIGS[type]) + CHASE_GIVEUP_SLACK_PX;
      let farPickups = 0;
      let flights = 0;
      for (const dx of [88, 120, 160, 202]) {
        const w = board();
        const u = put(w, 0, type, { x: 1000, y: 300 }, castleAnchor(1, w.layout));
        const start = { x: 1000 - dx, y: 300 + 30 };
        const drone = put(w, 1, 'lightningDrone', start, castleAnchor(0, w.layout));
        const d = deps();
        const s = makeHostTickState(w);
        for (let t = 0; t < 120; t++) {
          if (w.creatures.has(drone.id)) {
            const x = start.x - DRONE_CRUISE_PX_PER_TICK * t;
            drone.prevPos.x = x + DRONE_CRUISE_PX_PER_TICK; drone.prevPos.y = start.y;
            drone.pos.x = x; drone.pos.y = start.y;
            const home = castleAnchor(0, w.layout);
            drone.targetPos.x = home.x; drone.targetPos.y = home.y;
          }
          runHostTick(w, d, s);
          for (const id of [...w.creatures.keys()]) if (id !== u.id && id !== drone.id) w.creatures.delete(id);
          const me = w.creatures.get(u.id);
          if (me === undefined) break;
          if (t === 0) { flights++; expect(zoneOf(drone.pos, w.layout), 'fixture: the drone is in seat 0 zone').toBe(0); }
          if (me.targetCreatureId === drone.id) {
            const dist = Math.sqrt((drone.pos.x - me.pos.x) ** 2 + (drone.pos.y - me.pos.y) ** 2);
            if (dist > reach + 5) farPickups++;
          }
        }
      }
      expect(flights, 'anti-vacuity: every fly-by ran').toBe(4);
      expect(farPickups, `${type}: ticks locked on a drone beyond reach + slack (${reach.toFixed(0)} px)`).toBe(0);
    });
  }

  /**
   * ⭐⭐ S195 N11 — HIS SCENE, through the real host tick: four seat-0 SCARABS at home (`maxAccel` 105) while a
   * seat-1 CHEWER (120) crosses their zone toward a connector of theirs FAR from them. Before N11 (ratio
   * 1.25, home engaged regardless) they chased it the whole way — *"far too long until a stink tower killed
   * it"*. Now none locks on it beyond reach + slack; the CONTROL flies the same chewer straight through them.
   * ⚠ The chewer's flight is SCRIPTED (as the drone's is in the fly-bys); the scarabs run the unmodified tick.
   */
  const CHEWER_CRUISE_PX_PER_TICK = 1.96; // 120 / 240 of the drone's measured 3.92
  function scarabsVsChewer(pathY: number): { farLocks: number; anyLocks: number } {
    const w = board();
    const scarabs: CreatureId[] = [];
    for (let i = 0; i < 4; i++) scarabs.push(put(w, 0, 't3Scarab', { x: 500 + 25 * i, y: 500 }, { x: 500 + 25 * i, y: 500 }).id);
    const reach = engageRange(CREATURE_CONFIGS.t3Scarab) + CHASE_GIVEUP_SLACK_PX;
    const start = { x: 930, y: pathY }; // just inside seat 0's zone (the border is at 960), heading west
    const goal = { x: 150, y: pathY }; // "its target": a connector deep in seat 0's zone
    const chewer = put(w, 1, 'chewer', start, goal);
    const d = deps();
    const s = makeHostTickState(w);
    let farLocks = 0;
    let anyLocks = 0;
    for (let t = 0; t < 400; t++) {
      if (w.creatures.has(chewer.id)) {
        const x = Math.max(goal.x, start.x - CHEWER_CRUISE_PX_PER_TICK * t);
        chewer.prevPos.x = x + CHEWER_CRUISE_PX_PER_TICK; chewer.prevPos.y = pathY;
        chewer.pos.x = x; chewer.pos.y = pathY;
        chewer.targetPos.x = goal.x; chewer.targetPos.y = goal.y;
      }
      runHostTick(w, d, s);
      for (const id of [...w.creatures.keys()]) if (!scarabs.includes(id) && id !== chewer.id) w.creatures.delete(id);
      for (const id of scarabs) {
        const me = w.creatures.get(id);
        if (me === undefined || me.targetCreatureId !== chewer.id) continue;
        anyLocks++;
        const dist = Math.sqrt((chewer.pos.x - me.pos.x) ** 2 + (chewer.pos.y - me.pos.y) ** 2);
        if (dist > reach + 5) farLocks++;
      }
    }
    return { farLocks, anyLocks };
  }

  it('⭐⭐ S195 N11 REACH — his scarabs do not chase a chewer crossing their zone that they cannot cut off', () => {
    const far = scarabsVsChewer(150); // 350 px north of them: it is past before they could ever get ahead of it
    expect(far.farLocks, 'ticks a scarab spent locked on a chewer it could not catch').toBe(0);
  });

  it('CONTROL — the same chewer flying straight through them IS taken (intercept / reach)', () => {
    const through = scarabsVsChewer(500);
    expect(through.anyLocks, 'anti-vacuity: a catchable chewer is still chased').toBeGreaterThan(0);
  });

  /**
   * The advance table: a seat-0 unit marching east IN ENEMY GROUND with one seat-1 drone flying west
   * past it toward seat 0's base, 120 px off-axis. ⚠ The drone's flight is SCRIPTED (only the drone's):
   * a drone with no enemy connector idles at its hub, and the castle emitter's mid-run births would
   * measure a fight rather than a fly-by. The marcher runs on the unmodified host tick.
   */
  const DRONE_CRUISE_PX_PER_TICK = 3.92;
  function advance(type: CreatureType, withDrone: boolean, ticks: number): { dx: number; lockedTicks: number } {
    const w = board();
    const start = { x: 1000, y: 300 };
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
        const home = castleAnchor(0, w.layout);
        drone.targetPos.x = home.x; drone.targetPos.y = home.y;
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

  for (const type of ['goblinMelee', 't9BossOrcs'] as const) {
    it(`advance table — ${type}: a drone flying past costs it far less than the unrestricted chase did`, () => {
      const TICKS = 400;
      const clean = advance(type, false, TICKS);
      const drone = advance(type, true, TICKS);
      const loss = 1 - drone.dx / clean.dx;
      console.log(`[S192 T6] ${type}: no drone ${clean.dx.toFixed(0)} px, one drone ${drone.dx.toFixed(0)} px, loss ${(loss * 100).toFixed(1)} %, ticks locked ${drone.lockedTicks}`);
      expect(clean.dx, 'anti-vacuity: the unit really marched').toBeGreaterThan(300);
      // MEASURED (S192, 400 ticks): BEFORE (`cannotCatch` forced false) goblinMelee 663 → 285 px (−57.0 %,
      // 129 ticks locked), t9BossOrcs 702 → 296 (−57.8 %, 130). AFTER goblinMelee 663 → 413 (−37.6 %, 92),
      // t9BossOrcs 702 → 434 (−38.2 %, 93). ⭐ S193 (home arm needs the CHASER at home too): goblinMelee
      // 663 → 619 (−6.6 %, 38 ticks locked), t9BossOrcs 702 → 651 (−7.3 %, 39) — most of the S192 "intercept"
      // loss was this unit (starting 40 px abroad) re-taking the drone once it crossed into zone 0. What is
      // left is the intercept he asked for: they step out to cut it off and let it go once it is by.
      // ⭐ S193 merge owner (re-audit a50d846c LOW): pinned at 0.15 so the −6.6 % / −7.3 % S193 numbers are ASSERTED,
      // not only printed — the pre-fix −37.6 % now fails here too.
      expect(loss).toBeLessThan(0.15);
    });
  }
});
