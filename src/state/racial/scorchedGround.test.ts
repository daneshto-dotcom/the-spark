/**
 * SPARK — S188 — SCORCHED GROUND (demons L0): every enemy creature standing in the demon seat's own
 * territory loses 2 % of its pool per second, on the zombie aura's mechanic, used unchanged.
 *
 * The arithmetic; the REACH — an enemy held inside the demon's half really loses exactly one fifth
 * per cadence through the real `runHostTick`, and a unit at one fifth really dies and is swept; the
 * negatives — outside the zone, the quarry, the demon's OWN units, a demon seat without the pick,
 * another race with its pick, BUILD — and the derived ember look.
 */
import { describe, expect, it } from 'vitest';
import {
  PHYSICS_HZ,
  PLAYER_COLORS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  ZOMBIE_AURA_PER_MILLE,
  phaseDurationTicks,
} from '../../constants.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { SCORCHED_GROUND_PER_MILLE, runScorchedGround, scorchedZones } from './scorchedGround.ts';
import { dotIntervalTicks, maxPoolFifths } from '../damageOverTime.ts';
import { asCreatureId, makeCreature, type Creature, type CreatureType } from '../creatures/creature.ts';
import { getCreatureConfig } from '../creatures/voltkin-config.ts';
import { zoneOf } from '../zones.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { SCORCHED_ZONE_TINT, zoneBackdropTint } from '../../render/zoneBackgroundRenderer.ts';
import type { Controls } from '../../input/controls.ts';
import type { DraftPick } from '../draft.ts';
import type { RaceId } from '../races.ts';
import { asPlayerId, asSpawnerId, type PlayerId } from '../../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
/** Deep in seat 0's half of the pitch: far from its keep's gun (300 px) and from the quarry. */
const IN_DEMON_LAND = { x: 600, y: 200 };
/** The mirror spot in seat 1's half. */
const IN_ENEMY_LAND = { x: 1320, y: 200 };

function twoSeat(phase: 'FIGHT' | 'BUILD' = 'FIGHT'): World {
  const w = makeWorld(0x188d);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = phase;
  w.phaseEndsAtTick = w.tick + phaseDurationTicks(phase) * 10;
  w.creatures.clear();
  w.draft = null;
  return w;
}

function seatAs(w: World, seat: PlayerId, raceId: RaceId, picks: DraftPick[]): void {
  const pl = w.players.get(seat)!;
  pl.raceId = raceId;
  pl.draftPicks = [...picks];
}

/** A unit held in place by a long stun — a stun stops what it DOES, never what is done to it. */
function heldUnit(w: World, type: CreatureType, owner: PlayerId, at: { x: number; y: number }): Creature {
  const c = makeCreature(getCreatureConfig(type), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { ...at }, targetPos: { ...at },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  c.stunnedUntilTick = w.tick + 1_000_000;
  w.creatures.set(c.id, c);
  return c;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function ticks(w: World, n: number): void {
  const d = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
  const st = makeHostTickState(w);
  for (let i = 0; i < n; i++) runHostTick(w, d, st);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 SCORCHED GROUND — the arithmetic', () => {
  it('⭐ his 2 %, per-mille — NOT the zombie boss’s 2.5 %', () => {
    expect(SCORCHED_GROUND_PER_MILLE).toBe(20);
    expect(ZOMBIE_AURA_PER_MILLE).toBe(25);
  });

  it('one fifth per cadence: 2 % a second for any pool — a uniform ~50 s to burn anything down', () => {
    for (const type of ['chewer', 'goblinMelee', 't3Warband', 't9BossOrcs'] as CreatureType[]) {
      const pool = maxPoolFifths(type);
      const interval = dotIntervalTicks(pool, SCORCHED_GROUND_PER_MILLE);
      const secondsToDie = (pool * interval) / PHYSICS_HZ;
      expect(secondsToDie, type).toBeGreaterThan(45);
      expect(secondsToDie, type).toBeLessThan(55);
    }
  });

  it('the fixture spots are where they claim to be', () => {
    const w = twoSeat();
    expect(zoneOf(IN_DEMON_LAND, w.layout)).toBe(0);
    expect(zoneOf(IN_ENEMY_LAND, w.layout)).toBe(1);
    expect(zoneOf({ x: SPAWNER_CENTER_X - 10, y: SPAWNER_CENTER_Y }, w.layout), 'the quarry is nobody’s').toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 SCORCHED GROUND — ⭐ REACH through the real host tick', () => {
  function burned(raceId: RaceId, picks: DraftPick[], at: { x: number; y: number }, owner = P1): number {
    const w = twoSeat();
    seatAs(w, P0, raceId, picks);
    const v = heldUnit(w, 't3Warband', owner, at);
    const full = v.ehp;
    const interval = dotIntervalTicks(maxPoolFifths(v.type), SCORCHED_GROUND_PER_MILLE);
    ticks(w, interval * 3);
    return full - (w.creatures.get(v.id)?.ehp ?? 0);
  }

  it('⭐ an ENEMY standing in the demon’s half loses EXACTLY one fifth per cadence — 3 in 3', () => {
    expect(burned('demons', ['racial'], IN_DEMON_LAND)).toBe(3);
  });

  it('⛔ the same enemy on ITS OWN side of the line takes nothing', () => {
    expect(burned('demons', ['racial'], IN_ENEMY_LAND)).toBe(0);
  });

  it('⛔ the shared quarry does not burn', () => {
    expect(burned('demons', ['racial'], { x: SPAWNER_CENTER_X - 40, y: SPAWNER_CENTER_Y })).toBe(0);
  });

  it('⛔ the demon’s OWN units in its own land take nothing', () => {
    expect(burned('demons', ['racial'], IN_DEMON_LAND, P0)).toBe(0);
  });

  it('⛔ NEGATIVE: a demon seat WITHOUT the pick burns nothing', () => {
    expect(burned('demons', ['hp'], IN_DEMON_LAND)).toBe(0);
  });

  it('⛔ NEGATIVE: ANOTHER race with its racial pick burns nothing', () => {
    expect(burned('orcs', ['racial'], IN_DEMON_LAND)).toBe(0);
  });

  it('⛔ BUILD burns nothing — nothing may be attacked while the walls are up', () => {
    const w = twoSeat('BUILD');
    seatAs(w, P0, 'demons', ['racial']);
    const v = heldUnit(w, 't3Warband', P1, IN_DEMON_LAND);
    const full = v.ehp;
    ticks(w, dotIntervalTicks(maxPoolFifths(v.type), SCORCHED_GROUND_PER_MILLE) * 2);
    expect(w.matchPhase, 'fixture: still BUILD').toBe('BUILD');
    expect(w.creatures.get(v.id)?.ehp).toBe(full);
  });

  it('⭐ a unit at ONE fifth burns to death and is swept by the deferral like any other kill', () => {
    const w = twoSeat();
    seatAs(w, P0, 'demons', ['racial']);
    const v = heldUnit(w, 't3Warband', P1, IN_DEMON_LAND);
    v.ehp = 1;
    ticks(w, dotIntervalTicks(maxPoolFifths(v.type), SCORCHED_GROUND_PER_MILLE) + 1);
    expect(w.creatures.has(v.id)).toBe(false);
  });

  it('on a FOUR-seat board the demon owns its QUARTER — the neighbouring quarter does not burn', () => {
    const w = twoSeat();
    w.layout = 'QUADRANTS_4P';
    seatAs(w, P0, 'demons', ['racial']);
    expect(scorchedZones(w)).toEqual([{ seat: P0, zone: 0 }]);
    const inTL = heldUnit(w, 't3Warband', P1, { x: 400, y: 300 }); // zone 0
    const inBL = heldUnit(w, 't3Warband', P1, { x: 400, y: 800 }); // zone 3
    const interval = dotIntervalTicks(maxPoolFifths('t3Warband'), SCORCHED_GROUND_PER_MILLE);
    const full = inTL.ehp;
    for (let i = 0; i < interval * 2; i++) {
      runScorchedGround(w);
      w.tick++;
    }
    expect(full - inTL.ehp).toBe(2);
    expect(inBL.ehp).toBe(full);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 SCORCHED GROUND — the ember look is derived from the picks', () => {
  it('a holding seat’s backdrop is ember; every other seat’s is untinted', () => {
    expect(zoneBackdropTint({ raceId: 'demons', draftPicks: ['racial'] })).toBe(SCORCHED_ZONE_TINT);
    expect(zoneBackdropTint({ raceId: 'demons', draftPicks: ['hp'] })).toBe(0xffffff);
    expect(zoneBackdropTint({ raceId: 'vampires', draftPicks: ['racial'] })).toBe(0xffffff);
  });
});
