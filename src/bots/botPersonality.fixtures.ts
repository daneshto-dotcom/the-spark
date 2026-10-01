/**
 * SPARK — ⭐ S193 (R193-AI) — the bot-vs-bot SIGNATURE harness, shared by `botPersonality.test.ts`.
 *
 * A real four-seat vs-bots match on the REAL host tick (`runHostTick`, the phase clock unpinned — the
 * fixture `firstTowerSpeed.test.ts` paid three S155 corrections to arrive at), with the bots built the
 * way `BotManager` builds them: same seat numbering, same per-seat mulberry32 seed, same RANDOM
 * resolution. The only difference is that each controller's `send` is wrapped so the harness can see
 * what the bot DID — the stamps that landed, the feeds that landed, the first raid — rather than
 * inferring it from the board afterwards.
 *
 * ⚠ The wrap is observation only: it calls `dispatch(world, action)` exactly as `BotManager.tick` does,
 * in the same order, so the world it produces is the world `BotManager` would produce (asserted in the
 * test by hashing both).
 */

import { ALL_SPARK_TYPES, PLAYER_COLORS } from '../constants.ts';
import { bankAdd } from '../state/castleBank.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import type { Controls } from '../input/controls.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { mulberry32 } from '../state/rng.ts';
import { hashWorldStateFull } from '../state/stateHashFull.ts';
import { runGodlyMatcherCore, type GodlyMatcherCursor } from '../state/godlyMatcherCore.ts';
import { dispatch, makeWorld, type GameAction, type World } from '../state/world.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { asPlayerId } from '../types.ts';
import { BotController } from './botController.ts';
import { BotManager } from './botManager.ts';
import { DEFENCE_ROLES, towerRoleOf } from './botPersonality.ts';
import { isRaceTowerId } from '../state/raceTowerIds.ts';
import {
  resolvePersonality,
  type BotDifficulty,
  type BotPersonality,
  type BotPersonalityChoice,
} from './botTypes.ts';

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

export const SIG_WORLD_SEED = 0xb07;
export const SIG_BOT_SEED = 0xbeef;
export const BOT_SEATS = [1, 2, 3] as const;

function makeDeps(botManager: unknown = null): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stubControls,
    botManager,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function startMatch(): World {
  const w = makeWorld(SIG_WORLD_SEED);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s] })),
    botSeats: [...BOT_SEATS],
  });
  return w;
}

/** The pre-S193 harness exactly: a bare `BotManager(tiers, seed)` on the real host tick. Returns the wide hash. */
export function runManagerMatch(
  tiers: readonly BotDifficulty[],
  seconds: number,
  personalities?: readonly BotPersonalityChoice[],
): number {
  const w = startMatch();
  const m = personalities === undefined
    ? new BotManager([...tiers], SIG_BOT_SEED)
    : new BotManager([...tiers], SIG_BOT_SEED, personalities);
  const d = makeDeps();
  const st = makeHostTickState(w);
  for (let t = 0; t < 60 * seconds; t++) {
    m.tick(w);
    runHostTick(w, d, st);
  }
  return hashWorldStateFull(w);
}

export interface SeatSignature {
  readonly seat: number;
  readonly personality: BotPersonality;
  /** Every structure that LANDED, in order. */
  readonly stamps: readonly GodlyId[];
  /** Tick of the first landed stamp, -1 if none. */
  readonly firstStampTick: number;
  /** Feeds that LANDED (a shape left the bank and a unit was born). */
  readonly feeds: number;
  /** Tick of the first landed feed, -1 if none — the "first unit I paid for". */
  readonly firstFeedTick: number;
  /** Tick of the first RAID_TARGET sent, -1 if none. */
  readonly firstRaidTick: number;
  /** Seats this bot sent raids at (the owner of the struck bond), in order. */
  readonly raidVictims: readonly number[];
  /** DEFENCE stamps / all stamps (0 when none). */
  readonly defenceRatio: number;
  /** Loose shapes placed. */
  readonly loosePlaced: number;
}

export interface MatchSignature {
  readonly seats: readonly SeatSignature[];
  readonly hash: number;
}

/** Run the match and record what every bot DID. */
export function runSignatureMatch(
  tiers: readonly BotDifficulty[],
  personalities: readonly BotPersonalityChoice[],
  seconds: number,
): MatchSignature {
  const w = startMatch();
  const total = tiers.length + 1;
  const rec = tiers.map((_, i) => ({
    stamps: [] as GodlyId[],
    firstStampTick: -1,
    feeds: 0,
    firstFeedTick: -1,
    firstRaidTick: -1,
    raidVictims: [] as number[],
    loosePlaced: 0,
    personality: resolvePersonality(personalities[i] ?? 'BALANCED', SIG_BOT_SEED, i + 1),
  }));
  const controllers = tiers.map((tier, i) => {
    const rng = mulberry32(((SIG_BOT_SEED ^ ((i + 1) * 0xb07b07)) >>> 0) || 1);
    return new BotController(asPlayerId(i + 1), tier, rng, total, rec[i]!.personality);
  });
  const stamped = (): number => {
    let n = 0;
    for (const p of w.primitives.values()) if (p.origin !== null) n++;
    return n;
  };
  const sendFor = (i: number) => (action: GameAction): void => {
    const r = rec[i]!;
    if (action.type === 'BUILD_BLUEPRINT') {
      const before = stamped();
      dispatch(w, action);
      if (stamped() > before) {
        r.stamps.push(action.blueprintId);
        if (r.firstStampTick < 0) r.firstStampTick = w.tick;
      }
      return;
    }
    if (action.type === 'FEED_TOWER') {
      const before = w.creatures.size;
      dispatch(w, action);
      if (w.creatures.size > before) {
        r.feeds++;
        if (r.firstFeedTick < 0) r.firstFeedTick = w.tick;
      }
      return;
    }
    if (action.type === 'RAID_TARGET') {
      if (r.firstRaidTick < 0) r.firstRaidTick = w.tick;
      if (action.target.kind === 'bond') {
        const b = w.bonds.get(action.target.id);
        const owner = b === undefined ? undefined : w.primitives.get(b.aId)?.placedBy;
        if (owner !== undefined) r.raidVictims.push(owner as unknown as number);
      }
      dispatch(w, action);
      return;
    }
    if (action.type === 'PLACE_PRIMITIVE') {
      const before = w.primitives.size;
      dispatch(w, action);
      if (w.primitives.size > before) r.loosePlaced++;
      return;
    }
    dispatch(w, action);
  };
  const sends = controllers.map((_, i) => sendFor(i));
  /*
   * ⛔ THE FRAME LIFECYCLE, NOT JUST THE TICK — and this is what the first version of this harness got
   * wrong. Towers IGNITE in `runGodlyMatcherCore`, which `main.ts` (via `godlyOrchestration`) and the
   * worker (`workerSim.ts:539`) run AFTER `runHostTick`, and `world.effects` is wiped after it. A
   * harness that only calls `runHostTick` stamps towers that never become spawners, so nothing can be
   * FED and every feed knob reads zero (measured: 0 feeds in all 15 cells). The bots ride
   * `deps.botManager`, i.e. they tick INSIDE the host tick at the production call site
   * (`hostTick.ts` "VS-BOTS: bots think + act"), not before it.
   */
  const manager = {
    tick(world: World): void {
      for (let i = 0; i < controllers.length; i++) controllers[i]!.tick(world, sends[i]!);
    },
  };
  const d = makeDeps(manager);
  const st = makeHostTickState(w);
  const cursor: GodlyMatcherCursor = { lastMatcherTick: -1 };
  for (let t = 0; t < 60 * seconds; t++) {
    runHostTick(w, d, st);
    if (w.gameState === 'PLAYING') runGodlyMatcherCore(w, cursor);
    w.effects.length = 0;
  }
  return {
    hash: hashWorldStateFull(w),
    seats: rec.map((r, i) => {
      const def = r.stamps.filter((id) => {
        const role = towerRoleOf(id);
        return role !== null && DEFENCE_ROLES.has(role);
      }).length;
      return {
        seat: i + 1,
        personality: r.personality,
        stamps: r.stamps,
        firstStampTick: r.firstStampTick,
        feeds: r.feeds,
        firstFeedTick: r.firstFeedTick,
        firstRaidTick: r.firstRaidTick,
        raidVictims: r.raidVictims,
        defenceRatio: r.stamps.length === 0 ? 0 : def / r.stamps.length,
        loosePlaced: r.loosePlaced,
      };
    }),
  };
}

/**
 * The same frame lifecycle with the REAL `BotManager` in `deps.botManager` and no instrumentation — the
 * oracle that proves `runSignatureMatch`'s wrapped controllers are observation only.
 */
export function runFrameMatchWithManager(
  tiers: readonly BotDifficulty[],
  personalities: readonly BotPersonalityChoice[],
  seconds: number,
): number {
  const w = startMatch();
  const d = makeDeps(new BotManager([...tiers], SIG_BOT_SEED, personalities));
  const st = makeHostTickState(w);
  const cursor: GodlyMatcherCursor = { lastMatcherTick: -1 };
  for (let t = 0; t < 60 * seconds; t++) {
    runHostTick(w, d, st);
    if (w.gameState === 'PLAYING') runGodlyMatcherCore(w, cursor);
    w.effects.length = 0;
  }
  return hashWorldStateFull(w);
}

export interface LockResult {
  /** `endgameBuildLocked` rejects during the locked window. */
  readonly lockRejects: number;
  /** FEED_TOWER sends that landed during the locked window. */
  readonly feedsLanded: number;
  /** Seats that owned a feedable spawner when the lock fell. */
  readonly seatsWithTower: number;
  /** Is any bot still holding a shape when the window ends? (It can never place it.) */
  readonly carryingAtEnd: boolean;
}

/**
 * ⭐ S193 audit HIGH — the ENDGAME BUILD LOCK on the real frame lifecycle: `preSeconds` of normal play,
 * then `waveNumber` forced to 27 (`BUILD_LOCK_FROM_WAVE`) for `lockSeconds`. The auditor's repro
 * (`.tmp-audit/zzAuditLock.test.ts`), made a shared fixture.
 */
export function runLockMatch(
  tier: BotDifficulty,
  personality: BotPersonalityChoice,
  preSeconds: number,
  lockSeconds: number,
  lockWave: number,
  /**
   * Bank one shape of every type per bot seat as the lock falls. The quarry is nearly dry by then on a
   * four-bot board (measured: 3 free sparks, gatherers SEEKING), so without this the window measures the
   * empty quarry (canon §9d: not a defect) instead of whether the bot FEEDS what it holds.
   */
  seedBank = true,
  /**
   * `'buildStart'`: the lock falls as a BUILD phase opens (the realistic case). `'midHaul'`: it falls
   * on the first tick a bot is CARRYING a shape — the controller's drop arm, which the brain-side skip
   * alone never exercises because a locked bot no longer picks anything up.
   */
  lockWhen: 'buildStart' | 'midHaul' = 'buildStart',
): LockResult {
  const w = startMatch();
  let locked = false;
  let feedsLanded = 0;
  const controllers = BOT_SEATS.map((s, i) => {
    const rng = mulberry32(((SIG_BOT_SEED ^ ((i + 1) * 0xb07b07)) >>> 0) || 1);
    return new BotController(asPlayerId(s), tier, rng, BOT_SEATS.length + 1,
      resolvePersonality(personality, SIG_BOT_SEED, i + 1));
  });
  const send = (a: GameAction): void => {
    if (a.type === 'FEED_TOWER' && locked) {
      const before = w.creatures.size;
      dispatch(w, a);
      if (w.creatures.size > before) feedsLanded++;
      return;
    }
    dispatch(w, a);
  };
  const d = makeDeps({ tick(world: World): void { for (const c of controllers) c.tick(world, send); } });
  const st = makeHostTickState(w);
  const cursor: GodlyMatcherCursor = { lastMatcherTick: -1 };
  const step = (): void => {
    runHostTick(w, d, st);
    if (w.gameState === 'PLAYING') runGodlyMatcherCore(w, cursor);
    w.effects.length = 0;
  };
  for (let t = 0; t < 60 * preSeconds; t++) step();
  // The lock falls at the START of a BUILD phase, as it does in play (*"in the build phase of 27"*):
  // gatherers shelter during FIGHT, so a lock window that opens mid-FIGHT measures no income at all.
  const anyCarrying = (): boolean =>
    BOT_SEATS.some((s) => w.players.get(asPlayerId(s))?.kind === 'Carrying');
  if (lockWhen === 'midHaul') {
    while (!anyCarrying()) step();
  } else {
    while (w.matchPhase === 'BUILD') step();
    while (w.matchPhase !== 'BUILD') step();
  }
  let seatsWithTower = 0;
  for (const s of BOT_SEATS) {
    for (const sp of w.creatureSpawners.values()) {
      if ((sp.ownerPlayerId as unknown as number) === s && (sp.recipeId === 'goblinTower' || isRaceTowerId(sp.recipeId))) {
        seatsWithTower++;
        break;
      }
    }
  }
  w.waveNumber = lockWave;
  locked = true;
  if (seedBank) for (const s of BOT_SEATS) for (const t of ALL_SPARK_TYPES) bankAdd(w.castleBanks, asPlayerId(s), t);
  const rej0 = w.diagnostics.rejectReasons.endgameBuildLocked;
  for (let t = 0; t < 60 * lockSeconds; t++) step();
  return {
    lockRejects: w.diagnostics.rejectReasons.endgameBuildLocked - rej0,
    feedsLanded,
    seatsWithTower,
    carryingAtEnd: anyCarrying(),
  };
}
