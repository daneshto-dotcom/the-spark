/**
 * SPARK — S156 P5: HOW FAST DOES A BOT RAISE ITS FIRST TOWER?
 *
 * Owner ruling: *"bot in hard and imba should build the first tower whenever the tower they want to
 * build is available!!! can even be 30 sec!"*
 *
 * ⛔ THIS FILE IS A MEASUREMENT BEFORE IT IS AN ASSERTION, and that ordering is deliberate. S155
 * spent a whole priority on this exact question, produced two "fixes" that both measured WORSE
 * (HARD 2 towers → 1) and reverted them, because the work was driven by a plausible causal story
 * instead of a number. So this harness prints the first-tower tick for every tier on the REAL phase
 * clock and the REAL four-seat board, and the assertions below are pinned to what was actually
 * observed — never to what a change was hoped to do.
 *
 * The fixture is the one S155 paid three corrections to arrive at:
 *   • NO phase pinning — a real match alternates BUILD 90 s / FIGHT 45 s, and towers are BUILD-only.
 *   • FOUR seats — the owner plays VS-BOTS with three bots, and four seats split one quarry.
 *   • Every opponent is a REAL bot that builds, so the rng-gated SEVER branch actually fires and the
 *     bot under test does not sail unopposed down to its economy branches.
 *
 * ⚠ AND THE SEAT UNDER TEST IS THE SEAT THAT HOLDS THE TIER. `BotManager` assigns tiers to
 * `botSeats` IN ORDER, so measuring seat 1 while the tier sits at seat 2 measures a different bot
 * entirely — which is precisely how S155 spent three rounds describing a NOOB behaving as designed.
 * `tierAt` below makes that binding explicit rather than assumed.
 */

import { describe, expect, it } from 'vitest';
import { PHASE_DURATION_TICKS, PLAYER_COLORS } from '../constants.ts';
import { mulberry32 } from '../state/rng.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asPlayerId, type PlayerId } from '../types.ts';
import type { Controls } from '../input/controls.ts';
import { BotManager } from './botManager.ts';
import { BOT_CONFIGS } from './botConfig.ts';
import type { BotDifficulty } from './botTypes.ts';

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

/** Seat 0 is the (idle) human; bots occupy 1..3 in the order the tiers are listed. */
const BOT_SEATS = [1, 2, 3] as const;
function tierAt(tiers: readonly BotDifficulty[], seat: PlayerId): BotDifficulty {
  const index = BOT_SEATS.indexOf((seat as unknown as number) as 1 | 2 | 3);
  return tiers[index];
}

/** A tower's primitives are STAMPED, which is what `origin !== null` means. */
function hasTower(world: World, seat: PlayerId): boolean {
  for (const p of world.primitives.values()) {
    if (p.placedBy === seat && p.origin !== null) return true;
  }
  return false;
}

interface Measurement {
  readonly firstTowerTick: number;
  readonly towerPrims: number;
  readonly phasesSeen: readonly string[];
}

/**
 * Run a real four-seat bots match for `seconds` and report when `seat` first stamped a structure.
 * Returns `firstTowerTick: -1` when it never did.
 */
function measure(
  tiers: readonly [BotDifficulty, BotDifficulty, BotDifficulty],
  seat: PlayerId,
  seconds = 300,
): Measurement {
  const w = makeWorld(0xb07);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s] })),
    botSeats: [...BOT_SEATS],
  });

  const m = new BotManager([...tiers], 0xbeef);
  const d = deps();
  const st = makeHostTickState(w);

  let firstTowerTick = -1;
  const phasesSeen = new Set<string>();
  for (let t = 0; t < 60 * seconds; t++) {
    m.tick(w);
    runHostTick(w, d, st);
    phasesSeen.add(w.matchPhase);
    if (firstTowerTick < 0 && hasTower(w, seat)) firstTowerTick = w.tick;
  }

  const towerPrims = [...w.primitives.values()].filter(
    (p) => p.placedBy === seat && p.origin !== null,
  ).length;
  return { firstTowerTick, towerPrims, phasesSeen: [...phasesSeen] };
}

describe('S156 P5 — first-tower speed on the real clock', () => {
  it('⭐ HARD raises its first tower inside the OPENING BUILD phase', () => {
    const seat = asPlayerId(1);
    const tiers = ['HARD', 'MID', 'IMBA'] as const;
    expect(tierAt(tiers, seat)).toBe('HARD'); // the seat/tier binding, asserted not assumed

    const r = measure(tiers, seat);
    // Anti-vacuity: the clock really ran through both phases.
    expect(r.phasesSeen).toContain('BUILD');
    expect(r.phasesSeen).toContain('FIGHT');

    console.log(`[S156 P5] HARD first tower tick = ${r.firstTowerTick} (${r.towerPrims} stamped prims)`);
    // MEASURED: 10 370 before the rush, 3 746 after. Pinned to the OPENING BUILD phase rather than
    // to 3 746 itself — the exact tick is an artifact of this seed, but "inside the first BUILD"
    // is the owner's ruling made checkable, and it is what regressed for the whole of S154/S155.
    expect(r.firstTowerTick, 'HARD raised a tower at all').toBeGreaterThan(0);
    expect(
      r.firstTowerTick,
      `HARD's first tower must land inside the opening BUILD phase (<= ${PHASE_DURATION_TICKS})`,
    ).toBeLessThanOrEqual(PHASE_DURATION_TICKS);
  });

  it('⭐ IMBA raises its first tower inside the OPENING BUILD phase', () => {
    const seat = asPlayerId(3);
    const tiers = ['HARD', 'MID', 'IMBA'] as const;
    expect(tierAt(tiers, seat)).toBe('IMBA');

    const r = measure(tiers, seat);
    console.log(`[S156 P5] IMBA first tower tick = ${r.firstTowerTick} (${r.towerPrims} stamped prims)`);
    // MEASURED: NEVER inside five sim-minutes before the rush; 3 610 after. The "never" is why this
    // test exists at all — S155 reported IMBA at ~17 900 from a different seat, and the tier-to-seat
    // binding asserted above is what makes these two numbers comparable.
    expect(r.firstTowerTick, 'IMBA raised a tower at all').toBeGreaterThan(0);
    expect(
      r.firstTowerTick,
      `IMBA's first tower must land inside the opening BUILD phase (<= ${PHASE_DURATION_TICKS})`,
    ).toBeLessThanOrEqual(PHASE_DURATION_TICKS);
  });

  it('MID is the difficulty floor between NOOB and HARD — it does not rush', () => {
    const seat = asPlayerId(2);
    const tiers = ['HARD', 'MID', 'IMBA'] as const;
    expect(tierAt(tiers, seat)).toBe('MID');

    const r = measure(tiers, seat);
    console.log(`[S156 P5] MID first tower tick = ${r.firstTowerTick} (${r.towerPrims} stamped prims)`);
    // The ruling named HARD and IMBA only. MID keeps the S154 duty cycle, so it stays the floor
    // between a NOOB that never builds towers and a HARD that rushes one inside the first BUILD.
    expect(BOT_CONFIGS.MID.rushesFirstTower).toBe(false);
    expect(BOT_CONFIGS.HARD.rushesFirstTower).toBe(true);
    expect(BOT_CONFIGS.IMBA.rushesFirstTower).toBe(true);
    expect(BOT_CONFIGS.NOOB.rushesFirstTower).toBe(false);
  });

  it('NOOB never stamps a structure', () => {
    const seat = asPlayerId(1);
    const tiers = ['NOOB', 'MID', 'IMBA'] as const;
    expect(tierAt(tiers, seat)).toBe('NOOB');

    const r = measure(tiers, seat, 120);
    console.log(`[S156 P5] NOOB first tower tick = ${r.firstTowerTick}`);
    expect(r.firstTowerTick).toBe(-1);
  });
});
