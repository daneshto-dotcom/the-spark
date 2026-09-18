/**
 * SPARK — dev stats overlay (toggle `~`).
 * § 10.6 frame budget visualisation: physics ≤ 5.5 ms, render ≤ 7.0 ms,
 * input + GC ≤ 4.17 ms, FPS = 60.
 *
 * Lines turn red when the slice exceeds its budget. Hidden by default —
 * press ~ (or `) to toggle. EMA smoothing damps single-frame spikes.
 */

import { Application, Text, TextStyle } from 'pixi.js';
import {
  FREE_SPARK_SOFT_CAP,
  NET_RENDER_DELAY_MS,
  NET_SNAPSHOT_HZ,
  STRAIN_BREAK_BY_TIER,
} from '../constants.ts';
import { netStats } from '../net/netStats.ts';
import type { World } from '../state/world.ts';

const PHYSICS_BUDGET_MS = 5.5;
const RENDER_BUDGET_MS = 7.0;
const FPS_TARGET = 60;
const EMA_ALPHA = 0.1;

/**
 * S182 STEP 0 — accepted-snapshot rate below which the joiner is STARVED rather than slow.
 * Derived from the cadence constant, never typed as a literal: `NET_SNAPSHOT_HZ` is the CAP the host
 * aims for, so anything meaningfully under it means snapshots are not arriving, and a joiner that
 * runs no sim has nothing else to move the board with.
 */
const SNAP_RX_STARVED_HZ = NET_SNAPSHOT_HZ * 0.8;
/**
 * S182 STEP 0 — accepted-snapshot gap beyond which the render-delay jitter buffer underruns.
 * `ClientSync.pickBracket` clamps to the newest buffered snapshot with `t=0` once the render clock
 * (now − NET_RENDER_DELAY_MS) runs past it, and `interpolatePositions` then writes that snapshot's
 * positions unchanged — the board FREEZES. Two render delays is the point past which that is
 * certain rather than marginal. ⚠ This threshold is Claude's, not an owner ruling; it exists to
 * colour a diagnostic line, and nothing in the sim reads it.
 */
const SNAP_GAP_BAD_MS = NET_RENDER_DELAY_MS * 2;

/** ≈bytes/sec → a compact KiB/s field. See netStats.ts on why sizes are approximate. */
function kibPerSec(bytesPerSec: number): string {
  return (bytesPerSec / 1024).toFixed(1).padStart(7, ' ');
}

export class StatsOverlay {
  private readonly text: Text;
  private isVisible = false;
  private physicsMs = 0;
  private renderMs = 0;
  private fps = 0;
  private lastFpsTime = performance.now();
  private framesSinceFps = 0;
  private sparkCount = 0;
  private freeSparkCount = 0;
  private primitiveCount = 0;
  private bondCount = 0;
  private worstStrain = 0;
  private effectsCount = 0;

  constructor(app: Application) {
    const style = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 12,
      fill: 0xcccccc,
      lineHeight: 14,
    });
    this.text = new Text({ text: '', style });
    this.text.position.set(10, 40);
    this.text.visible = this.isVisible;
    app.stage.addChild(this.text);

    window.addEventListener('keydown', (e) => {
      if (e.key === '~' || e.key === '`') {
        this.isVisible = !this.isVisible;
        this.text.visible = this.isVisible;
      }
    });
  }

  recordPhysics(ms: number): void {
    this.physicsMs = this.physicsMs * (1 - EMA_ALPHA) + ms * EMA_ALPHA;
  }

  recordRender(ms: number): void {
    this.renderMs = this.renderMs * (1 - EMA_ALPHA) + ms * EMA_ALPHA;
  }

  recordFrame(sparkCount: number): void {
    this.framesSinceFps++;
    this.sparkCount = sparkCount;
    const now = performance.now();
    const elapsed = now - this.lastFpsTime;
    if (elapsed >= 500) {
      const instantFps = (this.framesSinceFps * 1000) / elapsed;
      this.fps = this.fps === 0 ? instantFps : this.fps * 0.7 + instantFps * 0.3;
      this.lastFpsTime = now;
      this.framesSinceFps = 0;
    }
    if (this.isVisible) this.refreshText();
  }

  /** Update world-derived counters. Cheap to call every frame. */
  recordWorld(world: World, effectsActive: number): void {
    let free = 0;
    for (const s of world.freeSparks.values()) {
      if (s.state.kind === 'Free') free++;
    }
    this.freeSparkCount = free;
    this.primitiveCount = world.primitives.size;
    this.bondCount = world.bonds.size;
    this.effectsCount = effectsActive;

    let worst = 0;
    for (const bond of world.bonds.values()) {
      const dx = bond.b.pos.x - bond.a.pos.x;
      const dy = bond.b.pos.y - bond.a.pos.y;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / bond.restLength;
      const breakAt = STRAIN_BREAK_BY_TIER[bond.stiffnessTier];
      const stress = Math.max(0, (ratio - 1) / (breakAt - 1));
      if (stress > worst) worst = stress;
    }
    this.worstStrain = worst;
  }

  private refreshText(): void {
    const physBad = this.physicsMs > PHYSICS_BUDGET_MS;
    const renderBad = this.renderMs > RENDER_BUDGET_MS;
    const fpsBad = this.fps > 0 && this.fps < FPS_TARGET - 2;
    const capBad = this.freeSparkCount >= FREE_SPARK_SOFT_CAP;
    const strainBad = this.worstStrain > 0.7;

    this.text.text =
      `FPS      ${this.fps.toFixed(1).padStart(5, ' ')}  ${fpsBad ? '!' : ' '}\n` +
      `phys     ${this.physicsMs.toFixed(2).padStart(5, ' ')} ms ${physBad ? '!' : ' '} (≤ ${PHYSICS_BUDGET_MS})\n` +
      `render   ${this.renderMs.toFixed(2).padStart(5, ' ')} ms ${renderBad ? '!' : ' '} (≤ ${RENDER_BUDGET_MS})\n` +
      `entities ${this.sparkCount}\n` +
      `free     ${this.freeSparkCount.toString().padStart(2, ' ')}/${FREE_SPARK_SOFT_CAP}${capBad ? ' !' : ''}\n` +
      `prims    ${this.primitiveCount}\n` +
      `bonds    ${this.bondCount}\n` +
      `strain   ${this.worstStrain.toFixed(2)}${strainBad ? ' !' : ''}\n` +
      `fx       ${this.effectsCount}` +
      this.netSection();
    this.text.style.fill =
      physBad || renderBad || fpsBad || strainBad ? 0xff6666 : 0xcccccc;
  }

  /**
   * S182 STEP 0 — the net-bandwidth block. Empty (not even a header) unless the counters were armed
   * at boot via `?debug=1` / `?netstats=1`, so the overlay is unchanged for everyone else.
   *
   * ⭐ HOW TO READ IT, because the whole point is that one screenshot settles the diagnosis:
   *   • `out` with two near-equal strategy rows → the host is sending every snapshot TWICE.
   *   • `snap rx` well under `NET_SNAPSHOT_HZ` while `FPS` is fine → the joiner is STARVED, not slow.
   *     That combination is the owner's brother's video: a smooth 60 fps of a stationary board.
   *   • `dup` tracking `rx` one-for-one → the doubling confirmed from the receiving end.
   *   • `gap max` is the "every five seconds" number, in milliseconds.
   */
  private netSection(): string {
    // ⛔ GUARD BEFORE THE CLOCK READ. This was the one netStats call site that did not, so with the
    // counters disabled an open overlay still paid `performance.now()` plus two allocations every
    // frame — and the source tripwire that enforces the guard contract only scans transport.ts and
    // sync.ts, so it could not see the omission.
    if (!netStats.isEnabled()) return '';
    const n = netStats.read(performance.now());
    if (!n.enabled) return '';
    const perStrategy = n.outByStrategy
      .map((s) => `${s.name} ${(s.bytesPerSec / 1024).toFixed(1)}`)
      .join(' · ');
    const rxStarved = n.acceptedTotal > 0 && n.snapRxPerSec < SNAP_RX_STARVED_HZ;
    const gapBad = n.gapMaxMs > SNAP_GAP_BAD_MS;
    // `since` is live, so its threshold flags a freeze IN PROGRESS rather than one already over.
    const sinceBad = n.msSinceLastAcceptMs > SNAP_GAP_BAD_MS;
    const sinceText = n.msSinceLastAcceptMs < 0 ? '—' : n.msSinceLastAcceptMs.toFixed(0);
    return (
      `\n--- net (S182 step 0) ---\n` +
      `out     ${kibPerSec(n.outBytesPerSec)} KiB/s${perStrategy === '' ? '' : `  [${perStrategy}]`}\n` +
      `in      ${kibPerSec(n.inBytesPerSec)} KiB/s\n` +
      `snap tx ${n.snapTxPerSec.toFixed(1).padStart(7, ' ')} /s   ${(n.snapTxBytes / 1024).toFixed(1)} KiB ea\n` +
      `snap rx ${n.snapRxPerSec.toFixed(1).padStart(7, ' ')} /s${rxStarved ? ' !' : '  '} ` +
      `dup ${n.snapDupPerSec.toFixed(1)} /s\n` +
      `snap n  ${n.acceptedTotal} ok / ${n.dupTotal} dup` +
      (n.epochDropTotal > 0 ? ` / ${n.epochDropTotal} epoch` : '') +
      '\n' +
      // ⭐ THE LIVE ONE. Counts up in real time during a stall; every other gap field is frozen
      // until the snapshot that ENDS the stall arrives. This is the line that shows a freeze
      // WHILE it is happening.
      `since   ${sinceText.padStart(7, ' ')} ms${sinceBad ? ' !! FROZEN' : ''}\n` +
      `gap     last ${n.gapLastMs.toFixed(0)} avg ${n.gapAvgMs.toFixed(0)} ` +
      `max ${n.gapMaxMs.toFixed(0)} ms${gapBad ? ' !' : ''}`
    );
  }
}
