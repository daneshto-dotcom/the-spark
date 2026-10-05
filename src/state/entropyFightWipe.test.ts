/**
 * SPARK — ⭐⭐ S195 `s195/fight-wipe` — THE HUNT FOR *"half of my shit exploded when the fight started"*.
 *
 * Owner, 2026-10-05, verbatim: *"a three player game, 2v1, both of them against me. I was player one … I was
 * Nagas, they were mummies and zombies … we were probably wave eight, and I had a bunch of build. I had my
 * whole quadrant pretty much built, and then, boom, when the fight started, half of my fucking shit exploded …
 * it kind of looked like either the Vulcans I built or the lightning hubs exploded and destroyed everything
 * around them … Immediately when the session started, fucking explosion."*
 *
 * Four hypotheses, each ruled IN or OUT by MEASUREMENT through the real `runHostTick`, on the owner's own
 * board: seat 0 (Nagas, team 0) versus seats 1 + 2 (Mummies + Zombies, team 1), wave 8, a quadrant of REAL
 * stamped towers (`applyBuildBlueprint` — lightning hubs, Voltkin TVs, Piranha towers, goblin towers, laser
 * turrets) welded into ONE structure the way a player's hand-placed shapes weld them (one bond between the
 * nearest leaves of neighbouring towers, which is exactly the bond `placePrimitive`'s merge sweep mints).
 *
 *   H1 the ENTROPY TAX at the whistle (R194-18, `entropy.ts`) — per-connector snap, split deletes the SMALLER
 *      side (`severSplit`);
 *   H2 a lightning hub self-destruct chain (`hostTick.ts` recipe-break arm → `STRUCTURE_SELFDESTRUCT`);
 *   H3 any other BUILD→FIGHT edge hook that removes a bond or a shape (`hostTick.ts` `flipped` arm);
 *   H4 a 1v2 team-check error treating seat 0's own structures as enemy.
 *
 * THE FINDING (every number below is printed by the measurement test and pinned by the assertions):
 *   · the tax's snap count is what the canon table promises (n × chance), BUT every snap on a WELD or a tower
 *     arm is a cut on a TREE — a stamped tower is a star and a weld is a bridge — so each one deletes the
 *     smaller side whole. On a welded quadrant the connectors actually LOST are a MULTIPLE of the snaps: the
 *     split multiplier the canon §2 table does not show (it shows snaps). That multiple is what turns
 *     "~13 % snapped" into "half my build gone" — H1 is IN, and it is the RULE, not a bug.
 *   · the hubs do blow when a snap takes one of their arms (recipe broken → self-destruct), but the blast is
 *     owner-AND-team-spared (`planHubBlast`): zero seat-0 connectors fall to cause `'drone'`. The explosions he
 *     SAW were real — hubs do explode at the whistle — but they are a CONSEQUENCE of H1, not a cause. H2 OUT as
 *     a cause, IN as the visual.
 *   · no other edge hook removes a bond or a shape at the BUILD→FIGHT edge (enumerated below). H3 OUT.
 *   · the loss is byte-identical with `world.teams` = [0,1,1] and with teams off (FFA). H4 OUT.
 */
import { describe, expect, it } from 'vitest';
import './godlyRecipes/registerAll.ts';
import { AUTO_BOND_RADIUS, PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { lookupCombo } from '../combos.ts';
import type { GameEffect } from '../game/effects.ts';
import type { Primitive } from '../game/primitive.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { componentOf } from '../game/structure.ts';
import type { Controls } from '../input/controls.ts';
import { asPlayerId, type BondId, type PlayerId, type PrimitiveId } from '../types.ts';
import { applyBuildBlueprint } from './blueprintBuild.ts';
import { stampRefusalAt } from './blueprintLegality.ts';
import { blueprintBill } from './blueprints.ts';
import { makeCastleBank } from './castleBank.ts';
import { ENTROPY_SCALE, entropyChance, planEntropy } from './entropy.ts';
import { makeGameStateExtras } from './gameState.ts';
import type { GodlyId } from './godlyRecipes/types.ts';
import { runGodlyMatcherCore } from './godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { mulberry32 } from './rng.ts';
import { sampleBuilt } from './matchStats.ts';
import { makeBond } from './placePrimitive.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { sameTeam } from './teams.ts';
import { standingVoltkinTvs } from './voltkinTv.ts';
import { dispatch, makeWorld, type World } from './world.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const P2 = asPlayerId(2);

/** The owner's roster: seat 0 Nagas alone on team 0; seats 1 + 2 (Mummies, Zombies) together on team 1. */
const ROSTER_1V2 = [
  { seat: 0, color: PLAYER_COLORS[0]!, raceId: 'nagas' as const, team: 0 },
  { seat: 1, color: PLAYER_COLORS[1]!, raceId: 'mummies' as const, team: 1 },
  { seat: 2, color: PLAYER_COLORS[2]!, raceId: 'zombies' as const, team: 1 },
];
/** The same three seats as a free-for-all (no `team` picks → `world.teams` undefined). */
const ROSTER_FFA = ROSTER_1V2.map(({ seat, color, raceId }) => ({ seat, color, raceId }));

function match(seed: number, wave: number, roster: typeof ROSTER_1V2 | typeof ROSTER_FFA): World {
  const w = makeWorld(seed);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true, roster });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.waveNumber = wave;
  w.creatures.clear();
  return w;
}

/** The towers a Nagas player stamps — his own words name the hubs and the TVs ("Vulcans"). */
const TOWER_MIX: readonly GodlyId[] = ['lightningHub', 't3TowerNagas', 'voltkin', 'goblinTower', 'lightningHub', 'laserTurret'];

interface Quadrant {
  readonly towers: Array<{ id: GodlyId; prims: PrimitiveId[] }>;
  readonly welds: BondId[];
}

/**
 * Stamp as many REAL towers as fit on seat 0's ground (`stampRefusalAt` is the host's own legality), each
 * paid from a bank topped up for its bill, on a grid that keeps footprints apart the way a player's do.
 */
function stampQuadrant(w: World, maxTowers: number): Quadrant['towers'] {
  const towers: Quadrant['towers'] = [];
  let k = 0;
  for (let y = 60; y <= 1020 && towers.length < maxTowers; y += 90) {
    for (let x = 60; x <= 1860 && towers.length < maxTowers; x += 90) {
      const id = TOWER_MIX[k % TOWER_MIX.length]!;
      const centre = { x, y };
      // the host's own legality: ENEMY GROUND, CASTLE, QUARRY, OFF SCREEN and BLOCKED (per-node STAMP_CLEARANCE
      // against every standing shape) — so the towers pack exactly as tightly as a player's can
      if (stampRefusalAt(w, centre, P0, id) !== null) continue;
      const bank = w.castleBanks.get(P0) ?? makeCastleBank();
      for (const [type, count] of blueprintBill(id)) bank[type as number] = (bank[type as number] ?? 0) + count;
      w.castleBanks.set(P0, bank);
      const before = new Set(w.primitives.keys());
      applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre });
      const prims = [...w.primitives.keys()].filter((p) => !before.has(p));
      expect(prims.length, `fixture: ${id} stamped at ${x},${y}`).toBeGreaterThan(0);
      towers.push({ id, prims });
      k += 1;
    }
  }
  return towers;
}

/** A hand-placed shape (the player's own Square, carried from the porch and dropped between two towers). */
function handShape(w: World, x: number, y: number): Primitive {
  const id = (w.nextPrimitiveId++) as unknown as PrimitiveId;
  const p = { id, type: SparkType.Square, placerColor: PLAYER_COLORS[0]!, placedBy: P0, createdTick: w.tick,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set<BondId>(), ownerColor: PLAYER_COLORS[0]!,
    lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null } as unknown as Primitive;
  w.primitives.set(id, p);
  return p;
}

function bondPair(w: World, a: Primitive, b: Primitive): BondId {
  const bond = makeBond(w, a, b, lookupCombo(a.type, b.type).stiffnessTier);
  w.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
  return bond.id;
}

/**
 * Weld the towers into ONE structure the way a player does it: a hand-placed shape dropped between two
 * towers auto-bonds to the nearest shape of each within `AUTO_BOND_RADIUS` (the primary pick plus the
 * cross-structure merge sweep in `placePrimitive`). Nearest tower pairs first (Kruskal over the towers, so
 * every tower ends up in the one component), bridging each gap with a chain of hand shapes spaced
 * ≤ `AUTO_BOND_RADIUS` apart; then every pair of towers already within one hand shape of each other gets
 * that weld too (a player's quadrant has redundancy — the bots' blobs certainly do).
 */
function weld(w: World, towers: Quadrant['towers']): BondId[] {
  const out: BondId[] = [];
  const parent = towers.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const pairs: Array<[number, number, number, Primitive, Primitive]> = [];
  for (let i = 0; i < towers.length; i++) {
    for (let j = i + 1; j < towers.length; j++) {
      let best: [number, Primitive, Primitive] | null = null;
      for (const a of towers[i]!.prims) for (const b of towers[j]!.prims) {
        const pa = w.primitives.get(a)!, pb = w.primitives.get(b)!;
        const d2 = (pa.pos.x - pb.pos.x) ** 2 + (pa.pos.y - pb.pos.y) ** 2;
        if (best === null || d2 < best[0]) best = [d2, pa, pb];
      }
      if (best !== null) pairs.push([best[0], i, j, best[1], best[2]]);
    }
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const oneShape = (2 * AUTO_BOND_RADIUS) ** 2; // a single hand shape reaches both ends
  for (const [d2, i, j, a, b] of pairs) {
    const joined = find(i) === find(j);
    if (joined && d2 > oneShape) continue; // only the spanning welds bridge a real gap
    if (!joined) parent[find(i)] = find(j);
    const d = Math.sqrt(d2);
    const hops = Math.max(1, Math.ceil(d / AUTO_BOND_RADIUS) - 1); // hand shapes in the chain
    let prev = a;
    for (let k = 1; k <= hops; k++) {
      const t = k / (hops + 1);
      const s = handShape(w, Math.round(a.pos.x + (b.pos.x - a.pos.x) * t), Math.round(a.pos.y + (b.pos.y - a.pos.y) * t));
      out.push(bondPair(w, prev, s));
      prev = s;
    }
    out.push(bondPair(w, prev, b));
  }
  return out;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(spawner: Spawner): HostTickDeps {
  return {
    spawner, controls: stubControls, botManager: null, gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

interface Census {
  connectors: number;
  shapes: number;
  spawners: number;
  defenders: number;
  tvs: number;
  components: number;
  biggest: number;
}

function census(w: World, seat: PlayerId): Census {
  const shapes = [...w.primitives.values()].filter((p) => p.placedBy === seat);
  const seen = new Set<PrimitiveId>();
  let components = 0, biggest = 0;
  for (const p of shapes) {
    if (seen.has(p.id)) continue;
    const comp = componentOf(p, w.primitives, w.bonds);
    for (const id of comp.primitiveIds) seen.add(id);
    components += 1;
    biggest = Math.max(biggest, comp.bondIds.size);
  }
  return {
    connectors: sampleBuilt(w).get(seat) ?? 0,
    shapes: shapes.length,
    spawners: [...w.creatureSpawners.values()].filter((s) => s.ownerPlayerId === seat).length,
    defenders: [...w.defenders.values()].filter((d) => d.ownerPlayerId === seat).length,
    tvs: standingVoltkinTvs(w).filter((t) => t.owner === seat).length,
    components,
    biggest,
  };
}

interface WhistleReport {
  before: Census;
  /** The board the instant the whistle tick ends — the entropy snaps and their split sides. */
  after: Census;
  /** The board `FIGHT_SETTLE_TICKS` later — the hubs whose recipe a snap broke have self-destructed by now. */
  settled: Census;
  /** Connectors lost by the owner to a hub blast (cause 'drone'), over the whole window. */
  settleDroneSevers: number;
  /** Severs in the window by any cause other than 'entropy' / 'drone' — physics, creature, raid … must be 0. */
  otherSevers: number;
  planned: number;
  entropySevers: number;
  droneSevers: number;
  blasts: number;
  hubsBefore: number;
  seat0DroneSevers: number;
  hash: string;
}

/** 2 s of FIGHT after the whistle — long enough for every spawner poll to revalidate a broken hub recipe. */
const FIGHT_SETTLE_TICKS = 120;

/**
 * Settle the board in BUILD (ignition, TV minting), cross the BUILD→FIGHT whistle through `runHostTick`, then
 * run the first 2 s of the FIGHT with no creatures on the board, so what happens is the edge work and its
 * consequences alone (the hub recipe-break → self-destruct arm runs on the spawner poll, not on the edge tick).
 */
function whistle(w: World): WhistleReport {
  const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1));
  const d = deps(spawner);
  const st = makeHostTickState(w);
  // the real loop (`main.ts` / `workerSim.ts`): the godly matcher ignites towers beside the host tick, reading the
  // stamps' BOND_FORMED effects — hubs, goblin towers, Piranha towers register spawners; turrets register defenders
  const cursor = { lastMatcherTick: -1 };
  runGodlyMatcherCore(w, cursor);
  for (let i = 0; i < 12; i++) { runHostTick(w, d, st); runGodlyMatcherCore(w, cursor); } // BUILD ticks
  w.creatures.clear(); // keep the whistle tick to the edge work alone — no creature strikes
  const before = census(w, P0);
  const hubsBefore = [...w.creatureSpawners.values()].filter((s) => s.recipeId === 'lightningHub').length;
  const planned = planEntropy(w).length;
  w.effects.length = 0;
  w.phaseEndsAtTick = w.tick;
  runHostTick(w, d, st);
  expect(w.matchPhase).toBe('FIGHT');
  const fx: GameEffect[] = [...w.effects];
  const after = census(w, P0);
  for (let i = 0; i < FIGHT_SETTLE_TICKS; i++) {
    w.effects.length = 0;
    runHostTick(w, d, st);
    runGodlyMatcherCore(w, cursor);
    fx.push(...w.effects);
    w.creatures.clear();
  }
  expect(w.matchPhase, 'still the same FIGHT').toBe('FIGHT');
  const severs = fx.filter((e): e is Extract<GameEffect, { kind: 'BOND_SEVERED' }> => e.kind === 'BOND_SEVERED');
  return {
    before,
    after,
    settled: census(w, P0),
    planned,
    entropySevers: severs.filter((e) => e.cause === 'entropy').length,
    droneSevers: severs.filter((e) => e.cause === 'drone').length,
    seat0DroneSevers: severs.filter((e) => e.cause === 'drone' && e.victim === P0).length,
    settleDroneSevers: severs.filter((e) => e.cause === 'drone' && e.victim === P0).length,
    otherSevers: severs.filter((e) => e.cause !== 'entropy' && e.cause !== 'drone').length,
    blasts: fx.filter((e) => e.kind === 'BOMB_EXPLODE').length,
    hubsBefore,
    hash: hashWorldStateFull(w),
  };
}

function pct(lost: number, of: number): string {
  return of === 0 ? '0.0' : ((100 * lost) / of).toFixed(1);
}

/* ────────────────────────────── THE OWNER'S BOARD ────────────────────────────── */

const WAVE = 8;

function ownersBoard(seed: number, wave: number, roster: typeof ROSTER_1V2 | typeof ROSTER_FFA, towers = 40): World {
  const w = match(seed, wave, roster);
  const stamped = stampQuadrant(w, towers);
  weld(w, stamped);
  return w;
}

describe('⭐⭐ S195 fight-wipe — the owner\'s 1v2 wave-8 quadrant, crossed through the real host tick', () => {
  it('fixture: the roster really is 1v2 (teams [0,1,1]) and the quadrant really is ONE welded structure of 150–400 connectors', () => {
    const w = ownersBoard(1, WAVE, ROSTER_1V2);
    expect(w.teams).toEqual([0, 1, 1]);
    expect(sameTeam(w, P1, P2)).toBe(true);
    expect(sameTeam(w, P0, P1)).toBe(false);
    expect(w.players.get(P0)?.raceId).toBe('nagas');
    const r = whistle(w);
    const c = r.before;
    expect(c.components, 'one welded structure').toBe(1);
    expect(c.connectors).toBeGreaterThanOrEqual(150);
    expect(c.connectors).toBeLessThanOrEqual(400);
    expect(c.spawners, 'hubs + towers ignited').toBeGreaterThan(0);
    expect(c.defenders, 'turrets ignited').toBeGreaterThan(0);
    expect(c.tvs, 'Voltkin TVs standing').toBeGreaterThan(0);
    expect([...w.creatureSpawners.values()].filter((s) => s.recipeId === 'lightningHub').length, 'lightning hubs ignited').toBeGreaterThan(0);
  });

  it('H1 IN — MEASURED: the whistle snaps ~n×chance connectors, and the SPLIT rule turns them into a far bigger loss', () => {
    const rows: string[] = [];
    let worstLossPct = 0;
    let sumLost = 0, sumSnapped = 0, sumBefore = 0, sumSettled = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = ownersBoard(seed, WAVE, ROSTER_1V2);
      const r = whistle(w);
      const n = r.before.connectors;
      const chance = entropyChance(n);
      const lost = n - r.after.connectors;
      const shapesLost = r.before.shapes - r.after.shapes;
      const lostSettled = n - r.settled.connectors;
      const shapesLostSettled = r.before.shapes - r.settled.shapes;
      const hubsSettled = [...w.creatureSpawners.values()].filter((s) => s.recipeId === 'lightningHub').length;
      const towersOf = (c: Census) => c.spawners + c.defenders + c.tvs;
      const towersLost = towersOf(r.before) - towersOf(r.settled);
      sumLost += lost; sumSnapped += r.entropySevers; sumBefore += n; sumSettled += lostSettled;
      worstLossPct = Math.max(worstLossPct, (100 * lostSettled) / n);
      rows.push(
        `seed ${seed} wave ${WAVE}: n=${n} chance=${(chance * 100 / ENTROPY_SCALE).toFixed(1)}% ` +
        `planned=${r.planned} snapped=${r.entropySevers} → connectors lost ${lost} (${pct(lost, n)}%), ` +
        `shapes lost ${shapesLost}/${r.before.shapes} (${pct(shapesLost, r.before.shapes)}%); ` +
        `+2 s: connectors lost ${lostSettled} (${pct(lostSettled, n)}%), shapes lost ${shapesLostSettled} (${pct(shapesLostSettled, r.before.shapes)}%), ` +
        `towers lost ${towersLost}/${towersOf(r.before)} (hubs ${r.hubsBefore}→${hubsSettled}), hub blasts ${r.blasts}, ` +
        `seat-0 connectors cut by a hub blast ${r.seat0DroneSevers}, components ${r.settled.components} (biggest ${r.settled.biggest})`,
      );
      // the snap count is the canon's number: every planned connector went (or fell with a split side first)
      expect(r.entropySevers).toBeLessThanOrEqual(r.planned);
      expect(r.entropySevers).toBeGreaterThan(0);
      // THE FINDING: the split rule multiplies the loss well past the snaps
      expect(lost, 'connectors lost ≥ connectors snapped').toBeGreaterThanOrEqual(r.entropySevers);
      // H4 — a hub blast at the whistle never cut one of the owner's own connectors (owner + team spared)
      expect(r.seat0DroneSevers).toBe(0);
      // H3 — nothing else severed anything in the window: no physics, creature, raid or player cut
      expect(r.otherSevers).toBe(0);
    }
    console.log(['⭐ S195 fight-wipe — H1 measured through runHostTick (1v2, seat 0 Nagas, wave 8):', ...rows].join('\n'));
    console.log(`  TOTAL: ${sumSnapped} snapped → ${sumLost} lost of ${sumBefore} at the whistle (${pct(sumLost, sumBefore)} %), ${sumSettled} (${pct(sumSettled, sumBefore)} %) once the broken hubs have blown; split multiplier ×${(sumLost / sumSnapped).toFixed(2)} (×${(sumSettled / sumSnapped).toFixed(2)} with the hubs); worst board ${worstLossPct.toFixed(1)} %`);
    // the measured split multiplier on a welded quadrant: the realised loss is at least 1.5× the snaps in aggregate
    expect(sumLost / sumSnapped).toBeGreaterThan(1.5);
    // and the aggregate loss is a material share of the build — the owner's "half" is within reach of ONE whistle
    expect((100 * sumLost) / sumBefore).toBeGreaterThan(15);
  });

  it('H1 scales with the wave only through n: the SAME board at wave 8, 12 and 20 differs only in which bonds roll under the chance', () => {
    const rows: string[] = [];
    for (const wave of [8, 12, 20]) {
      const w = ownersBoard(2, wave, ROSTER_1V2);
      const r = whistle(w);
      const n = r.before.connectors;
      rows.push(`wave ${wave}: n=${n} planned=${r.planned} snapped=${r.entropySevers} lost=${n - r.after.connectors} (${pct(n - r.after.connectors, n)} %)`);
      expect(entropyChance(n), 'the chance is a function of n alone, not of the wave').toBe(entropyChance(census(ownersBoard(2, 8, ROSTER_1V2), P0).connectors));
    }
    console.log(['⭐ S195 fight-wipe — the wave is only the seed:', ...rows].join('\n'));
  });

  it('H2 OUT (as a cause) — hubs DO detonate at the whistle, but only because a snap broke their recipe, and the blast spares the owner\'s side entirely', () => {
    let blasts = 0, hubsBefore = 0, hubsAfter = 0, seat0DroneSevers = 0, droneSevers = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = ownersBoard(seed, WAVE, ROSTER_1V2);
      const r = whistle(w);
      hubsBefore += r.hubsBefore;
      hubsAfter += [...w.creatureSpawners.values()].filter((s) => s.recipeId === 'lightningHub').length;
      blasts += r.blasts;
      seat0DroneSevers += r.seat0DroneSevers;
      droneSevers += r.droneSevers;
    }
    console.log(`⭐ S195 fight-wipe — H2: ${hubsBefore} hubs ignited before the whistle, ${hubsAfter} standing 2 s into the FIGHT; ${blasts} hub blasts fired in that window; connectors cut by a blast: ${droneSevers} (seat 0: ${seat0DroneSevers})`);
    expect(blasts, 'the explosions he saw are real: a snapped hub arm breaks the recipe and the hub detonates').toBeGreaterThan(0);
    // a hub whose Dot itself went with a split side is REMOVED without a blast (`dying === undefined`); only a hub
    // still standing on a broken recipe detonates — so blasts ≤ hubs fallen, and never a blast per blast (no chain)
    expect(blasts).toBeLessThanOrEqual(hubsBefore - hubsAfter);
    expect(droneSevers, 'but nobody\'s connector fell to a hub blast — no enemy is in range, and the owner\'s side is spared').toBe(0);
    expect(seat0DroneSevers).toBe(0);
  });

  it('H2 negative — a hub whose recipe survives the whistle does NOT detonate (no fuse, no bulk arming at the FIGHT edge)', () => {
    // the same towers, UNWELDED: every structure ≤ 10 connectors → no tax → nothing breaks a recipe
    const w = match(1, WAVE, ROSTER_1V2);
    stampQuadrant(w, 40);
    const r = whistle(w);
    expect(r.hubsBefore, 'hubs ignited and standing alone').toBeGreaterThan(0);
    expect(r.planned).toBe(0);
    expect(r.entropySevers).toBe(0);
    expect(r.blasts, 'no hub blast without a broken recipe').toBe(0);
    expect(r.after.connectors).toBe(r.before.connectors);
    expect(r.after.shapes).toBe(r.before.shapes);
    expect(r.settled).toEqual(r.before);
  });

  it('H4 OUT — the loss at the whistle is byte-identical with teams [0,1,1] and with teams OFF (the tax and the hub blast never consult the 1v2 layout against the owner)', () => {
    for (const seed of [1, 2, 3]) {
      const a = whistle(ownersBoard(seed, WAVE, ROSTER_1V2));
      const b = whistle(ownersBoard(seed, WAVE, ROSTER_FFA));
      expect(a.before).toEqual(b.before);
      expect(a.after).toEqual(b.after);
      expect(a.entropySevers).toBe(b.entropySevers);
      expect(a.blasts).toBe(b.blasts);
    }
  });

  it('THE TABLE — n connectors → the canon\'s snap % and the REALISED loss % on a welded quadrant of real towers (owner-facing)', () => {
    const rows: string[] = ['| towers | n | chance/connector | snapped (canon) | lost at the whistle | lost +2 s (hubs blown) | towers lost |', '|---|---|---|---|---|---|---|'];
    const seeds = [1, 2, 3, 4];
    for (const towers of [4, 8, 14, 20, 30]) {
      let n = 0, snapped = 0, lost = 0, settled = 0, towersBefore = 0, towersAfter = 0;
      for (const seed of seeds) {
        const r = whistle(ownersBoard(seed, WAVE, ROSTER_1V2, towers));
        n += r.before.connectors; snapped += r.entropySevers;
        lost += r.before.connectors - r.after.connectors; settled += r.before.connectors - r.settled.connectors;
        towersBefore += r.before.spawners + r.before.defenders + r.before.tvs;
        towersAfter += r.settled.spawners + r.settled.defenders + r.settled.tvs;
      }
      const nAvg = n / seeds.length;
      rows.push(`| ${towers} | ${nAvg} | ${(entropyChance(Math.round(nAvg)) * 100 / ENTROPY_SCALE).toFixed(1)} % | ${pct(snapped, n)} % | ${pct(lost, n)} % | ${pct(settled, n)} % | ${towersBefore - towersAfter} of ${towersBefore} |`);
      if (nAvg <= 10) { expect(snapped).toBe(0); expect(lost).toBe(0); }
      else expect(lost).toBeGreaterThanOrEqual(snapped);
    }
    console.log(['⭐ S195 fight-wipe — THE TABLE (4 seeds each, wave 8, 1v2):', ...rows].join('\n'));
  });

  it('H1 control — the S194 lattice (cycle-rich, 65 shapes / 145 connectors) loses ≈ its snaps: the multiplier is TOPOLOGY, not a bug in the roll', () => {
    // same seed, same wave, a structure with the same order of connectors but almost no bridges
    const w = match(1, WAVE, ROSTER_1V2);
    latticeOf(w, 65, 145, 300, 220);
    const r = whistle(w);
    const lost = r.before.connectors - r.after.connectors;
    console.log(`⭐ S195 fight-wipe — control lattice 65/145: planned=${r.planned} snapped=${r.entropySevers} lost=${lost}`);
    expect(r.entropySevers).toBeGreaterThan(0);
    expect(lost).toBeGreaterThanOrEqual(r.entropySevers);
    // in a cycle-rich lattice a snap rarely splits: the realised loss stays within ~2× the snaps
    expect(lost).toBeLessThanOrEqual(r.entropySevers * 2);
  });
});

/** The S194 `entropy.test.ts` lattice, reproduced for the control: Square/Triangle, nearest-first, one component. */
function latticeOf(w: World, shapes: number, connectors: number, ox: number, oy: number): void {
  const cols = Math.ceil(Math.sqrt(shapes));
  const ps: Primitive[] = [];
  for (let i = 0; i < shapes; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = ox + c * 40 + (r % 2) * 20, y = oy + r * 35;
    const id = (w.nextPrimitiveId++) as unknown as PrimitiveId;
    const p = { id, type: i % 2 === 0 ? SparkType.Square : SparkType.Triangle, placerColor: PLAYER_COLORS[0]!, placedBy: P0, createdTick: w.tick,
      pos: { x, y }, prevPos: { x, y }, bonds: new Set<BondId>(), ownerColor: PLAYER_COLORS[0]!,
      lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null } as unknown as Primitive;
    w.primitives.set(id, p);
    ps.push(p);
  }
  const pairs: Array<[number, number, number]> = [];
  for (let i = 0; i < shapes; i++) for (let j = i + 1; j < shapes; j++) {
    const dx = ps[i]!.pos.x - ps[j]!.pos.x, dy = ps[i]!.pos.y - ps[j]!.pos.y;
    pairs.push([dx * dx + dy * dy, i, j]);
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const have = new Set<string>();
  let n = 0;
  const add = (i: number, j: number) => {
    if (have.has(`${i},${j}`)) return;
    have.add(`${i},${j}`);
    bondPair(w, ps[i]!, ps[j]!);
    n += 1;
  };
  for (let i = 1; i < shapes; i++) add(i - 1, i);
  for (const [, i, j] of pairs) { if (n >= connectors) break; add(i, j); }
  expect(n).toBe(connectors);
}
