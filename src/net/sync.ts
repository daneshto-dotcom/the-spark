/**
 * SPARK — host emit + client apply + lerp interpolation for Phase-2 1v1.
 *
 * § 11 LOCKED (post-S15): host emits NetSnapshot at NET_SNAPSHOT_HZ (10);
 * client interpolates linearly between prev + current snapshot over
 * NET_INTERPOLATION_MS (100). Per-direction sequence numbers (snapshotSeq
 * host→client; intentSeq client→host). Out-of-order snapshots rejected by
 * seq check.
 *
 * Authority model: host runs full Verlet sim authoritatively; client
 * receives snapshots and applies them. Client input becomes Intent
 * envelopes (host validates + dispatches in its world). Local cursor /
 * AttractDrag transient visual mutations happen pre-snapshot but are
 * overwritten when the next snapshot arrives — known v1 limitation
 * (AttractDrag client latency ~RTT/2; S16 prediction work).
 */

import type { NetSnapshot, NetSnapshotMsg, IntentMsg } from './protocol.ts';
import type { GameAction, World } from '../state/world.ts';
import { netSnapshot, applyNetSnapshot } from '../state/save.ts';
import { lerp01 } from './lerp.ts';
import type { SparkId } from '../types.ts';

/** Server-side: emit snapshots at fixed rate, increment seq. */
export class HostSync {
  private snapshotSeq = 0;

  /** Build a snapshot envelope ready to be sent. */
  buildSnapshotMessage(world: World): NetSnapshotMsg {
    this.snapshotSeq++;
    return {
      kind: 'NETSNAPSHOT',
      snapshotSeq: this.snapshotSeq,
      snapshot: netSnapshot(world),
    };
  }

  currentSeq(): number {
    return this.snapshotSeq;
  }
}

/** Client-side: receive snapshots, lerp-interpolate between prev + current. */
export class ClientSync {
  private prevSnap: NetSnapshot | null = null;
  private currentSnap: NetSnapshot | null = null;
  private currentSnapTime = 0;
  /** Highest snapshotSeq accepted — newer-than-this required for next apply. */
  private lastSeq = 0;
  /** Outgoing intent counter — used by controls when wrapping local actions. */
  private intentSeq = 0;
  /** Set true on receive; cleared after applyNetSnapshot runs on next render frame. */
  private needsFullApply = false;
  /** S39 P1 — count of applyNetSnapshot throws caught by interpolateInto. */
  private applyErrorCount = 0;

  /**
   * Accept the snapshot if seq > lastSeq. Stale / out-of-order rejected.
   * Returns true on accept (caller may want to log on reject).
   */
  receive(msg: NetSnapshotMsg, now: number): boolean {
    if (msg.snapshotSeq <= this.lastSeq) return false;
    this.lastSeq = msg.snapshotSeq;
    this.prevSnap = this.currentSnap;
    this.currentSnap = msg.snapshot;
    this.currentSnapTime = now;
    this.needsFullApply = true;
    return true;
  }

  /**
   * Wrap a local GameAction as an INTENT envelope ready for transport.
   * Increments intentSeq.
   */
  wrapIntent(action: GameAction): IntentMsg {
    this.intentSeq++;
    return { kind: 'INTENT', intentSeq: this.intentSeq, action };
  }

  /**
   * Render-time: write interpolated state into `world`. First snapshot
   * applies directly (no prev to lerp from). Subsequent snapshots lerp
   * primitive + freeSpark positions over NET_INTERPOLATION_MS.
   *
   * Non-position state (gameState, scoreProgress, currentPlayerId,
   * players, bonds adjacency) is snapped to currentSnap ONCE per new
   * snapshot (PRIME-AUDIT perf note — avoid per-render Map rebuilds).
   * Positions then lerp every render frame.
   *
   * S52 P1 Council C4 — `dragLockedSparkId` (optional): when present, the
   * snapshot lerp SKIPS that spark so a locally-dragged spark's position
   * (controls.stepAttractLerp on joiner) isn't clobbered every frame by
   * the host's stale "spark at spawn" snapshot. Lock is set during local
   * AttractDrag and for ~300ms after LMB-up dispatches PLACE_FROM_FREE
   * (closes the in-flight blink before the placement snapshot arrives).
   * Closes Gemini #2 HIGH from Council R1.
   */
  interpolateInto(
    world: World,
    now: number,
    interpolationMs: number,
    dragLockedSparkId?: SparkId,
  ): void {
    if (this.currentSnap === null) return;

    if (this.needsFullApply) {
      // Audit Pass 1 fix e698a17a: try/catch around applyNetSnapshot. Pre-fix
      // this throw (`unsupported schemaVersion` or `bond X references missing
      // primitive`, save.ts:328/435) propagated up through the Pixi ticker into
      // an uncaught render-loop error. Combined with finding d3f0e22b's
      // strengthened parseNetMessage wiring at transport.ts:recvFn, malformed
      // snapshots are now pre-rejected at the wire — this guard is the
      // defense-in-depth second layer for the host-malicious-or-buggy case
      // (a peer that conforms to parseNetMessage's structural shape but emits
      // an internally inconsistent snapshot, e.g. bond referencing a primitive
      // that was dropped between serializer passes).
      //
      // On error: skip THIS apply, leave needsFullApply=true so the next
      // snapshot retries. World may be in a partially-mutated intermediate
      // state if the throw happened mid-bonds-loop (applySnapshotCore clears
      // Maps before re-populating); subsequent snapshots will fully rebuild,
      // so any visible glitch is single-frame.
      try {
        applyNetSnapshot(this.currentSnap, world);
        this.needsFullApply = false;
      } catch (err) {
        this.applyErrorCount++;
        console.error(
          '[sync] applyNetSnapshot rejected snapshot:',
          err instanceof Error ? err.message : String(err),
        );
        return;
      }
    }

    if (this.prevSnap === null) return; // first snapshot — no lerp source.

    const elapsed = now - this.currentSnapTime;
    const t = lerp01(elapsed / interpolationMs);
    // t=1 means we've reached the current snapshot; t=0 means we just got it.
    // Render-position = lerp(prev, current, t). At t=1, positions == current.
    interpolatePositions(this.prevSnap, this.currentSnap, t, world, dragLockedSparkId);
  }

  lastSnapshotSeq(): number {
    return this.lastSeq;
  }

  /** S39 P1 — count of applyNetSnapshot throws caught by interpolateInto; surfaced in lobby diagnostics. */
  applyErrors(): number {
    return this.applyErrorCount;
  }

  reset(): void {
    this.prevSnap = null;
    this.currentSnap = null;
    this.currentSnapTime = 0;
    this.lastSeq = 0;
    this.intentSeq = 0;
    this.needsFullApply = false;
    this.applyErrorCount = 0;
  }
}

/**
 * Lerp primitive + freeSpark positions. Bonds derive position from prims,
 * so no per-bond lerp needed.
 *
 * S52 P1 Council C4 — `dragLockedSparkId` (optional): when set, the matching
 * freeSpark is excluded from the lerp loop so the joiner's local AttractDrag
 * (or post-LMB-up pendingPlaceFromFree TTL) position survives without
 * snapshot clobber. Primitives are NEVER drag-locked — they're host-
 * authoritative immutable after placement.
 *
 * Exported for unit testing.
 */
export function interpolatePositions(
  prev: NetSnapshot,
  curr: NetSnapshot,
  t: number,
  world: World,
  dragLockedSparkId?: SparkId,
): void {
  const prevPrims = new Map(prev.primitives.map((p) => [p.id, p]));
  for (const cp of curr.primitives) {
    const pp = prevPrims.get(cp.id);
    const prim = world.primitives.get(cp.id);
    if (prim === undefined || pp === undefined) continue;
    prim.pos.x = pp.pos.x + (cp.pos.x - pp.pos.x) * t;
    prim.pos.y = pp.pos.y + (cp.pos.y - pp.pos.y) * t;
  }
  const prevSparks = new Map(prev.freeSparks.map((s) => [s.id, s]));
  for (const cs of curr.freeSparks) {
    // S52 P1 Council C4 — skip the locally-dragged spark.
    if (dragLockedSparkId !== undefined && cs.id === dragLockedSparkId) continue;
    const ps = prevSparks.get(cs.id);
    const spark = world.freeSparks.get(cs.id);
    if (spark === undefined || ps === undefined) continue;
    spark.pos.x = ps.pos.x + (cs.pos.x - ps.pos.x) * t;
    spark.pos.y = ps.pos.y + (cs.pos.y - ps.pos.y) * t;
  }
}
