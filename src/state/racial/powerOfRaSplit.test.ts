/**
 * SPARK — S191 (owner) — **THE RA PERK COLUMN: 35 FIFTHS IN TOTAL, SPLIT.**
 *
 * > *"each column that it does 30 damage it split right so if it hits a tower and an enemy at the same
 * > time then it split amongst those two … it's not like 30 to each thing in the vicinity … we can do
 * > it 35 per hit."* — owner, S191
 *
 * What this file pins, each through the REAL host tick where it can be:
 *   1. the arithmetic of the split (`raSplitShares`) — whole fifths, sums to the total, remainder first;
 *   2. a STRUCTURE is ONE target — a 5-connector hub under a column banks 35 once and stands;
 *   3. the share follows the total order (nearer target gets the remainder);
 *   4. the caster's own things are spared AND not counted;
 *   5. the Pharaoh BOSS still lands 300 on EACH victim, unsplit (the decoupling, as a negative test);
 *   6. host vs `?worker=1` stay byte-identical through a split strike.
 */

import { describe, expect, it } from 'vitest';
import {
  LONE_PRIMITIVE_POOL_FIFTHS,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  RA_COLUMN_ATK,
  RA_COLUMN_COUNT,
  RA_COLUMN_PEN,
  RA_COLUMN_RADIUS,
  RA_RITUAL_TICKS,
  SparkType,
} from '../../constants.ts';
import { asPlayerId, asPrimitiveId, asSpawnerId, type BondId, type CreatureId, type PlayerId } from '../../types.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { Controls } from '../../input/controls.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from '../hostTick.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { mulberry32 } from '../rng.ts';
import { attackFifths, structurePoolFifths } from '../stats.ts';
import { raColumnImpactTick, raColumnPos, runPharaohRitual } from '../bossSkillsPharaohRitual.ts';
import { damageCreature } from '../creatures/creatureLifecycle.ts';
import { generalPickForWave } from '../draft.ts';
import { hashWorldState } from '../stateHash.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { netSnapshot, snapshot } from '../save.ts';
import { applyTickBatch, makeWorkerSim, WorkerControls, type WorkerTickBatchMsg } from '../workerSim.ts';
import { makeWorkerCinematicState, runGodlyMatcherCore, tickWorkerCinematics } from '../godlyMatcherCore.ts';
import { BotManager } from '../../bots/botManager.ts';
import {
  raColumnTargets,
  raSplitShares,
  raStrikeColumnPos,
  RA_PERK_STRIKE_FIFTHS,
  runPowerOfRa,
} from './powerOfRa.ts';

const P0 = asPlayerId(0); // the caster — MUMMIES with POWER OF RA
const P1 = asPlayerId(1); // the enemy
const AIM = { x: 960, y: 260 };

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function raWorld(): World {
  const w = makeWorld(0x5a191);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: '1v1',
    isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0]!, raceId: 'mummies' },
      { seat: 1, color: PLAYER_COLORS[1]!, raceId: 'orcs' },
    ],
  });
  dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P0, pick: 'racial' });
  dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P1, pick: generalPickForWave(1) });
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  return w;
}

const cast = (w: World, x: number, y: number): void => {
  dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P0, x, y });
};

let nextSentinel = 9600;
function victim(w: World, owner: PlayerId, x: number, y: number): CreatureId {
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: 'chewer', ownerPlayerId: owner,
    pos: { x, y }, targetPos: { x, y }, sourceSpawnerId: asSpawnerId(nextSentinel++),
  });
  const id = [...w.creatures.keys()].at(-1)!;
  const c = w.creatures.get(id)!;
  c.ehp = 10_000;
  c.maxEhp = 10_000;
  return id;
}

function place(w: World, id: CreatureId, at: { x: number; y: number }): void {
  const c = w.creatures.get(id)!;
  c.pos = { x: at.x, y: at.y };
  c.prevPos = { x: at.x, y: at.y };
  c.targetPos = { x: at.x, y: at.y };
}

function addPrim(w: World, seat: PlayerId, x: number, y: number): Primitive {
  const player = w.players.get(seat)!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const prim: Primitive = {
    id, type: SparkType.Square, placerColor: player.color, placedBy: player.id,
    createdTick: w.tick, pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
    ownerColor: player.color, lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, prim);
  return prim;
}

function link(w: World, a: Primitive, b: Primitive): BondId {
  const id = w.nextBondId++ as unknown as BondId;
  const len = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
  w.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: len, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0 } as never);
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

/**
 * A 5-connector HUB — a centre shape and five spokes of `spoke` px — the lightning hub's topology
 * (5 connectors, pool `structurePoolFifths(5)` = 50). Returns the bonds in id order.
 */
function hub(w: World, seat: PlayerId, at: { x: number; y: number }, spoke = 30): { centre: Primitive; bonds: BondId[] } {
  const centre = addPrim(w, seat, at.x, at.y);
  const bonds: BondId[] = [];
  for (let i = 0; i < 5; i++) {
    const ang = (i * 2 * Math.PI) / 5;
    const leaf = addPrim(w, seat, at.x + Math.round(Math.cos(ang) * spoke), at.y + Math.round(Math.sin(ang) * spoke));
    bonds.push(link(w, centre, leaf));
  }
  return { centre, bonds };
}

const banked = (w: World, ids: readonly BondId[]): number =>
  ids.reduce((s, id) => s + (w.bonds.get(id)?.damageFifths ?? 0), 0);

function tickTo(w: World, d: HostTickDeps, s: HostTickState, target: number): void {
  let guard = 0;
  while (w.tick < target) {
    runHostTick(w, d, s);
    if (++guard > 100_000) throw new Error('tickTo ran away');
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 — the split arithmetic (raSplitShares)', () => {
  it('the total is HIS 35, on the one ladder', () => {
    expect(RA_PERK_STRIKE_FIFTHS).toBe(35);
    expect(RA_PERK_STRIKE_FIFTHS).not.toBe(attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN));
  });

  it('whole fifths, summing to exactly the total, differing by at most one, remainder FIRST', () => {
    for (let n = 1; n <= 100; n++) {
      const sh = raSplitShares(RA_PERK_STRIKE_FIFTHS, n);
      expect(sh).toHaveLength(n);
      expect(sh.reduce((a, b) => a + b, 0), `n=${n}`).toBe(RA_PERK_STRIKE_FIFTHS);
      expect(sh.every(Number.isInteger)).toBe(true);
      expect(Math.max(...sh) - Math.min(...sh)).toBeLessThanOrEqual(1);
      for (let i = 1; i < n; i++) expect(sh[i]!).toBeLessThanOrEqual(sh[i - 1]!); // non-increasing
    }
    expect(raSplitShares(35, 1)).toEqual([35]);
    expect(raSplitShares(35, 2)).toEqual([18, 17]);
    expect(raSplitShares(35, 3)).toEqual([12, 12, 11]);
    // ⚠ MINE — more targets than fifths: the first 35 get one each, the rest nothing.
    const many = raSplitShares(35, 36);
    expect(many.slice(0, 35).every((v) => v === 1)).toBe(true);
    expect(many[35]).toBe(0);
  });

  it('⛔ no targets → no shares (and never a throw)', () => {
    expect(raSplitShares(35, 0)).toEqual([]);
    expect(raSplitShares(35, -1)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 — ⭐⭐ REACH: one column through the REAL host tick', () => {
  function atColumn0(): { w: World; d: HostTickDeps; s: HostTickState; spot: { x: number; y: number }; impact: number } {
    const w = raWorld();
    const d = deps();
    const s = makeHostTickState(w);
    cast(w, AIM.x, AIM.y);
    const strike = w.players.get(P0)!.raStrikes[0]!;
    const spot = raStrikeColumnPos(P0, 0, strike);
    const impact = raColumnImpactTick(strike.untilTick, 0);
    tickTo(w, d, s, impact - 1);
    return { w, d, s, spot, impact };
  }

  it('⭐⭐ a 5-connector hub under a column banks 35 ONCE — on ONE connector — and stands', () => {
    const { w, d, s, spot, impact } = atColumn0();
    const h = hub(w, P1, spot);
    // anti-vacuity: every one of its five connectors IS inside the circle
    for (const id of h.bonds) {
      const b = w.bonds.get(id)!;
      expect(Math.hypot((b.a.pos.x + b.b.pos.x) / 2 - spot.x, (b.a.pos.y + b.b.pos.y) / 2 - spot.y)).toBeLessThan(RA_COLUMN_RADIUS);
    }
    expect(raColumnTargets(w, P0, spot).map((t) => t.kind), 'ONE target, the structure').toEqual(['structure']);
    runHostTick(w, d, s);
    expect(w.tick).toBe(impact);
    expect(banked(w, h.bonds), 'the whole column, once').toBe(RA_PERK_STRIKE_FIFTHS);
    expect(h.bonds.filter((id) => (w.bonds.get(id)?.damageFifths ?? 0) > 0), 'on ONE connector').toHaveLength(1);
    expect(h.bonds.every((id) => w.bonds.has(id)), 'the hub stands — 35 < its pool').toBe(true);
    expect(RA_PERK_STRIKE_FIFTHS).toBeLessThan(structurePoolFifths(5));
    // …and no shape inside it was razed by an area arm.
    expect(w.primitives.get(h.centre.id)!.hp).toBe(PRIMITIVE_MAX_HP);
  });

  it('⭐ hub + enemy creature: 18 to the NEARER, 17 to the other — a split, not 35 each', () => {
    const { w, d, s, spot } = atColumn0();
    // The hub's nearest connector midpoint is 15 px from the centre; the creature stands 40 px off.
    const h = hub(w, P1, spot);
    const e = victim(w, P1, spot.x, spot.y + 40);
    place(w, e, { x: spot.x, y: spot.y + 40 });
    const before = w.creatures.get(e)!.ehp;
    const shares = raSplitShares(RA_PERK_STRIKE_FIFTHS, 2);
    runHostTick(w, d, s);
    expect(banked(w, h.bonds), 'the structure is nearer → the remainder').toBe(shares[0]);
    expect(before - w.creatures.get(e)!.ehp).toBe(shares[1]);
    expect(banked(w, h.bonds) + (before - w.creatures.get(e)!.ehp), 'the column total').toBe(RA_PERK_STRIKE_FIFTHS);
  });

  it('⭐ the ORDER decides the remainder: a creature at the centre takes 18, the hub 17', () => {
    const { w, d, s, spot } = atColumn0();
    const h = hub(w, P1, { x: spot.x + 40, y: spot.y }, 20); // nearest midpoint ≥ 30 px off
    const e = victim(w, P1, spot.x, spot.y);
    place(w, e, spot);
    const before = w.creatures.get(e)!.ehp;
    runHostTick(w, d, s);
    expect(before - w.creatures.get(e)!.ehp).toBe(18);
    expect(banked(w, h.bonds)).toBe(17);
  });

  it('⭐ two enemy structures in one column: each is one target, 18 + 17', () => {
    const { w, d, s, spot } = atColumn0();
    const a = hub(w, P1, { x: spot.x - 30, y: spot.y }, 20);
    const b = hub(w, P1, { x: spot.x + 34, y: spot.y }, 20);
    expect(raColumnTargets(w, P0, spot).map((t) => t.kind)).toEqual(['structure', 'structure']);
    runHostTick(w, d, s);
    expect(banked(w, a.bonds)).toBe(18); // nearer
    expect(banked(w, b.bonds)).toBe(17);
  });

  it('⛔ the caster\'s own hub and unit are spared AND not counted — the lone enemy takes all 35', () => {
    const { w, d, s, spot } = atColumn0();
    const mine = hub(w, P0, spot);
    const own = victim(w, P0, spot.x + 5, spot.y);
    place(w, own, { x: spot.x + 5, y: spot.y });
    const e = victim(w, P1, spot.x - 20, spot.y);
    place(w, e, { x: spot.x - 20, y: spot.y });
    const ob = w.creatures.get(own)!.ehp;
    const eb = w.creatures.get(e)!.ehp;
    runHostTick(w, d, s);
    expect(banked(w, mine.bonds)).toBe(0);
    expect(w.creatures.get(own)!.ehp).toBe(ob);
    expect(eb - w.creatures.get(e)!.ehp).toBe(RA_PERK_STRIKE_FIFTHS);
  });

  it('⭐ a lone built shape and a landed stink bag are one target each', () => {
    const { w, spot } = atColumn0();
    const lone = addPrim(w, P1, spot.x + 10, spot.y);
    const bagId = 77 as never;
    w.stinkClouds.set(bagId, { id: bagId, pos: { x: spot.x - 12, y: spot.y }, ownerPlayerId: P1, landedAtTick: w.tick, radius: 40, ehp: 500 } as never);
    expect(raColumnTargets(w, P0, spot).map((t) => [t.kind, t.id])).toEqual([['primitive', lone.id], ['stinkCloud', 77]]);
    w.tick = raColumnImpactTick(w.players.get(P0)!.raStrikes[0]!.untilTick, 0);
    runPowerOfRa(w);
    // The lone shape's 18 is ≥ its 5-fifth pool (canon §2) → it is gone; the bag took the other 17.
    expect(raSplitShares(RA_PERK_STRIKE_FIFTHS, 2)[0]!).toBeGreaterThanOrEqual(LONE_PRIMITIVE_POOL_FIFTHS);
    expect(w.primitives.has(lone.id)).toBe(false);
    expect(500 - (w.stinkClouds.get(bagId) as unknown as { ehp: number }).ehp).toBe(17);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 — the numbers the owner asked for (measured, not derived by hand)', () => {
  it('a fresh 5-connector hub falls on the SEVENTH column landing on it (no overkill carry on this branch)', () => {
    /*
     * Each column is landed on the hub by translating the hub onto that column's spot just before it
     * lands — the count is "columns that HIT it", whatever casts they came from.
     * 50 pool: 35 (stands) → 70 breaks; the 20 over sits on the severed bond and goes with it.
     * 36: 35 → 70 breaks. 24: one. 14: one. 6: one. = 2 + 2 + 1 + 1 + 1 = 7.
     * (With s191/carry's overkill carry the arithmetic is ceil(130 / 35) = 4 — re-measure after merge.)
     */
    const w = raWorld();
    const h = hub(w, P1, AIM);
    const members = new Set<number>([h.centre.id as unknown as number]);
    for (const id of h.bonds) { const b = w.bonds.get(id)!; members.add(b.bId as unknown as number); }
    let columns = 0;
    let firstStood = false;
    let until = w.tick + RA_RITUAL_TICKS;
    w.players.get(P0)!.raStrikes = [{ wave: w.waveNumber, x: AIM.x, y: AIM.y, untilTick: until }];
    while (h.bonds.some((id) => w.bonds.has(id)) && columns < 50) {
      const k = columns % RA_COLUMN_COUNT;
      if (k === 0 && columns > 0) {
        until += RA_RITUAL_TICKS;
        w.players.get(P0)!.raStrikes = [{ wave: w.waveNumber, x: AIM.x, y: AIM.y, untilTick: until }];
      }
      const strike = w.players.get(P0)!.raStrikes[0]!;
      const spot = raStrikeColumnPos(P0, k, strike);
      const live = w.primitives.get(h.centre.id);
      if (live !== undefined) {
        const dx = spot.x - live.pos.x;
        const dy = spot.y - live.pos.y;
        for (const pid of members) {
          const p = w.primitives.get(pid as never);
          if (p === undefined) continue;
          p.pos = { x: p.pos.x + dx, y: p.pos.y + dy };
          p.prevPos = { ...p.pos };
        }
      }
      w.tick = raColumnImpactTick(until, k);
      runPowerOfRa(w);
      columns++;
      if (columns === 1) firstStood = h.bonds.every((id) => w.bonds.has(id));
    }
    expect(firstStood, 'one column does not level a tower any more').toBe(true);
    expect(columns).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 — ⛔ NEGATIVE: the Pharaoh BOSS is not retuned and not split', () => {
  it('his column still lands attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN) = 300 on EACH of two victims', () => {
    const w = raWorld();
    dispatch(w, {
      type: 'SPAWN_CREATURE', creatureType: 't9BossMummies' as never, ownerPlayerId: P0,
      pos: { x: 500, y: 500 }, targetPos: { x: 500, y: 500 }, sourceSpawnerId: asSpawnerId(9990),
    });
    const boss = [...w.creatures.values()].find((c) => c.type === 't9BossMummies')!;
    expect(damageCreature(w, boss.id, 100_000)).toBe(false); // starts the ritual
    const until = boss.raRitualUntilTick!;
    expect(until).toBeDefined();

    const pos = raColumnPos(boss.id as unknown as number, 0, boss.pos.x, boss.pos.y);
    const a = victim(w, P1, pos.x, pos.y);
    const b = victim(w, P1, pos.x + 4, pos.y);
    place(w, a, pos);
    place(w, b, { x: pos.x + 4, y: pos.y });
    w.tick = raColumnImpactTick(until, 0);
    runPharaohRitual(w);
    expect(10_000 - w.creatures.get(a)!.ehp).toBe(attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN));
    expect(10_000 - w.creatures.get(b)!.ehp).toBe(300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 — host vs ?worker=1 through a split strike (wide hash)', () => {
  it('is byte-identical every frame across all five columns, and the split really happened', () => {
    const w = raWorld();
    const strikeAim = AIM;
    cast(w, strikeAim.x, strikeAim.y);
    const strike = w.players.get(P0)!.raStrikes[0]!;
    const spot = raStrikeColumnPos(P0, 0, strike);
    const h = hub(w, P1, spot);
    const e = victim(w, P1, spot.x, spot.y + 40);
    const ebefore = w.creatures.get(e)!.ehp;

    const newSpawner = () => new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1), mulberry32(2), mulberry32(3), mulberry32(4), mulberry32(5));
    const saveJson = JSON.stringify(snapshot(w, { spawnerState: newSpawner().getState() }));
    const sim = makeWorkerSim({ type: 'INIT', saveJson, hostSeats: [], localPlayerId: 0, ratePerSecond: 1 }, (dd, ss) => new BotManager(dd, ss));
    expect(hashWorldStateFull(sim.world), 'INIT adoption is bit-exact').toBe(hashWorldStateFull(w));

    const spawner = newSpawner();
    const controls = new WorkerControls(w, P0);
    const extras = makeGameStateExtras();
    const state = makeHostTickState(w);
    const cursor = { lastMatcherTick: -1 };
    const cin = makeWorkerCinematicState();
    let seq = 0;
    const end = raColumnImpactTick(strike.untilTick, RA_COLUMN_COUNT - 1) + 3;
    let f = 0;
    while (w.tick < end) {
      const input: Omit<WorkerTickBatchMsg, 'type' | 'batchSeq'> = {
        ticks: 1 + (f % 3),
        control: { state: { kind: 'Idle' } as const, cursor: { x: 960, y: 540 } },
        alivePeerIds: null,
        intents: [],
        nowMs: f * 16,
      };
      controls.setFrame(input.control);
      const dd: HostTickDeps = { spawner, controls, botManager: null, gameStateExtras: extras, alivePeerIds: null, hostSeats: new Map() };
      for (let i = 0; i < input.ticks; i++) runHostTick(w, dd, state);
      if (w.gameState === 'PLAYING') runGodlyMatcherCore(w, cursor);
      tickWorkerCinematics(w, cin);
      const aJson = JSON.stringify(netSnapshot(w));
      const aHash = hashWorldState(w);
      w.effects.length = 0;
      const r = applyTickBatch(sim, { type: 'TICK_BATCH', batchSeq: ++seq, ...input }, { forceSnapshot: true });
      if (aJson !== JSON.stringify(r.snapshot) || aHash !== r.hash) throw new Error(`DIVERGED at frame ${f} (tick ${w.tick})`);
      if (hashWorldStateFull(w) !== hashWorldStateFull(sim.world)) throw new Error(`WIDE divergence at frame ${f}`);
      f++;
    }
    // ⛔ ANTI-VACUITY — the first column was split between the hub and the creature.
    expect(banked(w, h.bonds) + (ebefore - (w.creatures.get(e)?.ehp ?? ebefore))).toBeGreaterThan(0);
    expect(w.creatures.get(e)!.ehp).toBeLessThan(ebefore);
    expect(h.bonds.some((id) => (w.bonds.get(id)?.damageFifths ?? 0) > 0) || h.bonds.some((id) => !w.bonds.has(id))).toBe(true);
  });
});
