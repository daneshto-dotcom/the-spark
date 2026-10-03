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
  FIGHT_PHASE_TICKS,
  MONSTER_HOLD_LEAD_TICKS,
  MONSTER_FINAL_WAVE,
  MONSTER_FIRST_WAVE,
  MONSTER_WAVE_PER_SEAT,
  PANTS_WINDOW_SECONDS,
  PHYSICS_HZ,
} from '../constants.ts';
import type { PlayerId } from '../types.ts';
import { mix32 } from './rng.ts';
import type { GameAction } from './world.ts';
import type { World } from './worldTypes.ts';
import { isEliminated, livingSeats } from './elimination.ts';
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

/** ⭐ S194 R194-17 — this wave's pants window in ticks (`PANTS_WINDOW_SECONDS`, HIS); 0 off the monster waves. */
export function pantsWindowTicks(wave: number): number {
  return isMonsterWave(wave) ? (PANTS_WINDOW_SECONDS[wave] ?? 0) * PHYSICS_HZ : 0;
}

/**
 * ⭐ S194 R194-17 — how long this wave's FIGHT lasts, set at the whistle. ⚠ MINE: a monster fight runs
 * `max(FIGHT_PHASE_TICKS, window + MONSTER_HOLD_LEAD_TICKS)` — the window, then the old 10 s tail — so
 * 27 / 28 / 29 / 30 / 31 = 3600 / 3600 / 4200 / 6000 / 7800 ticks. Any other wave: `FIGHT_PHASE_TICKS`.
 * (Wave 31 with two seats alive is still held open by `isMonsterFightHeld` — his "the clock doesn't end".)
 */
export function monsterFightTicks(wave: number): number {
  if (!isMonsterWave(wave)) return FIGHT_PHASE_TICKS;
  return Math.max(FIGHT_PHASE_TICKS, pantsWindowTicks(wave) + MONSTER_HOLD_LEAD_TICKS);
}

/**
 * ⭐⭐ S194 R194-17 (HIS, option B) — THE PANTS WINDOW. *"Within that minute … all those pants should be
 * able to be spawned no matter how many."* The wave's `total` T = his count × `N` living seats comes out
 * evenly across the window W, FIRST AT THE WHISTLE and LAST EXACTLY AT THE WINDOW'S END: release `r`
 * (0-based; it goes to lane `r mod N`, `tickEndgameSpawner`) is due at `floor(r × W / (T − 1))` ticks
 * after the fight began. So each lane gets one pants every ≈ `W / count` ticks (250 in 120 s: 28.9), the
 * lanes are STAGGERED by `W / (T − 1)`, and the last lane's last pants lands on `W`.
 * ⚠ MINE: "from the window's start so the last one emerges at the window's end" read literally — the
 * divisor is `T − 1`, not `T`, so BOTH ends hold (with `T` the first would wait a spacing, or the last
 * would come one spacing early). One at a time: `T − 1 < W` on every shipped board (max 6 × 250 = 1500
 * < 7200), so no two releases share a tick.
 *
 * Due by `elapsed` = #{r ∈ [0, T−1] : floor(r × W / (T−1)) ≤ e} = #{r : r × W < (e+1)(T−1)}
 * = `floor(((e + 1)(T − 1) − 1) / W) + 1`, capped at T. Integer arithmetic only. ⭐ S194 (T8 merge): N and
 * T are the LANES — the seats that started the fight (`monsterLaneSeats`) — and stay fixed when a seat
 * falls: the fallen lane's slots come due on the same schedule and are skipped at no cost
 * (`tickEndgameSpawner`), so nobody else's pace moves, `monsterWaveSpawned` still reaches T by the window's
 * end, and the mega pants (R194-26) still comes at his slot (R194-2: the fallen seat's pants never come).
 */
export function monstersDueBy(elapsed: number, living: number, total: number, windowTicks: number): number {
  if (elapsed < 0 || living <= 0 || total <= 0 || windowTicks <= 0) return 0;
  if (total === 1) return 1;
  return Math.min(total, Math.floor(((elapsed + 1) * (total - 1) - 1) / windowTicks) + 1);
}

/**
 * ⭐⭐ S194 (T8, owner) — THE LANES ARE THE SEATS THAT STARTED THE FIGHT, AND A FALLEN SEAT'S LANE
 * SIMPLY STOPS. *"if there's still pants that are supposedly queued, then they stop coming, but the
 * existing ones just keep attacking."*
 *
 * ⛔ What it replaced: the lanes were the LIVING seats, so a seat falling shrank `N` and re-dealt the
 * release sequence over the survivors — and the fallen seat's ALREADY-EMERGED pants stayed counted in
 * `monsterWaveSpawned`, so they came out of the SURVIVORS' share. Measured (3 seats, wave 27 = 10 each,
 * seat 2 falls at 4/4/4 out): the survivors got 8 each, not 10 — the fallen seat's 6 queued were dropped
 * AND 4 more from the living. Now each lane keeps its own count: a living seat gets exactly his number,
 * the fallen seat's un-emerged slots are skipped, and nobody's pace changes (`N` is fixed for the fight).
 *
 * A seat is a lane unless it fell BEFORE this fight began (`eliminatedAtTick` < `monsterFightStartTick`,
 * both synced, so a joiner, a promoted host and the worker mirror all derive the same lanes). A seat down
 * but not yet stamped counts as a lane — it is not living, so its slots are skipped all the same.
 */
export function monsterLaneSeats(world: World): PlayerId[] {
  const start = world.monsterFightStartTick;
  return [...world.players.entries()]
    .filter(([, p]) => !isEliminated(p) || p.eliminatedAtTick === undefined || p.eliminatedAtTick >= start)
    .map(([id]) => id)
    .sort((a, b) => (a as unknown as number) - (b as unknown as number));
}

/** This monster fight's total release SLOTS: his count per lane × the lanes (dead lanes' slots are skipped). */
export function monsterWaveTotal(world: World): number {
  return monstersPerSeatForWave(world.waveNumber) * monsterLaneSeats(world).length;
}

/**
 * ⭐ HIS COUNTDOWN (S193): *"there will be a countdown at the top of how many are left to come out so
 * that players can know, like, oh shit, I have 66 left"*. A pure function of synced state
 * (`waveNumber`, `matchPhase`, the castles, `monsterWaveSpawned`) — no new wire field for the count: a
 * joiner, a promoted host and the worker mirror all read the same number. 0 outside a monster fight.
 */
export function monstersLeftToComeOut(world: World): number {
  if (world.matchPhase !== 'FIGHT' || !isMonsterWave(world.waveNumber)) return 0;
  // ⭐ S194 — the LIVING lanes' remaining only: a fallen seat's un-emerged pants are not coming.
  let left = 0;
  for (const seat of livingSeats(world)) left += monstersLeftForSeat(world, seat) ?? 0;
  return left;
}

/**
 * ⭐ HIS COUNTDOWN, PER SEAT (S193 audit): *"oh shit, I have 66 left"* is MY seat's number. Release `k`
 * goes to lane `lanes[k mod N]` (`tickEndgameSpawner`, `monsterLaneSeats`), so the releases still to come for the seat at
 * index `i` are the `k` in [spawned, total) with `k mod N = i` — counted exactly, no field. `null` when
 * `seat` is not a living seat (a fallen or spectating viewer), so the HUD shows the total alone.
 *
 * ⭐ HIS (S194) — WHEN A SEAT FALLS, ITS UN-EMERGED PANTS STOP COMING (its lane's slots are skipped) and
 * its pants already on the board keep attacking — they retarget to the survivors (`monsterVictimSeat`).
 * The survivors' own counts do not move (`monsterLaneSeats`).
 */
export function monstersLeftForSeat(world: World, seat: PlayerId): number | null {
  if (world.matchPhase !== 'FIGHT' || !isMonsterWave(world.waveNumber)) return null;
  if (!livingSeats(world).includes(seat)) return null;
  const lanes = monsterLaneSeats(world); // ⭐ S194 — fixed for the fight, see `monsterLaneSeats`
  const i = lanes.indexOf(seat);
  if (i < 0) return null;
  const n = lanes.length;
  const total = monstersPerSeatForWave(world.waveNumber) * n;
  const upTo = (m: number): number => (m > i ? Math.ceil((m - i) / n) : 0);
  return Math.max(0, upTo(total) - upTo(Math.min(world.monsterWaveSpawned, total)));
}

/**
 * ⭐ IS THIS FIGHT'S DEADLINE HELD? Two rules, one his and one mine:
 *   · HIS (Q2) — the FINAL fight (wave 31) never ends on the clock while two or more seats live. It
 *     ends when someone wins (score or last keep standing), never by going to BUILD.
 *   · ⚠ MINE (`MONSTER_HOLD_LEAD_TICKS`) — a monster fight on waves 27–30 holds while pants are still
 *     to come out, because his counts at his pace do not fit a 60 s fight from wave 29 on.
 * Pure function of synced state, so the HUD reads the same verdict the host acts on.
 */
export function isMonsterFightHeld(world: World): boolean {
  if (world.gameState !== 'PLAYING' || world.matchPhase !== 'FIGHT' || !isMonsterWave(world.waveNumber)) return false;
  if (world.waveNumber === MONSTER_FINAL_WAVE && livingSeats(world).length >= 2) return true;
  return monstersLeftToComeOut(world) > 0;
}

/**
 * ⭐ S193 — IS THE CLOCK READOUT LYING RIGHT NOW? The HUD's question, not the host's: the final fight
 * with two seats alive has no clock at all (his); a held wave 27–30 fight only stops counting once its
 * deadline has been pushed (the last `MONSTER_HOLD_LEAD_TICKS`) — before that the 60 s count is true.
 */
export function isClockFrozenForDisplay(world: World): boolean {
  if (!isMonsterFightHeld(world)) return false;
  if (world.waveNumber === MONSTER_FINAL_WAVE && livingSeats(world).length >= 2) return true;
  return world.phaseEndsAtTick - world.tick <= MONSTER_HOLD_LEAD_TICKS;
}

/**
 * ⭐⭐ S194 R194-26 (HIS) — THE MEGA PANTS IS THE 251st. *"the mega pants comes out after the last pant came
 * out … it's literally the last one in queue … we said 250 pants and he's going to be the 251."* His slot
 * is the NEXT one of the window's own cadence, `floor(r × W / (T − 1))` at `r = T`: one interval past the
 * window's end. 2 seats (T 500): floor(500 × 7200 / 499) = **7214** ticks; 4 seats (T 1000): **7207**.
 * A lone pants (T ≤ 1) has no interval, so the slot is the window's end. Integer arithmetic only.
 */
export function megaPantsSlotTicks(total: number, windowTicks: number): number {
  if (total <= 1) return windowTicks;
  return Math.floor((total * windowTicks) / (total - 1));
}

/**
 * The final fight's mega slot for this board: his count × the LANES (the seats that STARTED the fight,
 * `monsterLaneSeats` — the same T the release cadence runs over, so a seat falling mid-window does not
 * move his slot), over his 120 s window.
 */
export function megaPantsAtElapsed(world: World): number {
  return megaPantsSlotTicks(
    monstersPerSeatForWave(MONSTER_FINAL_WAVE) * monsterLaneSeats(world).length,
    pantsWindowTicks(MONSTER_FINAL_WAVE),
  );
}

/**
 * ⭐ HIS MEGA PANTS (Q2) — due in the FINAL fight, two or more seats alive, at his slot (R194-26: the
 * 251st — `megaPantsAtElapsed`) AND only once the last wave pants is actually out (*"after the last pant
 * came out"*: should the live cap ever hold a lane back, he still comes last), whenever none is on the
 * board. So a felled one is followed by another ("basically unbeatable"), exactly as before. Derived,
 * never latched: it needs no field of its own. (Was `MEGA_PANTS_AFTER_TICKS`, 240 s — retired.)
 */
export function megaPantsDue(world: World): boolean {
  if (world.gameState !== 'PLAYING' || world.matchPhase !== 'FIGHT' || world.waveNumber !== MONSTER_FINAL_WAVE) return false;
  if (world.monsterFightStartTick <= 0 || world.tick - world.monsterFightStartTick < megaPantsAtElapsed(world)) return false;
  if (world.monsterWaveSpawned < monsterWaveTotal(world)) return false;
  if (livingSeats(world).length < 2) return false;
  for (const c of world.creatures.values()) if (c.type === 'megaPants') return false;
  return true;
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
  // ⭐ S194 R194-27 (perf, identical verdict) — the common case first, without building the living list:
  // `livingSeats(world).includes(seat)` ⟺ the seat has a player who is not eliminated. That list (an
  // array + a sort, per pants per tick) was 11 % of a 500-pants host tick (measured, CPU profile).
  if (c.monsterSeat !== undefined) {
    const p = world.players.get(c.monsterSeat);
    if (p !== undefined && !isEliminated(p)) return c.monsterSeat;
  }
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
 *     only strand it in the hand. FIX does not need a pull either: since S193 (R191-B) a FIX is a
 *     gatherer JOB that fetches each shape from the castle bank or the quarry and carries it to the
 *     tower (`repairJobs.ts`) — and from wave 27 the quarry spawns nothing, so in the endgame a job
 *     draws on the BANK only. FEED reads the bank directly. Nothing he allowed needs a pull.
 * Everything else is ALLOWED, and three of those are his words: REPAIR_STRUCTURE and its castle-wide
 * form FIX_ALL (S193 R192-W1) (*"they can still fix existing towers"*), FEED_TOWER (*"they can build more … goblins"*) and every upgrade / economy verb
 * (*"their towers keep summoning and everything"*).
 */
export const ENDGAME_LOCK_INTENT_POLICY = {
  PLACE_PRIMITIVE: 'deny',
  PLACE_FROM_FREE: 'deny',
  BUILD_BLUEPRINT: 'deny',
  PULL_FROM_BANK: 'deny', // ⚠ MINE — see above
  REPAIR_STRUCTURE: 'allow', // HIS — FIX stays
  FIX_ALL: 'allow', // ⭐ S193 R192-W1 — FIX ALL is FIX for every tower: his "you can fix existing structures"
  SCRAP_STRUCTURE: 'allow', // removing a building creates nothing
  FEED_TOWER: 'allow', // HIS — "they can build more goblins"
  // ⭐ S193 (owner T4) — an auto-build toggle is a standing order for FEED_TOWER, which he allowed; the
  // feeds it causes are ordinary FEED_TOWERs and meet this lock as such.
  SET_AUTO_FEED: 'allow',
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
