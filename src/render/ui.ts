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

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FOOTER_HEIGHT,
  FOOTER_TOP_Y,
  GATHERER_PRICE,
  GATHERER_SPEED_UPGRADE_PRICE,
  LEADER_DECAY_THRESHOLD_FRACTION,
  MAX_DISRUPTION_CHARGES,
  PHASE_1_WIN_SCORE,
  PLAYER_COLORS,
  SCORE_TIER_STEP,
} from '../constants.ts';
import { isNetworked, type World } from '../state/world.ts';
import { isBenched } from '../state/hunters/hunter.ts';
import { asPlayerId } from '../types.ts';
import { MAGIC_COMBO_KEYS } from '../combos.ts';

const GAUGE_X = CANVAS_WIDTH - 24;

/**
 * V6-0.2 (S129) — tier banner hold, in FRAMES (render-only, so frames not ticks).
 * ~2 s at 60 fps: long enough to register as a beat, short enough not to occlude play.
 * The world-space pulse it complements runs 48 ticks (`SCORE_TIER_DURATION_TICKS`).
 */
export const TIER_BANNER_FRAMES = 120;

/**
 * V6-0.2 (S129) — banner label for a score-tier crossing. Pure, and exported for test, because
 * the Browser pane cannot be driven headlessly (a hidden pane pauses requestAnimationFrame, so
 * the Pixi ticker never advances) — so the arithmetic is verified here rather than by eye.
 */
export function formatTierBanner(tier: number): string {
  return `TIER ${tier}  —  ${tier * SCORE_TIER_STEP}/${PHASE_1_WIN_SCORE}`;
}

/** V6-0.2 — solo score readout. Floors, matching the leaderboard's own formatting. */
export function formatSoloScore(score: number): string {
  return `SCORE ${Math.floor(score)}/${PHASE_1_WIN_SCORE}`;
}

/**
 * V6-0.2 — banner opacity envelope: hold at full, then fade over the final third so the
 * milestone reads as a beat rather than a flicker. `framesRemaining` counts DOWN to 0.
 */
/**
 * V6-0.2 (S129 CHECK) — clear the tier-banner dedupe watermark when the sim clock has gone
 * BACKWARDS, which happens when `applySnapshotCore` adopts a host tick (`world.tick = snap.tick`,
 * save.ts:830) that is lower than one this client already observed. Without this, a long solo
 * session followed by joining a freshly-started host would suppress the banner for that entire
 * match. Returns the watermark to use.
 */
export function resetWatermarkIfRegressed(worldTick: number, lastTierTick: number): number {
  return worldTick < lastTierTick ? -1 : lastTierTick;
}

export function tierBannerAlpha(framesRemaining: number, total: number = TIER_BANNER_FRAMES): number {
  if (framesRemaining <= 0) return 0;
  const f = Math.min(1, framesRemaining / total);
  return f > 0.33 ? 1 : f / 0.33;
}

/**
 * Banner TOP edge. Named in S131 P3 because the plate geometry and the text position must agree —
 * two copies of `34` is exactly how a plate ends up offset from its own label. MEASURED in the S131
 * playtest: glyph band y 34–59, so the banner's bottom edge is ~60 (the V6-0.3 PDR's "bottom ≈68"
 * was a conservative estimate, which is why the sever toast at y=240 clears it easily).
 */
const TIER_BANNER_Y = 34;
/** P3 (S131) — banner plate padding. Wider than `betaBadgePlate`'s 9/4 because the font is 26px, not badge-size. */
const BANNER_PLATE_PAD_X = 14;
const BANNER_PLATE_PAD_Y = 5;
/** P3 (S131) — plate fill, matching `betaBadgePlate` exactly (main.ts:286) so all HUD chrome reads as one system. */
export const HUD_PLATE_FILL = { color: 0x05070a, alpha: 0.5 } as const;

export interface PlateRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * P3 (S131) — pure: the backing-plate rect for a TOP-ANCHORED, horizontally-CENTRED text.
 *
 * Extracted rather than inlined for the V6-0.2 reason: a plate is only correct if its geometry
 * tracks the text it backs, and geometry inlined in a Pixi method can only be verified by
 * constructing an `Application`. A plate that is one frame stale, or sized from the wrong anchor,
 * shows up as a dark rectangle offset from its own label.
 *
 * Matches `tierBannerText`'s anchor of (0.5, 0): `centreX` is the text's horizontal centre and
 * `topY` its TOP edge, not its middle.
 */
export function bannerPlateRect(
  textWidth: number,
  textHeight: number,
  centreX: number,
  topY: number,
): PlateRect {
  return {
    x: centreX - textWidth / 2 - BANNER_PLATE_PAD_X,
    y: topY - BANNER_PLATE_PAD_Y,
    w: textWidth + BANNER_PLATE_PAD_X * 2,
    h: textHeight + BANNER_PLATE_PAD_Y * 2,
  };
}

/**
 * What a tier-banner drain decided this frame. `text === null` means no crossing was captured and
 * the caller must leave the banner's current state alone (it may be mid-animation from an earlier
 * frame). `watermark` is always the value the caller should store back.
 */
export interface TierBannerCapture {
  readonly watermark: number;
  readonly text: string | null;
  readonly color: number;
  /**
   * V6-1.1 — the tier the captured crossing announces (0 when nothing was captured). Score became
   * SPENDABLE in V6-1.1, so scoreProgress can now fall below a 500/1000 boundary and re-cross it
   * upward, emitting a fresh SCORE_TIER effect at a NEW tick. The tick watermark cannot dedupe
   * that (the tick genuinely is newer), so the caller additionally suppresses any tier it has
   * already announced this match. Before spending existed this could not happen: leader-decay
   * floors at 1125, above both boundaries.
   */
  readonly tier: number;
}

/**
 * V6-0.3 (S130) — the tier banner's `world.effects` scan, extracted as a PURE function.
 *
 * WHY THIS IS A FREE FUNCTION AND NOT JUST A METHOD BODY. V6-0.2 shipped this scan inside a
 * private HUD method, which meant the only way to test it was to construct a HUD — which needs a
 * live Pixi `Application`. So the scan itself was never tested, only the arithmetic helpers around
 * it, and the defect that the scan ran AFTER `effectsRenderer` wiped `world.effects` went
 * unnoticed through a green suite (see the drain-order note on `drainTierBanner`). Extracting it
 * makes the ordering itself assertable without Pixi: a test can run this against a live
 * `world.effects`, simulate the wipe, run it again, and see the difference.
 *
 * Dedupe is by the effect's own `tick` rather than object identity, because `world.effects` is
 * wiped every frame so identity is never stable. The scan takes the LAST crossing in the array if
 * several land in one drained batch (main.ts steps up to 3 sim ticks per rendered frame), which is
 * correct: only the newest tier is worth naming.
 */
export function captureTierBanner(
  effects: readonly World['effects'][number][],
  worldTick: number,
  lastTierTick: number,
): TierBannerCapture {
  let watermark = resetWatermarkIfRegressed(worldTick, lastTierTick);
  let text: string | null = null;
  let color = 0xffffff;
  let tier = 0;
  for (const e of effects) {
    if (e.kind !== 'SCORE_TIER') continue;
    if (e.tick <= watermark) continue;
    watermark = e.tick;
    text = formatTierBanner(e.tier);
    color = e.color;
    tier = e.tier;
  }
  return { watermark, text, color, tier };
}
const GAUGE_Y_TOP = 80;
// V6-1.2 — anchored to the footer, like the progress bar. It was CANVAS_HEIGHT-80 (=1000), i.e.
// its bottom 4 px drew UNDER the footer plate — the same overlap pattern the progress bar had.
const GAUGE_Y_BOTTOM = FOOTER_TOP_Y - 8;
const GAUGE_WIDTH = 8;
const ENERGY_GAUGE_FULL = 100;

const PROGRESS_X = 12;
// V6-1.1 — RELOCATED above the new footer bar. These were CANVAS_HEIGHT-80/-40 (y 1000..1040),
// which sits ENTIRELY inside the footer strip (FOOTER_TOP_Y = 996): the bar would have been drawn
// underneath the automation bar and its clicks swallowed by the footer guard. Anchored to
// FOOTER_TOP_Y so the two can never silently overlap again if the footer height changes.
const PROGRESS_Y_TOP = FOOTER_TOP_Y - 76;
const PROGRESS_Y_BOTTOM = FOOTER_TOP_Y - 36;
const PROGRESS_WIDTH = 80;
/** V6-1.1 — buy-button box (the footer's only control this slot). */
const BUY_BTN_W = 232;
/** V6-1.2 — speed-upgrade button width (sits left of BUY in the same footer strip). */
const UPGRADE_BTN_W = 150;

/**
 * V6-1.2 — is this canvas-space point over an actual footer CONTROL?
 *
 * ⚠ WHY THIS IS NOT "is it in the footer strip". The first cut of the click guard early-returned on
 * the whole 1920x84 bottom band, which made every world object in the bottom 7.8% of the board
 * permanently unclickable during PLAYING — including structures the bot seeder deliberately places
 * down there. The guard exists to stop ONE thing: a button click ALSO firing the raw canvas
 * hit-test (Pixi's pointertap does not suppress it). So it must cover the buttons, not the band.
 * Exported and derived from the same constants the buttons are positioned from, so the two cannot
 * drift apart.
 */
export function isOverFooterControl(x: number, y: number): boolean {
  const top = FOOTER_TOP_Y + (FOOTER_HEIGHT - BUY_BTN_H) / 2;
  if (y < top || y > top + BUY_BTN_H) return false;
  const buyLeft = CANVAS_WIDTH - BUY_BTN_W - 28;
  if (x >= buyLeft && x <= buyLeft + BUY_BTN_W) return true;
  const upLeft = CANVAS_WIDTH - BUY_BTN_W - UPGRADE_BTN_W - 44;
  return x >= upLeft && x <= upLeft + UPGRADE_BTN_W;
}
const BUY_BTN_H = 46;

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
 *
 * S107 P1 — `ownDecaying`: true when the LOCAL player IS the leader (own === the max) AND past the
 * anti-coast decay threshold, i.e. their score is gently bleeding (state/scoring.ts). Drives a subtle
 * amber tint on the own-bar so the slow recede reads as "you're coasting — keep building" rather than
 * an unexplained drop (the gentle per-tick bleed is too small to trip the red NONET drop-flash). Never
 * true in solo (no decay there).
 */
export function progressBarFractions(
  world: Pick<World, 'scoreByPlayer' | 'localPlayerId' | 'scoreProgress' | 'gameMode'>,
): { own: number; leader: number; ownDecaying: boolean } {
  const localScore = world.scoreByPlayer.get(world.localPlayerId) ?? world.scoreProgress;
  // Local player is (tied for) the leader when their own score reaches the max-of-all.
  const isLeader = localScore >= world.scoreProgress - 0.001;
  const ownDecaying =
    world.gameMode !== 'solo' &&
    isLeader &&
    localScore > PHASE_1_WIN_SCORE * LEADER_DECAY_THRESHOLD_FRACTION;
  return {
    own: Math.min(1, localScore / PHASE_1_WIN_SCORE),
    leader: Math.min(1, world.scoreProgress / PHASE_1_WIN_SCORE),
    ownDecaying,
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
  /** V6-0.2 (S129) — milestone banner fired by a SCORE_TIER crossing. */
  private readonly tierBannerText: Text;
  /**
   * P3 (S131) — dark backing plate behind the banner, on the `betaBadgePlate` precedent
   * (main.ts:277). The S131 playtest showed the banner's glyphs sitting on the spawner rings and
   * the topmost structure: readable, because the text draws on top, but with thin cyan strokes
   * running through the letterforms. This masks whatever world content is behind the one HUD line
   * that exists to be READ. Redrawn whenever the text changes; alpha and visibility are driven by
   * `animateTierBanner` in lockstep with the text, so the two are never visible apart.
   */
  private readonly tierBannerPlate: Graphics;
  /** Frames remaining on the tier banner (render-only; never touches sim state). */
  private tierBannerFrames = 0;
  /** Dedupe key: the `tick` of the last SCORE_TIER effect consumed. */
  private lastTierTick = -1;
  /**
   * V6-1.1 — the automation FOOTER BAR (owner ruling S134: every automation control lives in a bar
   * along the bottom). V6-1.1 ships exactly ONE control in it — "BUY GATHERER 105" — but the
   * container reserves the full strip so the shape buttons / build queue / bank meter (V6-1.4) drop
   * in without a relayout. Canvas (Pixi), never DOM: every other HUD element is canvas, so this
   * inherits the object-fit:contain letterbox mapping and the stage z-order for free.
   */
  private readonly footer: Container;
  private readonly footerPlate: Graphics;
  private readonly buyButton: Container;
  private readonly upgradeButton: Container;
  private readonly upgradeButtonBg: Graphics;
  private readonly upgradeButtonText: Text;
  private onUpgradeSpeed: (() => void) | null = null;
  private upgradeHover = false;
  private upgradeEnabled = false;
  private readonly buyButtonBg: Graphics;
  private readonly buyButtonText: Text;
  /** Set by main.ts — dispatches BUY_GATHERER for the local seat. */
  private onBuyGatherer: (() => void) | null = null;
  private buyHover = false;
  /** Affordability latch, recomputed every frame from the local seat's own score. */
  private buyEnabled = false;
  private displayEnergy = 0;
  private displayProgress = 0;
  private lastLocalScore = -1; // S106 P4 — detect a DROP in your own score (NONET halving) to flash the bar
  private dropFlash = 0; // S106 P4 — 1 on a score drop, decays per frame (render-only cosmetic)
  /**
   * V6-1.1 — suppress the red drop-flash for ONE score-drop event, armed when the local player
   * buys. The flash exists to make an INVOLUNTARY loss (a NONET halving) felt; a purchase is a
   * deliberate investment, so flashing "you lost points" at it reads as a penalty for playing well.
   * The score still visibly falls — only the alarm colour is withheld.
   */
  private suppressNextDropFlash = false;
  /**
   * Frame budget on the suppression above. The latch is armed on the CLICK, but the spend can be
   * refused after that (benched, migration pause, a joiner acting on a stale mirror). Without an
   * expiry a refused buy strands the latch and it silently swallows the NEXT genuine involuntary
   * loss — the NONET halving alarm the flash exists for. ~1 s at 60 fps covers any real round-trip.
   */
  private suppressFramesLeft = 0;
  /**
   * V6-1.1 — highest SCORE_TIER milestone already announced this match. Score is now SPENDABLE, so
   * scoreProgress can fall back below 500/1000 and re-cross UPWARD, which would replay a milestone
   * banner the player already saw. Watermarking makes each milestone a once-per-match event.
   * Render-only (never synced): a re-announcement is a cosmetic annoyance, not sim state.
   */
  private tierWatermark = 0;
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

    // P3 (S131) — plate FIRST, so child-add order puts it behind the banner text (the
    // betaBadge/betaBadgePlate idiom; no zIndex API needed).
    this.tierBannerPlate = new Graphics();
    this.tierBannerPlate.visible = false;
    app.stage.addChild(this.tierBannerPlate);
    // V6-0.2 (S129) — TIER MILESTONE BANNER. Top-center, just under the combo counter.
    this.tierBannerText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 26, fill: 0xffffff, align: 'center' }),
    });
    this.tierBannerText.anchor.set(0.5, 0);
    this.tierBannerText.position.set(CANVAS_WIDTH / 2, TIER_BANNER_Y);
    this.tierBannerText.visible = false;
    app.stage.addChild(this.tierBannerText);

    // V6-1.1 — the automation footer bar + its single control. Added LAST so it renders above the
    // rest of the HUD (child-add order, the betaBadgePlate idiom — no zIndex needed).
    this.footer = new Container();
    this.footerPlate = new Graphics();
    this.footer.addChild(this.footerPlate);

    this.buyButtonBg = new Graphics();
    this.buyButtonText = new Text({
      text: `BUY GATHERER  ${GATHERER_PRICE}`,
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 17, fill: 0xffffff }),
    });
    this.buyButtonText.anchor.set(0.5);
    this.buyButtonText.position.set(BUY_BTN_W / 2, BUY_BTN_H / 2);

    this.buyButton = new Container();
    this.buyButton.addChild(this.buyButtonBg);
    this.buyButton.addChild(this.buyButtonText);
    this.buyButton.position.set(CANVAS_WIDTH - BUY_BTN_W - 28, FOOTER_TOP_Y + (FOOTER_HEIGHT - BUY_BTN_H) / 2);
    this.buyButton.eventMode = 'static';
    this.buyButton.cursor = 'pointer';
    this.buyButton.on('pointertap', () => {
      // Affordability is re-checked authoritatively in the reducer; this only avoids firing a
      // no-op intent (and the arming of the drop-flash suppression) on an unaffordable click.
      if (this.buyEnabled && this.onBuyGatherer !== null) {
        this.suppressNextDropFlash = true;
        this.suppressFramesLeft = 60;
        this.onBuyGatherer();
      }
    });
    this.buyButton.on('pointerover', () => { this.buyHover = true; });
    this.buyButton.on('pointerout', () => { this.buyHover = false; });
    this.footer.addChild(this.buyButton);

    // V6-1.2 — SPEED UPGRADE. Sits immediately left of BUY; steps every gatherer the player
    // owns (there is no unit-selection UI until V6-1.4, so a per-unit upgrade would be
    // unspendable). Same button idiom, same footer strip.
    this.upgradeButtonBg = new Graphics();
    this.upgradeButtonText = new Text({
      text: `SPEED  ${GATHERER_SPEED_UPGRADE_PRICE}`,
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 17, fill: 0xffffff }),
    });
    this.upgradeButtonText.anchor.set(0.5);
    this.upgradeButtonText.position.set(UPGRADE_BTN_W / 2, BUY_BTN_H / 2);
    this.upgradeButton = new Container();
    this.upgradeButton.addChild(this.upgradeButtonBg);
    this.upgradeButton.addChild(this.upgradeButtonText);
    this.upgradeButton.position.set(
      CANVAS_WIDTH - BUY_BTN_W - UPGRADE_BTN_W - 44,
      FOOTER_TOP_Y + (FOOTER_HEIGHT - BUY_BTN_H) / 2,
    );
    this.upgradeButton.eventMode = 'static';
    this.upgradeButton.cursor = 'pointer';
    this.upgradeButton.on('pointertap', () => {
      if (this.upgradeEnabled && this.onUpgradeSpeed !== null) {
        this.suppressNextDropFlash = true;
        this.suppressFramesLeft = 60;
        this.onUpgradeSpeed();
      }
    });
    this.upgradeButton.on('pointerover', () => { this.upgradeHover = true; });
    this.upgradeButton.on('pointerout', () => { this.upgradeHover = false; });
    this.footer.addChild(this.upgradeButton);

    this.footer.visible = false;
    app.stage.addChild(this.footer);
  }

  /** S15 P2 — main.ts sets this from netTransport.peerCount() each frame. */
  setConnectionPeers(peers: number): void {
    this.connectedPeers = peers;
  }

  /** V6-1.1 — main.ts injects the BUY_GATHERER dispatch for the local seat. */
  setBuyGathererHandler(fn: () => void): void {
    this.onBuyGatherer = fn;
  }

  /** V6-1.2 — main.ts injects the UPGRADE_GATHERER_SPEED dispatch for the local seat. */
  setUpgradeSpeedHandler(fn: () => void): void {
    this.onUpgradeSpeed = fn;
  }

  sync(world: World): void {
    this.drawEnergyGauge(world);
    this.drawProgress(world);
    this.drawWinState(world);
    this.drawMultiplayerHUD(world);
    this.drawComboCounter(world);
    this.drawFooter(world);
    // V6-0.3 (S130) — ANIMATE only. The `world.effects` scan that arms this banner lives in
    // `drainTierBanner`, which main.ts calls BEFORE effectsRenderer wipes the array. Do NOT move
    // the scan back in here: `sync` runs after the wipe, which is exactly the V6-0.2 defect.
    this.animateTierBanner(world);
  }

  /**
   * V6-0.2 (S129) — make the score-tier crossing FELT, not merely drawn.
   *
   * `SCORE_TIER_STEP = 500` against `PHASE_1_WIN_SCORE = 1500` gives the match an exact
   * three-act structure with pulses at 500 and 1000. The v0.6 diagnosis is that nobody can
   * feel it. The pulse itself is not missing — `drawScoreTier` renders a ring + bloom for 48
   * ticks (0.8 s) — but it draws in WORLD space at the placement position, on an open and
   * partly fogged canvas, so it reads as "some effect happened" rather than "I crossed a
   * threshold, and here is where that puts me".
   *
   * This does NOT revert S13 P4, which deliberately moved the pulse off a fixed HUD corner to
   * the placement position "so the pulse lands where the player's eyes already are". That
   * reasoning is sound and the world pulse is untouched. The two are complementary: the pulse
   * says *something happened here*, the banner NAMES the milestone and anchors it to progress.
   *
   * Render-only: reads `world.effects`, writes nothing back, consumes no RNG, and is not synced.
   *
   * ⚠ V6-0.3 (S130) — SPLIT IN TWO, AND THE SPLIT IS LOAD-BEARING. The `world.effects` scan lives
   * in `drainTierBanner` (which MUST run before the per-frame wipe) and the countdown lives in
   * `animateTierBanner` (called from `sync`). As shipped in S129 the whole thing ran inside `sync`
   * and therefore never rendered once, in any mode, for any player.
   */
  /**
   * V6-0.3 (S130) — CAPTURE half. MUST be called BEFORE `effectsRenderer.sync(world)`.
   *
   * THE DEFECT THIS FIXES. V6-0.2 shipped the `SCORE_TIER` scan inside `sync`, and `hud.sync` runs
   * at main.ts:2515 while `effectsRenderer.sync` sets `world.effects.length = 0` at main.ts:2486
   * (effectsRenderer.ts:73). Each has exactly ONE call site and nothing between them writes
   * `world.effects`, so the loop always iterated ZERO entries. Nothing caught it because the unit
   * tests pin only the pure helpers, and the draw path cannot be driven headlessly — a hidden
   * Browser pane pauses requestAnimationFrame, so the Pixi ticker never advances.
   *
   * Every other working `world.effects` consumer is already pre-wipe and says so in a comment:
   * `drainAudioEffects` (main.ts:2479) and `debugOverlay.sync` (main.ts:2485). The tier banner was
   * the lone consumer on the wrong side. This method joins the correct side rather than relocating
   * `hud.sync`, which would have required an argument about `hud.sync`'s order-independence
   * relative to five other renderers.
   *
   * OWNERSHIP SPLIT, pinned deliberately — a sloppy split can produce a NEW never-renders variant,
   * i.e. this same defect recurring inside its own fix. This half owns the PLAYING guard, the
   * watermark (including the between-matches `-1` reset) and the WRITES: text, fill, and ARMING
   * `tierBannerFrames`. `animateTierBanner` owns the countdown, the alpha and `visible`. The only
   * field both touch is the non-PLAYING zeroing of `tierBannerFrames`, which is idempotent.
   *
   * SCOPE LIMIT, stated rather than discovered later: `SCORE_TIER` is host-local — `serializeEffect`
   * returns null for it (save.ts:1400) — so this fixes solo and bots only. A 1v1 JOINER still never
   * sees the banner. Putting the kind on the wire would make it a new serialized literal in the
   * S110 `'WALK'` bump class, so that is a logged carry-forward, not a silent gap.
   */
  drainTierBanner(world: World): void {
    if (world.gameState !== 'PLAYING') {
      this.tierBannerFrames = 0;
      // S129 CHECK (GROK-ANALYST) — the dedupe watermark MUST reset between matches. The HUD
      // instance lives for the whole page, so a stale high watermark would suppress the banner
      // for every future match. Every match transition passes through a non-PLAYING state.
      this.lastTierTick = -1;
      // V6-1.1 — the TIER watermark resets on the same edge and for the identical reason: a stale
      // high tier would suppress every milestone of the next match.
      this.tierWatermark = 0;
      return;
    }
    // `captureTierBanner` also folds in the MID-MATCH backward-tick guard, which the
    // between-matches reset above cannot catch. GROK reported that as "world.tick resets on a new
    // match" — that mechanism is wrong (neither applyStartGame nor applyReturnToTitle touches
    // world.tick, so it is monotonic on the host). The real path is `applySnapshotCore` doing
    // `world.tick = snap.tick` (save.ts:830) for both restore() and applyNetSnapshot(): play solo
    // for ten minutes, then join a freshly-started host, and the adopted tick lands far BELOW the
    // watermark. Right conclusion, wrong cause — so guard the cause that actually exists.
    const cap = captureTierBanner(world.effects, world.tick, this.lastTierTick);
    this.lastTierTick = cap.watermark;
    // `text === null` means no crossing this frame. Do NOT touch the banner state — it may be
    // mid-animation from an earlier crossing, and clobbering it here would truncate the beat.
    if (cap.text === null) return;
    // V6-1.1 — SPEND-AWARE dedupe. A gatherer purchase can drop scoreProgress back below a tier
    // boundary; re-climbing emits a genuinely-new SCORE_TIER effect that the tick watermark above
    // cannot filter. Announce each milestone at most once per match.
    if (cap.tier <= this.tierWatermark) return;
    this.tierWatermark = cap.tier;
    this.tierBannerText.text = cap.text;
    this.tierBannerText.style.fill = cap.color;
    this.tierBannerFrames = TIER_BANNER_FRAMES;
    // P3 (S131) — resize the plate to the NEW label, here rather than in the animate half, because
    // this is the only place the text can change. Pixi v8 Text measures synchronously, so .width
    // and .height are already correct for the string just assigned (the betaBadgePlate precedent).
    const r = bannerPlateRect(
      this.tierBannerText.width,
      this.tierBannerText.height,
      CANVAS_WIDTH / 2,
      TIER_BANNER_Y,
    );
    this.tierBannerPlate.clear().roundRect(r.x, r.y, r.w, r.h, 8).fill(HUD_PLATE_FILL);
  }

  /**
   * V6-0.3 (S130) — ANIMATE half. Runs inside `sync`, i.e. AFTER the wipe, which is safe precisely
   * because it reads no effects. See `drainTierBanner` for the ownership split and why it exists.
   */
  private animateTierBanner(world: World): void {
    // P3 (S131) — the plate is toggled on EVERY path the text is, deliberately in the same
    // statements: a plate that outlives its label is a black rectangle parked on the board, which
    // is worse than the line-noise it was added to hide.
    if (world.gameState !== 'PLAYING') {
      this.tierBannerFrames = 0;
      this.tierBannerText.visible = false;
      this.tierBannerPlate.visible = false;
      return;
    }
    if (this.tierBannerFrames <= 0) {
      this.tierBannerText.visible = false;
      this.tierBannerPlate.visible = false;
      return;
    }
    this.tierBannerFrames--;
    const alpha = tierBannerAlpha(this.tierBannerFrames);
    this.tierBannerText.alpha = alpha;
    this.tierBannerText.visible = true;
    // Multiplies with HUD_PLATE_FILL's own 0.5, so the plate fades with the text rather than
    // snapping off at the end of the hold.
    this.tierBannerPlate.alpha = alpha;
    this.tierBannerPlate.visible = true;
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

  /**
   * V6-1.1 — the automation footer bar. Shown during PLAYING only (same gate as the combo counter),
   * so the title/win screens are untouched. The button dims when the local player cannot afford a
   * gatherer; the reducer re-checks affordability authoritatively regardless, so a stale/laggy
   * enabled state on a joiner can never produce a negative score.
   */
  private drawFooter(world: World): void {
    const playing = world.gameState === 'PLAYING';
    this.footer.visible = playing;
    if (!playing) return;

    const g = this.footerPlate;
    g.clear();
    g.rect(0, FOOTER_TOP_Y, CANVAS_WIDTH, FOOTER_HEIGHT).fill({ color: 0x0a1622, alpha: 0.82 });
    g.moveTo(0, FOOTER_TOP_Y).lineTo(CANVAS_WIDTH, FOOTER_TOP_Y).stroke({ width: 1, color: 0x2a4055, alpha: 0.9 });

    const score = world.scoreByPlayer.get(world.localPlayerId) ?? 0;
    // ⚠ HONOUR THE SAME INPUT LOCKS THE CANVAS PATH DOES. These buttons live on app.stage and
    // their pointertap never passes through Controls.isInputLocked(), so without this a benched
    // (eaten) player — or one mid-cinematic / mid-NONET, where full-screen overlays do not all
    // capture pointers — could spend victory points on an invisible button. The reducer denies a
    // benched buy anyway (BENCH_INTENT_POLICY), but a lit button that silently no-ops is worse
    // than a dim one. Caught by the S135 end-of-session audit.
    const me = world.players.get(world.localPlayerId);
    const locked =
      world.sudoku !== null ||
      world.activeCinematicPlayerId === world.localPlayerId ||
      (me !== undefined && isBenched(me.benchedUntilTick, world.tick));
    this.buyEnabled = !locked && Math.floor(score) >= GATHERER_PRICE;

    const bg = this.buyButtonBg;
    bg.clear();
    const fill = this.buyEnabled ? (this.buyHover ? 0x1f5f9e : 0x17497a) : 0x1a2530;
    const border = this.buyEnabled ? 0x85b7eb : 0x3a4a58;
    bg.roundRect(0, 0, BUY_BTN_W, BUY_BTN_H, 6)
      .fill({ color: fill, alpha: 0.95 })
      .stroke({ width: 2, color: border, alpha: 0.95 });
    this.buyButtonText.style.fill = this.buyEnabled ? 0xffffff : 0x6b7a88;
    this.buyButton.cursor = this.buyEnabled ? 'pointer' : 'default';

    // Upgrade: affordable AND you actually own a gatherer to upgrade (the reducer refuses to
    // charge for nothing, and the button must say so rather than look clickable).
    let ownsGatherer = false;
    for (const gg of world.gatherers.values()) {
      if (gg.ownerPlayerId === world.localPlayerId) { ownsGatherer = true; break; }
    }
    this.upgradeEnabled = !locked && ownsGatherer && Math.floor(score) >= GATHERER_SPEED_UPGRADE_PRICE;
    const ubg = this.upgradeButtonBg;
    ubg.clear();
    const ufill = this.upgradeEnabled ? (this.upgradeHover ? 0x1f5f9e : 0x17497a) : 0x1a2530;
    const uborder = this.upgradeEnabled ? 0x85b7eb : 0x3a4a58;
    ubg.roundRect(0, 0, UPGRADE_BTN_W, BUY_BTN_H, 6)
      .fill({ color: ufill, alpha: 0.95 })
      .stroke({ width: 2, color: uborder, alpha: 0.95 });
    this.upgradeButtonText.style.fill = this.upgradeEnabled ? 0xffffff : 0x6b7a88;
    this.upgradeButton.cursor = this.upgradeEnabled ? 'pointer' : 'default';
  }

  private drawProgress(world: World): void {
    // S106 P4 — the PRIMARY bar tracks YOUR OWN score (own), with the LEADER as a ghost-tick. See
    // progressBarFractions: this makes a NONET halving VISIBLE (your bar drops) where the old shared
    // leader-max bar hid it. The bar also flashes red on any DROP in your own score so the loss is felt.
    const { own, leader, ownDecaying } = progressBarFractions(world);
    this.displayProgress += (own - this.displayProgress) * 0.18;

    if (this.suppressFramesLeft > 0) {
      this.suppressFramesLeft--;
      if (this.suppressFramesLeft === 0) this.suppressNextDropFlash = false; // lapsed → re-arm the alarm
    }
    const localScore = world.scoreByPlayer.get(world.localPlayerId) ?? world.scoreProgress;
    if (this.lastLocalScore >= 0 && localScore < this.lastLocalScore - 0.5) {
      // V6-1.1 — a VOLUNTARY spend (buying a gatherer) must not trip the loss alarm. The drop is
      // still fully visible in the bar and the number; only the red "you were robbed" flash is
      // withheld, and only for the single drop the purchase caused.
      if (this.suppressNextDropFlash) this.suppressNextDropFlash = false;
      else this.dropFlash = 1;
    }
    this.lastLocalScore = localScore;
    this.dropFlash = Math.max(0, this.dropFlash - 0.04);

    const g = this.progress;
    g.clear();
    const trackHeight = PROGRESS_Y_BOTTOM - PROGRESS_Y_TOP;
    g.rect(PROGRESS_X, PROGRESS_Y_TOP, PROGRESS_WIDTH, trackHeight)
      .stroke({ width: 1, color: 0x333333, alpha: 0.6 });
    // your own progress — flashes RED on a sharp drop (NONET loss / any future point-loss),
    // else AMBER while gently decaying as the coasting leader (S107 P1 anti-coast cue — the
    // slow per-tick bleed is too small to trip the red flash, so amber signals "you're past
    // 75% and bleeding; keep building to close it out"), else white.
    const barColor = this.dropFlash > 0 ? 0xff5a5a : ownDecaying ? 0xffc04d : 0xffffff;
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
    // V6-0.2 (S129) — SOLO NUMERIC SCORE. The `N/1500` readout above lives inside the
    // leaderboard, which is gated `isNetworked` — correctly, since ranking one player is
    // noise. But that left pure solo with a progress BAR and no number at all, i.e. no way to
    // read "how far am I" except by eyeballing a bar. vs-bots is unaffected: `isNetworked` is
    // `gameMode !== 'solo'` (gameMode.ts:95), so bots mode already gets the full leaderboard.
    // Reuses row 0 rather than adding a Text object — same position, zero new bundle cost.
    if (!isNetworked(world) && world.gameState === 'PLAYING') {
      const t0 = this.scoreTexts[0];
      if (t0 !== undefined) {
        const score = world.scoreByPlayer.get(world.localPlayerId) ?? 0;
        const me = world.players.get(world.localPlayerId);
        t0.text = formatSoloScore(score);
        t0.style.fill = me?.color ?? 0xffffff;
        t0.position.set(12, 12);
        t0.visible = true;
      }
      for (let i = 1; i < this.scoreTexts.length; i++) {
        const t = this.scoreTexts[i];
        if (t !== undefined) t.visible = false;
      }
      // NOTE: no early return — everything below (connection dot, charge dots) must still run.
      // `connectionDot.clear()` in particular is unconditional, so skipping it would leave a
      // stale dot on screen after returning from a networked match to solo.
    } else this.scoreTexts.forEach((t, i) => {
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
 *
 * V6-0.3 (S131) — that deferral is now RESOLVED, and not by building the preview. Blueprint
 * §IX.5 ("Sever Preview", `SPARK_Blueprint.md:375`) asked to re-ratify or narrowly revoke the
 * locked "no preview" rule. It closes via BRANCH 2 — satisfied BY DELIVERY — because the
 * Blueprint's own suggested narrow form is "a post-hoc explanation of what a cut did", which is
 * exactly what the V6-0.3 sever toast now provides (`severToastRenderer.ts`). The PRE-commit
 * hover-cost preview (branch 3, ~120-200 LoC of new hit-test infrastructure — `bondHover` still
 * does not exist) stays DECLINED: a new interactive mechanic does not belong in the same slot as
 * a repair of a shipped-broken visual. It remains BACKLOG P7.
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
