/**
 * SPARK — S189 LOW (b): **CASTLE REGEN IS A PERCENT OF THE SEAT'S OWN (UPGRADED) MAX.**
 *
 * R128 gave the regen as a percent of max (*"+1% hp reg"*). S187 made a seat's max
 * `CASTLE_MAX_HP + hpBonus` and moved the regen CEILING onto it, but the RATE stayed a percent of the
 * flat 2,500 — a keep that bought 250 HP healed at 25/s toward 2,750 instead of 1 % of 2,750.
 *
 * ⚠ A balance consequence, flagged at the function and in the canon notes: buying HP now also buys a
 * little regen. The un-upgraded ladder (25/30/35/40/45, pinned by `canon.test.ts`) is unchanged.
 *
 * Pinned: the arithmetic (integer, half-up at the new non-exact pools), REACH through the real host
 * tick after the REAL purchase reducers, a negative (an un-upgraded keep still regains 25), and
 * ⭐ MUTATION-TESTED — passing the flat `CASTLE_MAX_HP` again turns the REACH case red.
 */
import { describe, expect, it } from 'vitest';
import { dispatch, makeWorld, type World } from './world.ts';
import { castleRegenPerSecond, castleRegensOnTick } from './castleRegen.ts';
import { CASTLE_UPGRADE_PRICE, castleMaxHpFor } from './castleUpgrades.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import type { Controls } from '../input/controls.ts';
import { asPlayerId } from '../types.ts';
import {
  CASTLE_MAX_HP,
  CASTLE_MAX_REGEN_LEVEL,
  CASTLE_REGEN_UPGRADE_PRICE,
  PLAYER_COLORS,
} from '../constants.ts';

const P0 = asPlayerId(0);
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

function board(): World {
  const w = makeWorld(0xb189);
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
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  return w;
}

/** Buy `hpBuys` castle-HP points and regen level `regen` through the REAL reducers, then wound it. */
function keep(w: World, hpBuys: number, regen: number, hp: number): void {
  // ⚠ EXACTLY the purchases, never a round big number: 100,000 VP is past the win bar, and the first
  // draft of this fixture won the match on tick 1 — `gameState` went to WIN and regen never ran.
  w.scoreByPlayer.set(P0, hpBuys * CASTLE_UPGRADE_PRICE + regen * CASTLE_REGEN_UPGRADE_PRICE);
  for (let i = 0; i < hpBuys; i++) dispatch(w, { type: 'UPGRADE_CASTLE_STAT', playerId: P0, stat: 'hp' } as never);
  for (let i = 0; i < regen; i++) dispatch(w, { type: 'UPGRADE_CASTLE_REGEN', playerId: P0 } as never);
  const me = w.players.get(P0)!;
  expect(me.castleUpgrades.hpLevel, 'fixture: the HP purchases landed').toBe(hpBuys);
  expect(me.castleRegenLevel, 'fixture: the regen purchases landed').toBe(regen);
  me.castleHp = hp;
  expect(w.scoreByPlayer.get(P0), 'fixture: every point was spent').toBe(0);
}

/**
 * One regen pulse for seat 0, through the real host tick. Returns HP gained.
 *
 * ⚠ THE PLAYER IS RE-READ AFTER EVERY TICK: the host tick rebuilds `Player` objects (the carry-FSM
 * rebuilds `player.ts` warns about), so a reference held across a tick reads a stale copy — the first
 * draft of this helper measured a gain of 0 exactly that way.
 */
function onePulse(w: World): number {
  const d = deps();
  const s = makeHostTickState(w);
  // Stop one tick short of seat 0's regen tick, then run exactly that tick.
  while (!castleRegensOnTick(0, w.tick + 1)) runHostTick(w, d, s);
  const before = w.players.get(P0)!.castleHp;
  runHostTick(w, d, s);
  return w.players.get(P0)!.castleHp - before;
}

describe('S189 LOW (b) — castle regen reads the effective max', () => {
  it('the arithmetic: the base ladder is unchanged, and an upgraded pool is a percent of ITSELF', () => {
    // The canon's un-upgraded ladder, with and without the argument.
    expect([1, 2, 3, 4, 5].map((l) => castleRegenPerSecond(l))).toEqual([25, 30, 35, 40, 45]);
    expect([1, 2, 3, 4, 5].map((l) => castleRegenPerSecond(l, CASTLE_MAX_HP))).toEqual([25, 30, 35, 40, 45]);
    // 2,750 (one wave-1 HP point): 27.5 → 28 and 49.5 → 50, rounded half-up in exact integers.
    expect(castleRegenPerSecond(1, 2750)).toBe(28);
    expect(castleRegenPerSecond(5, 2750)).toBe(50);
    // Whole HP at every level for a spread of pools, and level 0 is still nothing.
    for (const pool of [2500, 2750, 3100, 5000, 9000]) {
      for (let l = 1; l <= CASTLE_MAX_REGEN_LEVEL; l++) {
        expect(Number.isInteger(castleRegenPerSecond(l, pool)), `${pool} L${l}`).toBe(true);
      }
      expect(castleRegenPerSecond(0, pool)).toBe(0);
    }
  });

  it('⭐⭐ REACH, THROUGH THE REAL HOST TICK: a keep that bought HP regains 1 % of ITS max', () => {
    const w = board();
    keep(w, 1, 1, 1000);
    const max = castleMaxHpFor(w.players.get(P0)!.castleUpgrades);
    expect(max, 'fixture: the purchase raised the pool').toBeGreaterThan(CASTLE_MAX_HP);
    const gained = onePulse(w);
    expect(gained).toBe(castleRegenPerSecond(1, max));
    // ⛔ and that is NOT the flat-base number — the fixture has to be able to tell them apart.
    expect(gained).not.toBe(castleRegenPerSecond(1));
  });

  it('negative — an un-upgraded keep regains exactly the base ladder (25 at level 1)', () => {
    const w = board();
    keep(w, 0, 1, 1000);
    expect(onePulse(w)).toBe(25);
  });

  it('the ceiling still holds: a keep one pulse from full stops exactly at its own max', () => {
    const w = board();
    keep(w, 1, 5, 0);
    const max = castleMaxHpFor(w.players.get(P0)!.castleUpgrades);
    w.players.get(P0)!.castleHp = max - 3;
    onePulse(w);
    expect(w.players.get(P0)!.castleHp).toBe(max);
  });
});
