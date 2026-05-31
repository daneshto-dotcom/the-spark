/**
 * SPARK — peripheral UI: energy gauge + win banner + 1v1 HUD.
 * § XIV.8 LOCKED — energy is a flat passive +5/sec in Phase 1.
 * The gauge is a thin vertical bar on the right edge — fills as energy
 * accrues. No numeric readout (per § XV anti-bloat).
 *
 * Win banner is dormant until Session 4 flips world.gameState='WIN'.
 *
 * 1v1-only HUD elements: per-player score readouts (top-left, both
 * scores); net connection status dot (top-right). Hidden in solo mode.
 *
 * S42 — Turn-indicator badge ("PLAYER N'S TURN · SPACE to end") DELETED.
 * The 1v1 mode was incorrectly shipped as turn-based hotseat (S15 P2);
 * blueprint mandates real-time. Energy gauge now reads world.localPlayerId
 * instead of the removed world.currentPlayerId (Council R1 Battle Ledger
 * row 3 + Δ4 — drops fallback chain in favor of explicit guard).
 */

import { Application, Graphics, Text, TextStyle } from 'pixi.js';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAX_DISRUPTION_CHARGES,
  PHASE_1_WIN_SCORE,
} from '../constants.ts';
import { isNetworked, type World } from '../state/world.ts';
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
  private readonly p1ScoreText: Text;
  private readonly p2ScoreText: Text;
  private readonly connectionDot: Graphics;
  /** S17 P1 — per-player disruption charge dots (Phase-2 §VIII.1-2). */
  private readonly chargeDots: Graphics;
  /** S49 P1 (Sym F) — "Q=ZONE" key hint near charge dots. 1v1 PLAYING only. */
  private readonly qHintText: Text;
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

    // S42 — Turn indicator badge DELETED (was top-center "PLAYER N'S TURN").

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

    // S17 P1 — disruption charge dots (Phase-2 §VIII.1-2). Per-player filled
    // dots next to each score readout. 0/1/2 charges → hollow rings / 1 filled
    // / both filled. Player-colored, visible only in 1v1 PLAYING.
    this.chargeDots = new Graphics();
    app.stage.addChild(this.chargeDots);

    // S50 P3 (Sym E occlusion polish) — Q key hint shifted from x=240 to
    // x=290 to clear the new charge-dot range. Council Battle Ledger C4:
    // dots now at x=260+i*12 (max x=276 with radius), so qHint anchored
    // left-justified at x=290 leaves a ~14px breathing gap.
    this.qHintText = new Text({
      text: 'Q=ZONE',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0xaaaaaa }),
    });
    this.qHintText.position.set(290, 8);
    this.qHintText.visible = false;
    app.stage.addChild(this.qHintText);
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
    // S42 — read LOCAL player's energy via world.localPlayerId (replaces
    // removed world.currentPlayerId turn-based artifact). Solo: id=0. 1v1
    // host: id=0. 1v1 client: id=1. Guard handles the early-frame race
    // where snapshot hasn't populated players[localPlayerId] yet — gauge
    // skips this tick rather than crashing (Council R1 Battle Ledger row 3
    // Grok-C3 ADOPT + Gemini-R2 confirmed). Pre-S42 fallback to
    // [...players.values()][0] removed (PRIME-AUDIT Δ4 — unnecessary post-guard).
    const local = world.players.get(world.localPlayerId);
    if (local === undefined) return;
    const target = Math.min(local.energy, ENERGY_GAUGE_FULL);
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
    ).fill({ color: local.color, alpha: 0.8 });
    if (fillRatio > 0.02) {
      g.rect(
        GAUGE_X - 2,
        GAUGE_Y_BOTTOM - fillHeight - 1,
        GAUGE_WIDTH + 4,
        2,
      ).fill({ color: local.color, alpha: 0.5 });
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
      const winLabel = isNetworked(world) && winner !== undefined
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
    const show1v1 = isNetworked(world) && world.gameState === 'PLAYING';

    // S42 — Turn indicator badge block DELETED. Real-time gameplay has
    // no "active player" concept; per-player score readouts below still
    // show both players' progress.

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
    // S17 P3: moved from (CANVAS_WIDTH-24, 24) to (CANVAS_WIDTH-24, 48) to
    // clear the longer "BETA · S17 PHASE-2" badge text in the top-right corner
    // (PRIME-AUDIT E — badge width grew with the Phase-2 marker).
    const g = this.connectionDot;
    g.clear();
    if (isNetworked(world)) {
      const color = this.connectedPeers > 0 ? 0x3bff7a : 0xff3b6b;
      g.circle(CANVAS_WIDTH - 24, 48, 6).fill({ color, alpha: 0.85 });
    }

    // S17 P1 — charge dots. Position to the right of each score readout
    // (p1 score at (12,12) ~120px wide; p2 score at (12,34)). Dots at
    // x ∈ {140, 152}, y=20 for p1 / y=42 for p2. Filled circles when
    // disruptionCharges > index, hollow rings otherwise. Player-colored.
    const d = this.chargeDots;
    d.clear();
    if (show1v1) {
      drawPlayerCharges(d, world.players.get(asPlayerId(0)), 20);
      drawPlayerCharges(d, world.players.get(asPlayerId(1)), 42);
    }

    // S49 P1 (Sym F) — Q=ZONE key hint visibility.
    this.qHintText.visible = show1v1;
  }
}

/**
 * S17 P1 helper — render up to MAX_DISRUPTION_CHARGES dots horizontally for a
 * player at the given y. Filled circles when player has that many charges;
 * hollow stroke rings when not yet earned (Council R1 Grok #4 PARTIAL adoption
 * — kept HUD dots; bond-hover cost preview deferred to S18 polish).
 */
function drawPlayerCharges(g: Graphics, player: { color: number; disruptionCharges: number } | undefined, y: number): void {
  if (player === undefined) return;
  for (let i = 0; i < MAX_DISRUPTION_CHARGES; i++) {
    // S50 P3 (Sym E occlusion polish) — moved from x=210 to x=260 to fully
    // clear the "RED  50 / 50" score text. Council Battle Ledger C4 over
    // dynamic getBounds (rejected: async Pixi text-layout pitfall + no
    // benefit at PHASE_1_WIN_SCORE=50 max 2-digit). Static numeric chosen
    // for traceability in git blame. Pre-S46: x=140 (collided past 2-digit).
    // S46: x=210 (still tight per user feedback across S46/S47/S48/S49).
    // S50: x=260 (50px additional headroom — score text max ends x≈132 at
    // 12-char "RED  50 / 50" at 9.6px/char monospace 16).
    const cx = 260 + i * 12;
    if (player.disruptionCharges > i) {
      g.circle(cx, y, 4).fill({ color: player.color, alpha: 0.9 });
    } else {
      g.circle(cx, y, 4).stroke({ width: 1, color: player.color, alpha: 0.5 });
    }
  }
}
