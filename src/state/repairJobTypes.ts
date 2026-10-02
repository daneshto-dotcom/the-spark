/**
 * SPARK — S193 R191-B / R192-W1 — **FIX IS A GATHERER JOB** (pure types, leaf module).
 *
 * Owner, S191: *"clicking on fix … it actually queues … a gatherer and he has to bring the shape from
 * the castle to the tower that needs fixing. And once he reaches the tower, that fixes [it]
 * automatically … It's going to be the top … priority for your gatherers."* Refined: *"one or multiple
 * gatherers, depends how many shapes it needs … the priority here is, first of all, what are we nearer
 * to? And second of all, does this place even have the shape I need?"* Answered later: *no shape → keep
 * gathering, fetch when one appears; a repair in flight at FIGHT waits in the castle and lands next
 * BUILD.* S192 (R192-W1): *"a button on your castle saying fix all … a mass command to all the
 * gatherers to first go and fix all the existing towers before … continuing to gather."*
 *
 * Leaf on purpose: `worldTypes.ts` imports these, so nothing here may import a reducer.
 */
import type { SparkType } from '../constants.ts';
import type { PlayerId, PrimitiveId, SparkId } from '../types.ts';

/**
 * One queued FIX: a tower (or an un-welded stamped structure) and the shapes its bill still needs.
 *
 * ⚠ ADDRESSED BY SHAPES, NOT BY A TOWER ID, for `RepairStructureAction`'s reason: there is no
 * structure id. `targetId` is the shape the FIX was planned through and `memberIds` the plan's members
 * then (ascending). Every re-plan goes through `targetId` while it stands, else through the lowest
 * surviving member whose plan still overlaps `memberIds`, so the job resolves its tower exactly the way
 * the card and the reducer do (`reclaimScopeAt`) — a shape two towers share never re-aims it.
 */
export interface RepairJob {
  readonly id: number;
  readonly seat: PlayerId;
  /** The shape the FIX was planned through (the clicked shape; FIX ALL's pick). Re-planned through it while it stands. */
  readonly targetId: PrimitiveId;
  readonly memberIds: readonly PrimitiveId[];
  /** Shapes of the bill no gatherer has taken yet, in bill order. */
  need: SparkType[];
  /** Shapes already carried to the tower, waiting for the rest of the bill. */
  delivered: SparkType[];
}

/**
 * A gatherer's part in a job: ONE shape, from ONE source, to the job's tower.
 *
 * `carrying` false: walking to the source — the castle (`'bank'`; debited only on arrival, so a shape
 * is never spent for a trip that is abandoned) or a quarry spark (`'quarry'`, `sparkId`). `carrying`
 * true: holding the shape (a TYPE — a quarry spark is lifted out of `freeSparks` on pickup, the way a
 * deposit lifts it into the bank) and walking it to the tower.
 */
export interface RepairTask {
  readonly jobId: number;
  readonly type: SparkType;
  readonly source: 'bank' | 'quarry';
  readonly sparkId: SparkId | null;
  carrying: boolean;
}
