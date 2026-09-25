/**
 * SPARK — S189 LOW (a): **CORPSE EATER'S BITE CLOCK RUNS ON THE RAGE LATCHED AT THE START OF THE
 * SWING, NOT ON THE LIVE BIT.**
 *
 * Deploy #2's F3 latched `Creature.attackCycleRaged` for the FSM's swing because a rage flip mid-cycle
 * broke one-blow-per-cycle. The feed clock in `corpseEater.ts` re-derived its cadence from the LIVE
 * `enraged` bit every tick, so it carried the identical defect:
 *   · calm → raged AFTER the calm bite: the counter wrapped onto the raged clock and bit again 29
 *     ticks later instead of finishing the calm swing (59);
 *   · raged → calm right after a raged bite: the calm fire tick re-armed on the very next tick — a
 *     second bite one tick after the first.
 *
 * ⚠ LATENT IN PRODUCTION: nothing that ships enrages a zombie boss (the only `enraged` writers are
 * orc-typed), so the flips below are set by the fixture. The clock is what is under test.
 *
 * Pinned: the arithmetic of the intervals, REACH through the real host tick, a negative (no flip =
 * every interval the calm cadence), and ⭐ MUTATION-TESTED — reading the live bit again turns the two
 * flip cases red.
 */
import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { mulberry32 } from '../rng.ts';
import { asCreatureId, asPlayerId, type PlayerId } from '../../types.ts';
import type { Controls } from '../../input/controls.ts';
import type { RaceId } from '../races.ts';
import type { DraftPick } from '../draft.ts';
import {
  makeCreature,
  isCorpseEaterFeeding,
  applyStun,
  creatureMaxEhp,
  type Creature,
  type CreatureType,
} from '../creatures/creature.ts';
import { getCreatureConfig } from '../creatures/voltkin-config.ts';
import { WARLORD_RAGE_MULTIPLIER } from '../../constants.ts';
import { CORPSE_EATER_TRIGGER_PCT } from './corpseEater.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const BOSS: CreatureType = 't9BossZombies';
const CX = 960;
const CY = 540;
const CFG = getCreatureConfig(BOSS);
const CALM_CADENCE = CFG.attackCadenceTicks;
const RAGED_CADENCE = Math.max(1, Math.round(CFG.attackCadenceTicks / WARLORD_RAGE_MULTIPLIER));
const CALM_FIRE = Math.min(CFG.attackFireTick, CALM_CADENCE - 1);
const RAGED_FIRE = Math.min(CFG.attackFireTick, RAGED_CADENCE - 1);

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

function setSeat(w: World, seat: PlayerId, race: RaceId, picks: DraftPick[]): void {
  const p = w.players.get(seat)!;
  (p as { raceId: RaceId }).raceId = race;
  p.draftPicks.splice(0, p.draftPicks.length, ...picks);
}

/** Seat 0 = zombies holding the level-5 pick, in FIGHT, far from the phase edge (as corpseEater.test.ts). */
function make1v1(): World {
  const w = makeWorld(0x5189);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.draft = null;
  w.creatures.clear();
  setSeat(w, P0, 'zombies', ['hp', 'racial']);
  setSeat(w, P1, 'orcs', []);
  return w;
}

function put(w: World, type: CreatureType, owner: PlayerId, x: number): Creature {
  const id = asCreatureId(w.nextCreatureId++);
  const c = makeCreature(getCreatureConfig(type), {
    id, ownerPlayerId: owner, pos: { x, y: CY }, targetPos: { x, y: CY }, spawnedAtTick: w.tick,
    sourceSpawnerId: null,
  });
  c.state = 'SEEKING';
  w.creatures.set(id, c);
  return c;
}

type Flip = { readonly atCycleTick: number; readonly afterBites: number; readonly raged: boolean };

/**
 * Seat the boss at his 20 % line beside a practically unkillable OWN scarab (held by a stun so it
 * cannot walk off — a stunned unit can still be bitten), run the REAL host tick for his whole window,
 * apply each `Flip` on the first tick his swing counter reads `atCycleTick` after `afterBites` bites,
 * and return the ticks on which a bite landed (the scarab's pool dropped).
 */
function biteTicks(flips: readonly Flip[]): number[] {
  const w = make1v1();
  const boss = put(w, BOSS, P0, CX);
  boss.ehp = Math.floor((creatureMaxEhp(boss) * CORPSE_EATER_TRIGGER_PCT) / 100);
  const meal = put(w, 't3Scarab', P0, CX + 20);
  meal.ehp = 1_000_000;
  applyStun(meal, 1_000_000);
  const d = deps();
  const s = makeHostTickState(w);
  const out: number[] = [];
  const pending = [...flips];
  let last = meal.ehp;
  for (let t = 0; t < 600; t++) {
    runHostTick(w, d, s);
    if (meal.ehp < last) out.push(w.tick);
    last = meal.ehp;
    const f = pending[0];
    if (f !== undefined && out.length >= f.afterBites && boss.state === 'ATTACKING' && boss.ticksInState === f.atCycleTick) {
      boss.enraged = f.raged;
      pending.shift();
    }
    if (!isCorpseEaterFeeding(boss, w.tick + 1) && out.length > 0 && t > 50) break;
  }
  expect(pending, 'fixture: every flip must actually have been applied').toHaveLength(0);
  return out;
}

const gaps = (ticks: readonly number[]): number[] => ticks.slice(1).map((t, i) => t - ticks[i]!);

describe('S189 LOW (a) — the feed bite clock latches rage per cycle', () => {
  it('the arithmetic: calm and raged cadences and fire ticks, off the one rage multiplier', () => {
    expect(RAGED_CADENCE).toBe(CALM_CADENCE / 2);
    // The interval the latch predicts for a calm → raged flip AFTER the calm bite: finish the calm
    // swing, then the raged fire tick of the next one.
    expect(CALM_CADENCE - CALM_FIRE + RAGED_FIRE).toBe(59);
  });

  it('negative — with no flip every bite is exactly one calm cadence after the last', () => {
    const g = gaps(biteTicks([]));
    expect(g.length).toBeGreaterThan(4);
    for (const x of g) expect(x).toBe(CALM_CADENCE);
  });

  it('⭐⭐ REACH: calm → raged mid-swing, after the bite — the swing finishes calm, then the raged clock', () => {
    // Flip on cycle tick 40 of the SECOND swing (after 2 bites): its bite (tick 30) already landed.
    const g = gaps(biteTicks([{ atCycleTick: 40, afterBites: 2, raged: true }]));
    expect(g[0]).toBe(CALM_CADENCE);
    // ⛔ the live-bit clock bit again after 29 (41 mod 30 = 11 → its fire tick 29); the latch waits 59.
    expect(g[1]).toBe(CALM_CADENCE - CALM_FIRE + RAGED_FIRE);
    for (const x of g.slice(2)) expect(x).toBe(RAGED_CADENCE);
  });

  it('⭐⭐ REACH: raged → calm right after a raged bite — never a second bite in the same swing', () => {
    // Start raged, then calm him on the raged fire tick itself, the moment the bite has landed.
    const g = gaps(biteTicks([
      { atCycleTick: 1, afterBites: 0, raged: true }, // the first swing is latched calm (0 → 1)
      { atCycleTick: RAGED_FIRE, afterBites: 3, raged: false },
    ]));
    // ⛔ the live-bit clock bit AGAIN one tick later (29 + 1 = 30 = the calm fire tick). The latch
    // lets the raged swing end, and the next calm swing bites at its own fire tick.
    for (const x of g) expect(x).toBeGreaterThan(1);
    expect(Math.min(...g)).toBeGreaterThanOrEqual(RAGED_CADENCE);
  });
});
