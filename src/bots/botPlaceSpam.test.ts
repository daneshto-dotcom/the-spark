/**
 * SPARK — ⭐ S194 (T7) — A BOT NEVER SENDS A PLACE THE REDUCER WILL REFUSE.
 *
 * The S193 re-audit's carry-forward: *"bots ~40 territory-refused PLACE/s in normal play (pre-existing
 * retry spam)"*. Measured on the real host tick before the fix (three BALANCED bots, 300 s, seeds
 * 0xb07 / 0xbeef): **13 226 / 19 741 / 19 954** refused PLACE_PRIMITIVEs at MID / HARD / IMBA — 44 / 66 /
 * 66 a second across the table — and **99.9 % of them in FIGHT**, where `canBuildNow` is false for the
 * whole board. The HAUL arm re-sent on every arrival, re-routed to an equally illegal fallback, and
 * repeated until the 15 s stuck guard dropped the shape.
 *
 * Three causes, three fixes, all bot-side (host-only planning; the reducers are untouched):
 *   1. a fetch begun in BUILD finished in FIGHT and a loose haul could START in FIGHT — the brain's loose
 *      block (`looseOk`) and the controller's TO_SPARK validation now end at the whistle (a carry is banked
 *      at every edge by `bankCarriedSparksAtPhaseEdge` anyway, so nothing is lost);
 *   2. the HAUL arm sent first and asked afterwards — it now asks `placeRefusedAt` (the reducer's own two
 *      gates) BEFORE sending, and a refusal it did not foresee backs off `PLACE_RETRY_BACKOFF_TICKS`;
 *   3. the same class on the bank: a saving bot re-sent a no-op PULL_FROM_BANK into a full porch every
 *      think (426 HARD / 428 IMBA per 300 s) — `porchHasFreeSlot` asks the reducer's slot rule first.
 *
 * After: **0 / 0 / 0** refused PLACEs, **0** no-op pulls, and the bots place as much as before
 * (26 / 34 / 42 landed vs 26 / 34 / 42).
 */

import { afterEach, describe, expect, it } from 'vitest';

import { CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_COLORS, SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SPAWNER_RADIUS } from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import type { Controls } from '../input/controls.ts';
import { canBuildNow } from '../state/buildLegality.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { runGodlyMatcherCore, type GodlyMatcherCursor } from '../state/godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { mulberry32 } from '../state/rng.ts';
import { dispatch, makeWorld, type GameAction, type World } from '../state/world.ts';
import { asPlayerId } from '../types.ts';
import { bankCount } from '../state/castleBank.ts';
import { BotController, placeRefusedAt } from './botController.ts';
import type { BotDifficulty } from './botTypes.ts';

afterEach(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
});

const stub = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function startMatch(): World {
  const w = makeWorld(0xb07);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s] })),
    botSeats: [1, 2, 3],
  });
  return w;
}

interface PlaceTally {
  sent: number;
  landed: number;
  refusedBuild: number;
  refusedFight: number;
  /** Shapes bots were carrying going into a FIGHT→BUILD edge (held through the FIGHT). */
  heldThroughFight: number;
  /** PLACEs that landed in the first 60 ticks of each BUILD that followed a FIGHT. */
  landedAtBuildOpen: number;
  /** DROP_SPARK sends during FIGHT (the stuck guard giving a shape up). */
  fightDrops: number;
  /** PICKUP_SPARK / PULL_FROM_BANK sends outside BUILD (a loose haul started where none can land). */
  fightFetches: number;
  /** PULL_FROM_BANK sends the reducer turned into a no-op (bank unchanged). */
  pullNoops: number;
  /** Bot-ticks spent carrying a shape outside BUILD. */
  fightCarryTicks: number;
}

/** Three bots on the real frame lifecycle (`runHostTick` → matcher → effects wipe), every PLACE classified. */
function runTally(tier: BotDifficulty, seconds: number): PlaceTally {
  const w = startMatch();
  const bots = [1, 2, 3].map(
    (s, i) => new BotController(asPlayerId(s), tier, mulberry32(((0xbeef ^ ((i + 1) * 0xb07b07)) >>> 0) || 1), 4),
  );
  const t: PlaceTally = { sent: 0, landed: 0, refusedBuild: 0, refusedFight: 0, heldThroughFight: 0, landedAtBuildOpen: 0, fightDrops: 0, fightFetches: 0, pullNoops: 0, fightCarryTicks: 0 };
  let buildOpenedAt = -1;
  const send = (a: GameAction): void => {
    if (a.type === 'PLACE_PRIMITIVE') {
      t.sent++;
      const before = w.primitives.size;
      dispatch(w, a);
      if (w.primitives.size > before) t.landed++;
      else if (w.matchPhase === 'BUILD') t.refusedBuild++;
      else t.refusedFight++;
      return;
    }
    if (a.type === 'DROP_SPARK' && w.matchPhase !== 'BUILD') t.fightDrops++;
    if ((a.type === 'PICKUP_SPARK' || a.type === 'PULL_FROM_BANK') && w.matchPhase !== 'BUILD') t.fightFetches++;
    if (a.type === 'PULL_FROM_BANK') {
      const before = bankCount(w.castleBanks, a.playerId);
      dispatch(w, a);
      if (bankCount(w.castleBanks, a.playerId) === before) t.pullNoops++;
      return;
    }
    dispatch(w, a);
  };
  const deps = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stub,
    botManager: { tick(world: World): void { for (const b of bots) b.tick(world, send); } },
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
  const st = makeHostTickState(w);
  const cursor: GodlyMatcherCursor = { lastMatcherTick: -1 };
  const phase = (): string => w.matchPhase;
  const carryingNow = (): number => [1, 2, 3].filter((s) => w.players.get(asPlayerId(s))?.kind === 'Carrying').length;
  let openBase = -1;
  for (let i = 0; i < 60 * seconds; i++) {
    const was = phase();
    const carryingBefore = carryingNow();
    const landedBefore = t.landed;
    runHostTick(w, deps, st);
    if (w.gameState === 'PLAYING') runGodlyMatcherCore(w, cursor);
    w.effects.length = 0;
    if (phase() !== 'BUILD') t.fightCarryTicks += carryingNow();
    // The bots tick INSIDE the host tick, after the phase clock: on the edge tick a held shape is placed
    // in the same tick BUILD opens. So read who was carrying going INTO the edge, and how many PLACEs
    // landed from the edge tick through the next 60.
    if (was !== 'BUILD' && phase() === 'BUILD') {
      t.heldThroughFight += carryingBefore;
      buildOpenedAt = i;
      openBase = landedBefore;
    }
    if (buildOpenedAt >= 0 && (i === buildOpenedAt + 60 || i === 60 * seconds - 1)) {
      t.landedAtBuildOpen += t.landed - openBase;
      buildOpenedAt = -1;
    }
  }
  return t;
}

describe('⭐ S194 T7 — REACH: no refused PLACE stream in a real bots match', () => {
  for (const tier of ['MID', 'HARD', 'IMBA'] as const) {
    it(`${tier}: zero refused PLACEs over 300 s, and the bots still build`, () => {
      const t = runTally(tier, 300);
      console.log(`[S194 T7] ${tier}: ${JSON.stringify(t)}`);
      expect(t.refusedFight, 'refused in FIGHT').toBe(0);
      expect(t.refusedBuild, 'refused in BUILD').toBe(0);
      // ⚠ NEGATIVE (anti-vacuity): a fix that stopped bots placing would also read zero refusals.
      expect(t.landed, 'loose shapes landed').toBeGreaterThanOrEqual(20);
      expect(t.sent).toBe(t.landed);
      expect(t.fightDrops, 'shapes dropped during FIGHT').toBe(0);
      expect(t.fightFetches, 'pickups / pulls sent outside BUILD').toBe(0);
      expect(t.fightCarryTicks, 'bot-ticks carrying outside BUILD').toBe(0);
      expect(t.pullNoops, 'no-op pulls into a full porch').toBe(0);
    }, 60_000);
  }

  it('⚠ NEGATIVE (anti-vacuity): the bots still PULL and still fetch in BUILD', () => {
    const t = runTally('HARD', 300);
    expect(t.landed).toBeGreaterThanOrEqual(20);
    expect(t.heldThroughFight, 'nobody carries into a FIGHT→BUILD edge').toBe(0);
  }, 60_000);
});

describe('⭐ S194 T7 — placeRefusedAt is the reducer\'s two position gates', () => {
  it('BUILD: agrees with canBuildNow everywhere outside the spawner disc; the disc is always refused', () => {
    const w = startMatch();
    w.gameState = 'PLAYING';
    w.matchPhase = 'BUILD';
    const seat = asPlayerId(1);
    let legal = 0;
    for (let x = 20; x < CANVAS_WIDTH; x += 40) {
      for (let y = 20; y < CANVAS_HEIGHT; y += 40) {
        const pos = { x, y };
        const inDisc = Math.hypot(x - SPAWNER_CENTER_X, y - SPAWNER_CENTER_Y) < SPAWNER_RADIUS;
        expect(placeRefusedAt(w, pos, seat), `${x},${y}`).toBe(inDisc || !canBuildNow(w, pos, seat));
        if (!placeRefusedAt(w, pos, seat)) legal++;
      }
    }
    expect(legal, 'some ground is legal for seat 1 in BUILD').toBeGreaterThan(10);
    expect(placeRefusedAt(w, { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y }, seat)).toBe(true);
  });

  it('⚠ NEGATIVE: in FIGHT every point is refused (the 99.9 % case)', () => {
    const w = startMatch();
    w.gameState = 'PLAYING';
    w.matchPhase = 'BUILD';
    const seat = asPlayerId(1);
    let legalInBuild: { x: number; y: number } | null = null;
    for (let x = 20; x < CANVAS_WIDTH && legalInBuild === null; x += 40) {
      for (let y = 20; y < CANVAS_HEIGHT; y += 40) if (!placeRefusedAt(w, { x, y }, seat)) { legalInBuild = { x, y }; break; }
    }
    expect(legalInBuild).not.toBeNull();
    w.matchPhase = 'FIGHT';
    expect(placeRefusedAt(w, legalInBuild!, seat)).toBe(true);
  });
});
