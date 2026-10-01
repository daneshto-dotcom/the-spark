/**
 * SPARK — S191 (owner item 1b) — **THE SCORCHED EARTH SQUARE AND GESTURE, driven through the REAL
 * `Controls`, the REAL `FooterBand` and the REAL `ZoneBackgroundRenderer`.**
 *
 * > *"on the bottom left same where the wrath of ra ability lies there's going to be … a scorched earth
 * > ability button that you click on and then you can click on any quadrant of the enemy there's going
 * > to be like a cool preview when you mouse over it like shows you it turning red"* — owner, S191
 *
 * Square → aim → hover (the zone turns red on the render model) → click → `CAST_SCORCHED_EARTH` → the
 * reducer → the scorched zone drawn red from synced state; and every way out (RMB, Escape — consumed —
 * a second press, a click on the quarry, BUILD). The square is asserted where the footer's two recorded
 * defect shapes live: drawn-but-not-hit-tested and hit-tested-but-not-drawn, in both collapse states.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../render/audioManager.ts', () => ({
  playUiClickSFX: vi.fn(async () => {}),
  playUiRefusedSFX: vi.fn(async () => {}),
}));

import { Container, Texture, type Application } from 'pixi.js';
import { PLAYER_COLORS, SPAWNER_CENTER_X, SPAWNER_CENTER_Y } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { dispatch, makeWorld, type GameAction, type World } from '../state/world.ts';
import { Controls } from './controls.ts';
import { FooterBand, layoutRaButton, layoutScorchedEarthButton } from '../render/footerBand.ts';
import {
  clearScorchedEarthPending,
  scorchedEarthAim,
  scorchedEarthHoverSeat,
  setScorchedEarthAim,
} from '../render/scorchedEarthAim.ts';
import { setRaAimPreview } from '../render/raAimPreview.ts';
import {
  SCORCHED_EARTH_PREVIEW_TINT,
  SCORCHED_ZONE_TINT,
  ZoneBackgroundRenderer,
} from '../render/zoneBackgroundRenderer.ts';
import { playUiRefusedSFX } from '../render/audioManager.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const IN_P1_LAND = { x: 1400, y: 300 };
const UNTINTED = 0xffffff;

beforeAll(() => {
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  // `createElement` → a canvas with no 2D context: the backdrop's portal bake then keeps its texture
  // (its own documented fallback), exactly as it does headless.
  vi.stubGlobal('document', { activeElement: null, createElement: () => ({ getContext: () => null }) });
});
afterEach(() => {
  setScorchedEarthAim(null);
  setRaAimPreview(null);
  clearScorchedEarthPending();
});

function rig(tookIt = true): { w: World; c: Controls; band: FooterBand; sent: GameAction[] } {
  const w = makeWorld(0xc191);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0]!, raceId: 'demons' },
      { seat: 1, color: PLAYER_COLORS[1]!, raceId: 'orcs' },
    ],
    botSeats: [1],
  });
  dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P0, pick: tookIt ? 'racial' : 'hp' });
  w.draft = null;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.tick = Math.max(w.tick, 1000); // past the backdrop's opening hold
  const canvas = {
    addEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    style: { cursor: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080, right: 1920, bottom: 1080, x: 0, y: 0 }),
  };
  const sent: GameAction[] = [];
  const c = new Controls({ canvas } as never, w, P0, (a) => { sent.push(a); dispatch(w, a); });
  const stage = new Container();
  const band = new FooterBand({ stage } as never, stage);
  c.setFooterBand(band);
  band.sync(w);
  return { w, c, band, sent };
}

/** The real backdrop renderer, its texture loader short-circuited (no network / GPU under vitest). */
function backdrop(): { r: ZoneBackgroundRenderer; tintOf: (zone: number) => number | undefined } {
  const r = new ZoneBackgroundRenderer({ stage: new Container() } as unknown as Application, new Container());
  const inner = r as unknown as {
    ensureTexture(url: string): void;
    textures: Map<string, Texture>;
    sprites: Map<number, { tint: number }>;
  };
  inner.ensureTexture = (url: string) => { inner.textures.set(url, Texture.WHITE); };
  return { r, tintOf: (zone) => inner.sprites.get(zone)?.tint };
}

type Ptr = { button: number; clientX: number; clientY: number; pointerId: number };
const down = (c: Controls, x: number, y: number, button = 0): void =>
  (c as unknown as { onDown(e: Ptr): void }).onDown({ button, clientX: x, clientY: y, pointerId: 1 });
const move = (c: Controls, x: number, y: number): void =>
  (c as unknown as { onMove(e: Ptr): void }).onMove({ button: 0, clientX: x, clientY: y, pointerId: 1 });
const key = (c: Controls, k: string, preventDefault?: () => void): void =>
  (c as unknown as { onKeyDown(e: { key: string; preventDefault?: () => void }): void }).onKeyDown({ key: k, preventDefault });
const squareMid = (band: FooterBand): { x: number; y: number } => {
  const r = band.getUiPoints().scorchedEarth!;
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};
const casts = (sent: GameAction[]) => sent.filter((a) => a.type === 'CAST_SCORCHED_EARTH');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 — the SCORCHED EARTH square: drawn where Ra’s lives, and solid wherever it is drawn', () => {
  it('⭐ a demons seat holding SCORCHED GROUND gets the square, in Ra’s own slot', () => {
    const { band } = rig();
    const ui = band.getUiPoints();
    expect(ui.ra, 'a demons seat has no Ra').toBeNull();
    expect(ui.scorchedEarth).toEqual(layoutRaButton(ui.chips, false));
    expect(ui.scorchedEarthSlot).toMatchObject({ refusal: null, charges: 1, left: 1 });
  });

  it('⛔ a demons seat WITHOUT the pick has no square — and nothing hit-tests where none is drawn', () => {
    const { band } = rig(false);
    const ui = band.getUiPoints();
    expect(ui.scorchedEarth).toBeNull();
    const slot = layoutRaButton(ui.chips, false)!;
    expect(band.isOverScorchedEarthButton(slot.x + 5, slot.y + 5)).toBe(false);
  });

  it('⭐ a CONTROL and an opaque SURFACE, in BOTH collapse states', () => {
    const { w, band } = rig();
    const m = squareMid(band);
    expect(band.isOverChip(m.x, m.y), 'the cursor offers it').toBe(true);
    expect(band.isOverBandSurface(m.x, m.y), 'nothing is planted under it').toBe(true);
    band.toggleCollapsed();
    band.sync(w);
    const compact = band.getUiPoints().scorchedEarth!;
    expect(compact.compact, 'the collapsed form is the compact square beside the tab').toBe(true);
    expect(compact).toEqual(layoutScorchedEarthButton([], true));
    const cm = { x: compact.x + compact.w / 2, y: compact.y + compact.h / 2 };
    expect(band.isOverChip(cm.x, cm.y)).toBe(true);
    expect(band.isOverBandSurface(cm.x, cm.y)).toBe(true);
    // …and the expanded square's ground is released when it is not drawn there.
    expect(band.isOverBandSurface(m.x, m.y)).toBe(false);
  });

  it('⚠ should a seat ever hold BOTH skills, the square steps one slot LEFT of Ra’s instead of drawing over it', () => {
    const { band } = rig();
    const chips = band.getUiPoints().chips;
    const ra = layoutRaButton(chips, false)!;
    const se = layoutScorchedEarthButton(chips, false, ra)!;
    expect(se.x + se.w).toBeLessThan(ra.x);
    expect(se.y).toBe(ra.y);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S191 — square → aim → hover preview → click → CAST_SCORCHED_EARTH', () => {
  it('⭐⭐ the press aims; the zone under the cursor turns red on the REAL backdrop; the click scorches THAT zone', () => {
    const { w, c, band, sent } = rig();
    const bg = backdrop();
    const m = squareMid(band);
    down(c, m.x, m.y);
    expect(scorchedEarthAim(), 'the press starts aiming').not.toBeNull();
    expect(casts(sent)).toHaveLength(0);

    move(c, IN_P1_LAND.x, IN_P1_LAND.y);
    expect(scorchedEarthHoverSeat(w)).toBe(P1);
    bg.r.sync(w);
    bg.r.sync(w);
    expect(bg.tintOf(1), 'the hovered enemy zone previews red').toBe(SCORCHED_EARTH_PREVIEW_TINT);
    expect(bg.tintOf(0), 'the caster’s own (unhovered, passive) zone is its ember').toBe(SCORCHED_ZONE_TINT);

    move(c, 600, 300); // over his own zone — also a legal target
    bg.r.sync(w);
    expect(bg.tintOf(0), 'hovering his OWN zone previews it').toBe(SCORCHED_EARTH_PREVIEW_TINT);
    expect(bg.tintOf(1), 'and the enemy zone is back to its art').toBe(UNTINTED);

    move(c, IN_P1_LAND.x, IN_P1_LAND.y);
    down(c, IN_P1_LAND.x, IN_P1_LAND.y);
    expect(casts(sent)).toEqual([{ type: 'CAST_SCORCHED_EARTH', playerId: P0, zoneSeat: P1 }]);
    expect(scorchedEarthAim(), 'one cast, then the aim is put away').toBeNull();
    expect(w.players.get(P0)!.scorchedEarth, 'it reached the reducer').toEqual({ wave: w.waveNumber, zoneSeat: P1 });

    // The scorched zone is drawn red from SYNCED state, not from the aim.
    bg.r.sync(w);
    expect(bg.tintOf(1), 'the scorched enemy zone now burns red').toBe(SCORCHED_ZONE_TINT);
    band.sync(w);
    expect(band.getUiPoints().scorchedEarthSlot?.refusal, 'and the square is spent').toBe('USED');
    expect(band.getUiPoints().scorchedEarthCaption).toBe('USED');

    // …and the red goes with the FIGHT: in BUILD the scorched zone shows its original art again.
    w.matchPhase = 'BUILD';
    bg.r.sync(w);
    expect(bg.tintOf(1), 'BUILD: no scorch drawn').toBe(UNTINTED);
    expect(bg.tintOf(0), 'BUILD: the passive’s ember is off too (1a)').toBe(UNTINTED);
  });

  it('⛔ RMB cancels — nothing is sent, the preview is gone', () => {
    const { w, c, band, sent } = rig();
    const m = squareMid(band);
    down(c, m.x, m.y);
    move(c, IN_P1_LAND.x, IN_P1_LAND.y);
    down(c, IN_P1_LAND.x, IN_P1_LAND.y, 2);
    expect(scorchedEarthAim()).toBeNull();
    expect(scorchedEarthHoverSeat(w)).toBeNull();
    expect(casts(sent)).toHaveLength(0);
  });

  it('⛔ Escape cancels AND consumes the key (a cancel is not the first press of the double-Escape leave)', () => {
    const { c, band, sent } = rig();
    const m = squareMid(band);
    down(c, m.x, m.y);
    const prevent = vi.fn();
    key(c, 'Escape', prevent);
    expect(scorchedEarthAim()).toBeNull();
    expect(prevent, 'consumed').toHaveBeenCalledTimes(1);
    down(c, IN_P1_LAND.x, IN_P1_LAND.y);
    expect(casts(sent)).toHaveLength(0);
    // ⛔ NEGATIVE — an Escape with nothing to cancel is NOT consumed here (the leave chord may count it).
    const prevent2 = vi.fn();
    key(c, 'Escape', prevent2);
    expect(prevent2).not.toHaveBeenCalled();
  });

  it('⛔ a second press on the square puts the aim away', () => {
    const { c, band, sent } = rig();
    const m = squareMid(band);
    down(c, m.x, m.y);
    down(c, m.x, m.y);
    expect(scorchedEarthAim()).toBeNull();
    expect(casts(sent)).toHaveLength(0);
  });

  it('⛔ a click on the QUARRY (nobody’s ground) is refused and keeps aiming — nothing is sent', () => {
    const { w, c, band, sent } = rig();
    const m = squareMid(band);
    down(c, m.x, m.y);
    vi.mocked(playUiRefusedSFX).mockClear();
    move(c, SPAWNER_CENTER_X - 10, SPAWNER_CENTER_Y);
    expect(scorchedEarthHoverSeat(w), 'the quarry never lights').toBeNull();
    down(c, SPAWNER_CENTER_X - 10, SPAWNER_CENTER_Y);
    expect(casts(sent)).toHaveLength(0);
    expect(scorchedEarthAim(), 'still aiming').not.toBeNull();
    expect(playUiRefusedSFX).toHaveBeenCalled();
  });

  it('⛔ in BUILD the square refuses — no aim, the caption says FIGHT ONLY', () => {
    const { w, c, band, sent } = rig();
    w.matchPhase = 'BUILD';
    band.sync(w);
    expect(band.getUiPoints().scorchedEarthCaption).toBe('FIGHT ONLY');
    const m = squareMid(band);
    down(c, m.x, m.y);
    expect(scorchedEarthAim()).toBeNull();
    down(c, IN_P1_LAND.x, IN_P1_LAND.y);
    expect(casts(sent)).toHaveLength(0);
  });

  it('⛔ an aim left over when the fight ends is dropped by the square, so the preview cannot lie', () => {
    const { w, c, band } = rig();
    const m = squareMid(band);
    down(c, m.x, m.y);
    move(c, IN_P1_LAND.x, IN_P1_LAND.y);
    w.matchPhase = 'BUILD';
    expect(scorchedEarthHoverSeat(w), 'the preview asks the refusal, so BUILD previews nothing').toBeNull();
    band.sync(w);
    expect(scorchedEarthAim(), 'and the square put the stale aim away').toBeNull();
  });

  it('⭐ a joiner’s square does not re-light inside the round trip (the cast is counted as sent)', () => {
    const { w, c, band } = rig();
    // A joiner: the intent goes out and nothing is applied locally until a snapshot comes back.
    (c as unknown as { dispatchFn: (a: GameAction) => void }).dispatchFn = () => {};
    const m = squareMid(band);
    down(c, m.x, m.y);
    move(c, IN_P1_LAND.x, IN_P1_LAND.y);
    down(c, IN_P1_LAND.x, IN_P1_LAND.y);
    expect(w.players.get(P0)!.scorchedEarth, 'fixture: not applied locally').toBeNull();
    band.sync(w);
    expect(band.getUiPoints().scorchedEarthSlot?.refusal).toBe('USED');
    down(c, m.x, m.y);
    expect(scorchedEarthAim(), 'a second press cannot re-aim').toBeNull();
  });
});
