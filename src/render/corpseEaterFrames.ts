/**
 * SPARK — S188 — **THE CORPSE EATER'S ANIMATION, DERIVED FROM THE SYNCED STAMP.** Pure, Pixi-free.
 *
 * No boss skill in this game drew anything before (`ART_PIPELINE.md`'s last section), and the rule for
 * making one draw is the same everywhere: derive the picture per frame from synced state, never from a
 * one-shot `world.effects` push (lost ~5/6 of the time at 10 Hz sampling). `corpseEaterUntilTick` is on
 * the wire, so both peers compute the same frame from `world.tick`.
 *
 * The 480-tick window plays, in order:
 *   · `feedIn`   — he drops to the pile (one-shot, crouch-in 1..23);
 *   · `feedLoop` — ⭐ PING-PONG of crouch-in 13..24, the owner's own fix (TILE_AND_REROLL §3: *"he's
 *     putting his head down, eating, bringing it up, putting it down"*). It starts at the LAST frame and
 *     runs backward first, so it continues from where `feedIn` ended, and forward/backward closes the
 *     loop by construction — no seamless-loop sheet was ever needed;
 *   · `feedOut`  — he stands and burps, scheduled to END on the window's last tick, so the burp always
 *     lands (PROMPTS.md's timing note).
 */

import { CORPSE_EATER_TICKS } from '../state/racial/corpseEater.ts';
import { isCorpseEaterFeeding, isStunned, type Creature } from '../state/creatures/creature.ts';

/**
 * ⭐ S188 (audit F5) — **DOES THIS BOSS DRAW HIS FEED RIGHT NOW?** Feeding, not stunned (R152's idle
 * pose wins), and ⛔ **in FIGHT**. A window that straddles the FIGHT→BUILD edge keeps counting in the
 * sim, but `recallArmies` has already sent him home and released him and the feed runner is FIGHT-gated,
 * so drawing the eat loop at his castle through BUILD would show a meal that is not happening.
 */
export function showsCorpseEaterFeed(
  c: Pick<Creature, 'corpseEaterUntilTick' | 'stunnedUntilTick'>,
  world: { readonly tick: number; readonly matchPhase: 'BUILD' | 'FIGHT' },
): boolean {
  return world.matchPhase === 'FIGHT' && isCorpseEaterFeeding(c, world.tick) && !isStunned(c, world.tick);
}

export type FeedRow = 'feedIn' | 'feedLoop' | 'feedOut';

/** Frames per row and ticks per frame, as the `-anim.json` manifest ships them. */
export interface FeedTiming {
  readonly feedIn: { frames: number; ticksPerFrame: number };
  readonly feedLoop: { frames: number; ticksPerFrame: number };
  readonly feedOut: { frames: number; ticksPerFrame: number };
}

/**
 * Which row and frame to draw `elapsed` ticks into the feed (0 on the stamp tick). Out-of-range
 * `elapsed` is clamped, so a late snapshot can never index past a row.
 */
export function corpseEaterFrame(elapsed: number, t: FeedTiming): { row: FeedRow; index: number } {
  const e = Math.max(0, Math.min(CORPSE_EATER_TICKS - 1, Math.floor(elapsed)));
  const inTicks = t.feedIn.frames * t.feedIn.ticksPerFrame;
  const outTicks = t.feedOut.frames * t.feedOut.ticksPerFrame;
  if (e < inTicks) return { row: 'feedIn', index: Math.floor(e / t.feedIn.ticksPerFrame) };
  const outStart = CORPSE_EATER_TICKS - outTicks;
  if (e >= outStart) {
    return {
      row: 'feedOut',
      index: Math.min(t.feedOut.frames - 1, Math.floor((e - outStart) / t.feedOut.ticksPerFrame)),
    };
  }
  const n = t.feedLoop.frames;
  if (n <= 1) return { row: 'feedLoop', index: 0 };
  const period = 2 * n - 2;
  const p = Math.floor((e - inTicks) / t.feedLoop.ticksPerFrame) % period;
  return { row: 'feedLoop', index: p <= n - 1 ? n - 1 - p : p - (n - 1) };
}

/** Ticks since the feed began, from the synced deadline. */
export function corpseEaterElapsed(untilTick: number, tick: number): number {
  return tick - (untilTick - CORPSE_EATER_TICKS);
}
