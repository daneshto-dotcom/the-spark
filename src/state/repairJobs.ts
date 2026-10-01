/**
 * SPARK — S193 R191-B / R192-W1 — **FIX IS A GATHERER JOB, AND THE CASTLE CAN ORDER THEM ALL.**
 *
 * > *"clicking on fix … it actually queues … a gatherer and he has to bring the shape from the castle to
 * > the tower that needs fixing. And once he reaches the tower, that fixes [it] automatically … It's
 * > going to be the top … priority for your gatherers … if it takes many shapes, then he has to actually
 * > take time off gathering."* — owner, S191
 * >
 * > *"one or multiple gatherers, depends how many shapes it needs … a very smart way to queue, very
 * > dynamic … the priority here is, first of all, what are we nearer to? And second of all, does this
 * > place even have the shape I need? … fix, fix, fix, fix, fix … there should probably be like a mass
 * > fix button"* — owner, S191 (refined)
 * >
 * > Answered later in S191: no shape available → gatherers keep gathering and fetch it once one appears;
 * > a repair in flight at FIGHT → the gatherer waits in the castle with the shape and fixes in the next
 * > BUILD.
 * >
 * > *"there should be a button on your castle saying fix all. And then it just gives a mass command to
 * > all the gatherers to first go and fix all the existing towers before … continuing to gather."*
 * > — owner, S192 (R192-W1)
 *
 * ## THE SHAPE OF IT
 *
 *   · `REPAIR_STRUCTURE` (the card's FIX) no longer restores on the spot: it QUEUES a job — the plan's
 *     bill (R13 what it lost / R182-E one shape flat), planned exactly as before (`planStructureRepair`:
 *     BUILD only R19, own ground, per tower inside a weld R191-A). `FIX_ALL` (the castle row) queues
 *     one for every tower of the seat that needs one, nearest the castle first.
 *   · Each SHAPE of a bill is one TASK, taken by one gatherer, so a five-shape bill spreads over five
 *     gatherers. A free gatherer (SEEKING, empty-handed) takes the first open shape of the first job
 *     in the queue that some source can supply, from the NEARER of: its castle (if the bank holds that
 *     type, net of shapes other tasks are already walking to collect) or the nearest quarry spark of
 *     that type. Nothing can supply it → the shape waits, and the gatherer keeps gathering.
 *   · A bank shape is debited ON ARRIVAL at the castle (never for an abandoned trip); a quarry spark is
 *     lifted out of the world on pickup. The gatherer walks the shape to the tower and hands it over.
 *   · When a job's whole bill is delivered, it is re-planned and — if what was delivered covers the
 *     bill as it stands NOW — the tower is restored (`restoreFromDelivered`), surplus shapes go to the
 *     bank; if the tower lost more meanwhile, the shortfall becomes new open shapes.
 *   · A job whose tower is gone, scrapped, or no longer fixable is CANCELLED: everything delivered and
 *     everything in a gatherer's hands goes back to the bank. Nothing is ever destroyed by a cancel.
 *   · FIGHT: no task is taken or delivered. The shelter (1 s before FIGHT) pulls every gatherer in;
 *     one holding a repair shape keeps it, and walks it out at the next BUILD.
 *
 * ## DETERMINISM
 *
 * Every pass is a total order: jobs in queue order (ids ascend), gatherers by id, quarry candidates by
 * squared distance then spark id, FIX ALL by squared distance from the castle then lowest member id.
 * No RNG, no wall clock, no float accumulator (positions are stepped by the gatherer's own speed).
 */
import type { SparkType } from '../constants.ts';
import { GATHERER_DEPOSIT_OFFSET_Y, GATHERER_REACH } from '../constants.ts';
import type { PlayerId, PrimitiveId, SparkId, Vec2 } from '../types.ts';
import { bankAdd, bankCountOf, bankRemove } from './castleBank.ts';
import { isEliminated } from './elimination.ts';
import { castleAnchor, type Gatherer } from './gatherers/gatherer.ts';
import { isHarvestable, stepToward } from './gatherers/gathererLifecycle.ts';
import type { RepairJob } from './repairJobTypes.ts';
import {
  planStructureRepair,
  restoreFromDelivered,
  type RepairPlan,
  type RepairStructureAction,
} from './structureRepair.ts';
import type { World } from './worldTypes.ts';

/** R192-W1 — the castle's FIX ALL. One intent, no payload: the host works out every tower. */
export interface FixAllAction {
  readonly type: 'FIX_ALL';
  readonly playerId: PlayerId;
}

/**
 * ⚠ MINE — the most jobs one seat may have queued. A bound on what a mashed FIX ALL (or a hostile
 * client) can grow the hashed queue to; the roster's largest base fits well inside it.
 */
export const REPAIR_JOBS_MAX_PER_SEAT = 32;

const distSq = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

/** Where a gatherer stands to take a shape out of (or hand one into) its castle — the deposit point. */
function castleDoor(world: World, seat: PlayerId): Vec2 {
  const home = castleAnchor(seat as unknown as number, world.layout);
  return { x: home.x, y: home.y + GATHERER_DEPOSIT_OFFSET_Y };
}

/** PURE — does this plan have anything to fix? (`applyRepairStructure`'s own idle test.) */
export function planNeedsWork(plan: RepairPlan): boolean {
  return plan.group.missing.length > 0 || plan.damagedCount > 0 || plan.missingBondCount > 0;
}

/** PURE — how many gatherers `seat` owns. A job nobody can carry is never queued. */
export function seatGathererCount(world: World, seat: PlayerId): number {
  let n = 0;
  for (const g of world.gatherers.values()) if (g.ownerPlayerId === seat) n++;
  return n;
}

/** PURE — the queued job of `seat` that already covers one of `memberIds` (one job per tower), or null. */
export function repairJobCovering(world: World, seat: PlayerId, memberIds: readonly PrimitiveId[]): RepairJob | null {
  const want = new Set(memberIds);
  for (const j of world.repairJobs) {
    if (j.seat !== seat) continue;
    for (const m of j.memberIds) if (want.has(m)) return j;
  }
  return null;
}

/**
 * PURE — the shape a job re-plans through: its `targetId` while it stands, else the lowest surviving
 * member whose plan still overlaps the job's members (so a shared shape never re-aims it at the
 * neighbour). `null` when nothing of it is left. Outside BUILD (no plan can be made) any surviving
 * member is accepted — the job is only CHECKED there, never acted on.
 */
export function repairJobTarget(world: World, job: RepairJob): PrimitiveId | null {
  if (world.primitives.has(job.targetId)) return job.targetId;
  const members = new Set(job.memberIds);
  for (const id of job.memberIds) {
    if (!world.primitives.has(id)) continue;
    if (world.matchPhase !== 'BUILD') return id;
    const plan = planStructureRepair(world, job.seat, id);
    if (plan !== null && plan.memberIds.some((m) => members.has(m))) return id;
  }
  return null;
}

function enqueue(world: World, seat: PlayerId, targetId: PrimitiveId, plan: RepairPlan): void {
  world.repairJobs.push({
    id: world.nextRepairJobId++,
    seat,
    targetId,
    memberIds: [...plan.memberIds].sort((a, b) => a - b),
    need: [...plan.cost],
    delivered: [],
  });
}

function seatJobCount(world: World, seat: PlayerId): number {
  let n = 0;
  for (const j of world.repairJobs) if (j.seat === seat) n++;
  return n;
}

/**
 * ⭐ R191-B — the card's FIX: queue the job. No-op-never-throw, like every reclaim intent: refused when
 * there is no FIX here (`planStructureRepair` null — wrong phase R19, wrong seat, rubble, a welded
 * free-form shape R191-A), nothing to fix, a job already covers this tower, the seat owns no gatherer
 * to carry it (⚠ MINE), or the seat's queue is full.
 *
 * ⚠ NOT gated on the bank covering the bill — *"no shape → keep gathering, fetch when one appears"*:
 * the quarry is a source too.
 */
export function applyQueueRepair(world: World, action: RepairStructureAction): World {
  const seat = action.playerId;
  if (!world.players.has(seat)) return world;
  const plan = planStructureRepair(world, seat, action.primitiveId);
  if (plan === null || !planNeedsWork(plan)) return world;
  if (repairJobCovering(world, seat, plan.memberIds) !== null) return world;
  if (seatGathererCount(world, seat) === 0) return world;
  if (seatJobCount(world, seat) >= REPAIR_JOBS_MAX_PER_SEAT) return world;
  enqueue(world, seat, action.primitiveId, plan);
  return world;
}

/** One tower FIX ALL would queue: the shape it plans through, and the plan. */
export interface FixAllTarget {
  readonly targetId: PrimitiveId;
  readonly plan: RepairPlan;
}

/**
 * ⭐ PURE — R192-W1 — every tower of `seat` FIX ALL would queue, in the order it queues them: squared
 * distance of the tower's anchor (a fallen stamp: its lowest shape) from the seat's castle, then its
 * lowest shape id. Towers already covered by a job, and towers with nothing to fix, are left out.
 *
 * A "tower" is any structure `planStructureRepair` will FIX — a stamped shape is the only thing that
 * has a bill (`blueprintGroupOf` needs provenance) — reached through each stamped shape of the seat in
 * ascending id, each plan's members then skipped, so a tower is planned once however many shapes it has.
 */
export function fixAllTargets(world: World, seat: PlayerId): FixAllTarget[] {
  const castle = castleAnchor(seat as unknown as number, world.layout);
  const covered = new Set<PrimitiveId>();
  for (const j of world.repairJobs) if (j.seat === seat) for (const m of j.memberIds) covered.add(m);
  const ids = [...world.primitives.values()]
    .filter((p) => p.placedBy === seat && p.origin !== null)
    .map((p) => p.id)
    .sort((a, b) => a - b);
  const out: Array<FixAllTarget & { d2: number; key: number }> = [];
  for (const id of ids) {
    if (covered.has(id)) continue;
    const plan = planStructureRepair(world, seat, id);
    if (plan === null) continue;
    let overlaps = false;
    for (const m of plan.memberIds) {
      if (covered.has(m)) overlaps = true;
      covered.add(m);
    }
    if (overlaps || !planNeedsWork(plan)) continue;
    const anchorId = plan.unit?.kind === 'live' ? plan.unit.anchorId : plan.memberIds[0]!;
    const at = world.primitives.get(anchorId) ?? world.primitives.get(id)!;
    out.push({ targetId: id, plan, d2: distSq(at.pos, castle), key: Math.min(...plan.memberIds) });
  }
  out.sort((a, b) => a.d2 - b.d2 || a.key - b.key);
  return out.map(({ targetId, plan }) => ({ targetId, plan }));
}

/**
 * ⭐ R192-W1 — FIX ALL: queue every tower `fixAllTargets` names, in its order. The same refusals as a
 * single FIX (no gatherer, the queue bound); BUILD only through `planStructureRepair` (R19).
 */
export function applyFixAll(world: World, action: FixAllAction): World {
  const seat = action.playerId;
  if (!world.players.has(seat)) return world;
  if (seatGathererCount(world, seat) === 0) return world;
  for (const t of fixAllTargets(world, seat)) {
    if (seatJobCount(world, seat) >= REPAIR_JOBS_MAX_PER_SEAT) break;
    enqueue(world, seat, t.targetId, t.plan);
  }
  return world;
}

/* ══ THE PER-TICK PASS ═══════════════════════════════════════════════════════════════════════ */

const byId = (a: Gatherer, b: Gatherer): number => Number(a.id) - Number(b.id);

/** Give every shape of a job back to the bank and drop it — tasks in flight included. Destroys nothing. */
function cancelJob(world: World, job: RepairJob): void {
  for (const t of job.delivered) bankAdd(world.castleBanks, job.seat, t);
  for (const g of [...world.gatherers.values()].sort(byId)) {
    const task = g.repairTask;
    if (task === null || task.jobId !== job.id) continue;
    if (task.carrying) bankAdd(world.castleBanks, g.ownerPlayerId, task.type);
    g.repairTask = null;
  }
  const i = world.repairJobs.indexOf(job);
  if (i !== -1) world.repairJobs.splice(i, 1);
}

/** A task ended without a delivery: its shape is open again, first in line (the bill's order). */
function reopen(world: World, g: Gatherer): void {
  const task = g.repairTask;
  if (task === null) return;
  const job = world.repairJobs.find((j) => j.id === task.jobId);
  if (task.carrying) {
    // Only reachable when the job vanished under it; a live job always takes the delivery.
    bankAdd(world.castleBanks, g.ownerPlayerId, task.type);
  } else if (job !== undefined) {
    job.need.unshift(task.type);
  }
  g.repairTask = null;
}

function tasksInFlight(world: World, jobId: number): number {
  let n = 0;
  for (const g of world.gatherers.values()) if (g.repairTask?.jobId === jobId) n++;
  return n;
}

/** Multiset `have` minus `want`, or null when `have` does not cover `want`. */
function coverRemainder(have: readonly SparkType[], want: readonly SparkType[]): { short: SparkType[]; surplus: SparkType[] } {
  const left = [...have];
  const short: SparkType[] = [];
  for (const t of want) {
    const i = left.indexOf(t);
    if (i === -1) short.push(t);
    else left.splice(i, 1);
  }
  return { short, surplus: left };
}

/** Move one task-holding gatherer one tick. */
function stepTask(world: World, g: Gatherer): void {
  const task = g.repairTask!;
  const job = world.repairJobs.find((j) => j.id === task.jobId);
  if (job === undefined) { reopen(world, g); return; }
  if (!task.carrying) {
    if (task.source === 'bank') {
      if (!stepToward(g, castleDoor(world, g.ownerPlayerId), GATHERER_REACH)) return;
      // Debited ON ARRIVAL: a trip abandoned on the way never cost the seat a shape.
      if (bankRemove(world.castleBanks, g.ownerPlayerId, task.type)) task.carrying = true;
      else reopen(world, g); // spent meanwhile — the shape is open again
      return;
    }
    const spark = task.sparkId === null ? undefined : world.freeSparks.get(task.sparkId);
    if (spark === undefined || !isHarvestable(spark)) { reopen(world, g); return; } // taken or reaped
    if (!stepToward(g, spark.pos, GATHERER_REACH)) return;
    world.freeSparks.delete(spark.id); // lifted, the way a deposit lifts a spark into the bank
    task.carrying = true;
    return;
  }
  const at = repairJobTarget(world, job);
  if (at === null) return; // the job is cancelled by the validation pass, refunding this shape
  if (!stepToward(g, world.primitives.get(at)!.pos, GATHERER_REACH)) return;
  job.delivered.push(task.type);
  g.repairTask = null; // back to gathering
}

/** The nearest quarry spark of `type` no other repair task is walking to — total order (d², id). */
function nearestQuarrySpark(world: World, from: Vec2, type: SparkType, claimed: ReadonlySet<SparkId>): { id: SparkId; d2: number } | null {
  let best: { id: SparkId; d2: number } | null = null;
  for (const s of world.freeSparks.values()) {
    if (s.type !== type || claimed.has(s.id) || !isHarvestable(s)) continue;
    const d2 = distSq(s.pos, from);
    if (best === null || d2 < best.d2 || (d2 === best.d2 && Number(s.id) < Number(best.id))) best = { id: s.id, d2 };
  }
  return best;
}

/** Offer the open shapes, in queue order, to the free gatherers, by id. */
function assignTasks(world: World): void {
  const free = [...world.gatherers.values()]
    .filter((g) => g.repairTask === null && g.state === 'SEEKING' && g.carriedSparkId === null)
    .sort(byId);
  if (free.length === 0) return;
  for (const g of free) {
    const seat = g.ownerPlayerId;
    const owner = world.players.get(seat);
    if (owner === undefined || isEliminated(owner)) continue;
    // Shapes already promised: bank shapes other tasks are walking to collect, sparks they are walking to.
    const reservedBank = new Map<SparkType, number>();
    const claimed = new Set<SparkId>();
    for (const o of world.gatherers.values()) {
      const t = o.repairTask;
      if (t === null || t.carrying) continue;
      if (t.source === 'bank' && o.ownerPlayerId === seat) reservedBank.set(t.type, (reservedBank.get(t.type) ?? 0) + 1);
      if (t.sparkId !== null) claimed.add(t.sparkId);
    }
    const door = castleDoor(world, seat);
    let done = false;
    for (const job of world.repairJobs) {
      if (job.seat !== seat || done) continue;
      for (let i = 0; i < job.need.length; i++) {
        const type = job.need[i]!;
        const inBank = bankCountOf(world.castleBanks, seat, type) - (reservedBank.get(type) ?? 0);
        const bankD2 = inBank > 0 ? distSq(g.pos, door) : Infinity;
        const quarry = nearestQuarrySpark(world, g.pos, type, claimed);
        const quarryD2 = quarry === null ? Infinity : quarry.d2;
        if (bankD2 === Infinity && quarryD2 === Infinity) continue; // nothing has it: it waits
        // "First of all, what are we nearer to?" — the castle wins a tie (it cannot be taken from under you).
        const fromBank = bankD2 <= quarryD2;
        job.need.splice(i, 1);
        g.repairTask = {
          jobId: job.id,
          type,
          source: fromBank ? 'bank' : 'quarry',
          sparkId: fromBank ? null : quarry!.id,
          carrying: false,
        };
        g.targetSparkId = null; // off the haul cycle: "the top priority for your gatherers"
        done = true;
        break;
      }
    }
  }
}

/**
 * ⭐ THE PASS, once per host tick, BEFORE the gatherer fan-out (which skips every task holder):
 *   1. CHECK every job — nothing of it left (any phase), or in BUILD no FIX here / nothing to fix →
 *      cancel, refunding every shape;
 *   2. MOVE every task holder (BUILD only — in FIGHT they are sheltered);
 *   3. FINISH every fully delivered job with no task in flight (BUILD only, R19);
 *   4. OFFER the open shapes to the free gatherers (BUILD only).
 */
export function tickRepairJobs(world: World): void {
  if (world.repairJobs.length === 0 && ![...world.gatherers.values()].some((g) => g.repairTask !== null)) return;
  const build = world.matchPhase === 'BUILD';

  for (const job of [...world.repairJobs]) {
    const owner = world.players.get(job.seat);
    if (owner === undefined) { cancelJob(world, job); continue; }
    const target = repairJobTarget(world, job);
    if (target === null) { cancelJob(world, job); continue; }
    if (!build) continue;
    const plan = planStructureRepair(world, job.seat, target);
    if (plan === null || !planNeedsWork(plan)) cancelJob(world, job);
  }
  // A task whose job is gone (cancelled above, or a malformed restore) — its shape goes home.
  for (const g of [...world.gatherers.values()].sort(byId)) {
    const t = g.repairTask;
    if (t !== null && !world.repairJobs.some((j) => j.id === t.jobId)) reopen(world, g);
  }
  if (!build) return;

  for (const g of [...world.gatherers.values()].sort(byId)) {
    if (g.repairTask === null || g.state === 'SHELTERED') continue;
    const owner = world.players.get(g.ownerPlayerId);
    if (owner !== undefined && isEliminated(owner)) continue;
    stepTask(world, g);
  }

  for (const job of [...world.repairJobs]) {
    if (job.need.length > 0 || tasksInFlight(world, job.id) > 0) continue;
    const target = repairJobTarget(world, job);
    const plan = target === null ? null : planStructureRepair(world, job.seat, target);
    if (plan === null || !planNeedsWork(plan)) { cancelJob(world, job); continue; }
    const { short, surplus } = coverRemainder(job.delivered, plan.cost);
    if (short.length > 0) {
      // The tower lost more while the shapes were on their way: the bill grew, the job goes on.
      job.need.push(...short);
      continue;
    }
    restoreFromDelivered(world, job.seat, plan);
    for (const t of surplus) bankAdd(world.castleBanks, job.seat, t);
    world.repairJobs.splice(world.repairJobs.indexOf(job), 1);
  }

  assignTasks(world);
}
