/**
 * SPARK — S188 — THE RACIAL MECHANICS' HOST-TICK HOOK, and the queue that keeps their spawns
 * out of the strike batch.
 *
 * `hostTick` calls exactly two functions from here, and nothing else about the racials:
 *
 *   `runRacialPerksFight(world)`   inside the FIGHT gate, AFTER the six bosses' alive-skills and
 *                                  BEFORE the deferred death sweep — the slot the boss skills use,
 *                                  for the same reason (a unit that crossed a threshold in this
 *                                  tick's combat acts on it this tick).
 *   `drainRacialSpawnQueue(world)` immediately AFTER the death sweep, every PLAYING tick.
 *
 * ## ⛔ ONE SLOT PER BRANCH, AND THE COMMENT LINES BETWEEN THEM ARE LOAD-BEARING
 *
 * S188 builds the twelve mechanics on four parallel branches. Each owns ONE slot below and replaces
 * only its own placeholder lines (its import line at the top, its call line in the body). The
 * separating comment lines stay unchanged, so no two branches ever edit adjacent lines and every
 * merge is clean (Council A4). Delete a placeholder comment when you fill it; never touch another's.
 *
 * ## ⛔ WHY SPAWNS ARE QUEUED (Council A5)
 *
 * THE RISEN, HELLSPAWN and ENDLESS DYNASTY all make creatures BECAUSE of an event inside the strike
 * batch — a kill, a death, a castle hit. `world.creatures` is a `Map`, and a `Map` iteration VISITS
 * entries inserted during it: a creature born mid-loop would act on its own birth tick, reached by
 * a loop that did not expect it, in an order that depends on where in the batch its parent died.
 * Deterministic on host and worker alike, which is exactly why no test would notice — and wrong.
 * So an event-born creature is QUEUED here and born after the sweep, in the order it was queued
 * (which is the deterministic order of the events that queued it).
 *
 * The queue is keyed by `World` in a module-level `WeakMap`, not a `World` field, so it is never
 * serialized, hashed or carried to a joiner. ⛔ S189 (LOW d): that is only safe because it is EMPTY
 * wherever a save can land, and until S189 it was not — work queued OUTSIDE the strike batch (a remote
 * RAID applied between ticks, a bot acting after the post-sweep drain) waited for the next tick and
 * was lost to any save in the gap. It now drains at that boundary; the queue and the full argument
 * live in `spawnQueue.ts`, re-exported below so every import of it from here is unchanged.
 */

import type { World } from '../worldTypes.ts';

// ── s188/racial-a imports ─────────────────────────────────────────────────────────────────────────
import { runBloodFrenzy } from './bloodFrenzy.ts';
import { runScorchedGround } from './scorchedGround.ts';
// ── s188/racial-b imports ─────────────────────────────────────────────────────────────────────────
// (racial-b: replace this line with your imports)
// ── s188/racial-c imports ─────────────────────────────────────────────────────────────────────────
import { runPowerOfRa } from './powerOfRa.ts';
// ── s188/racial-d imports ─────────────────────────────────────────────────────────────────────────
import { runCorpseEater } from './corpseEater.ts'; // CORPSE EATER (zombies.l5)
// ── end imports ───────────────────────────────────────────────────────────────────────────────────

/** One host tick of every racial mechanic that runs on a cadence. FIGHT only — see the docblock. */
export function runRacialPerksFight(world: World): void {
  // ⛔ S188 (racial-a audit F2) — a DECIDED match mutates nothing. The FIGHT gate in `hostTick` answers
  // the phase question only; a match can end during FIGHT, and every boss skill in that block returns
  // on `gameState !== 'PLAYING'` for exactly this reason. Without it SCORCHED GROUND kept burning the
  // post-game board and BLOOD FRENZY kept rewriting `enraged` after the result was in.
  if (world.gameState !== 'PLAYING') return;
  // ── s188/racial-a ───────────────────────────────────────────────────────────────────────────────
  runBloodFrenzy(world); // orcs.l0 — after `runWarlordRage` in this tick, so the latch has spoken
  runScorchedGround(world); // demons.l0 — 1 fifth per victim on its own cadence, inside the deferral
  // ── s188/racial-b ───────────────────────────────────────────────────────────────────────────────
  // (racial-b: replace this line with your call(s) — ENDLESS DYNASTY, if it needs a tick)
  // ── s188/racial-c ───────────────────────────────────────────────────────────────────────────────
  runPowerOfRa(world); // POWER OF RA (mummies.l0) — lands whichever aimed column is due this tick
  // ── s188/racial-d ───────────────────────────────────────────────────────────────────────────────
  runCorpseEater(world); // CORPSE EATER (zombies.l5) — see `corpseEater.ts`
  // ── end ─────────────────────────────────────────────────────────────────────────────────────────
  void world;
}

// ⭐ S189 (LOW d) — the queue moved to a leaf module so `world.ts` can drain it at the out-of-tick
// boundary without an import cycle. Same names, same behaviour inside the strike batch.
export { drainRacialSpawnQueue, pendingRacialSpawns, queueAfterStrike } from './spawnQueue.ts';
