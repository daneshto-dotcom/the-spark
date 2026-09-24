/**
 * SPARK — S188 — DEEP CURRENT (nagas L0): *"they will go to get a shape and then they will teleport
 * back to base rather than having to walk all the way back"*.
 *
 * The REACH is the whole haul through the real `runHostTick`: the gatherer walks OUT (unchanged),
 * claims, and on the next tick is standing on its deposit point with the shape banked — against a
 * walker that is still hundreds of pixels from home, and the shape is out of the world the same tick
 * (so the verlet trap cannot bite). Negatives: a naga seat without the pick, another race with its racial pick. And the vortex
 * predicate the renderer draws from.
 */
import { describe, expect, it } from 'vitest';
import {
  GATHERER_DEPOSIT_OFFSET_Y,
  PLAYER_COLORS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SparkType,
  phaseDurationTicks,
} from '../../constants.ts';
import { makeFreeSpark } from '../../game/spark.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { castleAnchor, makeGatherer } from '../gatherers/gatherer.ts';
import { bankCountOf } from '../castleBank.ts';
import { deepCurrentSnap } from './deepCurrent.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { DEEP_CURRENT_JUMP_PX, isDeepCurrentJump } from '../../render/gathererRenderer.ts';
import type { Controls } from '../../input/controls.ts';
import type { DraftPick } from '../draft.ts';
import type { RaceId } from '../races.ts';
import { asGathererId, asPlayerId, asSparkId } from '../../types.ts';

const P0 = asPlayerId(0);

/** A BUILD-phase board (gatherers work in BUILD and shelter for the FIGHT), shelter far away. */
function board(raceId: RaceId, picks: DraftPick[]): World {
  const w = makeWorld(0x188e);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'BUILD';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('BUILD') * 10;
  w.draft = null;
  w.gatherers.clear();
  w.freeSparks.clear();
  const pl = w.players.get(P0)!;
  pl.raceId = raceId;
  pl.draftPicks = [...picks];
  return w;
}

/** One gatherer at seat 0's keep and ONE shape in the quarry, nothing else to fetch. */
function haul(w: World): { gid: ReturnType<typeof asGathererId>; sid: ReturnType<typeof asSparkId> } {
  const home = castleAnchor(0, w.layout);
  const gid = asGathererId(0);
  w.gatherers.set(gid, makeGatherer({ id: gid, ownerPlayerId: P0, pos: { x: home.x, y: home.y }, spawnedAtTick: 0 }));
  w.nextGathererId = 1;
  const sid = asSparkId(7700);
  w.freeSparks.set(sid, makeFreeSpark({
    id: sid, type: SparkType.Dot, pos: { x: SPAWNER_CENTER_X - 20, y: SPAWNER_CENTER_Y },
    velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
  }));
  return { gid, sid };
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
const deps = (): HostTickDeps => ({
  spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
  botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
} as unknown as HostTickDeps);

/** Drive the real host tick until the gatherer CLAIMS; then report one more tick of the haul. */
function throughTheHaul(raceId: RaceId, picks: DraftPick[]) {
  const w = board(raceId, picks);
  const { gid, sid } = haul(w);
  const d = deps();
  const st = makeHostTickState(w);
  let claimedAt = -1;
  for (let t = 0; t < 2000 && claimedAt < 0; t++) {
    runHostTick(w, d, st);
    if (w.gatherers.get(gid)!.state === 'HAULING') claimedAt = t;
  }
  expect(claimedAt, 'fixture: the gatherer walked out and claimed the shape').toBeGreaterThan(0);
  const g = w.gatherers.get(gid)!;
  const atQuarry = { x: g.pos.x, y: g.pos.y };
  runHostTick(w, d, st);
  const home = castleAnchor(0, w.layout);
  const depositAt = { x: home.x, y: home.y + GATHERER_DEPOSIT_OFFSET_Y };
  return { w, g, sid, claimedAt, atQuarry, depositAt };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 DEEP CURRENT — ⭐ REACH: the haul home is a snap, through the real host tick', () => {
  it('⭐ one tick after the claim the gatherer is ON its deposit point and the shape is BANKED', () => {
    const r = throughTheHaul('nagas', ['racial']);
    expect(r.g.pos).toEqual(r.depositAt);
    expect(bankCountOf(r.w.castleBanks, P0, SparkType.Dot)).toBe(1);
    expect(r.w.freeSparks.has(r.sid), 'the shape left the world into the castle').toBe(false);
    expect(r.g.state).toBe('SEEKING');
    expect(r.g.carriedSparkId).toBeNull();
  });

  it('⭐ the outbound walk is UNCHANGED — the naga reaches the shape exactly when a walker does', () => {
    expect(throughTheHaul('nagas', ['racial']).claimedAt).toBe(throughTheHaul('nagas', ['hp']).claimedAt);
  });

  it('⛔ NEGATIVE: a naga seat WITHOUT the pick still walks — far from home, still carrying', () => {
    const r = throughTheHaul('nagas', ['hp']);
    const dx = r.g.pos.x - r.depositAt.x;
    const dy = r.g.pos.y - r.depositAt.y;
    expect(Math.hypot(dx, dy)).toBeGreaterThan(DEEP_CURRENT_JUMP_PX);
    expect(r.g.state).toBe('HAULING');
    expect(bankCountOf(r.w.castleBanks, P0, SparkType.Dot)).toBe(0);
  });

  it('⛔ NEGATIVE: ANOTHER race with its racial pick still walks', () => {
    const r = throughTheHaul('demons', ['racial']);
    expect(r.g.state).toBe('HAULING');
    expect(bankCountOf(r.w.castleBanks, P0, SparkType.Dot)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 DEEP CURRENT — the snap itself', () => {
  it('⛔ THE VERLET TRAP CANNOT BITE: the shape is never left in the world at the far end', () => {
    // The HAULING leg slaves the cargo's pos AND prevPos to the gatherer, and on arrival deposits it
    // out of `freeSparks` IN THE SAME TICK — so a snapped shape has no frame in which a stale prevPos
    // could fling it. Asserted on the real reducer: after the snap tick no free spark sits anywhere.
    const r = throughTheHaul('nagas', ['racial']);
    expect([...r.w.freeSparks.values()].filter((s) => s.escrow === 'hauled')).toEqual([]);
  });

  it('touches nothing for a seat without the perk (the walk runs instead)', () => {
    const w = board('nagas', []);
    const { gid } = haul(w);
    const g = w.gatherers.get(gid)!;
    const before = { ...g.pos };
    expect(deepCurrentSnap(w, g, { x: 1, y: 1 })).toBe(false);
    expect(g.pos).toEqual(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 DEEP CURRENT — the vortex is derived from the jump', () => {
  const a = { x: 900, y: 540 };
  const b = { x: 120, y: 614 };
  it('a holding seat’s quarry-to-keep jump opens a vortex', () => {
    expect(isDeepCurrentJump(a, b, true, 'SEEKING')).toBe(true);
  });
  it('⛔ no vortex for: no perk, a walking step, the first sighting, or the shelter snap', () => {
    expect(isDeepCurrentJump(a, b, false, 'SEEKING')).toBe(false);
    expect(isDeepCurrentJump(a, { x: a.x - 6.6, y: a.y }, true, 'HAULING')).toBe(false);
    expect(isDeepCurrentJump(a, { x: a.x - 40, y: a.y }, true, 'HAULING'), 'a 10 Hz peer’s six-tick walk').toBe(false);
    expect(isDeepCurrentJump(undefined, b, true, 'SEEKING')).toBe(false);
    expect(isDeepCurrentJump(a, b, true, 'SHELTERED')).toBe(false);
  });
});

