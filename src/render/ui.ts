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
  PLAYER_COLORS,
} from '../constants.ts';
import { isNetworked, type World } from '../state/world.ts';
import { asPlayerId } from '../types.ts';
import { MAGIC_COMBO_KEYS } from '../combos.ts';

const GAUGE_X = CANVAS_WIDTH - 24;
const GAUGE_Y_TOP = 80;
const GAUGE_Y_BOTTOM = CANVAS_HEIGHT - 80;
const GAUGE_WIDTH = 8;
const ENERGY_GAUGE_FULL = 100;

const PROGRESS_X = 12;
const PROGRESS_Y_TOP = CANVAS_HEIGHT - 80;
const PROGRESS_Y_BOTTOM = CANVAS_HEIGHT - 40;
const PROGRESS_WIDTH = 80;

// S84 P4 — the S62 colour-name labels (RED/CYAN/…) are GONE: the rainbow shuffle
// migrates colours mid-match, so colour names lied after the first switch. Rows
// are labeled by seat-stable P{n}, matching the S82 nameplates + the win banner.

/**
 * S106 P4 — pure: the two progress-bar fractions [0..1]. `own` = the LOCAL player's own banked score
 * — the bar the owner actually watches. (It used to be world.scoreProgress = max-of-all = the LEADER,
 * which HID your own NONET halving: when the friend won the trial his doubled score kept the shared
 * bar near-full, so the owner read "almost full victory points" while his OWN score had been cut.)
 * `leader` = max-of-all, kept as a thin ghost-tick so "who's winning" stays legible (the WIN gate +
 * HUNTER trigger still read world.scoreProgress elsewhere — unchanged). Solo: localPlayerId=0 is the
 * only entry, so own === leader. Exported for unit tests. Falls back to scoreProgress pre-population.
 */
export function progressBarFractions(
  world: Pick<World, 'scoreByPlayer' | 'localPlayerId' | 'scoreProgress'>,
): { own: number; leader: number } {
  const localScore = world.scoreByPlayer.get(world.localPlayerId) ?? world.scoreProgress;
  return {
    own: Math.min(1, localScore / PHASE_1_WIN_SCORE),
    leader: Math.min(1, world.scoreProgress / PHASE_1_WIN_SCORE),
  };
}

export class HUD {
  private readonly gauge: Graphics;
  private readonly progress: Graphics;
  private readonly winText: Text;
  /** S62 — N-player leaderboard rows (pool of PLAYER_COLORS.length since S87). */
  private readonly scoreTexts: Text[];
  private readonly connectionDot: Graphics;
  /** S17 P1 — per-player disruption charge dots (Phase-2 §VIII.1-2). */
  private readonly chargeDots: Graphics;
  /** S49 P1 (Sym F) — "Q=ZONE" key hint near charge dots. 1v1 PLAYING only. */
  private readonly qHintText: Text;
  /** S88 G3a — "Combos N/14" discovered counter (top-center, PLAYING, all modes). */
  private readonly comboCounterText: Text;
  private displayEnergy = 0;
  private displayProgress = 0;
  private lastLocalScore = -1; // S106 P4 — detect a DROP in your own score (NONET halving) to flash the bar
  private dropFlash = 0; // S106 P4 — 1 on a score drop, decays per frame (render-only cosmetic)
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
    // rows; drawMultiplayerHUD shows one per live player, sorted by score
    // (leader on top), each in the player's color, the local player marked.
    // S87 — pool sized by PLAYER_COLORS.length (not MAX_PLAYERS): VS-BOTS can
    // seat MAX_BOTS+1=7 players; the wire/lobby caps stay at MAX_PLAYERS=6.
    this.scoreTexts = [];
    for (let i = 0; i < PLAYER_COLORS.length; i++) {
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

    // S88 G3a — discovered-combo counter (top-center; shown during PLAYING, all modes).
    this.comboCounterText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: 0xffe066 }),
    });
    this.comboCounterText.anchor.set(0.5, 0);
    this.comboCounterText.position.set(CANVAS_WIDTH / 2, 10);
    this.comboCounterText.visible = false;
    app.stage.addChild(this.comboCounterText);
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
    this.drawComboCounter(world);
  }

  // S88 G3a — "Combos N/14" discovered-combo counter (top-center; total auto-follows
  // MAGIC_COMBO_KEYS.length, now 14 after S91 G2-PROMO). Shown during
  // PLAYING in ALL modes (solo/bots/networked) — discovery is a core mechanic for
  // everyone. Brightens to full alpha at the complete set. discoveredCombos rides
  // the host snapshot, so the client mirror shows the authoritative count.
  private drawComboCounter(world: World): void {
    if (world.gameState !== 'PLAYING') {
      this.comboCounterText.visible = false;
      return;
    }
    const found = world.discoveredCombos.size;
    const total = MAGIC_COMBO_KEYS.length;
    this.comboCounterText.text = `Combos ${found}/${total}`;
    this.comboCounterText.alpha = found >= total ? 1 : 0.7;
    this.comboCounterText.visible = true;
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
    // S106 P4 — the PRIMARY bar tracks YOUR OWN score (own), with the LEADER as a ghost-tick. See
    // progressBarFractions: this makes a NONET halving VISIBLE (your bar drops) where the old shared
    // leader-max bar hid it. The bar also flashes red on any DROP in your own score so the loss is felt.
    const { own, leader } = progressBarFractions(world);
    this.displayProgress += (own - this.displayProgress) * 0.18;

    const localScore = world.scoreByPlayer.get(world.localPlayerId) ?? world.scoreProgress;
    if (this.lastLocalScore >= 0 && localScore < this.lastLocalScore - 0.5) this.dropFlash = 1;
    this.lastLocalScore = localScore;
    this.dropFlash = Math.max(0, this.dropFlash - 0.04);

    const g = this.progress;
    g.clear();
    const trackHeight = PROGRESS_Y_BOTTOM - PROGRESS_Y_TOP;
    g.rect(PROGRESS_X, PROGRESS_Y_TOP, PROGRESS_WIDTH, trackHeight)
      .stroke({ width: 1, color: 0x333333, alpha: 0.6 });
    // your own progress — flashes red on a drop (NONET loss / any future point-loss)
    const barColor = this.dropFlash > 0 ? 0xff5a5a : 0xffffff;
    g.rect(PROGRESS_X, PROGRESS_Y_TOP, PROGRESS_WIDTH * this.displayProgress, trackHeight)
      .fill({ color: barColor, alpha: 0.6 + this.dropFlash * 0.35 });
    // leader ghost-tick (max-of-all) so "who's ahead" stays readable
    const leaderX = PROGRESS_X + PROGRESS_WIDTH * leader;
    g.rect(leaderX - 1, PROGRESS_Y_TOP - 2, 2, trackHeight + 4)
      .fill({ color: 0xffd60a, alpha: 0.85 });
  }

  private drawWinState(world: World): void {
    if (world.gameState === 'WIN' || world.gameState === 'POSTGAME') {
      const winnerPid = world.lastWinnerId ?? asPlayerId(0);
      const winner = world.players.get(winnerPid);
      // S87 — a bot victory says so (rub it in / soothe accordingly).
      const winLabel = isNetworked(world) && winner !== undefined
        ? world.botSeats.has(winnerPid)
          ? `BOT ${winnerPid + 1} WINS`
          : `PLAYER ${winnerPid + 1} WINS`
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
    //
    // S84 P4 — rows are labeled by SEAT ("P1".."P6"), never by colour NAME: the
    // rainbow colour-shuffle migrates colours mid-match, so the old RED/CYAN/…
    // labels lied after the first switch ("RED" rendered in green) and players
    // could no longer tell whose score was whose — half of the S84 field report
    // ("we all seemed to be gaining similar points"). P{n} matches the S82 CVD
    // avatar nameplates AND the win banner, so every identity surface agrees;
    // the row colour stays live as the redundant cue. The leader also gets a
    // "*" crown marker so rank reads even when scores are close.
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
      const score = world.scoreByPlayer.get(p.id) ?? 0;
      const isLocal = p.id === world.localPlayerId;
      const crown = i === 0 ? '*' : ' ';
      // S87 — bot rows read B{n} (matches the avatar nameplates).
      const tag = world.botSeats.has(p.id) ? 'B' : 'P';
      t.text = `${isLocal ? '>' : ' '}${crown}${tag}${seat + 1} ${Math.floor(score)}/${PHASE_1_WIN_SCORE}${isLocal ? ' <YOU' : ''}`;
      t.style.fill = p.color;
      t.position.set(12, 12 + i * 22);
      t.visible = true;
    });

    // Connection status dot — visible in any networked gameState (PLAYING/LOBBY).
    // S82 P3 — CVD fix (EYES backlog #3): green-vs-red alone is the classic
    // deuteranopia trap. Connected = FILLED dot; lost = HOLLOW ring + X slash —
    // the state now reads by SHAPE, colour stays as the redundant cue.
    const g = this.connectionDot;
    g.clear();
    if (isNetworked(world)) {
      const cx = CANVAS_WIDTH - 24;
      const cy = 48;
      if (this.connectedPeers > 0) {
        g.circle(cx, cy, 6).fill({ color: 0x3bff7a, alpha: 0.85 });
      } else {
        g.circle(cx, cy, 6).stroke({ color: 0xff3b6b, width: 2, alpha: 0.85 });
        g.moveTo(cx - 3, cy - 3).lineTo(cx + 3, cy + 3)
          .moveTo(cx + 3, cy - 3).lineTo(cx - 3, cy + 3)
          .stroke({ color: 0xff3b6b, width: 2, alpha: 0.85 });
      }
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
