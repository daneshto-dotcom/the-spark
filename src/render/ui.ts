/**
 * SPARK — peripheral UI: energy gauge + win banner.
 * § XIV.8 LOCKED — energy is a flat passive +5/sec in Phase 1.
 * The gauge is a thin vertical bar on the right edge — fills as energy
 * accrues. No numeric readout (per § XV anti-bloat).
 *
 * Win banner is dormant until Session 4 flips world.gameState='WIN'.
 */

import { Application, Graphics, Text, TextStyle } from 'pixi.js';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PHASE_1_WIN_SCORE,
} from '../constants.ts';
import type { World } from '../state/world.ts';

const GAUGE_X = CANVAS_WIDTH - 24;
const GAUGE_Y_TOP = 80;
const GAUGE_Y_BOTTOM = CANVAS_HEIGHT - 80;
const GAUGE_WIDTH = 8;
const ENERGY_GAUGE_FULL = 100; // arbitrary visual cap

const PROGRESS_X = 12;
const PROGRESS_Y_TOP = CANVAS_HEIGHT - 80;
const PROGRESS_Y_BOTTOM = CANVAS_HEIGHT - 40;
const PROGRESS_WIDTH = 80;

export class HUD {
  private readonly gauge: Graphics;
  private readonly progress: Graphics;
  private readonly winText: Text;
  /**
   * Eased visual readout — lerped toward player.energy at 12% per frame
   * so the bar glides instead of stepping. Underlying world.player.energy
   * is unchanged; this is renderer-only state.
   */
  private displayEnergy = 0;
  private displayProgress = 0;
  private winTextAlphaTarget = 0;
  private winTextAlpha = 0;

  constructor(app: Application) {
    this.gauge = new Graphics();
    app.stage.addChild(this.gauge);

    this.progress = new Graphics();
    app.stage.addChild(this.progress);

    this.winText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 64,
        fill: 0xffffff,
        align: 'center',
      }),
    });
    this.winText.anchor.set(0.5);
    this.winText.position.set(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    this.winText.visible = false;
    app.stage.addChild(this.winText);
  }

  sync(world: World): void {
    this.drawEnergyGauge(world);
    this.drawProgress(world);
    this.drawWinState(world);
  }

  private drawEnergyGauge(world: World): void {
    const player = [...world.players.values()][0];
    if (player === undefined) return;
    const target = Math.min(player.energy, ENERGY_GAUGE_FULL);
    // 12% lerp ≈ 200ms 1→0 settle, smooth without feeling laggy.
    this.displayEnergy += (target - this.displayEnergy) * 0.12;
    const fillRatio = this.displayEnergy / ENERGY_GAUGE_FULL;
    const gaugeHeight = GAUGE_Y_BOTTOM - GAUGE_Y_TOP;
    const fillHeight = gaugeHeight * fillRatio;

    const g = this.gauge;
    g.clear();
    // Track.
    g.rect(GAUGE_X, GAUGE_Y_TOP, GAUGE_WIDTH, gaugeHeight)
      .stroke({ width: 1, color: 0x333333, alpha: 0.6 });
    // Fill (bottom-up).
    g.rect(
      GAUGE_X,
      GAUGE_Y_BOTTOM - fillHeight,
      GAUGE_WIDTH,
      fillHeight,
    ).fill({ color: player.color, alpha: 0.8 });
    // Glow accent at the fill edge — subtle visual feedback that the
    // bar is moving even when the change is small.
    if (fillRatio > 0.02) {
      g.rect(
        GAUGE_X - 2,
        GAUGE_Y_BOTTOM - fillHeight - 1,
        GAUGE_WIDTH + 4,
        2,
      ).fill({ color: player.color, alpha: 0.5 });
    }
  }

  private drawProgress(world: World): void {
    // S9 P3: progress is weighted by combo complexity — Magic combos count 3x.
    const target = Math.min(1, world.scoreProgress / PHASE_1_WIN_SCORE);
    this.displayProgress += (target - this.displayProgress) * 0.18;
    const g = this.progress;
    g.clear();
    const trackHeight = PROGRESS_Y_BOTTOM - PROGRESS_Y_TOP;
    g.rect(PROGRESS_X, PROGRESS_Y_TOP, PROGRESS_WIDTH, trackHeight)
      .stroke({ width: 1, color: 0x333333, alpha: 0.6 });
    g.rect(PROGRESS_X, PROGRESS_Y_TOP, PROGRESS_WIDTH * this.displayProgress, trackHeight)
      .fill({ color: 0xffffff, alpha: 0.6 });
  }

  private drawWinState(world: World): void {
    if (world.gameState === 'WIN' || world.gameState === 'POSTGAME') {
      this.winText.text = world.gameState === 'WIN' ? 'WIN' : 'WIN — click or press R to reset';
      this.winText.visible = true;
      this.winTextAlphaTarget = 1;
    } else {
      this.winTextAlphaTarget = 0;
      if (this.winTextAlpha < 0.01) this.winText.visible = false;
    }
    // Smooth fade so the WIN banner doesn't snap on/off.
    this.winTextAlpha += (this.winTextAlphaTarget - this.winTextAlpha) * 0.12;
    this.winText.alpha = this.winTextAlpha;
  }
}
