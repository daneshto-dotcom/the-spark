/**
 * SPARK — S192 — **RESISTANCE BELONGS TO THE CASTER'S SEAT ONLY, behind ONE predicate.**
 *
 * > *"only you are resistant when you're a demon to your own scorched earth … you should be able to double
 * > your Scorched Earth … click on yours again"* — owner, S192 (re-stated after the playtest)
 *
 * ⭐ R192-T1 (owner, S192): teammates never damage each other — units, towers, and zone effects (a demon
 * teammate's zone does not burn you). Teams do not exist YET, so today every seat that is not the spared
 * one burns; `isScorchImmune` is the single site the teams branch changes — pinned mechanically here (every
 * burn arm calls it; none compares seats inline) and by REACH through the real host tick (ANOTHER SEAT in
 * the caster's own doubled zone burns ×2 while the caster's own unit beside him loses nothing). The teams
 * branch re-pins the REACH case to "a teammate is spared".
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLAYER_COLORS } from '../../constants.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { SCORCHED_EARTH_OWN_ZONE_MUL, SCORCHED_GROUND_PER_MILLE } from './scorchedGround.ts';
import { isScorchImmune } from './scorchedEarthRules.ts';
import { dotIntervalTicks, maxPoolFifths } from '../damageOverTime.ts';
import { asCreatureId, makeCreature, type Creature } from '../creatures/creature.ts';
import { getCreatureConfig } from '../creatures/voltkin-config.ts';
import { zoneOf, zoneOwner } from '../zones.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import type { Controls } from '../../input/controls.ts';
import { asPlayerId, asSpawnerId, type PlayerId, type Vec2 } from '../../types.ts';

const P0 = asPlayerId(0); // the demon caster
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function fourSeatFight(): { w: World; keep: Set<number> } {
  const w = makeWorld(0x192b);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [0, 1, 2, 3].map((seat) => ({ seat, color: PLAYER_COLORS[seat] })),
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  w.draft = null;
  w.players.get(P0)!.raceId = 'demons';
  w.players.get(P0)!.draftPicks = ['racial'];
  return { w, keep: new Set() };
}

function held(w: World, keep: Set<number>, owner: PlayerId, at: Vec2): Creature {
  const c = makeCreature(getCreatureConfig('t3Warband'), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { ...at }, targetPos: { ...at },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  c.stunnedUntilTick = w.tick + 10_000_000;
  w.creatures.set(c.id, c);
  keep.add(c.id as unknown as number);
  return c;
}

function step(w: World, keep: Set<number>, n: number): void {
  const d = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
  const st = makeHostTickState(w);
  for (let i = 0; i < n; i++) {
    runHostTick(w, d, st);
    for (const id of [...w.creatures.keys()]) if (!keep.has(id as unknown as number)) w.creatures.delete(id);
  }
}

describe('S192 — isScorchImmune: the caster’s seat, and nobody else', () => {
  it('the predicate: only the spared seat is immune (no teams yet)', () => {
    expect(isScorchImmune(P0, P0)).toBe(true);
    for (const s of [1, 2, 3]) expect(isScorchImmune(asPlayerId(s), P0)).toBe(false);
    expect(isScorchImmune(undefined, P0)).toBe(false);
  });

  it('⭐⭐ REACH: another seat (no teams yet — R192-T1 lands with teams) in the caster’s OWN doubled zone burns ×2; the caster’s own unit loses nothing', () => {
    const { w, keep } = fourSeatFight();
    const at = { x: 400, y: 300 };
    expect(zoneOf(at, w.layout)).toBe(zoneOwner(0, w.layout));
    const other = held(w, keep, asPlayerId(2), at);
    const mine = held(w, keep, P0, { x: at.x + 30, y: at.y });
    const full = other.ehp;
    const mineFull = mine.ehp;
    dispatch(w, { type: 'CAST_SCORCHED_EARTH', playerId: P0, zoneSeat: P0 }); // "click on yours again"
    const n = 4;
    step(w, keep, dotIntervalTicks(maxPoolFifths('t3Warband'), SCORCHED_GROUND_PER_MILLE) * n);
    expect(full - w.creatures.get(other.id)!.ehp, 'any other seat burns today — passive + cast').toBe(n * SCORCHED_EARTH_OWN_ZONE_MUL);
    expect(w.creatures.get(mine.id)!.ehp, 'only the caster is resistant').toBe(mineFull);
  });

  it('⭐ REACH: an aimed cast on ONE enemy zone hits every seat standing in it except the caster', () => {
    const { w, keep } = fourSeatFight();
    const at = { x: 1400, y: 300 };
    expect(zoneOf(at, w.layout)).toBe(zoneOwner(1, w.layout));
    const owner = held(w, keep, asPlayerId(1), at);
    const third = held(w, keep, asPlayerId(3), { x: at.x + 30, y: at.y });
    const mine = held(w, keep, P0, { x: at.x - 30, y: at.y });
    const f1 = owner.ehp, f3 = third.ehp, f0 = mine.ehp;
    dispatch(w, { type: 'CAST_SCORCHED_EARTH', playerId: P0, zoneSeat: asPlayerId(1) });
    step(w, keep, dotIntervalTicks(maxPoolFifths('t3Warband'), SCORCHED_GROUND_PER_MILLE) * 3);
    expect(f1 - w.creatures.get(owner.id)!.ehp).toBe(3);
    expect(f3 - w.creatures.get(third.id)!.ehp).toBe(3);
    expect(w.creatures.get(mine.id)!.ehp).toBe(f0);
  });

  it('⛔ MECHANICAL: every burn arm asks isScorchImmune, and no arm compares seats inline (one site for teams)', () => {
    const src = readFileSync(new URL('./scorchedGround.ts', import.meta.url), 'utf8')
      .replace(/\r\n/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    // creatures · Helga · connector (2 endpoints) · lone shape · stink bag
    expect(src.match(/isScorchImmune\(/g)?.length, 'raise only with a new burn arm that calls it').toBe(6);
    expect(src.match(/(ownerPlayerId|placedBy|Owner)\s*[!=]==\s*(spared|caster)\b/g), 'an inline seat compare').toBeNull();
  });
});
