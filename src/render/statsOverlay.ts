/**
 * SPARK — dev stats overlay (toggle `~`).
 * § 10.6 frame budget visualisation: physics ≤ 5.5 ms, render ≤ 7.0 ms,
 * input + GC ≤ 4.17 ms, FPS = 60.
 *
 * Lines turn red when the slice exceeds its budget. Hidden by default —
 * press ~ (or `) to toggle. EMA smoothing damps single-frame spikes.
 */

import { Application, Text, TextStyle } from 'pixi.js';
import { FREE_SPARK_SOFT_CAP, STRAIN_BREAK_BY_TIER } from '../constants.ts';
import type { World } from '../state/world.ts';

const PHYSICS_BUDGET_MS = 5.5;
const RENDER_BUDGET_MS = 7.0;
const FPS_TARGET = 60;
const EMA_ALPHA = 0.1;

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
      `fx       ${this.effectsCount}`;
    this.text.style.fill =
      physBad || renderBad || fpsBad || strainBad ? 0xff6666 : 0xcccccc;
  }
}
