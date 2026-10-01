/**
 * SPARK — S192 (s191/owner fix round) — **THE OWNER'S TWO LATER SCORCH ANSWERS, through the real host tick.**
 *
 * > scorch: *"a fallen caster's ENEMY-zone cast stops, his own zone keeps burning; Helga is NOT immune"*
 * > (she burns at the units' 2 %) — owner, S191 evening answers (S191 PDR §0, S191_DISPATCH_LOG)
 *
 *   1. A caster whose castle falls: his cast on an ENEMY zone stops at once; his cast on his OWN zone burns
 *      on for the rest of that FIGHT. (The always-on passive keeps S188 F4 — a fallen seat's PASSIVE stops;
 *      whether "his own zone keeps burning" also reverses F4 is reported as an open question.)
 *   2. HELGA burns: an enemy Helga inside a scorched zone loses one fifth on the units' DoT clock for HER
 *      pool — 2 %/s, the creature rate. A DORMANT Helga (S189 C2: a record, `ehp === null`) is not a live
 *      unit and takes nothing; the caster's own Helga is resistant like every other thing of his.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRINCESS_DEF, PRINCESS_HP, PHYSICS_HZ } from '../../constants.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { SCORCHED_GROUND_PER_MILLE, SCORCHED_EARTH_CAST_PER_MILLE } from './scorchedGround.ts';
import { dotIntervalTicks, maxPoolFifths } from '../damageOverTime.ts';
import { asCreatureId, makeCreature, type Creature, type CreatureType } from '../creatures/creature.ts';
import { getCreatureConfig } from '../creatures/voltkin-config.ts';
import { zoneOf, zoneOwner } from '../zones.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { unitPoolFifths } from '../stats.ts';
import { applyBuildBlueprint } from '../blueprintBuild.ts';
import { stampRefusalAt } from '../blueprintLegality.ts';
import { runGodlyMatcherCore } from '../godlyMatcherCore.ts';
import { blueprintBill } from '../blueprints.ts';
import { makeCastleBank } from '../castleBank.ts';
import type { Defender } from '../defenders/defender.ts';
import type { Controls } from '../../input/controls.ts';
import { asPlayerId, asSpawnerId, type PlayerId, type Vec2 } from '../../types.ts';
// ⚠ SIDE-EFFECT IMPORT, REQUIRED — the recipe registers itself; without it no Helga ignites.
import '../godlyRecipes/princessHelga.ts';

const P0 = asPlayerId(0); // the demon caster
const P1 = asPlayerId(1);
const P2 = asPlayerId(2);

const fixtureIds = new WeakMap<World, Set<number>>();
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function match(seats: number, phase: 'FIGHT' | 'BUILD'): World {
  const w = makeWorld(0x192a);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: Array.from({ length: seats }, (_, seat) => ({ seat, color: PLAYER_COLORS[seat] })),
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = phase;
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  w.draft = null;
  w.players.get(P0)!.raceId = 'demons';
  w.players.get(P0)!.draftPicks = ['racial'];
  return w;
}

function heldUnit(w: World, type: CreatureType, owner: PlayerId, at: Vec2): Creature {
  const c = makeCreature(getCreatureConfig(type), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { ...at }, targetPos: { ...at },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  c.stunnedUntilTick = w.tick + 10_000_000;
  w.creatures.set(c.id, c);
  if (!fixtureIds.has(w)) fixtureIds.set(w, new Set());
  fixtureIds.get(w)!.add(c.id as unknown as number);
  return c;
}

/** The real host tick; every creature the fixture did not place is removed (castle emitters). */
function runner(w: World): (n: number) => void {
  const d = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
  const st = makeHostTickState(w);
  return (n) => {
    for (let i = 0; i < n; i++) {
      runHostTick(w, d, st);
      const keep = fixtureIds.get(w);
      for (const id of [...w.creatures.keys()]) if (keep?.has(id as unknown as number) !== true) w.creatures.delete(id);
    }
  };
}

const cast = (w: World, zoneSeat: PlayerId, by: PlayerId = P0): void => {
  dispatch(w, { type: 'CAST_SCORCHED_EARTH', playerId: by, zoneSeat });
};

/** Stamp + ignite a Helga hall for `seat` near `near`, through the production reducer and matcher (BUILD). */
function buildHelga(w: World, seat: PlayerId, near: Vec2): Defender {
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill('helga')) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(seat, bank);
  let site: Vec2 | null = null;
  for (let r = 0; r <= 400 && site === null; r += 8) {
    for (let dx = -r; dx <= r && site === null; dx += 8) {
      for (const dy of [-r, r]) {
        const p = { x: near.x + dx, y: near.y + dy };
        if (stampRefusalAt(w, p, seat, 'helga') === null) { site = p; break; }
      }
    }
  }
  if (site === null) throw new Error('fixture: no legal Helga site');
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: seat, blueprintId: 'helga', centre: site } as never);
  w.tick += 1;
  runGodlyMatcherCore(w, { lastMatcherTick: 0 });
  const helga = [...w.defenders.values()].find((d) => d.kind === 'princess' && d.ownerPlayerId === seat);
  if (helga === undefined) throw new Error('fixture: no Helga ignited');
  return helga;
}

const HELGA_POOL = unitPoolFifths(PRINCESS_HP, PRINCESS_DEF);

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S192 — owner answer 1: a FALLEN caster — ENEMY-zone cast stops, OWN-zone cast keeps burning', () => {
  it('⭐ REACH: his cast on his OWN zone burns on after his castle falls (cast clock only — the passive is F4-off)', () => {
    const w = match(4, 'FIGHT');
    const step = runner(w);
    const ownZone = zoneOwner(0, w.layout);
    const v = heldUnit(w, 't3Warband', P2, { x: 400, y: 300 }); // an outsider in the caster's own quarter
    expect(zoneOf(v.pos, w.layout)).toBe(ownZone);
    const interval = dotIntervalTicks(maxPoolFifths(v.type), SCORCHED_EARTH_CAST_PER_MILLE);
    cast(w, P0); // his own zone
    expect(w.players.get(P0)!.scorchedEarth).not.toBeNull();
    w.players.get(P0)!.castleHp = 0; // the caster falls
    const full = v.ehp;
    step(interval * 3);
    expect(full - w.creatures.get(v.id)!.ehp, 'his own ground keeps burning — one source (the cast)').toBe(3);
  });

  it('⛔ NEGATIVE: his cast on an ENEMY zone stops the moment he falls', () => {
    const w = match(4, 'FIGHT');
    const step = runner(w);
    const v = heldUnit(w, 't3Warband', P2, { x: 1400, y: 300 }); // zone 1 = seat 1's
    expect(zoneOf(v.pos, w.layout)).toBe(zoneOwner(1, w.layout));
    const interval = dotIntervalTicks(maxPoolFifths(v.type), SCORCHED_EARTH_CAST_PER_MILLE);
    const full = v.ehp;
    cast(w, P1);
    step(interval * 2);
    const mid = w.creatures.get(v.id)!.ehp;
    expect(full - mid, 'it was burning while he stood').toBe(2);
    w.players.get(P0)!.castleHp = 0;
    step(interval * 3);
    expect(w.creatures.get(v.id)!.ehp, 'the enemy-zone cast stopped with him').toBe(mid);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S192 — owner answer 2: HELGA is NOT immune — she burns at the units’ 2 %', () => {
  it('the arithmetic: her interval is the creature DoT clock for HER pool (2 %/s of it)', () => {
    const interval = dotIntervalTicks(HELGA_POOL, SCORCHED_EARTH_CAST_PER_MILLE);
    expect(Number.isFinite(interval)).toBe(true);
    const perSecond = (PHYSICS_HZ / interval) / HELGA_POOL;
    expect(Math.abs(perSecond - SCORCHED_EARTH_CAST_PER_MILLE / 1000)).toBeLessThan(0.002);
  });

  it('⭐⭐ REACH: an enemy Helga in a scorched zone loses one fifth per interval of HER pool', () => {
    const w = match(2, 'BUILD');
    const helga = buildHelga(w, P1, { x: 1320, y: 300 });
    const zone = zoneOf(helga.pos, w.layout);
    expect(zone, 'her hall stands in seat 1’s land').toBe(zoneOwner(1, w.layout));
    w.matchPhase = 'FIGHT';
    const step = runner(w);
    const interval = dotIntervalTicks(HELGA_POOL, SCORCHED_EARTH_CAST_PER_MILLE);
    const full = w.defenders.get(helga.id)!.ehp!;
    expect(full).toBe(HELGA_POOL);
    cast(w, P1);
    step(interval * 6);
    const h = w.defenders.get(helga.id)!;
    expect(zoneOf(h.pos, w.layout), 'she stayed in the scorched zone').toBe(zone);
    expect(full - h.ehp!, 'six intervals, six fifths').toBe(6);
  });

  it('⛔ NEGATIVE: no cast → the enemy Helga loses nothing (the burn is the only source)', () => {
    const w = match(2, 'BUILD');
    const helga = buildHelga(w, P1, { x: 1320, y: 300 });
    w.matchPhase = 'FIGHT';
    const step = runner(w);
    step(dotIntervalTicks(HELGA_POOL, SCORCHED_EARTH_CAST_PER_MILLE) * 6);
    expect(w.defenders.get(helga.id)!.ehp).toBe(HELGA_POOL);
  });

  it('⛔ RESISTANCE: the CASTER’s own Helga in his own scorched zone loses nothing', () => {
    const w = match(2, 'BUILD');
    const mine = buildHelga(w, P0, { x: 600, y: 300 });
    expect(zoneOf(mine.pos, w.layout)).toBe(zoneOwner(0, w.layout));
    w.matchPhase = 'FIGHT';
    const step = runner(w);
    cast(w, P0);
    step(dotIntervalTicks(HELGA_POOL, SCORCHED_GROUND_PER_MILLE) * 6);
    expect(w.defenders.get(mine.id)!.ehp).toBe(HELGA_POOL);
  });

  it('⛔ a DORMANT Helga (S189 C2 — a record, not a live unit) takes nothing and stays DORMANT', () => {
    const w = match(2, 'BUILD');
    const helga = buildHelga(w, P1, { x: 1320, y: 300 });
    const d = w.defenders.get(helga.id)!;
    d.state = 'DORMANT';
    d.ehp = null;
    w.matchPhase = 'FIGHT';
    const step = runner(w);
    cast(w, P1);
    step(dotIntervalTicks(HELGA_POOL, SCORCHED_EARTH_CAST_PER_MILLE) * 6);
    const after = w.defenders.get(helga.id);
    expect(after, 'the record is untouched').toBeDefined();
    expect(after!.state).toBe('DORMANT');
    expect(after!.ehp).toBeNull();
  });
});
