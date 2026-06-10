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
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
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

interface SeatCell {
  readonly bg: Graphics;
  readonly label: Text;
  readonly glyph: Text;
}

export interface SeatRackHandle {
  readonly container: Container;
  /** Apply a SeatView[] projection (length up to MAX_PLAYERS) to the cells. */
  update(seats: readonly SeatView[]): void;
}

export function makeSeatRack(): SeatRackHandle {
  const container = new Container();
  const cells: SeatCell[] = [];

  for (let i = 0; i < MAX_PLAYERS; i++) {
    const rect = getSeatRect(i);
    const cell = new Container();
    cell.position.set(rect.x, rect.y);

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

    container.addChild(cell);
    cells.push({ bg, label, glyph });
  }

  function update(seats: readonly SeatView[]): void {
    for (let i = 0; i < cells.length; i++) {
      const seat = seats[i];
      const { bg, label, glyph } = cells[i];
      bg.clear();

      if (seat !== undefined && seat.occupied) {
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
    }
  }

  return { container, update };
}
