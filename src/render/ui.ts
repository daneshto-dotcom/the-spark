/**
 * SPARK — peripheral UI: energy gauge + win banner + (S15 P2) 1v1 HUD.
 * § XIV.8 LOCKED — energy is a flat passive +5/sec in Phase 1.
 * The gauge is a thin vertical bar on the right edge — fills as energy
 * accrues. No numeric readout (per § XV anti-bloat).
 *
 * Win banner is dormant until Session 4 flips world.gameState='WIN'.
 *
 * S15 P2 additions (1v1 only): turn indicator badge (top-center, active
 * player color); per-player score readouts (top-left, both scores); net
 * connection status dot (top-right). Hidden in solo mode.
 */

import { Application, Graphics, Text, TextStyle } from 'pixi.js';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PHASE_1_WIN_SCORE,
} from '../constants.ts';
import type { World } from '../state/world.ts';
import { asPlayerId } from '../types.ts';

const GAUGE_X = CANVAS_WIDTH - 24;
const GAUGE_Y_TOP = 80;
const GAUGE_Y_BOTTOM = CANVAS_HEIGHT - 80;
const GAUGE_WIDTH = 8;
const ENERGY_GAUGE_FULL = 100;

const PROGRESS_X = 12;
const PROGRESS_Y_TOP = CANVAS_HEIGHT - 80;
const PROGRESS_Y_BOTTOM = CANVAS_HEIGHT - 40;
const PROGRESS_WIDTH = 80;

export class HUD {
  private readonly gauge: Graphics;
  private readonly progress: Graphics;
  private readonly winText: Text;
  private readonly turnBadge: Text;
  private readonly p1ScoreText: Text;
  private readonly p2ScoreText: Text;
  private readonly connectionDot: Graphics;
  private displayEnergy = 0;
  private displayProgress = 0;
  private winTextAlphaTarget = 0;
  private winTextAlpha = 0;
  /** S15 P2 — set by main.ts each frame; reflects netTransport.peerCount(). */
  private connectedPeers = 0;

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

    // S15 P2 — 1v1 turn indicator (top-center).
    this.turnBadge = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 24,
        fill: 0xffffff,
        letterSpacing: 4,
      }),
    });
    this.turnBadge.anchor.set(0.5);
    this.turnBadge.position.set(CANVAS_WIDTH / 2, 40);
    this.turnBadge.visible = false;
    app.stage.addChild(this.turnBadge);

    // S15 P2 — per-player score (top-left, vertical stack).
    this.p1ScoreText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: 0xff3b6b }),
    });
    this.p1ScoreText.position.set(12, 12);
    this.p1ScoreText.visible = false;
    app.stage.addChild(this.p1ScoreText);

    this.p2ScoreText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: 0x3bd7ff }),
    });
    this.p2ScoreText.position.set(12, 34);
    this.p2ScoreText.visible = false;
    app.stage.addChild(this.p2ScoreText);

    // S15 P2 — connection status dot (top-right).
    this.connectionDot = new Graphics();
    app.stage.addChild(this.connectionDot);
  }

  /** S15 P2 — main.ts sets this from netTransport.peerCount() each frame. */
  setConnectionPeers(peers: number): void {
    this.connectedPeers = peers;
  }

  sync(world: World): void {
    this.drawEnergyGauge(world);
    this.drawProgress(world);
    this.drawWinState(world);
    this.drawMultiplayerHUD(world);
  }

  private drawEnergyGauge(world: World): void {
    // S15 P2: in 1v1 show the LOCAL active player's energy. Without an
    // explicit "local player" handle we use currentPlayerId — flips on
    // END_TURN. Solo behavior unchanged (player 0 always active).
    const active = world.players.get(world.currentPlayerId) ?? [...world.players.values()][0];
    if (active === undefined) return;
    const target = Math.min(active.energy, ENERGY_GAUGE_FULL);
    this.displayEnergy += (target - this.displayEnergy) * 0.12;
    const fillRatio = this.displayEnergy / ENERGY_GAUGE_FULL;
    const gaugeHeight = GAUGE_Y_BOTTOM - GAUGE_Y_TOP;
    const fillHeight = gaugeHeight * fillRatio;

    const g = this.gauge;
    g.clear();
    g.rect(GAUGE_X, GAUGE_Y_TOP, GAUGE_WIDTH, gaugeHeight)
      .stroke({ width: 1, color: 0x333333, alpha: 0.6 });
    g.rect(
      GAUGE_X,
      GAUGE_Y_BOTTOM - fillHeight,
      GAUGE_WIDTH,
      fillHeight,
    ).fill({ color: active.color, alpha: 0.8 });
    if (fillRatio > 0.02) {
      g.rect(
        GAUGE_X - 2,
        GAUGE_Y_BOTTOM - fillHeight - 1,
        GAUGE_WIDTH + 4,
        2,
      ).fill({ color: active.color, alpha: 0.5 });
    }
  }

  private drawProgress(world: World): void {
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
      const winnerPid = world.lastWinnerId ?? asPlayerId(0);
      const winner = world.players.get(winnerPid);
      const winLabel = world.gameMode === '1v1' && winner !== undefined
        ? `PLAYER ${winnerPid + 1} WINS`
        : 'WIN';
      this.winText.text = world.gameState === 'WIN'
        ? winLabel
        : `${winLabel} — click or press R to reset`;
      if (winner !== undefined) this.winText.style.fill = winner.color;
      this.winText.visible = true;
      this.winTextAlphaTarget = 1;
    } else {
      this.winTextAlphaTarget = 0;
      if (this.winTextAlpha < 0.01) this.winText.visible = false;
    }
    this.winTextAlpha += (this.winTextAlphaTarget - this.winTextAlpha) * 0.12;
    this.winText.alpha = this.winTextAlpha;
  }

  private drawMultiplayerHUD(world: World): void {
    const show1v1 = world.gameMode === '1v1' && world.gameState === 'PLAYING';

    // Turn indicator badge.
    if (show1v1) {
      const active = world.players.get(world.currentPlayerId);
      if (active !== undefined) {
        const pNum = world.currentPlayerId + 1;
        this.turnBadge.text = `PLAYER ${pNum}'S TURN  ·  SPACE to end`;
        this.turnBadge.style.fill = active.color;
        this.turnBadge.visible = true;
      }
    } else {
      this.turnBadge.visible = false;
    }

    // Per-player score readouts.
    if (show1v1) {
      const p1Score = world.scoreByPlayer.get(asPlayerId(0)) ?? 0;
      const p2Score = world.scoreByPlayer.get(asPlayerId(1)) ?? 0;
      this.p1ScoreText.text = `RED  ${p1Score} / ${PHASE_1_WIN_SCORE}`;
      this.p2ScoreText.text = `BLUE ${p2Score} / ${PHASE_1_WIN_SCORE}`;
      this.p1ScoreText.visible = true;
      this.p2ScoreText.visible = true;
    } else {
      this.p1ScoreText.visible = false;
      this.p2ScoreText.visible = false;
    }

    // Connection status dot — visible in any 1v1 gameState (PLAYING / LOBBY).
    const g = this.connectionDot;
    g.clear();
    if (world.gameMode === '1v1') {
      const color = this.connectedPeers > 0 ? 0x3bff7a : 0xff3b6b;
      g.circle(CANVAS_WIDTH - 24, 24, 6).fill({ color, alpha: 0.85 });
    }
  }
}
