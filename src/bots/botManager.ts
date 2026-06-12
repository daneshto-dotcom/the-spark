/**
 * SPARK — S87: BotManager — owns one BotController per bot seat and ticks
 * them inside the host-only fixed-step loop (main.ts), exactly where the
 * hunter/hazard orchestration lives.
 *
 * LAZY CHUNK: imported via `await import()` on VS-BOTS match start only —
 * the index bundle pays ~0 bytes (S85 debugOverlay charter pattern).
 *
 * Determinism: each controller owns a mulberry32 stream seeded from
 * (matchSeed ^ seat ^ 0xb07b07) — no Math.random, no Date.now. Every bot
 * action is a plain GameAction through dispatch(), so the bench gate, poop
 * gates, reach validation and territory blocks bind bots identically to
 * remote human players (Council S87 F1).
 */

import { dispatch, type World } from '../state/world.ts';
import { mulberry32 } from '../state/rng.ts';
import { BotController } from './botController.ts';
import type { BotDifficulty } from './botTypes.ts';
import { asPlayerId } from '../types.ts';

export class BotManager {
  private readonly controllers: BotController[];

  constructor(difficulties: readonly BotDifficulty[], matchSeed: number) {
    this.controllers = difficulties.map((difficulty, i) => {
      const seat = asPlayerId(i + 1); // human is always seat 0
      const rng = mulberry32(((matchSeed ^ ((i + 1) * 0xb07b07)) >>> 0) || 1);
      return new BotController(seat, difficulty, rng, difficulties.length + 1);
    });
  }

  /** One host physics tick: think (staggered) + act for every bot. */
  tick(world: World): void {
    for (const c of this.controllers) {
      c.tick(world, (action) => void dispatch(world, action));
    }
  }

  /** DEV/test probe — controller count + per-bot FSM labels. */
  debugStates(): ReadonlyArray<{ seat: number; difficulty: BotDifficulty; state: string }> {
    return this.controllers.map((c) => c.debugState());
  }
}
