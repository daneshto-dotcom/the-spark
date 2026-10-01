/**
 * SPARK — S192 T5 (owner playtest): **HELGA PATROLS IN BUILD TOO.**
 *
 * > *"Helga is not patrolling during … the build stage. She just stands behind her tower … She should
 * > always like walk around her tower patrolling."* — owner, S192
 *
 * Root cause (S192 research): the S183 patrol lived in the FSM's IDLE arm, and `hostTick` never
 * dispatches `DEFENDER_TICK` outside FIGHT (S149 R4 — right for the WEAPON). Measured before the fix:
 * 0.00 px of movement in 900 BUILD ticks, 110.8 px in 900 FIGHT ticks.
 *
 * ## What is pinned
 *   · REACH, through the real host tick: a hall stamped by the REAL reducer and ignited by the REAL
 *     matcher walks in BUILD — and stays inside her 133 px disc and on the board (C8 kept).
 *   · the arithmetic: the BUILD step walks to exactly the point the S183 formula derives.
 *   · NEGATIVE — motion only: an enemy at her feet in BUILD is never acquired, her fire clock never
 *     moves, she stays IDLE with a null target, so `isHelgaEngagedRaw` (her music) stays false.
 *   · NEGATIVE — a DORMANT Helga (R190-J) does not move in BUILD.
 *   ⭐ MUTATION-TESTED: removing the BUILD-branch `stepPrincessPatrol` call in `hostTick.ts` turns the
 *   REACH case red (0 px); putting her in `WALK` for the patrol turns the music case red.
 */
import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PLAYER_COLORS,
  PRINCESS_PATROL_LEG_TICKS,
  PRINCESS_PATROL_RADIUS_FRAC,
  WORLD_EDGE_MARGIN,
} from '../../constants.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asPlayerId, type Vec2 } from '../../types.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mix32, mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import type { Controls } from '../../input/controls.ts';
import { applyBuildBlueprint } from '../blueprintBuild.ts';
import { stampRefusalAt } from '../blueprintLegality.ts';
import { runGodlyMatcherCore } from '../godlyMatcherCore.ts';
import { blueprintBill } from '../blueprints.ts';
import { makeCastleBank } from '../castleBank.ts';
import { zoneCastleAnchor } from '../zones.ts';
import { clampPointIntoPlayfield } from './defenderMotion.ts';
import { getDefenderConfig, type Defender } from './defender.ts';
import { isHelgaEngagedRaw } from '../../render/audioManager.ts';
// ⚠ SIDE-EFFECT IMPORT, REQUIRED — the recipe registers itself; without it nothing ignites.
import './../godlyRecipes/princessHelga.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const LO = WORLD_EDGE_MARGIN;
const onBoard = (p: Vec2): boolean =>
  p.x >= LO && p.x <= CANVAS_WIDTH - LO && p.y >= LO && p.y <= CANVAS_HEIGHT - LO;
const DISC = getDefenderConfig('princess').attackRange * PRINCESS_PATROL_RADIUS_FRAC; // 380 × 0.35 = 133

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

function twoSeatInBuild(): World {
  const w = makeWorld(0x75);
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
  w.matchPhase = 'BUILD';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  return w;
}

function buildHelgaInOpenGround(w: World): Defender {
  const castle = zoneCastleAnchor(0, w.layout);
  let site: Vec2 | null = null;
  for (let x = castle.x + 300; x <= castle.x + 600 && site === null; x += 10) {
    if (stampRefusalAt(w, { x, y: castle.y }, P0, 'helga') === null) site = { x, y: castle.y };
  }
  if (site === null) throw new Error('fixture: no legal Helga site');
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill('helga')) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'helga', centre: site } as never);
  w.tick += 1;
  runGodlyMatcherCore(w, { lastMatcherTick: 0 });
  const helga = [...w.defenders.values()].find((d) => d.kind === 'princess');
  if (helga === undefined) throw new Error('fixture: no Helga ignited');
  return helga;
}

interface BuildLog {
  maxDisplacement: number;
  maxFromHub: number;
  offBoard: number;
  nonIdle: number;
  targeted: number;
  engaged: number;
  fireClockMoved: number;
}

function runBuild(w: World, helga: Defender, ticks: number): BuildLog {
  expect(w.matchPhase).toBe('BUILD');
  const d = deps();
  const s = makeHostTickState(w);
  const start = { x: helga.pos.x, y: helga.pos.y };
  const fire0 = helga.nextFireTick;
  const log: BuildLog = {
    maxDisplacement: 0, maxFromHub: 0, offBoard: 0, nonIdle: 0, targeted: 0, engaged: 0, fireClockMoved: 0,
  };
  for (let t = 0; t < ticks; t++) {
    runHostTick(w, d, s);
    expect(w.matchPhase).toBe('BUILD');
    const h = w.defenders.get(helga.id);
    if (h === undefined) throw new Error('fixture: Helga removed mid-BUILD');
    const hub = w.primitives.get(h.anchorPrimitiveId)!.pos;
    log.maxDisplacement = Math.max(log.maxDisplacement, Math.hypot(h.pos.x - start.x, h.pos.y - start.y));
    log.maxFromHub = Math.max(log.maxFromHub, Math.hypot(h.pos.x - hub.x, h.pos.y - hub.y));
    if (!onBoard(h.pos)) log.offBoard += 1;
    if (h.state !== 'IDLE' && h.state !== 'DORMANT') log.nonIdle += 1;
    if (h.targetCreatureId !== null) log.targeted += 1;
    if (isHelgaEngagedRaw(w)) log.engaged += 1;
    if (h.nextFireTick !== fire0) log.fireClockMoved += 1;
  }
  return log;
}

describe('S192 T5 — Helga patrols in BUILD', () => {
  it('⭐⭐ REACH, through the real host tick: she walks in BUILD, inside her disc and on the board', () => {
    const w = twoSeatInBuild();
    const helga = buildHelgaInOpenGround(w);
    const log = runBuild(w, helga, 900);
    // Before S192: 0.00 px. The research measured 110.8 px for the same 900 ticks in FIGHT.
    expect(log.maxDisplacement).toBeGreaterThan(10);
    // Her disc is 133 px; `PRINCESS_ARRIVE_RADIUS` braking lets her settle a hair past a point, so
    // the bound carries a 5 px tolerance, not a free pass.
    expect(log.maxFromHub).toBeLessThanOrEqual(DISC + 5);
    expect(log.offBoard).toBe(0);
  });

  it('the arithmetic: in BUILD she walks to exactly the point the S183 formula derives', () => {
    const w = twoSeatInBuild();
    const helga = buildHelgaInOpenGround(w);
    const d = deps();
    const s = makeHostTickState(w);
    expect(DISC).toBeCloseTo(133, 6);
    let checked = 0;
    // Six legs. On each tick derive the leg's point from (id, floor(tick / leg)) and require her destination to be exactly that point. A leg whose point lies within
    // 20 px of the hub is skipped: it can coincide with where she already stands and prove nothing.
    for (let t = 0; t < 6 * PRINCESS_PATROL_LEG_TICKS; t++) {
      runHostTick(w, d, s);
      // `runHostTick` advances `world.tick` FIRST (inside `stepPhysics`), and the defender poll reads
      // the anchor after physics — so the point is predicted from the POST-tick tick and hub.
      const h = w.defenders.get(helga.id)!;
      const hub = w.primitives.get(helga.anchorPrimitiveId)!.pos;
      const leg = Math.floor(w.tick / PRINCESS_PATROL_LEG_TICKS);
      const hh = mix32(Number(helga.id), leg);
      const ang = ((hh >>> 8) / 0x01000000) * Math.PI * 2;
      const rad = DISC * Math.sqrt((hh & 0xff) / 255);
      const expected = clampPointIntoPlayfield({ x: hub.x + Math.cos(ang) * rad, y: hub.y + Math.sin(ang) * rad });
      expect(rad).toBeLessThanOrEqual(DISC);
      if (rad < 20 || h.walkTargetPos === null) continue; // arrived, or a point too near the hub to prove anything
      expect(h.walkTargetPos.x).toBeCloseTo(expected.x, 6);
      expect(h.walkTargetPos.y).toBeCloseTo(expected.y, 6);
      checked += 1;
    }
    // Anti-vacuity: she was really walking to a derived point for a good part of the run.
    expect(checked).toBeGreaterThan(PRINCESS_PATROL_LEG_TICKS / 4);
  });

  it('⛔ NEGATIVE — motion only: an enemy at her feet is never acquired, the fire clock never moves, her music never starts', () => {
    const w = twoSeatInBuild();
    const helga = buildHelgaInOpenGround(w);
    // An enemy goblin parked 50 px from her. In FIGHT she would acquire it on her next fire tick.
    dispatch(w, {
      type: 'SPAWN_CREATURE',
      creatureType: 'goblinMelee',
      ownerPlayerId: P1,
      pos: { x: helga.pos.x + 50, y: helga.pos.y },
      targetPos: { x: helga.pos.x + 50, y: helga.pos.y },
    } as never);
    expect(w.creatures.size).toBe(1);
    const log = runBuild(w, helga, 600);
    expect(log.maxDisplacement).toBeGreaterThan(10); // the walk is live in THIS run too
    expect(log.targeted).toBe(0);
    expect(log.nonIdle).toBe(0);
    expect(log.fireClockMoved).toBe(0);
    // `audioManager.updateHelgaTheme`'s raw predicate: false every single tick of the BUILD patrol.
    expect(log.engaged).toBe(0);
  });

  it('⛔ NEGATIVE — a DORMANT Helga (R190-J) does not move in BUILD', () => {
    const w = twoSeatInBuild();
    const helga = buildHelgaInOpenGround(w);
    helga.state = 'DORMANT';
    const log = runBuild(w, helga, 600);
    expect(log.maxDisplacement).toBe(0);
    expect(log.engaged).toBe(0);
  });

  it('the music predicate itself: IDLE + null target is not engaged; WALK is (why the patrol stays IDLE)', () => {
    const view = (state: string, target: unknown) => ({
      tick: 0,
      defenders: new Map([[1, { kind: 'princess', state, targetCreatureId: target }]]),
    });
    expect(isHelgaEngagedRaw(view('IDLE', null))).toBe(false);
    expect(isHelgaEngagedRaw(view('WALK', null))).toBe(true);
    expect(isHelgaEngagedRaw(view('IDLE', 7))).toBe(true);
    expect(isHelgaEngagedRaw(view('DORMANT', null))).toBe(false);
  });
});
