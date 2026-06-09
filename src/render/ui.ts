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
  MAX_PLAYERS,
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

// S62 — short per-seat labels for the N-player leaderboard. The row text is also
// drawn in the player's color, so the label is a redundant (CVD-friendlier) cue.
const PLAYER_LABELS = ['RED', 'CYAN', 'YELLOW', 'GREEN', 'ORANGE', 'MAGENTA'] as const;

export class HUD {
  private readonly gauge: Graphics;
  private readonly progress: Graphics;
  private readonly winText: Text;
  /** S62 — N-player leaderboard rows (pool of MAX_PLAYERS; shown/sorted per frame). */
  private readonly scoreTexts: Text[];
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

    // S62 — per-player score LEADERBOARD (top-left, vertical stack). A pool of
    // MAX_PLAYERS rows; drawMultiplayerHUD shows one per live player, sorted by
    // score (leader on top), each in the player's color, the local player marked.
    // Replaces the pre-S62 hardcoded 2-row RED/BLUE readout.
    this.scoreTexts = [];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const t = new Text({
        text: '',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: 0xffffff }),
      });
      t.position.set(12, 12 + i * 22);
      t.visible = false;
      app.stage.addChild(t);
      this.scoreTexts.push(t);
    }

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

    // S62 — N-player score LEADERBOARD. All live players ranked by score (leader
    // on top); each row in the player's color; the LOCAL player marked "> … <YOU"
    // so you read "who's winning" + "who am I" at a glance (Council/Gemini quality
    // lift). Replaces the pre-S62 fixed RED/BLUE rows. ASCII markers for font
    // safety. `ranked` is reused below for the aligned charge-dot rows.
    const ranked = show1v1
      ? [...world.players.values()].sort(
          (a, b) =>
            (world.scoreByPlayer.get(b.id) ?? 0) - (world.scoreByPlayer.get(a.id) ?? 0),
        )
      : [];
    this.scoreTexts.forEach((t, i) => {
      const p = ranked[i];
      if (p === undefined) {
        t.visible = false;
        return;
      }
      const seat = p.id as unknown as number;
      const name = PLAYER_LABELS[seat] ?? `P${seat + 1}`;
      const score = world.scoreByPlayer.get(p.id) ?? 0;
      const isLocal = p.id === world.localPlayerId;
      t.text = `${isLocal ? '> ' : '  '}${name} ${Math.floor(score)}/${PHASE_1_WIN_SCORE}${isLocal ? ' <YOU' : ''}`;
      t.style.fill = p.color;
      t.position.set(12, 12 + i * 22);
      t.visible = true;
    });

    // Connection status dot — visible in any networked gameState (PLAYING/LOBBY).
    const g = this.connectionDot;
    g.clear();
    if (isNetworked(world)) {
      const color = this.connectedPeers > 0 ? 0x3bff7a : 0xff3b6b;
      g.circle(CANVAS_WIDTH - 24, 48, 6).fill({ color, alpha: 0.85 });
    }

    // S17 P1 — disruption charge dots, one row per ranked player (aligned to the
    // leaderboard rows above). Filled when earned, hollow ring otherwise; colored.
    const d = this.chargeDots;
    d.clear();
    ranked.forEach((p, i) => drawPlayerCharges(d, p, 20 + i * 22));

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
