/**
 * SPARK — THE LIVE DRAFT: opening it, resolving a pick, and the deadline that closes it.
 *
 * The pure vocabulary and arithmetic live in `draft.ts`; this is the half that touches `World`,
 * mirroring the `sudoku.ts` / `sudokuEvent.ts` split for the same reason (a `World` import in the
 * pure module would close a cycle through `game/player.ts`).
 *
 * ## ⛔ THE DRAFT DOES NOT FREEZE THE SIM, AND THAT IS DELIBERATE
 *
 * The NONET trial is this codebase's only precedent for pausing on a human decision, and it was the
 * obvious thing to copy. It is the wrong model here. R106 says the draft must never block the sim,
 * and the owner independently described the same behaviour: *"they can take their time, they can take
 * like as much as the whole build phase"*. So BUILD runs underneath — the player keeps gathering and
 * building while the panel is up — and only the deadline is enforced.
 *
 * That also removes the NONET freeze's worst hazard. Its freeze exists in **two** places
 * (`main.ts` guards on `!workerActive`, and `workerSim.ts` holds a second copy), and a draft that
 * copied only the first would have run at full speed under `?worker=1` — a divergence no test in the
 * repo would have seen.
 *
 * ## ⭐ WHAT IS DERIVED RATHER THAN STORED, AND WHY THAT MATTERS
 *
 * "Has this seat already picked in the current draft?" is NOT a field. It is
 * `player.draftPicks.length > draftIndexForWave(draft.waveNumber)`, because a seat's Nth pick is by
 * construction its pick for the Nth draft. Storing a per-event pick map would have put a second copy
 * of the same fact on the wire and in the hash, and two copies of one fact is how they drift apart.
 * The event therefore carries exactly two integers.
 */

import type { World } from './world.ts';
import type { PlayerId } from '../types.ts';
import {
  draftIndexForWave,
  generalPickForWave,
  isDraftWave,
  type DraftPick,
} from './draft.ts';
import { PHASE_DURATION_TICKS } from '../constants.ts';

/**
 * A draft that is currently open.
 *
 * ⚠ TWO INTEGERS, NO PICK MAP — see the module docblock. `openedAtTick` is the base for a RELATIVE
 * deadline, which is the form `tickSudoku` uses (`world.tick - ev.startTick >= …`). An ABSOLUTE
 * deadline would be wrong for the same reason `applyStartGame` stamps its clock relative:
 * `world.tick` is not reset between matches, so an absolute value computed in one match is already
 * in the past in the next.
 */
export interface DraftEvent {
  /** The tick the panel opened. The deadline is measured from here, never from an absolute tick. */
  readonly openedAtTick: number;
  /** The wave this draft belongs to: 1, 6, 11, 16, 21, … */
  readonly waveNumber: number;
}

/**
 * How long a seat has before the pick is made for it.
 *
 * ⭐ HIS RULING, and it is a WHOLE BUILD rather than the five seconds the panel suggests:
 * *"they can take like as much as the whole build phase, but then in the end of the build phase it
 * just takes the racial one automatically."* The five seconds are a reading hint in the UI, not a
 * deadline — the panel shows a countdown but nothing is taken away when it reaches zero.
 */
export const DRAFT_DEADLINE_TICKS = PHASE_DURATION_TICKS;

/** How many picks a seat should hold once the draft for `waveNumber` has resolved. */
function picksOwedBy(waveNumber: number): number {
  return draftIndexForWave(waveNumber) + 1;
}

/** True when this seat still owes a pick for the open draft. */
export function seatMustStillPick(world: World, seat: PlayerId, waveNumber: number): boolean {
  const pl = world.players.get(seat);
  if (pl === undefined) return false;
  return pl.draftPicks.length < picksOwedBy(waveNumber);
}

/**
 * The option a seat gets when it does not choose.
 *
 * ⛔ **THIS REVERSES R106, ON HIS S187 RULING.** R106 auto-assigned the GENERAL option; he said
 * *"in the end of the build phase, it just takes the racial one automatically."* The later ruling
 * governs, and it is recorded as a reversal rather than applied quietly.
 *
 * ⚠ **BUT EVERY RACIAL IS `COMING SOON` TODAY, SO THE FALLBACK IS THE GENERAL ONE.** He asked for
 * exactly that — *"on the right side, no upgrade, and just like coming soon or something, and it's
 * not choosable"* — and a deadline that auto-took a non-existent option would grant nothing at all,
 * which is strictly worse than the rule it implements. When a race's perk is defined, this function
 * returns it and nothing else changes.
 */
export function autoPickFor(world: World, seat: PlayerId, waveNumber: number): DraftPick {
  void world;
  void seat;
  // The racial slot is unimplemented, so there is nothing to prefer yet. `racialPickFor(seat)` goes
  // here, ahead of the general fallback, the moment the first race perk lands.
  return generalPickForWave(waveNumber);
}

/**
 * Open the draft for `waveNumber`, if that wave has one and one is not already open.
 *
 * Called from the TITLE→PLAYING edge (the pre-wave-1 draft) and from the BUILD wave edge.
 */
export function openDraftIfDue(world: World, waveNumber: number): void {
  if (world.gameState !== 'PLAYING') return;
  if (world.draft !== null) return;
  if (!isDraftWave(waveNumber)) return;
  // A seat that somehow already holds its pick for this wave (a restored save, a re-entered edge)
  // must not be offered it again.
  let anyOwed = false;
  for (const seat of world.players.keys()) {
    if (seatMustStillPick(world, seat, waveNumber)) {
      anyOwed = true;
      break;
    }
  }
  if (!anyOwed) return;
  world.draft = { openedAtTick: world.tick, waveNumber };
}

/**
 * Record a seat's choice. Host-authoritative: this is what the `CHOOSE_DRAFT` intent reduces to.
 *
 * Idempotent per draft — a seat that has already picked is ignored rather than allowed to stack a
 * second upgrade, which is what a duplicated or replayed intent would otherwise buy it.
 */
export function applyDraftChoice(world: World, seat: PlayerId, pick: DraftPick): void {
  const ev = world.draft;
  if (ev === null) return;
  if (!seatMustStillPick(world, seat, ev.waveNumber)) return;
  const pl = world.players.get(seat);
  if (pl === undefined) return;
  pl.draftPicks.push(pick);
  closeIfEveryoneHasPicked(world);
}

/** Close the panel as soon as nobody is still owed a pick, so it does not linger over the board. */
function closeIfEveryoneHasPicked(world: World): void {
  const ev = world.draft;
  if (ev === null) return;
  for (const seat of world.players.keys()) {
    if (seatMustStillPick(world, seat, ev.waveNumber)) return;
  }
  world.draft = null;
}

/**
 * One host tick of the open draft: enforce the deadline.
 *
 * ⛔ **THE SEAT ORDER IS AN EXPLICIT NUMERIC SORT, NOT `Map` ITERATION.** Every seat appends to its
 * own list so the order could not change any seat's outcome today — but `world.draft` is hashed, the
 * pick lists are hashed IN ORDER, and this project's most expensive determinism bug (S155 N1) was
 * exactly a scan that let insertion order decide something. A total order costs one comparator.
 */
export function tickDraft(world: World): void {
  const ev = world.draft;
  if (ev === null) return;
  if (world.gameState !== 'PLAYING') return;
  if (world.tick - ev.openedAtTick < DRAFT_DEADLINE_TICKS) return;

  const seats = [...world.players.keys()].sort((a, b) => Number(a) - Number(b));
  for (const seat of seats) {
    if (!seatMustStillPick(world, seat, ev.waveNumber)) continue;
    const pl = world.players.get(seat);
    if (pl === undefined) continue;
    pl.draftPicks.push(autoPickFor(world, seat, ev.waveNumber));
  }
  world.draft = null;
}

/**
 * The two options a seat is shown. The renderer reads this; it is not stored.
 *
 * `racial: null` renders as the non-choosable COMING SOON tile he asked for.
 */
export function draftOptionsFor(
  waveNumber: number,
): { readonly general: DraftPick; readonly racial: null } {
  return { general: generalPickForWave(waveNumber), racial: null };
}

/** Ticks remaining before the deadline takes the pick, for the panel's countdown. Never negative. */
export function draftTicksRemaining(world: World): number {
  const ev = world.draft;
  if (ev === null) return 0;
  return Math.max(0, DRAFT_DEADLINE_TICKS - (world.tick - ev.openedAtTick));
}
