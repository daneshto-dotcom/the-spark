/**
 * SPARK — S190 P0 (C5) — TEST-ONLY FIXTURES: a real four-seat bots match on the real host tick, and the
 * lever that holds 120 creatures on its wave-5 board.
 *
 * Shared by the opt-in CPU instrument (`c5HostTickMeasure.test.ts`) and the bond-targeting identity
 * oracle (`creatures/bondTargetIndex.differential.test.ts`), so the board the fix is MEASURED on and
 * the board it is PROVEN on are the same board. ⛔ Never imported by production code — the
 * `.fixtures.ts` suffix is the same convention as `zones.fixtures.ts`.
 */
import { BotManager } from '../bots/botManager.ts';
import { makeHostTickState, type HostTickDeps, type HostTickState } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asCreatureId, asPlayerId } from '../types.ts';
import type { Controls } from '../input/controls.ts';
import { PLAYER_COLORS, FIGHT_PHASE_TICKS, PHASE_DURATION_TICKS } from '../constants.ts';
import { makeCreature, type CreatureType } from './creatures/creature.ts';
import { CREATURE_CONFIGS } from './creatures/voltkin-config.ts';
import { castleAnchor } from './gatherers/gatherer.ts';

/** One BUILD + one FIGHT. Wave N's FIGHT spans `[(N-1)·WAVE + BUILD, N·WAVE)`. */
export const WAVE_TICKS = PHASE_DURATION_TICKS + FIGHT_PHASE_TICKS;
/** The first tick of wave `n`'s FIGHT. */
export const fightStartTick = (n: number): number => (n - 1) * WAVE_TICKS + PHASE_DURATION_TICKS;

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

export function c5Deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

export interface C5Match { world: World; bots: BotManager; deps: HostTickDeps; state: HostTickState }

/**
 * A four-seat bots match (seat 0 idle, seats 1-3 HARD/IMBA/IMBA bots), fixed seeds throughout, so two
 * calls produce two worlds that stay byte-identical for as long as they are driven identically.
 */
export function startC5Match(allHp: boolean): C5Match {
  const w = makeWorld(0xb07);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s] })),
    botSeats: [1, 2, 3],
  });
  if (allHp) {
    for (const s of [0, 1, 2, 3]) dispatch(w, { type: 'CHOOSE_DRAFT', playerId: asPlayerId(s), pick: 'hp' });
  }
  return { world: w, bots: new BotManager(['HARD', 'IMBA', 'IMBA'], 0xbeef), deps: c5Deps(), state: makeHostTickState(w) };
}

/**
 * Keep the board at `target` live creatures, spread evenly over the four seats, each spawned at its
 * own castle heading for the middle — the brother's S182 count (120) on a wave-5 board. Inserted
 * directly (the per-(owner,type) summon latch would refuse a burst) with the real factory, so every
 * one is a creature the sim treats normally. Same shape as the s189/net instrument's lever, so the
 * numbers are comparable. Deterministic: a pure function of the world it is handed.
 */
const TOPUP_TYPES: readonly CreatureType[] = ['goblinMelee', 'goblinArcher', 'goblinShield', 'goblinHound', 'raceUnit'];
export function topUpCreatures(w: World, target: number, types: readonly CreatureType[] = TOPUP_TYPES): void {
  let i = 0;
  while (w.creatures.size < target) {
    const seat = i % 4;
    const type = types[Math.floor(i / 4) % types.length]!;
    const home = castleAnchor(seat, w.layout);
    const id = asCreatureId(w.nextCreatureId++);
    const c = makeCreature(CREATURE_CONFIGS[type], {
      id,
      ownerPlayerId: asPlayerId(seat),
      pos: { x: home.x + ((i * 7) % 40) - 20, y: home.y + ((i * 13) % 40) - 20 },
      targetPos: { x: 960, y: 540 },
      spawnedAtTick: w.tick,
      clock: w,
      draftPicks: w.players.get(asPlayerId(seat))?.draftPicks,
    });
    w.creatures.set(id, c);
    i++;
  }
}
