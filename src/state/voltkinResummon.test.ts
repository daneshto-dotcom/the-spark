/**
 * SPARK — S192 T16: *"I had five TVs, full health, but no new Voltkins each new wave phase."*
 *
 * The owner's report, through the REAL production paths, in BOTH sims:
 *   · DEFAULT (direct) — `runHostTick` + `runGodlyMatcher` + `startCinematicIfNeeded` per frame,
 *     the overlay's 900 ms silent timer stood in for by a tick-driven fake that calls the real
 *     `onComplete`, and `world.effects` wiped every frame exactly as `effectsRenderer` does;
 *   · WORKER (`?worker=1`) — the real INIT (`makeWorkerSim` from a JSON save) and `applyTickBatch`,
 *     stamps riding `batch.intents`.
 *
 * Repro measured BEFORE the fix (S192, both sims, the fixes mutated back out): TV A, TV B 31 ticks
 * later, TV C 400 ticks later → 3 TVs standing, **2 Voltkins** (B dropped by the matcher's early
 * return, Defect A). Then a full FIGHT and the next BUILD: 3 TVs standing, **0 Voltkins**. With only
 * Defect B mutated back, B is queued, never plays, and latches the slot for the match, so C is lost
 * too. See `S192_PROGRESS_voltkin.md`.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType, VOLTKIN_EMERGE_MS, phaseDurationTicks } from '../constants.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PlayerId, type PrimitiveId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import type { Controls } from '../input/controls.ts';
import { stampRefusalAt } from './blueprintLegality.ts';
import { ALL_BLUEPRINT_IDS, blueprintBill } from './blueprints.ts';
import { makeCastleBank } from './castleBank.ts';
import { cinematicMsToTicks } from './creatures/creature.ts';
import {
  makeGodlyOrchestrationState,
  runGodlyMatcher,
  startCinematicIfNeeded,
  type GodlyOrchestrationCtx,
} from './godlyOrchestration.ts';
import { applyTickBatch, makeWorkerSim } from './workerSim.ts';
import { snapshot } from './save.ts';
import { findAllVoltkinChains, voltkinPredicate } from './godlyRecipes/voltkin.ts';
import { findAllVoltkinChainsCanonical } from './godlyRecipes/voltkinChainWalk.ts';
import {
  dispatchVoltkinSpawn,
  resummonVoltkins,
  standingVoltkinTvs,
  tvsOwedAVoltkin,
  VOLTKINS_PER_TV,
  voltkinTvOwner,
} from './voltkinTv.ts';
import { runGodlyMatcherCore } from './godlyMatcherCore.ts';
import type { GameAction } from './world.ts';
// ⚠ SIDE-EFFECT IMPORT — the registry is filled by the recipe module's tail `registerRecipe`.
import './godlyRecipes/voltkin.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const BUILD_LEFT = 700; // ticks of BUILD left when the first TV is stamped
const STAMP_FRAMES = [0, 31, 400] as const; // the research repro's spacing

function twoSeat(): World {
  const w = makeWorld(0x716);
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
  w.phaseEndsAtTick = w.tick + BUILD_LEFT;
  w.creatures.clear();
  return w;
}

function addShape(w: World, owner: PlayerId, type: SparkType, x: number, y: number): Primitive {
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const seat = owner as unknown as number;
  const p = {
    id, type,
    placerColor: PLAYER_COLORS[seat]!, placedBy: owner, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set<BondId>(),
    ownerColor: PLAYER_COLORS[seat]!, lastOwnershipChange: 0,
    radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  } as unknown as Primitive;
  w.primitives.set(id, p);
  return p;
}

let nextBond = 91_000;
function connect(w: World, a: Primitive, b: Primitive, id = asBondId(nextBond++)): BondId {
  w.bonds.set(id, {
    id, aId: a.id, bId: b.id, a, b,
    restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0,
  } as never);
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

/**
 * Seat 1's buildings, far across the board, so the Voltkins have an ENEMY to walk to (§5b). ⚠ BIG ON
 * PURPOSE: three Voltkins level a 24-connector town in ~300 ticks, after which §5b's accepted
 * fallback sends them onto their OWN nearest connectors — their TVs — and the next-wave count would
 * be measuring the fallback instead of the re-summon.
 */
function enemyTown(w: World): void {
  for (let col = 0; col < 3; col++) {
    for (let k = 0; k < 10; k++) {
      const x0 = 1300 + col * 200;
      const y = 120 + k * 85;
      let prev = addShape(w, P1, SparkType.Square, x0, y);
      for (let i = 1; i <= 6; i++) {
        const next = addShape(w, P1, SparkType.Square, x0 + 26 * i, y);
        connect(w, prev, next);
        prev = next;
      }
    }
  }
}

/** Three legal, well-separated TV sites for seat 0, and the bank to stamp all three. */
function prepareSeat0(w: World): Array<{ x: number; y: number }> {
  const sites: Array<{ x: number; y: number }> = [];
  for (let x = 150; x <= 900 && sites.length < 3; x += 30) {
    for (let y = 150; y <= 950 && sites.length < 3; y += 30) {
      if (stampRefusalAt(w, { x, y }, P0, 'voltkin') !== null) continue;
      if (sites.some((s) => Math.hypot(s.x - x, s.y - y) < 260)) continue;
      sites.push({ x, y });
    }
  }
  expect(sites.length, 'fixture: three legal TV sites').toBe(3);
  const bank = w.castleBanks.get(P0) ?? makeCastleBank();
  for (let k = 0; k < 3; k++) {
    for (const [type, count] of blueprintBill('voltkin')) {
      bank[type as number] = (bank[type as number] ?? 0) + count;
    }
  }
  w.castleBanks.set(P0, bank);
  return sites;
}

function stampAction(at: { x: number; y: number }): GameAction {
  return { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'voltkin', centre: at } as never;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {}, getPlayerId: () => P0 } as unknown as Controls;
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

const liveVoltkins = (w: World, owner?: PlayerId): number =>
  [...w.creatures.values()].filter(
    (c) => c.type === 'voltkin' && c.state !== 'DESPAWNING' && (owner === undefined || c.ownerPlayerId === owner),
  ).length;

/** The overlay's silent 900 ms timer, driven by ticks; it calls the REAL `onComplete`. */
function fakeOverlay(w: World, timerTicks?: number) {
  let pending: { due: number; cb: () => void } | null = null;
  let plays = 0;
  return {
    get plays() { return plays; },
    play(_recipe: unknown, opts: { silentDurationMs?: number; onComplete: () => void }) {
      plays += 1;
      pending = {
        due: w.tick + (timerTicks ?? cinematicMsToTicks(opts.silentDurationMs ?? VOLTKIN_EMERGE_MS)),
        cb: opts.onComplete,
      };
      return Promise.resolve();
    },
    abort() { pending = null; },
    fire() {
      if (pending !== null && w.tick >= pending.due) {
        const cb = pending.cb;
        pending = null;
        cb();
      }
    },
  };
}

interface Rig {
  readonly world: World;
  /** One frame: `intents` first (as input lands between frames), then ONE sim tick and the godly pass. */
  frame(intents?: readonly GameAction[]): void;
}

function directRig(w: World, timerTicks?: number): Rig & { overlay: ReturnType<typeof fakeOverlay> } {
  const d = deps();
  const s = makeHostTickState(w);
  const gs = makeGodlyOrchestrationState();
  const overlay = fakeOverlay(w, timerTicks);
  const ctx = {
    netTransport: null,
    debugOverlay: null,
    debugProbes: { lastBondFormedTick: -1, bondFormedCount: 0, matcherFiredEver: false, lastMatcherTick: -1 },
    cutsceneOverlay: overlay,
    vignette: { setVisible() {} },
    controls: stubControls,
    simRunsHere: true,
  } as unknown as GodlyOrchestrationCtx;
  return {
    world: w,
    overlay,
    frame(intents = []) {
      overlay.fire(); // the wall-clock timer lands between frames
      for (const a of intents) dispatch(w, a);
      runHostTick(w, d, s);
      runGodlyMatcher(w, gs, ctx);
      startCinematicIfNeeded(w, gs, ctx);
      w.effects.length = 0; // effectsRenderer.ts:98
    },
  };
}

function workerRig(source: World): Rig {
  const sim = makeWorkerSim({
    type: 'INIT',
    saveJson: JSON.stringify(snapshot(source, { spawnerState: deps().spawner.getState() })),
    hostSeats: [],
    localPlayerId: 0,
  });
  let seq = 0;
  let nowMs = 0;
  return {
    world: sim.world,
    frame(intents = []) {
      nowMs += 1000 / 60;
      applyTickBatch(sim, {
        type: 'TICK_BATCH',
        batchSeq: ++seq,
        ticks: 1,
        control: { state: { kind: 'Idle' }, cursor: { x: 0, y: 0 } },
        alivePeerIds: null,
        intents,
        nowMs,
      } as never);
    },
  };
}

type Mode = 'direct' | 'worker';
function makeRig(mode: Mode, timerTicks?: number): { rig: Rig; sites: Array<{ x: number; y: number }> } {
  const w = twoSeat();
  enemyTown(w);
  const sites = prepareSeat0(w);
  return { rig: mode === 'direct' ? directRig(w, timerTicks) : workerRig(w), sites };
}

/** The owner's session: three TVs in one BUILD, a full FIGHT, into the next BUILD. */
function playHisWave(mode: Mode) {
  const { rig, sites } = makeRig(mode);
  const w = (): World => rig.world;
  let f = 0;
  const endOfBuild = w().phaseEndsAtTick;
  const queueDrained = (): boolean =>
    w().activeCinematicPlayerId === null && w().pendingCinematics.length === 0 && w().pendingCreatureSpawn === null;
  let tvsFirst = -1;
  let voltkinsFirst = -1;
  let drainedAtTick = -1;
  // ⚠ Measured when the emerge queue has DRAINED, not at the whistle: the worker still runs the
  // pre-S175 4.8 s emerge (`tickWorkerCinematics`) where direct runs 900 ms, so in worker mode the
  // third TV's Voltkin arrives ~tick 865, after this 700-tick BUILD. Late is not dropped; the
  // disagreement itself is reported in S192_PROGRESS_voltkin.md, not changed here.
  while (w().tick < endOfBuild + 900) {
    const k = STAMP_FRAMES.indexOf(f as never);
    rig.frame(k >= 0 ? [stampAction(sites[k]!)] : []);
    f += 1;
    if (drainedAtTick < 0 && f > STAMP_FRAMES[STAMP_FRAMES.length - 1]! && queueDrained()) {
      drainedAtTick = w().tick;
      tvsFirst = standingVoltkinTvs(w()).length;
      voltkinsFirst = liveVoltkins(w(), P0);
    }
  }
  // Through the whole FIGHT and a few ticks into the next BUILD.
  const nextBuild = endOfBuild + phaseDurationTicks('FIGHT');
  while (w().tick < nextBuild + 5) {
    // ⚠ FIXTURE: seat 1 fields no army. Its castle's race units otherwise walk over late in the
    // FIGHT and break a TV (measured: tick ~3400), which is the game working — and would make this
    // case measure a raid instead of the re-summon. The fallen-TV case is covered on its own below.
    for (const [id, c] of [...w().creatures]) if (c.ownerPlayerId === P1) w().creatures.delete(id);
    rig.frame();
  }
  return {
    w: w(),
    tvsFirst,
    voltkinsFirst,
    phaseNext: w().matchPhase,
    tvsNext: standingVoltkinTvs(w()).length,
    voltkinsNext: liveVoltkins(w(), P0),
    drainedAtTick,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe.each<Mode>(['direct', 'worker'])('S192 T16 — his three TVs, through the real %s sim', (mode) => {
  it('⭐⭐ every TV closed in one BUILD summons — none dropped while another is emerging (Defect A + B)', () => {
    const r = playHisWave(mode);
    expect(r.tvsFirst, 'fixture: three TVs standing').toBe(3);
    expect(r.voltkinsFirst).toBe(3 * VOLTKINS_PER_TV);
  });

  it('⭐⭐ the NEXT wave: three healthy TVs → three Voltkins again, with nothing rebuilt', () => {
    const r = playHisWave(mode);
    expect(r.phaseNext).toBe('BUILD');
    expect(r.tvsNext, 'fixture: the TVs survived the FIGHT').toBe(3);
    expect(r.voltkinsNext).toBe(r.tvsNext * VOLTKINS_PER_TV);
  });

  it('⭐ the emerge slot never locks: after the queue drains, the cinematic slot is free', () => {
    const r = playHisWave(mode);
    expect(r.w.activeCinematicPlayerId).toBeNull();
    expect(r.w.pendingCinematics.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S192 T16 — Defect B in isolation: a queued SAME-SEAT event plays and completes (direct)', () => {
  it('two same-seat TVs closed 31 ticks apart: two plays, and the slot returns to null', () => {
    const { rig, sites } = makeRig('direct');
    const d = rig as ReturnType<typeof directRig>;
    for (let f = 0; f < 200; f++) rig.frame(f === 0 ? [stampAction(sites[0]!)] : f === 31 ? [stampAction(sites[1]!)] : []);
    expect(d.overlay.plays).toBe(2);
    expect(rig.world.activeCinematicPlayerId).toBeNull();
    expect(liveVoltkins(rig.world, P0)).toBe(2);
  });

  it('⛔ a slow frame cannot eat a Voltkin: the wall-clock timer beating the tick poll mints it early', () => {
    // The overlay completes after 10 ticks instead of 54 — what a run of clamped (>50 ms) frames
    // does to a 900 ms setTimeout against a tick-driven `pendingCreatureSpawn`. The chained
    // cinematic must not overwrite the summon that has not fired yet.
    const { rig, sites } = makeRig('direct', 10);
    for (let f = 0; f < 200; f++) rig.frame(f === 0 ? [stampAction(sites[0]!)] : f === 3 ? [stampAction(sites[1]!)] : []);
    expect(liveVoltkins(rig.world, P0)).toBe(2);
    expect(rig.world.activeCinematicPlayerId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/** A board at the instant before FIGHT→BUILD, with `n` seat-0 TVs built directly (no ignition). */
function edgeBoard(n: number): { w: World; tvMembers: PrimitiveId[][] } {
  const w = twoSeat();
  enemyTown(w);
  const tvMembers: PrimitiveId[][] = [];
  for (let k = 0; k < n; k++) {
    const types = [SparkType.Square, SparkType.Square, SparkType.Square, SparkType.Square,
      SparkType.Triangle, SparkType.Triangle, SparkType.Triangle, SparkType.Triangle];
    const prims = types.map((t, i) => addShape(w, P0, t, 200 + i * 30, 200 + k * 250));
    for (let i = 0; i < prims.length - 1; i++) connect(w, prims[i]!, prims[i + 1]!);
    tvMembers.push(prims.map((p) => p.id));
  }
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1; // the next host tick crosses into BUILD
  return { w, tvMembers };
}

function crossEdge(w: World): void {
  const d = deps();
  const s = makeHostTickState(w);
  runHostTick(w, d, s);
  expect(w.matchPhase, 'fixture: the edge was crossed').toBe('BUILD');
}

describe('S192 T16 — the FIGHT→BUILD re-summon rule', () => {
  it('each standing TV with no Voltkin gets exactly one, at its centre, owned by its seat', () => {
    const { w } = edgeBoard(2);
    crossEdge(w);
    const vs = [...w.creatures.values()].filter((c) => c.type === 'voltkin');
    expect(vs.length).toBe(2);
    for (const v of vs) expect(v.ownerPlayerId).toBe(P0);
    const centres = standingVoltkinTvs(w).map((t) => t.centre);
    for (const v of vs) {
      expect(centres.some((c) => Math.hypot(c.x - v.pos.x, c.y - v.pos.y) < 1)).toBe(true);
    }
  });

  it('negative — a TV that FELL (a connector severed) summons nothing', () => {
    const { w, tvMembers } = edgeBoard(2);
    const victim = w.primitives.get(tvMembers[1]![3]!)!;
    const bondId = [...victim.bonds][0]!;
    const bond = w.bonds.get(bondId)!;
    w.primitives.get(bond.aId)!.bonds.delete(bondId);
    w.primitives.get(bond.bId)!.bonds.delete(bondId);
    w.bonds.delete(bondId);
    crossEdge(w);
    expect(liveVoltkins(w, P0)).toBe(1);
  });

  it('⛔ negative — NO DOUBLE SUMMON: a TV whose Voltkin still lives gets no second one', () => {
    const { w } = edgeBoard(2);
    const tvs = standingVoltkinTvs(w);
    // One TV's Voltkin is alive (e.g. it never left home); the other TV's is gone.
    dispatchVoltkinSpawn(w, P0, tvs[0]!.centre);
    expect(liveVoltkins(w, P0)).toBe(1);
    crossEdge(w);
    expect(liveVoltkins(w, P0), 'one new Voltkin, for the TV that had none').toBe(2);
    // …and a second edge with both alive adds nothing.
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1;
    crossEdge(w);
    expect(liveVoltkins(w, P0)).toBe(2);
  });

  it('negative — a summon already in flight (pendingCreatureSpawn) holds its TV', () => {
    const { w } = edgeBoard(1);
    const tv = standingVoltkinTvs(w)[0]!;
    w.pendingCreatureSpawn = {
      fireAtTick: w.tick + 10_000,
      event: { godlyId: 'voltkin', triggererPlayerId: P0, targetComponentPrimitiveIds: tv.members, targetPos: tv.centre, triggeredAtTick: w.tick } as never,
    };
    crossEdge(w);
    expect(liveVoltkins(w, P0)).toBe(0);
  });

  it('a Voltkin of ANOTHER seat does not hold my TV', () => {
    const { w } = edgeBoard(1);
    dispatchVoltkinSpawn(w, P1, standingVoltkinTvs(w)[0]!.centre);
    crossEdge(w);
    expect(liveVoltkins(w, P0)).toBe(1);
  });

  it('a client never re-summons (host-only)', () => {
    const { w } = edgeBoard(1);
    w.isHost = false;
    resummonVoltkins(w);
    expect(liveVoltkins(w)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S192 T16 — determinism of the TV census', () => {
  /** S1-S2-S3-S4 with TWO triangle tails off S4: two valid 8-paths from ONE start. */
  function forkedLattice(tailAFirst: boolean): World {
    const w = makeWorld(3);
    const sq = [0, 1, 2, 3].map((i) => addShape(w, P0, SparkType.Square, 100 + i * 30, 100));
    const ta = [0, 1, 2, 3].map((i) => addShape(w, P0, SparkType.Triangle, 220 + i * 30, 70));
    const tb = [0, 1, 2, 3].map((i) => addShape(w, P0, SparkType.Triangle, 220 + i * 30, 130));
    for (let i = 0; i < 3; i++) connect(w, sq[i]!, sq[i + 1]!, asBondId(10 + i));
    const linkA = (): void => { connect(w, sq[3]!, ta[0]!, asBondId(20)); for (let i = 0; i < 3; i++) connect(w, ta[i]!, ta[i + 1]!, asBondId(21 + i)); };
    const linkB = (): void => { connect(w, sq[3]!, tb[0]!, asBondId(30)); for (let i = 0; i < 3; i++) connect(w, tb[i]!, tb[i + 1]!, asBondId(31 + i)); };
    // Same ids, same graph — only the Set insertion order on S4 differs.
    if (tailAFirst) { linkA(); linkB(); } else { linkB(); linkA(); }
    return w;
  }

  it('⭐ the same graph inserted in a different order gives the SAME TV (the renderer walk does not)', () => {
    const a = forkedLattice(true);
    const b = forkedLattice(false);
    const key = (chains: ReadonlyArray<ReadonlyArray<PrimitiveId>>) => JSON.stringify(chains.map((c) => [...c].map(Number).sort((x, y) => x - y)));
    // The hazard is real: the insertion-order walk picks a different tail.
    expect(key(findAllVoltkinChains(a))).not.toBe(key(findAllVoltkinChains(b)));
    // The census does not.
    expect(key(findAllVoltkinChainsCanonical(a))).toBe(key(findAllVoltkinChainsCanonical(b)));
  });

  it('owner: majority colour, lowest seat on a tie', () => {
    const w = twoSeat();
    const prims = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => addShape(w, i < 4 ? P1 : P0, SparkType.Square, 100 + i * 30, 100));
    expect(voltkinTvOwner(w, prims.map((p) => p.id))).toBe(P0); // 4 / 4 → seat 0
    prims[0]!.placerColor = PLAYER_COLORS[0]!; // 3 P1 / 5 P0
    expect(voltkinTvOwner(w, prims.map((p) => p.id))).toBe(P0);
    for (const p of prims) p.placerColor = PLAYER_COLORS[1]!;
    expect(voltkinTvOwner(w, prims.map((p) => p.id))).toBe(P1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/*
 * ⭐ S192 audit M1 / L1 (merge-owner decision): A TV RE-SUMMONS IFF IT WOULD IGNITE NOW, AND FOR THE
 * SAME SEAT — still true. ⭐⭐ S195 B-31 (owner) REVERSED what "would ignite" means: *"you should be able to
 * weld everything on everything, and the existing … towers keep summoning and resummoning"*. The S48
 * isolation test is gone from BOTH sides; ignition now reads the census's own list (`standingVoltkinTvs`)
 * and its claim binding (`tvsOwedAVoltkin`), so A1 and A4 below are RE-PINNED to the welded answer, and the
 * B-31 cases after them pin the hole that closing isolation opened (a weld re-firing a TV that has its
 * Voltkin) shut.
 */
describe('S192 audit — the census counts exactly what ignition accepts', () => {
  function chain8(w: World, owners: PlayerId[], y: number): Primitive[] {
    const types = [SparkType.Square, SparkType.Square, SparkType.Square, SparkType.Square,
      SparkType.Triangle, SparkType.Triangle, SparkType.Triangle, SparkType.Triangle];
    const prims = types.map((t, i) => addShape(w, owners[i]!, t, 200 + i * 30, y));
    for (let i = 0; i < 7; i++) connect(w, prims[i]!, prims[i + 1]!);
    return prims;
  }
  /** How many canonical chains the ignition predicate would fire for, each tested at its own members. */
  function ignitionAccepted(w: World): number {
    let n = 0;
    for (const c of findAllVoltkinChainsCanonical(w)) {
      const key = [...c].map(Number).sort((a, b) => a - b).join(',');
      const fires = c.some((id) => {
        const r = voltkinPredicate(w, w.primitives.get(id)!.pos);
        return r !== null && [...r.targetComponentPrimitiveIds].map(Number).sort((a, b) => a - b).join(',') === key;
      });
      if (fires) n += 1;
    }
    return n;
  }

  it('⭐ A1 (RE-PINNED S195 B-31) — an extra square welded on the end: ignition FIRES, the census counts 1, the edge summons 1', () => {
    const w = twoSeat();
    const prims = chain8(w, Array(8).fill(P0), 300);
    const weld = addShape(w, P0, SparkType.Square, 170, 300);
    connect(w, weld, prims[0]!);
    const match = voltkinPredicate(w, prims[0]!.pos);
    expect(match, 'B-31: a welded TV ignites').not.toBeNull();
    expect([...match!.targetComponentPrimitiveIds], 'the TV is the chain; the weld is not a member').not.toContain(weld.id);
    expect(standingVoltkinTvs(w).length).toBe(1);
    expect(standingVoltkinTvs(w).length).toBe(ignitionAccepted(w));
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1;
    crossEdge(w);
    expect(liveVoltkins(w), 'a welded TV re-summons like any other').toBe(1);
  });

  it('⭐ A4 (RE-PINNED S195 B-31) — a 12-shape blob (two triangle tails on one square spine) is ONE TV, not two (⚠ MINE)', () => {
    const w = twoSeat();
    const sq = [0, 1, 2, 3].map((i) => addShape(w, P0, SparkType.Square, 300 + i * 30, 500));
    for (let i = 0; i < 3; i++) connect(w, sq[i]!, sq[i + 1]!);
    const ta = [0, 1, 2, 3].map((i) => addShape(w, P0, SparkType.Triangle, 420 + i * 30, 500));
    connect(w, sq[3]!, ta[0]!);
    for (let i = 0; i < 3; i++) connect(w, ta[i]!, ta[i + 1]!);
    const tb = [0, 1, 2, 3].map((i) => addShape(w, P0, SparkType.Triangle, 270 - i * 30, 500));
    connect(w, sq[0]!, tb[0]!);
    for (let i = 0; i < 3; i++) connect(w, tb[i]!, tb[i + 1]!);
    expect(findAllVoltkinChainsCanonical(w).length, 'fixture: the walk sees two 8-paths').toBe(2);
    expect(standingVoltkinTvs(w).length, 'overlapping paths are one tower').toBe(1);
    expect(standingVoltkinTvs(w).length).toBe(ignitionAccepted(w));
    // …and it is the FIRST path in the canonical (sorted-ids) order — the spine plus tail A — on every sim.
    expect(standingVoltkinTvs(w)[0]!.members).toEqual([...sq, ...ta].map((p) => p.id));
    // The whole blob summons exactly ONE Voltkin at the edge.
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1;
    crossEdge(w);
    expect(liveVoltkins(w)).toBe(1);
  });

  /* ══ S195 B-31 — the hole that closing isolation opened, pinned shut ═══════════════════════════════ */

  it('⛔ B-31 — a shape welded onto a standing TV whose Voltkin LIVES does not re-fire its recipe (the S161 "dozen Voltkins" door)', () => {
    const w = twoSeat();
    const prims = chain8(w, Array(8).fill(P0), 300);
    const first = voltkinPredicate(w, prims[3]!.pos);
    expect(first, 'the fresh TV ignites').not.toBeNull();
    dispatchVoltkinSpawn(w, first!.triggererPlayerId, first!.targetPos); // its Voltkin is on the board
    expect(liveVoltkins(w)).toBe(1);
    // Now weld a shape onto the standing TV: the BOND_FORMED lands within AUTO_BOND_RADIUS of a member.
    const weld = addShape(w, P0, SparkType.Circle, prims[3]!.pos.x, prims[3]!.pos.y + 30);
    connect(w, weld, prims[3]!);
    expect(voltkinPredicate(w, weld.pos), 'the TV already has its Voltkin — nothing to mint').toBeNull();
    expect(standingVoltkinTvs(w).length, 'it is still one standing TV').toBe(1);
    // NEGATIVE CONTROL: the same weld event on a TV whose Voltkin has FALLEN mints its replacement.
    w.creatures.clear();
    expect(voltkinPredicate(w, weld.pos)).not.toBeNull();
  });

  it('⛔ B-31 — the cinematic PLAYING now is a claim too: a weld during the emerge gap mints nothing', () => {
    const w = twoSeat();
    const prims = chain8(w, Array(8).fill(P0), 300);
    const first = voltkinPredicate(w, prims[3]!.pos);
    expect(first).not.toBeNull();
    // `GODLY_TRIGGER` sets `currentCinematicEvent`; `pendingCreatureSpawn` is scheduled a frame later.
    dispatch(w, { type: 'GODLY_TRIGGER', event: { godlyId: 'voltkin', triggererPlayerId: P0, targetComponentPrimitiveIds: first!.targetComponentPrimitiveIds, targetPos: first!.targetPos, triggerTick: w.tick } } as never);
    expect(w.currentCinematicEvent?.godlyId).toBe('voltkin');
    expect(w.pendingCreatureSpawn).toBeNull();
    const weld = addShape(w, P0, SparkType.Circle, prims[3]!.pos.x, prims[3]!.pos.y + 30);
    connect(w, weld, prims[3]!);
    expect(voltkinPredicate(w, weld.pos), 'the summon is on its way — no second one').toBeNull();
    // By IDENTITY, not by a positional claim: the census still lists the TV as owed (nothing is scheduled),
    // and a SECOND TV of the same seat closed in this gap is still owed too — the three-TV rig depends on it.
    expect(tvsOwedAVoltkin(w, standingVoltkinTvs(w))).toEqual([0]);
    const other = chain8(w, Array(8).fill(P0), 600);
    expect(voltkinPredicate(w, other[3]!.pos), 'another TV in the same gap still ignites').not.toBeNull();
  });

  it('⭐⭐ B-31 REACH — a NEW TV built already welded fires through the real matcher core, once, for its seat', () => {
    const w = twoSeat();
    // A seat-0 shape already standing where the TV's first square will land next to it.
    const pre = addShape(w, P0, SparkType.Circle, 170, 300);
    const prims = chain8(w, Array(8).fill(P0), 300);
    connect(w, pre, prims[0]!); // born welded
    // The BOND_FORMED the build emitted — the real matcher reads `world.effects`.
    w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: prims[0]!.pos.x, y: prims[0]!.pos.y }, bondCount: 8 } as never);
    const fired = runGodlyMatcherCore(w, { lastMatcherTick: 0 });
    expect(fired, 'merge-owner call: a new TV built already welded spawns its first Voltkin').not.toBeNull();
    expect(fired!.godlyId).toBe('voltkin');
    expect(fired!.triggererPlayerId).toBe(P0);
    expect(w.activeCinematicPlayerId).toBe(P0);
    // A second topology change on the same TV, same frame or next: the recipe does not fire again.
    w.effects.length = 0;
    w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: prims[5]!.pos.x, y: prims[5]!.pos.y }, bondCount: 1 } as never);
    expect(runGodlyMatcherCore(w, { lastMatcherTick: 0 })).toBeNull();
    expect(w.pendingCinematics.length).toBe(0);
  });

  it('A2 — every blueprint stamped alone: census count == ignition-accepted count (the TV is 1)', () => {
    for (const id of ALL_BLUEPRINT_IDS) {
      const w = twoSeat();
      const bank = makeCastleBank();
      for (const [t, n] of blueprintBill(id)) bank[t as number] = (bank[t as number] ?? 0) + n * 2;
      w.castleBanks.set(P0, bank);
      let site: { x: number; y: number } | null = null;
      for (let x = 150; x <= 900 && site === null; x += 30) {
        for (let y = 150; y <= 950 && site === null; y += 30) {
          if (stampRefusalAt(w, { x, y }, P0, id) === null) site = { x, y };
        }
      }
      if (site === null) continue;
      dispatch(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre: site } as never);
      expect(standingVoltkinTvs(w).length, id).toBe(ignitionAccepted(w));
      if (id === 'voltkin') expect(standingVoltkinTvs(w).length).toBe(1);
    }
  });

  it('A3 / L1 — a 4/4 tie: ignition and census both give it to the LOWEST seat', () => {
    const w = twoSeat();
    const prims = chain8(w, [P1, P1, P1, P1, P0, P0, P0, P0], 300);
    const pred = voltkinPredicate(w, prims[0]!.pos);
    expect(pred).not.toBeNull();
    expect(pred!.triggererPlayerId).toBe(P0);
    expect(standingVoltkinTvs(w)[0]!.owner).toBe(P0);
    // …so the ignition Voltkin, still alive at the edge, holds its TV: no second one for anybody.
    dispatchVoltkinSpawn(w, pred!.triggererPlayerId, pred!.targetPos);
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1;
    crossEdge(w);
    expect(liveVoltkins(w)).toBe(1);
  });
});
