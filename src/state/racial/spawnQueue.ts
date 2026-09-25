/**
 * SPARK — S188 (Council A5) + S189 (LOW d) — **THE RACIAL SPAWN QUEUE, AND THE BOUNDARY IT DRAINS AT.**
 *
 * Moved here from `racialTick.ts` in S189 so `world.ts`'s `dispatch` can reach it without an import
 * cycle (this module imports types only). `racialTick.ts` re-exports every name, so every existing
 * `import { queueAfterStrike } from './racialTick.ts'` is unchanged — including the unmerged S188
 * racial branches that call it.
 *
 * ## Why spawns are queued at all (Council A5, unchanged)
 *
 * THE RISEN, HELLSPAWN and ENDLESS DYNASTY make creatures BECAUSE of an event inside the strike
 * batch. `world.creatures` is a `Map`, and a `Map` iteration visits entries inserted during it, so an
 * event-born creature is queued and born after the sweep, FIFO.
 *
 * ## ⛔ S189 (LOW d) — THE QUEUE WAS NOT EMPTY AT EVERY SAVE, AND ITS DOCBLOCK SAID IT WAS
 *
 * It read: *"it is empty at every tick boundary by construction (drained the same tick it is
 * filled), so it never needs to be serialized."* True for work queued INSIDE the strike batch. False
 * for work queued anywhere else:
 *   · **outside `runHostTick`** — the host applies a remote INTENT (and its own local actions) with
 *     `dispatch` the moment it arrives. A RAID that kills a demons.l5 seat's chewer queues HELLSPAWN's
 *     two children, and they waited for the NEXT tick's drain;
 *   · **inside `runHostTick` but after its post-sweep drain** — the bots act after it.
 * A save in that gap — a NetSnapshot on a frame that ran zero ticks (any display above 60 Hz), the
 * `?worker=1` adoption INIT, the last snapshot a migration successor applied — carried the dead
 * parent and no children: the split was LOST. And a `restore()` into the SAME world object left the
 * stale closure queued, so the next drain spawned children of a parent the restored world still had
 * alive.
 *
 * ⭐ THE FIX IS "DRAIN AT THE BOUNDARY", NOT "SERIALIZE", so the closure API survives untouched:
 *   · a TOP-LEVEL `dispatch` that runs OUTSIDE a host tick drains on exit
 *     (`drainRacialSpawnQueueOutsideHostTick`, called by `world.ts`) — the action's split is part of
 *     applying the action, in live play and in any replay of the same actions alike;
 *   · `runHostTick` opens a window (`beginHostTickSpawnWindow`) inside which that hook stays silent —
 *     so the strike batch keeps A5's post-sweep ordering exactly — and closes it with a FINAL drain
 *     (`endHostTickSpawnWindow`) that catches anything queued after the post-sweep drain.
 * Between ticks, and after every top-level action, the queue is therefore empty: a save can no
 * longer land on queued work, and a restore can no longer inherit it.
 *
 * ⚠ A job queued BY a draining job still waits for the next drain (the "chain cannot recurse in one
 * drain" rule, pinned by `racialPerks.test.ts`): the hook is silent while a drain is running.
 */

import type { World } from '../worldTypes.ts';

const queues = new WeakMap<World, Array<() => void>>();
/** Worlds whose `runHostTick` is in progress — the hook must not drain mid-batch there. */
const inHostTick = new WeakSet<World>();
/** Worlds currently running a drain — the hook must not re-enter it. */
const draining = new WeakSet<World>();

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
 * Run and clear everything queued, FIFO. Work queued BY a drained job (a HELLSPAWN child that dies on
 * its birth tick, say) lands in a fresh queue and waits for the next drain, so a chain reaction can
 * never recurse inside one drain.
 */
export function drainRacialSpawnQueue(world: World): void {
  const q = queues.get(world);
  if (q === undefined || q.length === 0) return;
  queues.set(world, []);
  draining.add(world);
  try {
    for (const fn of q) fn();
  } finally {
    draining.delete(world);
  }
}

/** Test seam: how many jobs are waiting. Never read by the sim. */
export function pendingRacialSpawns(world: World): number {
  return queues.get(world)?.length ?? 0;
}

/**
 * ⭐ S189 (LOW d) — called by `world.ts`'s `dispatch` when a TOP-LEVEL dispatch returns. Drains only
 * OUTSIDE a host tick and outside a running drain; everywhere else it is a no-op. Cheapest check first:
 * the queue is empty on almost every call.
 */
export function drainRacialSpawnQueueOutsideHostTick(world: World): void {
  const q = queues.get(world);
  if (q === undefined || q.length === 0) return;
  if (inHostTick.has(world) || draining.has(world)) return;
  drainRacialSpawnQueue(world);
}

/** ⭐ S189 (LOW d) — `runHostTick`'s first line: from here the strike batch owns the drain timing. */
export function beginHostTickSpawnWindow(world: World): void {
  inHostTick.add(world);
}

/**
 * ⭐ S189 (LOW d) — `runHostTick`'s last line: a FINAL drain (anything queued after the post-sweep
 * drain — the bots act after it), then the window closes. The tick therefore never ends with work
 * queued, which is the boundary every save lands on.
 */
export function endHostTickSpawnWindow(world: World): void {
  drainRacialSpawnQueue(world);
  inHostTick.delete(world);
}
