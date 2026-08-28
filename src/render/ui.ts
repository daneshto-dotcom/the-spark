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
  FOOTER_TOP_Y,
  LEADER_DECAY_THRESHOLD_FRACTION,
  MAX_DISRUPTION_CHARGES,
  MAX_RAID_POINTS,
  PHASE_1_WIN_SCORE,
  PHYSICS_HZ,
  PLAYER_COLORS,
  SCORE_TIER_STEP,
} from '../constants.ts';
import { isNetworked, type MatchPhase, type World } from '../state/world.ts';
import { asPlayerId } from '../types.ts';
import { MAGIC_COMBO_KEYS } from '../combos.ts';
// ⭐ S155 P2 — the exit button's rect, registered in hudSurfaces() below so the overlap gate sees it.
import { exitButtonRect } from './exitButton.ts';

const GAUGE_X = CANVAS_WIDTH - 24;

/**
 * V6-0.2 (S129) — tier banner hold, in FRAMES (render-only, so frames not ticks).
 * ~2 s at 60 fps: long enough to register as a beat, short enough not to occlude play.
 * The world-space pulse it complements runs 48 ticks (`SCORE_TIER_DURATION_TICKS`).
 */
export const TIER_BANNER_FRAMES = 120;

/**
 * S147 P1 — how far the match-clock banner swells on a BUILD↔FIGHT transition, before easing back to
 * rest. Named rather than inlined because the pulse and its DECAY live in two different methods, and a
 * magic number in one of them is exactly how the first version shipped a banner that grew and never
 * shrank.
 */
export const PHASE_EDGE_PULSE_SCALE = 1.6;

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
 * S147 P1 — the match-clock readout: which half of the tower-defence cycle you are in, and how long
 * is left of it. e.g. `BUILD  1:30` / `FIGHT  0:07`.
 *
 * PURE + EXPORTED so it is unit-testable without PIXI (the `formatSoloScore` / `formatTierBanner`
 * precedent in this file). All the interesting behaviour is the arithmetic, and this keeps it out of
 * a render class where it could only be tested through a canvas.
 *
 * `ticksRemaining` is `phaseEndsAtTick - tick`, computed by the caller. It is CEILED to whole
 * seconds, so a fresh 5400-tick phase reads "1:30" rather than "1:29", and the display only reaches
 * 0:00 on the actual final tick. It is also CLAMPED at zero: the value can legitimately go negative
 * for a frame or two — a client's local tick advances at 60 Hz between 10 Hz snapshots and can pass
 * the deadline before the host's flip arrives, and the NONET freeze can leave it negative on the
 * host too. Showing "-0:03" would look broken, so it floors at 0:00 and waits for the flip.
 */
export function formatPhaseBanner(phase: MatchPhase, ticksRemaining: number): string {
  const secs = Math.max(0, Math.ceil(ticksRemaining / PHYSICS_HZ));
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  return `${phase}  ${mm}:${String(ss).padStart(2, '0')}`;
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
/**
 * ⛔ S150 P1 — MOVED 34 → 84, BECAUSE IT WAS DRAWN STRAIGHT THROUGH THE MATCH CLOCK.
 *
 * Owner: *"other stuff that is placed on top of itself and just not coherent"*. This is one of the
 * two literal instances. MEASURED on `spark-s150-hud-tier-vs-clock.png`: the tier plate occupied
 * y 29–71 and the clock text y 30–52, both centred on x=960 — and the plate is staged AFTER the
 * clock, so a milestone dimmed the countdown and then printed `TIER 2 — 1000/1500` over the top of
 * it, with `BUILD 1:26` ghosting through the letterforms.
 *
 * Nobody caught it because the collision is RARE: the clock is permanent but the banner fires for
 * ~2 s on a 500/1000 score crossing, so a routine capture never shows both. The e2e harness now
 * pushes a synthetic `SCORE_TIER` effect precisely so this pairing is photographed on purpose.
 *
 * 84 is derived, not guessed: the clock rests at y=30 with a 22 px glyph band and swells to
 * `PHASE_EDGE_PULSE_SCALE` (1.6) on a phase edge, so its worst-case bottom is 30 + 22×1.6 ≈ 65,
 * and the plate adds `BANNER_PLATE_PAD_Y`. 84 − 5 = 79 clears the fully-pulsed clock by 14 px.
 * `hudSurfaces()` pins the whole stack so it cannot silently drift back together.
 */
const TIER_BANNER_Y = 84;

/**
 * S150 P1 — the top-centre column, top to bottom: combo counter, match clock, milestone banner.
 *
 * Named rather than inlined at the two `position.set` calls because `topCentrePlateRect` and
 * `hudSurfaces` both have to agree with them. Two copies of `30` is exactly how the tier banner
 * ended up 4 px from the clock in the first place.
 */
const COMBO_COUNTER_Y = 10;
const PHASE_BANNER_Y = 30;
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
 * S150 P1 — PURE: one backing plate under BOTH top-centre readouts (combo counter + match clock).
 *
 * ⚠ THE DEFECT THIS CLOSES IS LEGIBILITY, NOT OVERLAP. `spark-s150-hud-BUILD-quadrants.png` shows
 * `BUILD  1:26` with the red and cyan border walls running vertically THROUGH the glyphs — the
 * board's own strokes crossing the one HUD line whose entire job is to be read at a glance. S131
 * already solved exactly this for the tier banner ("thin cyan strokes running through the
 * letterforms") by adding `tierBannerPlate`; the permanent readouts never got the same treatment,
 * so the rare banner was legible and the always-on clock was not. Same fill (`HUD_PLATE_FILL`) as
 * the banner and the BETA badge, so all HUD chrome reads as one system.
 *
 * Sized from LIVE text metrics every frame rather than once at construction, because the clock
 * SWELLS to `PHASE_EDGE_PULSE_SCALE` on a BUILD↔FIGHT edge and Pixi's `.width`/`.height` already
 * fold in `scale`. A plate measured once would be overflowed by its own label on every transition —
 * text sticking out of its backing box being precisely the incoherence this session is removing.
 */
export function topCentrePlateRect(
  comboW: number,
  comboH: number,
  clockW: number,
  clockH: number,
): PlateRect {
  const w = Math.max(comboW, clockW) + BANNER_PLATE_PAD_X * 2;
  const top = COMBO_COUNTER_Y - BANNER_PLATE_PAD_Y;
  const bottom =
    Math.max(COMBO_COUNTER_Y + comboH, PHASE_BANNER_Y + clockH) + BANNER_PLATE_PAD_Y;
  return { x: CANVAS_WIDTH / 2 - w / 2, y: top, w, h: bottom - top };
}

/**
 * S150 P1 — TITLE and LOBBY are OVERLAY SCREENS: the board is not being played, so no gameplay
 * instrument belongs on top of them.
 *
 * ⛔ WHY THIS IS ONE SHARED PREDICATE AND NOT FOUR INLINE COMPARISONS. main.ts has had
 * `const inOverlayScreen = showTitle || showLobby` since S16 P3.b, and it correctly hides the
 * spawner ring and the shape legend — but every element added since then simply forgot to ask.
 * MEASURED on `spark-s149-arcade-title.png` with a stage dump: the energy gauge (x 1896, y 80–989),
 * the score-progress bar (x 11, y 918–962), the controls help line (y 1058) and the local player's
 * avatar glow (a pink blob at −11,−11) were ALL drawn over the main menu. That is the same class of
 * defect as the border walls that bled onto the title screen earlier this session, and a green
 * suite says nothing about it either time. One exported predicate means the next element added has
 * something obvious to call.
 */
export function isOverlayScreen(gameState: World['gameState']): boolean {
  return gameState === 'TITLE' || gameState === 'LOBBY';
}

/** S150 P1 — the top-left score column. One rhythm, one set of numbers, three consumers. */
const SCORE_ROW_X = 12;
const SCORE_ROW_TOP_Y = 12;
const SCORE_ROW_STEP = 22;
/** Glyph band of a 16 px monospace row. Measured off a live stage dump (`h=16`), not assumed. */
const SCORE_ROW_HEIGHT = 16;
const CHARGE_DOT_X = 260;
const CHARGE_DOT_STEP = 12;
const CHARGE_DOT_R = 4;
// S152 P1 — breathing room between the round disruption pips and the diamond raid pips, so the
// two currencies read as two groups rather than one row of five.
const Q_HINT_X = 290;
/**
 * ⛔ S150 P1 — WAS y=8, i.e. FOUR PIXELS ABOVE the row it annotates. Every other element in the
 * top-left band starts at y=12, so this one label floated off the column's rhythm — small, but it
 * is exactly the kind of near-miss alignment that makes a screen read as *"not coherent"* without
 * the player being able to say why. Now sits on row 0's optical centre.
 *
 * It is also a verbatim DUPLICATE of the always-on help line ("Q shrink territory"), which is the
 * stale-second-copy class. Kept anyway, per the owner's no-deletions ruling this session: it is the
 * only 1v1-contextual reminder, and re-aligning it costs nothing.
 */
const Q_HINT_Y = 14;
/** 6 chars of 11 px monospace ≈ 6.6 px/char, rounded up. Measured live at w=36. */
const Q_HINT_W = 40;
const Q_HINT_H = 12;
// ⛔ AN EXPLICIT X, NOT `CHARGE_DOT_X + n*STEP + gap`, AND THAT IS THE POINT. Derived from the
// charge column it landed at 294, which sits INSIDE the "Q=ZONE" hint (Q_HINT_X 290 → 330) —
// measured on a real bots-match screenshot, where the diamonds drew straight through the text.
// The pips now start CLEAR of the hint's right edge, and `hudSurfaces` registers them so
// `hudLayout.test.ts` owns the invariant instead of the next reader's eyes.
const RAID_PIP_X = Q_HINT_X + Q_HINT_W + 10;
/** S150 P1 — the controls help line, owned by main.ts but pinned here so `hudSurfaces` can see it. */
export const HELP_LINE_X = 10;
export const HELP_LINE_Y = CANVAS_HEIGHT - 22;

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

/**
 * ⛔ S150 P1 — THE SCORE RAIL MOVED OUT OF THE BOTTOM-LEFT CORNER AND ONTO THE RIGHT EDGE, BESIDE
 * THE ENERGY GAUGE. It is the same instrument; it is no longer parked on top of a castle.
 *
 * TWO measured defects, both from `spark-s150-hud-BUILD-quadrants.png`:
 *
 *  1. IT TOUCHED THE SEAT-3 KEEP. The bar occupied x 12–93 / y 918–962 and the bottom-left keep in
 *     `QUADRANTS_4P` starts at x≈93 — one pixel of clearance, on a corner the layout puts a castle
 *     in by construction. V6-1.1 anchored the bar to `FOOTER_TOP_Y` so it could not slide INTO the
 *     footer band; nothing ever anchored it away from the keeps that S148 later parked in the same
 *     corner. It was a collision waiting for one more art tweak.
 *  2. IT READ AS A BUG. An unlabelled empty outlined rectangle with a lone yellow tick, floating in
 *     a corner with nothing else near it, looks like a panel that failed to load — the owner's
 *     *"non coherent parts"*. On the TITLE screen (where it also drew, see `isOverlayScreen`) that
 *     is all it was: an empty box on the main menu.
 *
 * THE FIX IS A PAIRING, NOT A NUDGE. Energy and score-progress are the two continuous per-player
 * quantities, so they now read as one matched set of vertical rails on the right edge, sharing the
 * same top and bottom and the same fill-from-the-bottom direction. Colour keeps them apart: energy
 * is the player's own colour, progress is white (amber while coasting, red on a loss). That is
 * *"more logical/coherent/consistent"* in the owner's sense — a rule you can state in one line,
 * rather than four instruments in four corners each following its own convention.
 *
 * Deliberately anchored to the gauge rather than to a fresh literal, so the pair cannot drift apart.
 */
const PROGRESS_X = GAUGE_X - 14;
const PROGRESS_Y_TOP = GAUGE_Y_TOP;
const PROGRESS_Y_BOTTOM = GAUGE_Y_BOTTOM;
const PROGRESS_WIDTH = 6;

/**
 * S150 P1 — the top-right chrome column: version stamp, then audio/settings, then the link dot,
 * then the two rails. Exported because main.ts owns the badge and the two glyphs while this file
 * owns the dot and the rails, and the ONLY reason `♪` was drawn through the connection dot is that
 * the two halves each picked their own number.
 *
 * MEASURED overlap before this change: `♪` occupied x 1900–1908 / y 30–45 and the connection dot
 * x 1889–1903 / y 41–55 — a 4×5 px intersection, clearly visible in the top-right crop of
 * `spark-s150-hud-BUILD-quadrants.png` as the note's tail running into the red no-link ring.
 * The badge's own backing plate ends at y=29, so `♪` at y=30 was also flush against it.
 *
 * The column is now a strict descending stack with real gaps: badge 8–29, glyphs 38–53, dot 62–74,
 * rails from 80. `hudSurfaces()` asserts it.
 */
export const HUD_RIGHT_X = CANVAS_WIDTH - 12;
export const BETA_BADGE_Y = 12;
export const AUDIO_ICON_Y = 38;
const CONNECTION_DOT_CY = 68;
const CONNECTION_DOT_R = 6;

/** A named rectangle on the HUD. `name` exists so a failing overlap assertion says WHICH pair. */
export interface HudSurface {
  readonly name: string;
  readonly rect: PlateRect;
}

/**
 * Live text metrics the caller measured. Everything the HUD lays out is either a fixed constant or
 * derived from one of these, so a test can reproduce any real frame without a Pixi `Application`.
 */
export interface HudMetrics {
  /** Visible leaderboard rows: 1 in solo, one per seat otherwise (max `PLAYER_COLORS.length`). */
  readonly rows: number;
  /** Pixel width of the WIDEST row, e.g. `>*P1 1500/1500 <YOU`. */
  readonly rowWidth: number;
  readonly comboWidth: number;
  readonly comboHeight: number;
  /** Clock metrics INCLUDING any live phase-edge pulse — Pixi's `.width` already folds in scale. */
  readonly clockWidth: number;
  readonly clockHeight: number;
  /** Tier-banner label metrics; pass 0 when the banner is not showing. */
  readonly tierWidth: number;
  readonly tierHeight: number;
  /** BETA build-stamp metrics, measured by main.ts where the badge is constructed. */
  readonly badgeWidth: number;
  readonly badgeHeight: number;
  /** Help-line width, likewise measured by main.ts. */
  readonly helpWidth: number;
}

/**
 * ⭐ S150 P1 — EVERY FIXED HUD RECTANGLE, AS ONE PURE FUNCTION. This is the whole point of the
 * priority.
 *
 * ## WHY THIS EXISTS
 *
 * Owner: *"the game screen itself has non coherent parts (text/the shapes on the top left) and
 * other stuff that is placed on top of itself"*. Every one of those defects was a pair of
 * independently-correct components that nothing in the codebase RELATED to each other. The legend
 * knew it was at (16,16); the leaderboard knew it was at (12,12); no type, no test and no reviewer
 * ever compared the two, so they were drawn through each other for tens of sessions and the suite
 * stayed green the entire time.
 *
 * A screenshot finds these. A screenshot cannot PREVENT the next one. So the geometry is extracted
 * the way this repo already extracts `layoutChips` and `progressBarFractions`: pure, exported, and
 * asserted headlessly. `hudLayout.test.ts` walks every pair in this list and fails on any
 * intersection, at 1, 4 and 7 seats. Moving any element back on top of another is now a RED test,
 * not a playtest complaint three sessions later.
 *
 * ## WHAT IS AND IS NOT IN HERE
 *
 * IN: everything screen-space and permanent. OUT: the world (keeps, sparks, walls — those move),
 * the transient toasts (combo/sever fly by design), the click-through overlays (codex, castle
 * panel, bot setup — they are modal and are MEANT to cover the board), and the footer chips +
 * shape legend, which `footerBand.test.ts` owns because their geometry is derived from the recipe
 * registry rather than fixed.
 */
export function hudSurfaces(m: HudMetrics): HudSurface[] {
  const out: HudSurface[] = [];
  for (let i = 0; i < m.rows; i++) {
    out.push({
      name: `score-row-${i}`,
      rect: {
        x: SCORE_ROW_X,
        y: SCORE_ROW_TOP_Y + i * SCORE_ROW_STEP,
        w: m.rowWidth,
        h: SCORE_ROW_HEIGHT,
      },
    });
  }
  if (m.rows > 0) {
    // One block for the whole dot column — they are a single visual object to the player.
    const left = CHARGE_DOT_X - CHARGE_DOT_R;
    const right = CHARGE_DOT_X + (MAX_DISRUPTION_CHARGES - 1) * CHARGE_DOT_STEP + CHARGE_DOT_R;
    const top = SCORE_ROW_TOP_Y + 8 - CHARGE_DOT_R;
    const bottom = SCORE_ROW_TOP_Y + 8 + (m.rows - 1) * SCORE_ROW_STEP + CHARGE_DOT_R;
    out.push({ name: 'charge-dots', rect: { x: left, y: top, w: right - left, h: bottom - top } });
  }
  if (m.rows > 0) {
    // ⭐ S152 P1 — THE RAID PIPS ARE A REGISTERED SURFACE. One block for the whole diamond column,
    // exactly as the charge dots are: they read as a single object to the player. Registering it is
    // what turns "does it collide with the Q hint?" from a screenshot question into a test.
    const rl = RAID_PIP_X - CHARGE_DOT_R;
    const rr = RAID_PIP_X + (MAX_RAID_POINTS - 1) * CHARGE_DOT_STEP + CHARGE_DOT_R;
    const rt = SCORE_ROW_TOP_Y + 8 - CHARGE_DOT_R;
    const rb = SCORE_ROW_TOP_Y + 8 + (m.rows - 1) * SCORE_ROW_STEP + CHARGE_DOT_R;
    out.push({ name: 'raid-pips', rect: { x: rl, y: rt, w: rr - rl, h: rb - rt } });
  }
  out.push({ name: 'q-hint', rect: { x: Q_HINT_X, y: Q_HINT_Y, w: Q_HINT_W, h: Q_HINT_H } });
  out.push({
    name: 'top-centre-plate',
    rect: topCentrePlateRect(m.comboWidth, m.comboHeight, m.clockWidth, m.clockHeight),
  });
  if (m.tierWidth > 0) {
    out.push({
      name: 'tier-banner',
      rect: bannerPlateRect(m.tierWidth, m.tierHeight, CANVAS_WIDTH / 2, TIER_BANNER_Y),
    });
  }
  out.push({
    name: 'beta-badge',
    rect: {
      x: HUD_RIGHT_X - m.badgeWidth - 9,
      y: BETA_BADGE_Y - 4,
      w: m.badgeWidth + 18,
      h: m.badgeHeight + 8,
    },
  });
  // ♪ and ⚙ are one 32 px-wide pair right-anchored to the column (main.ts stages them at
  // HUD_RIGHT_X and HUD_RIGHT_X − 20); a 14 px glyph band covers both.
  out.push({
    name: 'audio-glyphs',
    rect: { x: HUD_RIGHT_X - 34, y: AUDIO_ICON_Y, w: 34, h: 16 },
  });
  out.push({
    name: 'connection-dot',
    rect: {
      x: GAUGE_X - CONNECTION_DOT_R,
      y: CONNECTION_DOT_CY - CONNECTION_DOT_R,
      w: CONNECTION_DOT_R * 2,
      h: CONNECTION_DOT_R * 2,
    },
  });
  out.push({
    name: 'energy-gauge',
    rect: { x: GAUGE_X, y: GAUGE_Y_TOP, w: GAUGE_WIDTH, h: GAUGE_Y_BOTTOM - GAUGE_Y_TOP },
  });
  out.push({
    name: 'progress-rail',
    rect: {
      x: PROGRESS_X,
      y: PROGRESS_Y_TOP,
      w: PROGRESS_WIDTH,
      h: PROGRESS_Y_BOTTOM - PROGRESS_Y_TOP,
    },
  });
  /*
   * ⭐ S155 P2 — THE BACK-TO-MAIN BUTTON IS A REGISTERED SURFACE.
   *
   * Registering it is not bookkeeping, it is the gate: S152 shipped HUD diamonds drawn straight
   * through the Q=ZONE text because an unregistered surface is invisible to `hudLayout.test.ts`.
   * The slot was chosen by DUMPING this function's own output for worst-case 4-row metrics rather
   * than by eyeballing the screen — and that is what caught the trap, because the energy gauge and
   * progress rail run x=1882..1904 from y=80 all the way down to the footer, so the natural
   * "flush right" placement would have drawn through the rail for the whole match.
   */
  out.push({ name: 'exit-button', rect: exitButtonRect() });
  out.push({
    name: 'help-line',
    rect: { x: HELP_LINE_X, y: HELP_LINE_Y, w: m.helpWidth, h: 12 },
  });
  return out;
}

/** Do two HUD rectangles intersect? Touching edges are fine; shared area is not. */
export function rectsOverlap(a: PlateRect, b: PlateRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
/**
 * S136 P0 — THE FOOTER CONTROLS AND THEIR CLICK GUARD ARE GONE. Both moved to
 * `render/castlePanel.ts` on the owner's playtest ruling: the automation controls are no longer a
 * permanent bar, they open on a click on the castle. `isOverFooterControl` was replaced by
 * `CastlePanel.isOverPanel` — and it had to move WITH the buttons, not linger here, or the guard
 * would still be swallowing world clicks in a bottom band that no longer holds anything (the
 * inverse of the bug its own docblock warned about).
 *
 * `FOOTER_TOP_Y` / `FOOTER_HEIGHT` are deliberately RETAINED as pure layout constants: the energy
 * gauge and the progress bar are anchored to them (see GAUGE_Y_BOTTOM / PROGRESS_Y_TOP below) so
 * that they cannot drift into the bottom strip. Keeping the anchors means this change moves no
 * existing HUD element — the plate and the two buttons are simply no longer drawn.
 */

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
  /**
   * S150 P1 — one dark plate under the combo counter AND the match clock, so the board's border
   * walls stop running through the two readouts that exist to be read. See `topCentrePlateRect`.
   */
  private readonly topCentrePlate: Graphics;
  /** S147 P1 — the BUILD/FIGHT phase + countdown, top-centre under the combo counter. */
  private readonly phaseBannerText: Text;
  /**
   * S147 P1 — the last matchPhase this HUD actually OBSERVED, or null before the first frame.
   *
   * This is how the phase EDGE is detected, and it is deliberately render-local rather than a
   * PHASE_CHANGED sim effect. A transient effect emitted inside the host tick would be LOST to a
   * joiner and to a post-migration client: they receive a snapshot with matchPhase already
   * flipped and would silently never see the transition. Diffing what we last rendered works
   * identically for host, joiner, worker mirror and promoted successor, costs no wire bytes and
   * adds no hashed state. Same shape as syncRainbowYellAudio's fresh-rainbowSwitchTick watcher
   * and creatureRenderer's death-watcher.
   */
  private lastSeenPhase: MatchPhase | null = null;
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
  /** S150 P1 — see `setChromeMetrics`. Zeroes until main.ts measures the badge and the help line. */
  private chromeMetrics = { badgeWidth: 0, badgeHeight: 0, helpWidth: 0 };

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
      t.position.set(SCORE_ROW_X, SCORE_ROW_TOP_Y + i * SCORE_ROW_STEP);
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
    this.qHintText.position.set(Q_HINT_X, Q_HINT_Y);
    this.qHintText.visible = false;
    app.stage.addChild(this.qHintText);

    // S150 P1 — plate FIRST, so child-add order puts it BEHIND both readouts it backs (the
    // betaBadgePlate/tierBannerPlate idiom — no zIndex API needed). See `topCentrePlateRect`.
    this.topCentrePlate = new Graphics();
    this.topCentrePlate.visible = false;
    app.stage.addChild(this.topCentrePlate);

    // S88 G3a — discovered-combo counter (top-center; shown during PLAYING, all modes).
    this.comboCounterText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: 0xffe066 }),
    });
    this.comboCounterText.anchor.set(0.5, 0);
    this.comboCounterText.position.set(CANVAS_WIDTH / 2, COMBO_COUNTER_Y);
    this.comboCounterText.visible = false;
    app.stage.addChild(this.comboCounterText);

    // S147 P1 — the match clock. Sits directly under the combo counter on the top-centre axis, so
    // the two share one column instead of competing for the same 10px band.
    this.phaseBannerText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 20, fill: 0xffffff }),
    });
    this.phaseBannerText.anchor.set(0.5, 0);
    this.phaseBannerText.position.set(CANVAS_WIDTH / 2, PHASE_BANNER_Y);
    this.phaseBannerText.visible = false;
    app.stage.addChild(this.phaseBannerText);

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

  }

  /** S15 P2 — main.ts sets this from netTransport.peerCount() each frame. */
  setConnectionPeers(peers: number): void {
    this.connectedPeers = peers;
  }

  /**
   * S150 P1 — the two top-right elements main.ts owns (the BETA stamp and the controls help line),
   * measured once at boot and handed over so `getUiPoints()` can report the WHOLE HUD rather than
   * only the part this class happens to construct. Splitting ownership across two files is how the
   * ♪-through-the-connection-dot overlap survived: neither half could see the other's rectangle.
   */
  setChromeMetrics(m: { badgeWidth: number; badgeHeight: number; helpWidth: number }): void {
    this.chromeMetrics = m;
  }

  /**
   * S85 P4c geometry-getter convention — LIVE HUD rectangles for the e2e harness.
   *
   * ⚠ This is deliberately the SAME `hudSurfaces()` the unit test drives, fed with real Pixi text
   * metrics instead of assumed ones. The unit test proves the layout RULE holds; this proves the
   * running game is actually laid out by that rule — a font fallback that renders the leaderboard
   * 40 % wider than monospace would break the second check while the first stayed green.
   */
  getUiPoints(): { surfaces: HudSurface[] } {
    const visibleRows = this.scoreTexts.filter((t) => t.visible);
    return {
      surfaces: hudSurfaces({
        rows: visibleRows.length,
        rowWidth: visibleRows.reduce((m, t) => Math.max(m, t.width), 0),
        comboWidth: this.comboCounterText.visible ? this.comboCounterText.width : 0,
        comboHeight: this.comboCounterText.visible ? this.comboCounterText.height : 0,
        clockWidth: this.phaseBannerText.visible ? this.phaseBannerText.width : 0,
        clockHeight: this.phaseBannerText.visible ? this.phaseBannerText.height : 0,
        tierWidth: this.tierBannerText.visible ? this.tierBannerText.width : 0,
        tierHeight: this.tierBannerText.visible ? this.tierBannerText.height : 0,
        badgeWidth: this.chromeMetrics.badgeWidth,
        badgeHeight: this.chromeMetrics.badgeHeight,
        helpWidth: this.chromeMetrics.helpWidth,
      }),
    };
  }

  /**
   * S136 P0 — arm the one-shot drop-flash suppression for a VOLUNTARY spend.
   *
   * The buy/upgrade buttons moved to `CastlePanel`, so the latch is now armed from outside: main.ts
   * forwards `castlePanel.consumeSpendArmed()` here. The behaviour it protects is unchanged and
   * still load-bearing — the red flash exists to make an INVOLUNTARY loss (a NONET halving) felt,
   * and firing it at a purchase reads as a penalty for playing well. The frame budget stays here
   * with the flash it guards: the spend can still be REFUSED after the click (benched, migration
   * pause, a joiner on a stale mirror), and without an expiry a refused buy strands the latch and
   * silently swallows the next genuine involuntary loss.
   */
  armSpendSuppression(): void {
    this.suppressNextDropFlash = true;
    this.suppressFramesLeft = 60;
  }

  sync(world: World): void {
    this.drawEnergyGauge(world);
    this.drawProgress(world);
    this.drawWinState(world);
    this.drawMultiplayerHUD(world);
    this.drawComboCounter(world);
    this.drawPhaseBanner(world);
    // S150 P1 — LAST of the three, deliberately: it measures the two texts above, so it must run
    // after both have been given this frame's label (and this frame's pulse scale).
    this.drawTopCentrePlate(world);
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

  /**
   * S150 P1 — resize + toggle the shared top-centre plate.
   *
   * Runs every frame rather than on a text change, because the clock's label changes every second
   * AND its scale changes every frame during a phase-edge pulse. Redrawing a single rounded rect is
   * the same per-frame cost the energy gauge and the progress rail already pay.
   */
  private drawTopCentrePlate(world: World): void {
    if (world.gameState !== 'PLAYING') {
      this.topCentrePlate.visible = false;
      return;
    }
    const r = topCentrePlateRect(
      this.comboCounterText.width,
      this.comboCounterText.height,
      this.phaseBannerText.width,
      this.phaseBannerText.height,
    );
    this.topCentrePlate.clear().roundRect(r.x, r.y, r.w, r.h, 8).fill(HUD_PLATE_FILL);
    this.topCentrePlate.visible = true;
  }

  /**
   * S147 P1 — THE MATCH CLOCK READOUT. `BUILD 1:30` / `FIGHT 0:07`, top-centre.
   *
   * Reads only synced state, so it is correct on every surface for free: both `matchPhase` and
   * `phaseEndsAtTick` ride the host snapshot, while `world.tick` advances locally at 60 Hz on host
   * AND client. So the countdown ticks down SMOOTHLY on a joiner between 10 Hz snapshots rather than
   * stepping in 100 ms jumps — no interpolation code required.
   *
   * Colour carries the phase at a glance (the owner's framing: build stage is sealed and safe, fight
   * stage is when it kicks off): calm blue-white in BUILD, hot amber in FIGHT.
   */
  private drawPhaseBanner(world: World): void {
    if (world.gameState !== 'PLAYING') {
      this.phaseBannerText.visible = false;
      // Drop the edge memory with the match, so the first frame of the NEXT match is treated as a
      // fresh observation rather than a phantom transition out of the old match's final phase.
      this.lastSeenPhase = null;
      return;
    }
    this.phaseBannerText.text = formatPhaseBanner(world.matchPhase, world.phaseEndsAtTick - world.tick);
    this.phaseBannerText.style.fill = world.matchPhase === 'FIGHT' ? 0xffb347 : 0xcfe8ff;
    this.phaseBannerText.visible = true;

    // ⚠ DECAY THE EDGE PULSE BACK TO REST, every frame. Found by LOOKING at a captured screenshot,
    // not by a test: `onPhaseEdge` sets scale 1.6 and nothing brought it back, so after the very
    // first transition the banner stayed permanently oversized for the rest of the match. No unit
    // test could have caught it — the formatter is pure and knows nothing about scale, and the Pixi
    // ticker cannot run in a headless pane. Geometric ease toward 1: fast enough to read as a beat,
    // and it settles rather than snapping. Render-only, so frames not ticks (the TIER_BANNER_FRAMES
    // precedent in this file).
    const s = this.phaseBannerText.scale.x;
    this.phaseBannerText.scale.set(s > 1.005 ? 1 + (s - 1) * 0.88 : 1);

    // The phase EDGE. Fires once per transition, and deliberately NOT on the very first observation
    // (lastSeenPhase === null) — joining a match already in progress is not a transition.
    if (this.lastSeenPhase !== null && this.lastSeenPhase !== world.matchPhase) {
      this.onPhaseEdge(world.matchPhase);
    }
    this.lastSeenPhase = world.matchPhase;
  }

  /**
   * S147 P1 — one place for everything that should happen when the cycle turns over. Intentionally
   * minimal in S147 (the clock ships alone): it pulses the banner so the change is unmissable.
   * S149+ hangs the wall-drop cue, the gatherer-shelter beat and the phase sting off this seam.
   *
   * ⚠ Whatever this sets must be RETURNED TO REST by `drawPhaseBanner` above. The first version set a
   * scale here with no decay anywhere and the banner never shrank back.
   */
  private onPhaseEdge(_phase: MatchPhase): void {
    this.phaseBannerText.scale.set(PHASE_EDGE_PULSE_SCALE);
    this.phaseBannerText.alpha = 1;
  }

  private drawEnergyGauge(world: World): void {
    // S42 — read LOCAL player's energy via world.localPlayerId (replaces
    // removed world.currentPlayerId turn-based artifact). Solo: id=0. 1v1
    // host: id=0. 1v1 client: id=1. Guard handles the early-frame race
    // where snapshot hasn't populated players[localPlayerId] yet — gauge
    // skips this tick rather than crashing (Council R1 Battle Ledger row 3
    // Grok-C3 ADOPT + Gemini-R2 confirmed). Pre-S42 fallback to
    // [...players.values()][0] removed (PRIME-AUDIT Δ4 — unnecessary post-guard).
    // ⛔ S150 P1 — NOT ON THE MAIN MENU. `world.players` already holds P1 at TITLE, so the guard
    // below never fired there and the gauge's empty track was drawn down the right edge of the
    // title screen (measured: x 1896, y 80–989 on `spark-s149-arcade-title.png`). A gameplay
    // instrument on a menu is chrome the player cannot act on — the same defect class as the border
    // walls that bled onto TITLE earlier this session.
    if (isOverlayScreen(world.gameState)) {
      this.gauge.clear();
      return;
    }
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
    // ⛔ S150 P1 — NOT ON THE MAIN MENU (see `isOverlayScreen`). This bar was the single most
    // conspicuous piece of the title-screen bleed: an empty outlined box with a lone yellow tick,
    // sitting in the bottom-left of the menu with nothing to explain it. `lastLocalScore` is reset
    // with it so the first frame of the next match cannot be read as a score DROP and fire the red
    // loss-flash at a player who has not lost anything.
    if (isOverlayScreen(world.gameState)) {
      this.progress.clear();
      this.lastLocalScore = -1;
      this.dropFlash = 0;
      return;
    }
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
    // S150 P1 — FILLS UPWARD FROM THE BOTTOM, exactly like the energy gauge beside it. The old
    // horizontal bar grew left-to-right; two adjacent instruments filling in different directions
    // is precisely the inconsistency the owner asked to be rid of.
    const fillHeight = trackHeight * this.displayProgress;
    g.rect(PROGRESS_X, PROGRESS_Y_BOTTOM - fillHeight, PROGRESS_WIDTH, fillHeight)
      .fill({ color: barColor, alpha: 0.6 + this.dropFlash * 0.35 });
    // leader ghost-tick (max-of-all) so "who's ahead" stays readable — now a horizontal tick
    // across the rail, and it overhangs both edges so it reads against the fill.
    const leaderY = PROGRESS_Y_BOTTOM - trackHeight * leader;
    g.rect(PROGRESS_X - 2, leaderY - 1, PROGRESS_WIDTH + 4, 2)
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
        t0.position.set(SCORE_ROW_X, SCORE_ROW_TOP_Y);
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
      t.position.set(SCORE_ROW_X, SCORE_ROW_TOP_Y + i * SCORE_ROW_STEP);
      t.visible = true;
    });

    // Connection status dot — visible in any networked gameState (PLAYING/LOBBY).
    // S82 P3 — CVD fix (EYES backlog #3): green-vs-red alone is the classic
    // deuteranopia trap. Connected = FILLED dot; lost = HOLLOW ring + X slash —
    // the state now reads by SHAPE, colour stays as the redundant cue.
    const g = this.connectionDot;
    g.clear();
    if (isNetworked(world)) {
      // ⛔ S150 P1 — cy 48 → 68. At 48 the ring (y 41–55) intersected the ♪ mute glyph (y 30–45)
      // by a 4×5 px corner: the note's tail was drawn straight through the top-right of the
      // no-link ring, which is exactly what a "connection lost" indicator must not look like.
      // The dot now sits in the top-right column's own step, above the two rails.
      const cx = GAUGE_X;
      const cy = CONNECTION_DOT_CY;
      if (this.connectedPeers > 0) {
        g.circle(cx, cy, CONNECTION_DOT_R).fill({ color: 0x3bff7a, alpha: 0.85 });
      } else {
        g.circle(cx, cy, CONNECTION_DOT_R).stroke({ color: 0xff3b6b, width: 2, alpha: 0.85 });
        g.moveTo(cx - 3, cy - 3).lineTo(cx + 3, cy + 3)
          .moveTo(cx + 3, cy - 3).lineTo(cx - 3, cy + 3)
          .stroke({ color: 0xff3b6b, width: 2, alpha: 0.85 });
      }
    }

    // S17 P1 — disruption charge dots, one row per ranked player (aligned to the
    // leaderboard rows above). Filled when earned, hollow ring otherwise; colored.
    const d = this.chargeDots;
    d.clear();
    ranked.forEach((p, i) => drawPlayerCharges(d, p, SCORE_ROW_TOP_Y + 8 + i * SCORE_ROW_STEP));

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
function drawPlayerCharges(
  g: Graphics,
  player: { color: number; disruptionCharges: number; raidPoints: number } | undefined,
  y: number,
): void {
  if (player === undefined) return;
  drawPlayerRaidPoints(g, player, y);
  for (let i = 0; i < MAX_DISRUPTION_CHARGES; i++) {
    // S50 P3 (Sym E occlusion polish) — moved from x=210 to x=260 to fully
    // clear the "RED  50 / 50" score text. Council Battle Ledger C4 over
    // dynamic getBounds (rejected: async Pixi text-layout pitfall + no
    // benefit at PHASE_1_WIN_SCORE=50 max 2-digit). Static numeric chosen
    // for traceability in git blame. Pre-S46: x=140 (collided past 2-digit).
    // S46: x=210 (still tight per user feedback across S46/S47/S48/S49).
    // S50: x=260 (50px additional headroom — score text max ends x≈132 at
    // 12-char "RED  50 / 50" at 9.6px/char monospace 16).
    const cx = CHARGE_DOT_X + i * CHARGE_DOT_STEP;
    if (player.disruptionCharges > i) {
      g.circle(cx, y, CHARGE_DOT_R).fill({ color: player.color, alpha: 0.9 });
    } else {
      g.circle(cx, y, CHARGE_DOT_R).stroke({ width: 1, color: player.color, alpha: 0.5 });
    }
  }
}

/**
 * ⭐ S152 P1 (owner R78) — RAID POINTS, DRAWN AS DIAMONDS BESIDE THE ROUND DISRUPTION PIPS.
 *
 * ⛔ THE SHAPE IS THE POINT, NOT DECORATION. These are a SECOND currency with a different cap
 * (`MAX_RAID_POINTS` = 3 vs `MAX_DISRUPTION_CHARGES` = 2) and different sinks. Drawn as more round
 * dots in the same colour they would read as "you have five charges", which is exactly the confusion
 * the separate-currency decision exists to avoid. Diamond = offence, circle = disruption.
 *
 * Positioned AFTER the disruption pips so the existing x-coordinate reasoning above (score text
 * clearance, settled over four sessions of user feedback) is inherited rather than relitigated.
 */
function drawPlayerRaidPoints(
  g: Graphics,
  player: { color: number; raidPoints: number },
  y: number,
): void {
  const x0 = RAID_PIP_X;
  for (let i = 0; i < MAX_RAID_POINTS; i++) {
    const cx = x0 + i * CHARGE_DOT_STEP;
    const r = CHARGE_DOT_R;
    // A diamond: same visual weight as the pips, unmistakably not a circle.
    const pts = [cx, y - r, cx + r, y, cx, y + r, cx - r, y];
    if (player.raidPoints > i) {
      g.poly(pts).fill({ color: player.color, alpha: 0.9 });
    } else {
      g.poly(pts).stroke({ width: 1, color: player.color, alpha: 0.5 });
    }
  }
}
