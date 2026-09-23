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
 * The queue is keyed by `World` in a module-level `WeakMap`, not a `World` field: it is empty at
 * every tick boundary by construction (drained the same tick it is filled), so it never needs to be
 * serialized, hashed or carried to a joiner — and a `World` field would owe `FIELD_COVERAGE` an
 * entry for state that can never be observed between ticks.
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
// (racial-d: replace this line with your imports)
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
  // (racial-d: replace this line with your call(s) — CORPSE EATER)
  // ── end ─────────────────────────────────────────────────────────────────────────────────────────
  void world;
}

const queues = new WeakMap<World, Array<() => void>>();

/**
 * Queue work — in practice a `dispatch(world, { type: 'SPAWN_CREATURE', … })` — to run after this
 * tick's death sweep. Call it from inside the strike batch instead of spawning directly.
 */
export function queueAfterStrike(world: World, fn: () => void): void {
  let q = queues.get(world);
  if (q === undefined) {
    q = [];
    queues.set(world, q);
  }
  q.push(fn);
}

/**
 * Run and clear everything queued this tick, FIFO. Work queued BY a drained job (a HELLSPAWN child
 * that dies on its birth tick, say) lands in a fresh queue and waits for the next tick, so a chain
 * reaction can never recurse inside one drain.
 */
export function drainRacialSpawnQueue(world: World): void {
  const q = queues.get(world);
  if (q === undefined || q.length === 0) return;
  queues.set(world, []);
  for (const fn of q) fn();
}

/** Test seam: how many jobs are waiting. Never read by the sim. */
export function pendingRacialSpawns(world: World): number {
  return queues.get(world)?.length ?? 0;
}
