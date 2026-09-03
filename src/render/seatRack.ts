/**
 * SPARK — S69 P2: lobby seat-rack renderer.
 *
 * Extracted from lobbyScreen.ts (Council A1) so the already-oversized shell does
 * not grow further. Builds MAX_PLAYERS seat cells ONCE (positioned via the pure
 * getSeatRect layout) and applies a SeatView[] projection on update():
 *   - occupied  -> solid swatch in PLAYER_COLORS[seat], "P{n}" label (+ HOST / (you))
 *   - empty     -> thin outline + centered "+" glyph
 *   - own seat  -> brighter swatch + white glow outline ("you are here", A5)
 *
 * The empty/occupied distinction is conveyed by SHAPE (glyph vs solid), not only
 * by colour (A4 accessibility) — a partial de-risk of the deferred CVD shape-icon
 * item, achievable within the vector-only constraint.
 *
 * COUNT-based: a joiner cannot know WHICH seat is its own before the host mints
 * the roster at Begin, so `isYou` is set only on the host's seat 0 (see
 * lobbyStateMachine.lobbyView). P3 (presence broadcast) upgrades this to a true
 * per-seat roster. All seat OCCUPANCY logic is pure + unit-tested in
 * lobbyStateMachine.test.ts; this module is the Pixi projection (boot-smoke + e2e
 * verified, like lobbyScreen.ts itself — Pixi renderers are not vitest-unit-tested).
 *
 * S85 P4c — D1 living-lobby animations (the S70 P2 deferral): a seat POPS IN on
 * join (alpha+scale ease-out) and BLINKS OUT on leave (alpha dip while the empty
 * outline takes over). Animation state is per-cell, driven by Ticker.shared
 * (wall-clock cosmetic convention — the lobby has no sim-tick contract), and the
 * FIRST update() after mount sets a silent baseline (no spurious pop-in storm
 * when entering an already-populated room). Pure pose math in seatAnimPose()
 * (unit-tested); occupancy DATA (getSeats) is untouched — e2e contracts intact.
 */

import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture, Ticker } from 'pixi.js';
import { MAX_PLAYERS } from '../constants.ts';
import { getSeatRect, SEAT_H, SEAT_W } from './lobbyGeometry.ts';
import type { SeatView } from './lobbyStateMachine.ts';
import { RACE_BANNER_SRC, seatRaceLabel } from './raceBanners.ts';
import type { RaceId } from '../state/races.ts';

const EMPTY_OUTLINE = 0x555555;
const EMPTY_GLYPH = 0x777777;
const YOU_GLOW = 0xffffff;
/*
 * ⭐ S161 P6 — THE LABEL WENT FROM NEAR-BLACK TO NEAR-WHITE, AND IT HAD TO.
 *
 * It was `0x0a0a0a`, and the comment beside it explained why: *"Dark label reads with high contrast
 * on the max-saturation bright PLAYER_COLORS"* — correct, when a seat tile was a flat swatch of one
 * bright colour. The tile is now a mid-to-dark painted banner (the owner's *"cool art that defines
 * the race and color"*), so dark-on-bright has become dark-on-dark. Light text plus a dark shadow
 * reads on all six banners, which is also why the banner briefs ask for a darker centre band.
 */
const LABEL_FILL = 0xf4f4f4;
/** Dimmed swatch under the banner: the colour still shows through where the art is dark. */
const CORNER = 12;
/** How much of the flat seat colour survives on top of the banner — enough to tint, not to hide. */
const SWATCH_OVER_BANNER_ALPHA = 0.22;

/* ── S82 P5 — pure projection helpers (extracted for seatRack.test.ts; the Council
 *    REVISED SCOPE DELTA's missing unit-test item). The Pixi code below consumes
 *    EXACTLY these, so the test file locks the label/style contract without
 *    instantiating a renderer. ── */

/*
 * ⛔ `seatLabelText` WAS DELETED HERE, NOT LEFT BEHIND. S161 P6 replaced it with `seatRaceLabel`
 * (raceBanners.ts), which prints the RACE instead of the `(you)` marker on the owner's ruling. The
 * old function survived the swap with its four tests still green and nothing calling it — a dead
 * export with a passing test, which is the shape that convinces the next reader it is live. Its
 * coverage moved to `raceBanners.test.ts` rather than being dropped.
 */

export interface OccupiedSeatStyle {
  readonly fillAlpha: number;
  readonly strokeWidth: number;
  readonly strokeColor: number;
  readonly strokeAlpha: number;
}

/** Occupied-seat fill/stroke derivation: own seat = full alpha + white glow (A5). */
export function seatCellStyle(seatColor: number, isYou: boolean): OccupiedSeatStyle {
  return isYou
    ? { fillAlpha: 1, strokeWidth: 5, strokeColor: YOU_GLOW, strokeAlpha: 0.9 }
    : { fillAlpha: 0.85, strokeWidth: 2, strokeColor: seatColor, strokeAlpha: 1 };
}

/* ── S85 P4c — D1 join/leave animation pose (pure, unit-tested) ── */

export type SeatAnimKind = 'in' | 'out';

export const SEAT_ANIM_IN_MS = 280;
export const SEAT_ANIM_OUT_MS = 350;

export interface SeatAnimPose {
  readonly alpha: number;
  readonly scale: number;
  /** True once the animation has fully resolved (caller may drop the state). */
  readonly done: boolean;
}

const IDENTITY_POSE: SeatAnimPose = { alpha: 1, scale: 1, done: true };

/**
 * Pose for a cell `elapsedMs` into a join ('in') or leave ('out') animation.
 *   in:  ease-out cubic — alpha 0→1, scale 0.92→1 over SEAT_ANIM_IN_MS.
 *   out: alpha dips to 0.25 at the midpoint then recovers to 1 over
 *        SEAT_ANIM_OUT_MS (the "blink out" — the EMPTY visual is already
 *        drawn underneath, so the dip reads as the occupant vanishing).
 * Out-of-range elapsed resolves to the identity pose (idempotent, no clamp NaN).
 */
export function seatAnimPose(kind: SeatAnimKind, elapsedMs: number): SeatAnimPose {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return IDENTITY_POSE;
  if (kind === 'in') {
    if (elapsedMs >= SEAT_ANIM_IN_MS) return IDENTITY_POSE;
    const t = elapsedMs / SEAT_ANIM_IN_MS;
    const ease = 1 - Math.pow(1 - t, 3);
    return { alpha: ease, scale: 0.92 + 0.08 * ease, done: false };
  }
  if (elapsedMs >= SEAT_ANIM_OUT_MS) return IDENTITY_POSE;
  const t = elapsedMs / SEAT_ANIM_OUT_MS;
  // Triangle dip: 1 → 0.25 → 1.
  const dip = t < 0.5 ? 1 - t * 2 * 0.75 : 0.25 + (t - 0.5) * 2 * 0.75;
  return { alpha: dip, scale: 1, done: false };
}

interface SeatCell {
  /** S161 P6 — the race this cell should be showing, so a late banner load can still land. */
  wantRace: RaceId | null;
  readonly banner: Sprite;
  readonly cell: Container;
  readonly bg: Graphics;
  readonly label: Text;
  readonly glyph: Text;
  /** S89 P1 — quickmatch READY tick, top-right of the cell (dark for guaranteed
   *  contrast on every bright PLAYER_COLOR swatch, same rationale as the label). */
  readonly readyTick: Text;
  occupied: boolean;
  animKind: SeatAnimKind | null;
  animStartMs: number;
}

export interface SeatRackHandle {
  readonly container: Container;
  /** Apply a SeatView[] projection (length up to MAX_PLAYERS) to the cells. */
  update(seats: readonly SeatView[]): void;
}

/**
 * ⭐ S161 P6 — LAZY, CACHED, PER-RACE. Six banners is 524 KiB and a lobby shows at most four of
 * them, so they load on first use rather than at mount. The `started` set is what stops `update`
 * — which runs on every presence beacon — from queueing a fresh fetch each time before the first
 * one resolves; the same guard, for the same reason, as `GathererRenderer.ensureCastleAtlas`.
 */
const bannerCache = new Map<RaceId, Texture>();
const bannerStarted = new Set<RaceId>();
function bannerTexture(raceId: RaceId): Texture | null {
  const hit = bannerCache.get(raceId);
  if (hit !== undefined) return hit;
  if (!bannerStarted.has(raceId)) {
    bannerStarted.add(raceId);
    void Assets.load(RACE_BANNER_SRC[raceId])
      .then((t: Texture) => bannerCache.set(raceId, t))
      // A missing banner is cosmetic: the tile falls back to the flat colour swatch it always had.
      .catch(() => {});
  }
  return null;
}

export function makeSeatRack(onSeatClick?: (seatIndex: number) => void): SeatRackHandle {
  const container = new Container();
  const cells: SeatCell[] = [];
  let baselineSet = false;
  /** The last projection applied, so a late banner load can re-run it. See the ticker. */
  let lastSeats: readonly SeatView[] | null = null;

  for (let i = 0; i < MAX_PLAYERS; i++) {
    const rect = getSeatRect(i);
    const cell = new Container();
    // S85 P4c — center pivot so the pop-in scale grows from the cell middle.
    cell.pivot.set(SEAT_W / 2, SEAT_H / 2);
    cell.position.set(rect.x + SEAT_W / 2, rect.y + SEAT_H / 2);

    /*
     * ⭐ S161 P6 — THE BANNER SITS UNDER EVERYTHING, MASKED TO THE TILE'S OWN ROUNDED RECT.
     *
     * Order matters and is the whole layout: banner → swatch tint → outline → label. The swatch is
     * the SAME `seat.color` the tile used to be filled with, now at low alpha over the art, so the
     * tile still answers "which colour am I?" from across the screen while the art answers "who am
     * I?" — which is exactly the split the owner asked for.
     */
    const bannerMask = new Graphics().roundRect(0, 0, SEAT_W, SEAT_H, CORNER).fill(0xffffff);
    const banner = new Sprite();
    banner.width = SEAT_W;
    banner.height = SEAT_H;
    banner.visible = false;
    banner.mask = bannerMask;
    cell.addChild(banner);
    cell.addChild(bannerMask);

    const bg = new Graphics();
    cell.addChild(bg);

    const label = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 22,
        fill: LABEL_FILL,
        letterSpacing: 2,
        align: 'center',
        // Light text on painted art needs the shadow to survive a bright patch behind it.
        dropShadow: { color: 0x000000, alpha: 0.9, blur: 4, distance: 2, angle: Math.PI / 2 },
      }),
    });
    label.anchor.set(0.5);
    label.position.set(SEAT_W / 2, SEAT_H / 2);
    cell.addChild(label);

    const glyph = new Text({
      text: '+',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 48, fill: EMPTY_GLYPH }),
    });
    glyph.anchor.set(0.5);
    glyph.position.set(SEAT_W / 2, SEAT_H / 2);
    cell.addChild(glyph);

    // S89 P1 — per-seat READY tick (quickmatch). Dark fill on the bright swatch
    // for contrast (same as the label); top-right corner, hidden until ready.
    const readyTick = new Text({
      text: '✓',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 34, fontWeight: 'bold', fill: LABEL_FILL }),
    });
    readyTick.anchor.set(1, 0);
    readyTick.position.set(SEAT_W - 14, 10);
    readyTick.visible = false;
    cell.addChild(readyTick);

    /*
     * ⭐ S161 P6 — YOUR OWN SEAT IS A BUTTON. Only ever your own: `update` sets `eventMode` per
     * frame from `seat.isYou`, so an enemy tile is inert and there is nothing to spoof by clicking.
     * That gating is also what let the label drop its `(you)` marker — the clickable tile IS the
     * marker.
     */
    cell.on('pointertap', () => {
      if (cell.eventMode === 'static') onSeatClick?.(i);
    });
    container.addChild(cell);
    cells.push({ cell, banner, bg, label, glyph, readyTick, wantRace: null, occupied: false, animKind: null, animStartMs: 0 });
  }

  // S85 P4c — per-frame cosmetic animation pass. Cheap no-op when no cell is
  // animating; runs for the app lifetime like the rack itself (no teardown
  // path exists for the lobby shell). Wall-clock, not sim-tick: pure cosmetics.
  Ticker.shared.add(() => {
    const now = performance.now();
    for (const c of cells) {
      /*
       * ⭐ S161 P6 — ADOPT A BANNER THAT ARRIVED AFTER THE LAST `update()`.
       *
       * ⚠ THIS IS THE BUG THE FIRST CAPTURE CAUGHT. `update()` runs only when the lobby STATE
       * changes — a join, a leave, a presence beacon — while `bannerTexture` returns null on its
       * first call and resolves milliseconds later. On a host sitting alone in a fresh room there is
       * no further state change, so the texture landed in the cache and nothing ever applied it: the
       * tile kept the flat swatch and looked exactly like the pre-S161 rack. `GathererRenderer` has
       * no equivalent problem because its `sync` runs every frame; this rack does not, so the poll
       * belongs here — in the ticker it already runs for the join/leave animations.
       */
      if (c.wantRace !== null && !c.banner.visible && bannerTexture(c.wantRace) !== null) {
        // ⛔ RE-RUN THE WHOLE PROJECTION, don't just assign the texture. The colour swatch is drawn
        // OVER the banner and its alpha depends on whether a banner is present (opaque without one,
        // a 0.22 wash with one) — so patching the sprite alone would leave a solid swatch sitting on
        // top of the art and the tile would look exactly as broken as before.
        if (lastSeats !== null) update(lastSeats);
      }
      if (c.animKind === null) continue;
      const pose = seatAnimPose(c.animKind, now - c.animStartMs);
      c.cell.alpha = pose.alpha;
      c.cell.scale.set(pose.scale);
      if (pose.done) c.animKind = null;
    }
  });

  function update(seats: readonly SeatView[]): void {
    lastSeats = seats;
    for (let i = 0; i < cells.length; i++) {
      const seat = seats[i];
      const c = cells[i];
      const { bg, label, glyph, readyTick } = c;
      const nowOccupied = seat !== undefined && seat.occupied;
      bg.clear();

      // S89 P1 — show the READY tick only on an occupied seat that has readied
      // (seat.ready is undefined in friends lobbies → tick stays hidden there).
      readyTick.visible = nowOccupied && seat?.ready === true;

      if (nowOccupied) {
        // S82 P5 — style + label derivation through the exported pure helpers.
        const style = seatCellStyle(seat.color, seat.isYou);
        // ⭐ S161 P6 — the banner replaces the flat fill; the colour survives as a wash over it.
        c.wantRace = seat.raceId ?? null;
        const tex = seat.raceId !== undefined ? bannerTexture(seat.raceId) : null;
        c.banner.visible = tex !== null;
        if (tex !== null) c.banner.texture = tex;
        bg.roundRect(0, 0, SEAT_W, SEAT_H, CORNER).fill({
          color: seat.color,
          alpha: tex !== null ? SWATCH_OVER_BANNER_ALPHA : style.fillAlpha,
        });
        bg.roundRect(0, 0, SEAT_W, SEAT_H, CORNER).stroke({
          width: style.strokeWidth,
          color: style.strokeColor,
          alpha: style.strokeAlpha,
        });
        label.text = seatRaceLabel(i, seat.isHost, seat.raceId);
        label.visible = true;
        glyph.visible = false;
        // Only your own occupied seat accepts a click (see the handler's docblock).
        c.cell.eventMode = seat.isYou ? 'static' : 'none';
        c.cell.cursor = seat.isYou ? 'pointer' : 'default';
      } else {
        c.wantRace = null;
        c.banner.visible = false;
        c.cell.eventMode = 'none';
        c.cell.cursor = 'default';
        bg.roundRect(0, 0, SEAT_W, SEAT_H, CORNER).stroke({
          width: 2,
          color: EMPTY_OUTLINE,
          alpha: 0.6,
        });
        label.visible = false;
        glyph.visible = true;
      }

      // S85 P4c — D1 join/leave transition trigger. Baseline pass is silent
      // (no pop-in storm when first showing an already-populated room).
      if (baselineSet && nowOccupied !== c.occupied) {
        c.animKind = nowOccupied ? 'in' : 'out';
        c.animStartMs = performance.now();
        const pose = seatAnimPose(c.animKind, 0);
        c.cell.alpha = pose.alpha;
        c.cell.scale.set(pose.scale);
      }
      c.occupied = nowOccupied;
    }
    baselineSet = true;
  }

  return { container, update };
}
