/**
 * SPARK — host emit + client apply + lerp interpolation for Phase-2 1v1.
 *
 * § 11 (post-S15): host emits NetSnapshot at NET_SNAPSHOT_HZ (10). S89 P5 — the client now
 * buffers recent snapshots and renders the world NET_RENDER_DELAY_MS behind real time,
 * interpolating the two snapshots BRACKETING that render clock (a render-delay jitter buffer).
 * This replaced the original prev→current single-pair lerp over NET_INTERPOLATION_MS=100, whose
 * window equalled the snapshot interval ⇒ zero jitter buffer ⇒ freeze-then-jump on every late
 * packet. Per-direction sequence numbers (snapshotSeq host→client; intentSeq client→host).
 * Out-of-order snapshots rejected by seq check.
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
import type { SparkId, Vec2 } from '../types.ts';

/**
 * S89 P5 — how many recent snapshots the client keeps for render-delay interpolation.
 * The render clock sits NET_RENDER_DELAY_MS behind real time (≈1.5 snapshot intervals),
 * so a bracketing pair almost always exists; 8 × 100ms = 800ms of history is ample headroom.
 */
const SNAP_BUFFER_MAX = 8;

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

/** Client-side: receive snapshots, render-delay interpolate between buffered snapshots. */
export class ClientSync {
  /** The latest accepted snapshot — drives the full state apply (entity SET + non-position). */
  private currentSnap: NetSnapshot | null = null;
  /**
   * S89 P5 — ring of recent snapshots with their LOCAL arrival time. The render clock sits
   * NET_RENDER_DELAY_MS behind real time and interpolates the two snapshots BRACKETING that
   * render time. This is the jitter buffer the old single-pair lerp lacked: the previous scheme
   * lerped prev→current over a window EQUAL to the snapshot interval and restarted the lerp on
   * each arrival, so a late packet saturated t at 1 (freeze) then jumped — every jittery interval.
   * Bracketing a render-delayed clock means a newer snapshot almost always exists past the render
   * time, so motion stays continuous; only a true stall (no packet for > the delay) clamps.
   */
  private snapBuffer: Array<{ snap: NetSnapshot; t: number }> = [];
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
    this.currentSnap = msg.snapshot;
    this.needsFullApply = true;
    // S89 P5 — append to the render-delay buffer (seq-monotonic ⇒ arrival-time-monotonic since
    // out-of-order is rejected above). Cap the history; the render clock only ever looks back
    // ~NET_RENDER_DELAY_MS, far inside SNAP_BUFFER_MAX × interval.
    this.snapBuffer.push({ snap: msg.snapshot, t: now });
    if (this.snapBuffer.length > SNAP_BUFFER_MAX) this.snapBuffer.shift();
    return true;
  }

  /**
   * S89 P5 — pick the two buffered snapshots bracketing `renderTime` (= now − render delay) plus
   * the lerp factor between them. Degrades gracefully (PRIME-AUDIT A1):
   *   • empty buffer → null (caller skips the lerp);
   *   • renderTime at/before the oldest (cold start, < 2 snapshots buffered) → clamp to oldest;
   *   • renderTime at/after the newest (buffer underrun / network stall) → clamp to newest (no
   *     extrapolation — holding the last known pose is safer than inventing one);
   *   • otherwise the consecutive pair a,b with a.t ≤ renderTime ≤ b.t.
   * A clamp returns a === b with t = 0, so interpolatePositions writes that snapshot's positions.
   */
  private pickBracket(renderTime: number): { a: NetSnapshot; b: NetSnapshot; t: number } | null {
    const buf = this.snapBuffer;
    if (buf.length === 0) return null;
    if (buf.length === 1 || renderTime <= buf[0].t) {
      return { a: buf[0].snap, b: buf[0].snap, t: 0 };
    }
    const last = buf[buf.length - 1];
    if (renderTime >= last.t) {
      return { a: last.snap, b: last.snap, t: 0 };
    }
    for (let i = 1; i < buf.length; i++) {
      if (buf[i].t >= renderTime) {
        const a = buf[i - 1];
        const b = buf[i];
        const span = b.t - a.t;
        return { a: a.snap, b: b.snap, t: span > 0 ? lerp01((renderTime - a.t) / span) : 0 };
      }
    }
    // Unreachable (renderTime is strictly between oldest and newest), but stay total.
    return { a: last.snap, b: last.snap, t: 0 };
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
   * Render-time: write interpolated state into `world`. The LATEST snapshot's entity SET +
   * non-position state is applied once per arrival (the needsFullApply block below); positions
   * are then interpolated EVERY render frame from the two buffered snapshots bracketing the
   * render clock (now − renderDelayMs) — see pickBracket. The first snapshot, or a cold/underrun
   * buffer, clamps to a single snapshot (no extrapolation).
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
    renderDelayMs: number,
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
      //
      // S56 P1 (GAP 2) — preserve the locally-dragged spark across the full
      // snapshot rebuild. applySnapshotCore does world.freeSparks.clear() then
      // recreates EVERY spark as a NEW object at its snapshot (spawn) position
      // (save.ts). The dragLock below only makes interpolatePositions SKIP the
      // lerp — it does NOT shield this clear+rebuild, so without preservation
      // the joiner's dragged spark snaps back to spawn on every snapshot (10Hz)
      // → sawtooth jitter. Capture pos+prevPos before the rebuild, write them
      // back after, so the dragged spark's position is fully client-owned for
      // the gesture (completing S52 P1's dragLock intent). Restore is guarded:
      // only if the spark is still present AND still Free in the new snapshot —
      // if the host despawned / grabbed / consumed it, the restore is skipped
      // and the next controls.applyPerSubstep null/!Free check ends the drag
      // cleanly (Council Gemini-A/D → no crash). prevPos is render-inert on the
      // client (no client verlet; Council GROK#6b refuted) but preserved for
      // state hygiene.
      let lockedPos: { x: number; y: number } | null = null;
      let lockedPrev: { x: number; y: number } | null = null;
      if (dragLockedSparkId !== undefined) {
        const locked = world.freeSparks.get(dragLockedSparkId);
        if (locked !== undefined) {
          lockedPos = { x: locked.pos.x, y: locked.pos.y };
          lockedPrev = { x: locked.prevPos.x, y: locked.prevPos.y };
        }
      }
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
      if (lockedPos !== null && lockedPrev !== null && dragLockedSparkId !== undefined) {
        const locked = world.freeSparks.get(dragLockedSparkId);
        // S58 (#2) — preserve the locally-predicted drag position for a spark
        // that is Free (pre-S58 path) OR now Carried by the LOCAL player (the
        // LMB-down claim). Without the Carried case, a claimed drag would snap
        // to the host's 10Hz-stale pos every snapshot (the S56 GAP-2 sawtooth).
        // A spark Carried by the OPPONENT (race-lost) fails the carrierId check
        // → not preserved → the next applyPerSubstep `mine` guard ends the drag.
        if (
          locked !== undefined &&
          (locked.state.kind === 'Free' ||
            (locked.state.kind === 'Carried' &&
              locked.state.carrierId === world.localPlayerId))
        ) {
          locked.pos.x = lockedPos.x;
          locked.pos.y = lockedPos.y;
          locked.prevPos.x = lockedPrev.x;
          locked.prevPos.y = lockedPrev.y;
        }
      }
    }

    // S89 P5 — render-delay bracket lerp. Render the world as it was renderDelayMs ago,
    // interpolating the two buffered snapshots bracketing that render time. This is the jitter
    // buffer the old prev→current scheme lacked (see pickBracket / the snapBuffer comment).
    // Positions only — non-position state was snapped to the LATEST snapshot in the full apply
    // above; determinism is untouched (the client never simulates from these positions).
    const bracket = this.pickBracket(now - renderDelayMs);
    if (bracket === null) return; // no snapshot buffered yet
    interpolatePositions(bracket.a, bracket.b, bracket.t, world, dragLockedSparkId);
  }

  lastSnapshotSeq(): number {
    return this.lastSeq;
  }

  /** S39 P1 — count of applyNetSnapshot throws caught by interpolateInto; surfaced in lobby diagnostics. */
  applyErrors(): number {
    return this.applyErrorCount;
  }

  reset(): void {
    this.currentSnap = null;
    this.snapBuffer = [];
    this.lastSeq = 0;
    this.intentSeq = 0;
    this.needsFullApply = false;
    this.applyErrorCount = 0;
  }
}

/**
 * S89 P5 — lerp ONE id-keyed entity collection prev→curr by t. Skips entities absent from
 * EITHER snapshot (just-spawned / despawned → left at the full-apply position, never
 * extrapolated) and the optional skip id (the drag-locked spark). Generic over the serialized
 * {id, pos} shape so every moving hazard reuses one tested code path. A no-op when either array
 * is absent (the optional hazard arrays are omitted from the wire when empty).
 */
function lerpCollection<K, E extends { pos: Vec2 }>(
  prev: ReadonlyArray<{ id: K; pos: Vec2 }> | undefined,
  curr: ReadonlyArray<{ id: K; pos: Vec2 }> | undefined,
  t: number,
  worldMap: Map<K, E>,
  skipId?: K,
): void {
  if (prev === undefined || curr === undefined) return;
  const prevById = new Map(prev.map((e) => [e.id, e]));
  for (const c of curr) {
    if (skipId !== undefined && c.id === skipId) continue;
    const p = prevById.get(c.id);
    const ent = worldMap.get(c.id);
    if (ent === undefined || p === undefined) continue;
    ent.pos.x = p.pos.x + (c.pos.x - p.pos.x) * t;
    ent.pos.y = p.pos.y + (c.pos.y - p.pos.y) * t;
  }
}

/**
 * Lerp primitive + freeSpark + moving-hazard positions. Bonds derive position from prims,
 * so no per-bond lerp needed.
 *
 * S52 P1 Council C4 — `dragLockedSparkId` (optional): when set, the matching
 * freeSpark is excluded from the lerp loop so the joiner's local AttractDrag
 * (or post-LMB-up pendingPlaceFromFree TTL) position survives without
 * snapshot clobber. Primitives are NEVER drag-locked — they're host-
 * authoritative immutable after placement.
 *
 * S89 P5 — also interpolates the CONTINUOUSLY-moving hazards (hunters + seagulls), which
 * previously rendered RAW at 10Hz on the client and visibly stepped while structures + sparks
 * glided. Avatars are NOT here — the avatarRenderer's smoothTowards already de-steps avatarPos.
 * S89 post-audit — creatures (voltkin) are added too, but STATE-GATED to SEEKING-in-both-snapshots
 * (their only continuous-motion phase). They DO ride the client mirror (NetSnapshot v2; the S27
 * "client creatures stay empty" comment is stale) and stepped at 10Hz while SEEKING — the exact
 * artifact P5 set out to kill. The final-audit MED finding: the P5 Council coverage said
 * "creatures"; the hunter+seagull narrowing (CHECK finding #5) had over-dropped them.
 *
 * DELIBERATELY EXCLUDED (CHECK GROK-ANALYST finding #5 — lerping a DISCONTINUOUS position jump
 * smears the entity across the screen for a render-delay window): poops (the FALLING→SPLAT
 * transition snaps the pos onto the struck structure — a lerp would slide the splat mid-air),
 * potatoes (grab teleports it to the carrier's hand), rainbows + bombs (spawn / pickup-vanish /
 * placement). Hunters pursue continuously and seagulls fly linearly across the field — neither
 * mid-life-teleports, so their lerp is clean (a spawn is absent-from-prev → skipped; a despawn is
 * removed by the full apply → pops, which is correct). Creatures: SPAWNING/DESPAWNING are
 * stationary animation states + a state transition could shift the anchor, so only SEEKING lerps.
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
  // S89 P5 — continuous-motion hazards only (no-op when the optional wire array is absent/empty).
  // Poops/potatoes/rainbows/bombs are EXCLUDED — they transition discontinuously and a lerp would
  // smear them (CHECK finding #5). See the function doc.
  lerpCollection(prev.hunters, curr.hunters, t, world.hunters);
  lerpCollection(prev.seagulls, curr.seagulls, t, world.seagulls);
  // S89 post-audit — creatures, STATE-GATED to SEEKING-in-both (their continuous-motion phase).
  // SPAWNING/DESPAWNING (stationary animation) + any state transition are skipped so a creature
  // is never smeared across a state change; a creature absent from prev is skipped (just spawned).
  if (curr.creatures !== undefined && prev.creatures !== undefined) {
    const prevCreatures = new Map(prev.creatures.map((c) => [c.id, c]));
    for (const cc of curr.creatures) {
      if (cc.state !== 'SEEKING') continue;
      const pc = prevCreatures.get(cc.id);
      if (pc === undefined || pc.state !== 'SEEKING') continue;
      const creature = world.creatures.get(cc.id);
      if (creature === undefined) continue;
      creature.pos.x = pc.pos.x + (cc.pos.x - pc.pos.x) * t;
      creature.pos.y = pc.pos.y + (cc.pos.y - pc.pos.y) * t;
    }
  }
}
