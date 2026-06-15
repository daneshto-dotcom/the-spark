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

import { Container, Graphics, Text, TextStyle, Ticker } from 'pixi.js';
import { MAX_PLAYERS } from '../constants.ts';
import { getSeatRect, SEAT_H, SEAT_W } from './lobbyGeometry.ts';
import type { SeatView } from './lobbyStateMachine.ts';

const EMPTY_OUTLINE = 0x555555;
const EMPTY_GLYPH = 0x777777;
const YOU_GLOW = 0xffffff;
// Dark label reads with high contrast on the max-saturation bright PLAYER_COLORS.
const LABEL_FILL = 0x0a0a0a;
const CORNER = 12;

/* ── S82 P5 — pure projection helpers (extracted for seatRack.test.ts; the Council
 *    REVISED SCOPE DELTA's missing unit-test item). The Pixi code below consumes
 *    EXACTLY these, so the test file locks the label/style contract without
 *    instantiating a renderer. ── */

/** Occupied-seat label: "P{n}" + HOST badge + "(you)" marker, double-space joined. */
export function seatLabelText(seatIndex: number, isHost: boolean, isYou: boolean): string {
  const parts = [`P${seatIndex + 1}`];
  if (isHost) parts.push('HOST');
  if (isYou) parts.push('(you)');
  return parts.join('  ');
}

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

export function makeSeatRack(): SeatRackHandle {
  const container = new Container();
  const cells: SeatCell[] = [];
  let baselineSet = false;

  for (let i = 0; i < MAX_PLAYERS; i++) {
    const rect = getSeatRect(i);
    const cell = new Container();
    // S85 P4c — center pivot so the pop-in scale grows from the cell middle.
    cell.pivot.set(SEAT_W / 2, SEAT_H / 2);
    cell.position.set(rect.x + SEAT_W / 2, rect.y + SEAT_H / 2);

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

    container.addChild(cell);
    cells.push({ cell, bg, label, glyph, readyTick, occupied: false, animKind: null, animStartMs: 0 });
  }

  // S85 P4c — per-frame cosmetic animation pass. Cheap no-op when no cell is
  // animating; runs for the app lifetime like the rack itself (no teardown
  // path exists for the lobby shell). Wall-clock, not sim-tick: pure cosmetics.
  Ticker.shared.add(() => {
    const now = performance.now();
    for (const c of cells) {
      if (c.animKind === null) continue;
      const pose = seatAnimPose(c.animKind, now - c.animStartMs);
      c.cell.alpha = pose.alpha;
      c.cell.scale.set(pose.scale);
      if (pose.done) c.animKind = null;
    }
  });

  function update(seats: readonly SeatView[]): void {
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
        bg.roundRect(0, 0, SEAT_W, SEAT_H, CORNER).fill({
          color: seat.color,
          alpha: style.fillAlpha,
        });
        bg.roundRect(0, 0, SEAT_W, SEAT_H, CORNER).stroke({
          width: style.strokeWidth,
          color: style.strokeColor,
          alpha: style.strokeAlpha,
        });
        label.text = seatLabelText(i, seat.isHost, seat.isYou);
        label.visible = true;
        glyph.visible = false;
      } else {
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
