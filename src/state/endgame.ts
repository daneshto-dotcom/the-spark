/**
 * SPARK — ⭐⭐ S192 (owner, scope amendment A3): **THE ENDGAME RULES.** Pure predicates and the
 * build-lock policy. The spawner, the targeting arm and the end-of-fight sweep live in
 * `endgameMonsters.ts`, which needs `dispatch`; this file must stay importable by `world.ts`.
 *
 * Spec: `.claude/plans/S192_ENDGAME_SPEC.md`. His words, verbatim in `S192_OWNER_ENDGAME_SPEC.md`:
 *
 * > *"End of fight, wave 25. You … get your last upgrade. Then you get to build. Everything is normal
 * > for wave build phase of wave 26. Then fight wave of 26 is the last one you can actually fight each
 * > other without any … incoming monsters. And then in the build phase of 27 … you can't build anything
 * > new anymore. You can fix existing structures, but you can't build any new ones."*
 *
 * ⚠ HIS SELF-CORRECTION IS THE RULE: he first said *"you can't fix anymore"* and corrected it in the
 * next breath — *"You can fix existing structures"*. FIX stays allowed.
 *
 * Every predicate here is a pure function of `world.waveNumber` (synced, hashed since S157 B8), so the
 * host, an optimistic joiner and a `?worker=1` mirror agree by construction. The RULE still earns a
 * protocol bump (the S186 test): a stale peer would build where a current host refuses.
 */

import {
  BUILD_LOCK_FROM_WAVE,
  MONSTER_FINAL_WAVE,
  MONSTER_FIRST_WAVE,
  MONSTER_MIN_PULSE_TICKS,
  MONSTER_SPAWN_WINDOW_TICKS,
  MONSTER_WAVE_PER_SEAT,
} from '../constants.ts';
import type { PlayerId } from '../types.ts';
import { mix32 } from './rng.ts';
import type { GameAction } from './world.ts';
import type { World } from './worldTypes.ts';
import { livingSeats } from './elimination.ts';
import type { Creature } from './creatures/creature.ts';

/** ⛔ FROM BUILD OF WAVE 27: no new shapes, structures or connections. FIX is allowed. */
export function isBuildLocked(world: Pick<World, 'waveNumber'>): boolean {
  return world.waveNumber >= BUILD_LOCK_FROM_WAVE;
}

/** Is `wave` one of the five monster waves (27–31)? */
export function isMonsterWave(wave: number): boolean {
  return wave >= MONSTER_FIRST_WAVE && wave <= MONSTER_FINAL_WAVE;
}

/** Monsters per LIVING seat this wave (0 off the monster waves). */
export function monstersPerSeatForWave(wave: number): number {
  return isMonsterWave(wave) ? (MONSTER_WAVE_PER_SEAT[wave] ?? 0) : 0;
}

/**
 * ⚠ MINE — ticks between pulses: the wave pours out over `MONSTER_SPAWN_WINDOW_TICKS`, one monster
 * per living seat per pulse. 10 each → 120 ticks · 25 → 48 · 35 → 34 · 50 → 24 · 75 → 16.
 */
export function monsterPulseTicks(perSeat: number): number {
  if (perSeat <= 0) return MONSTER_SPAWN_WINDOW_TICKS;
  return Math.max(MONSTER_MIN_PULSE_TICKS, Math.floor(MONSTER_SPAWN_WINDOW_TICKS / perSeat));
}

/**
 * ⭐ HIS RETARGET, DERIVED: *"if one player is destroyed and lost, then whatever leftover monsters
 * there are, they go to the other two players."*
 *
 * The assigned seat while it lives; otherwise a survivor chosen by `mix32(id)` over the living seats in
 * id order, so the leftovers FAN OUT across every survivor rather than all piling onto one. Never
 * written back: both sims re-derive the same answer from synced state every tick. `null` when no seat
 * is alive (the monster then stands still — the match is over anyway).
 */
export function monsterVictimSeat(world: World, c: Pick<Creature, 'id' | 'monsterSeat'>): PlayerId | null {
  const living = livingSeats(world);
  if (living.length === 0) return null;
  if (c.monsterSeat !== undefined && living.includes(c.monsterSeat)) return c.monsterSeat;
  return living[mix32(c.id as unknown as number, 0x9a75) % living.length] ?? null;
}

type LockPolicy = 'allow' | 'deny';

/**
 * ⛔ THE LOCK, AS AN EXHAUSTIVE POLICY OVER EVERY CLIENT INTENT — the bench/elimination pattern.
 * `endgame.test.ts` asserts set-equality with `CLIENT_INTENT_TYPES` in both directions, so a new
 * intent cannot exist without someone deciding whether the lock refuses it.
 *
 * The four DENIES are the four ways a seat makes a NEW shape or a NEW connection exist:
 *   · PLACE_PRIMITIVE / PLACE_FROM_FREE — a hand-placed shape, and every auto-bond it forms;
 *   · BUILD_BLUEPRINT — a stamped tower;
 *   · PULL_FROM_BANK — ⚠ MINE: a shape out of the keep can no longer be placed, so pulling one would
 *     only strand it in the hand. FIX pays from the bank directly (`planPaymentForTypes`), and FEED
 *     reads the bank directly, so nothing he allowed needs a pull.
 * Everything else is ALLOWED, and three of those are his words: REPAIR_STRUCTURE (*"they can still fix
 * existing towers"*), FEED_TOWER (*"they can build more … goblins"*) and every upgrade / economy verb
 * (*"their towers keep summoning and everything"*).
 */
export const ENDGAME_LOCK_INTENT_POLICY = {
  PLACE_PRIMITIVE: 'deny',
  PLACE_FROM_FREE: 'deny',
  BUILD_BLUEPRINT: 'deny',
  PULL_FROM_BANK: 'deny', // ⚠ MINE — see above
  REPAIR_STRUCTURE: 'allow', // HIS — FIX stays
  SCRAP_STRUCTURE: 'allow', // removing a building creates nothing
  FEED_TOWER: 'allow', // HIS — "they can build more goblins"
  PICKUP_SPARK: 'allow',
  DROP_SPARK: 'allow',
  SEVER_BOND: 'allow',
  UPDATE_AVATAR_POS: 'allow',
  SHRINK_TERRITORY: 'allow',
  TRIGGER_BOMB: 'allow',
  TRIGGER_RAINBOW: 'allow',
  PICKUP_POTATO: 'allow',
  PLACE_POTATO: 'allow', // a hazard, not a building (and archived — canon §1)
  DROP_POTATO: 'allow',
  SUDOKU_SOLVED: 'allow',
  RAID_TARGET: 'allow',
  BUY_GATHERER: 'allow',
  UPGRADE_GATHERER_SPEED: 'allow',
  UPGRADE_CASTLE_REGEN: 'allow',
  CHOOSE_DRAFT: 'allow', // no draft opens past wave 26 anyway
  UPGRADE_CASTLE_STAT: 'allow',
  CAST_POWER_OF_RA: 'allow',
  CAST_SCORCHED_EARTH: 'allow', // ⭐ S193 — a CAST is not a build: it scorches a zone, it makes no shape or connector
  SET_GATHERER_PREFERENCE: 'allow',
  ENQUEUE_GATHERER_ORDER: 'allow',
  CANCEL_GATHERER_ORDER: 'allow',
} as const satisfies Partial<Record<GameAction['type'], LockPolicy>>;

/** True iff `type` is refused while the build lock holds. Non-intent types return false. */
export function isEndgameLockDeniedIntent(type: GameAction['type']): boolean {
  return (ENDGAME_LOCK_INTENT_POLICY as Partial<Record<GameAction['type'], LockPolicy>>)[type] === 'deny';
}
