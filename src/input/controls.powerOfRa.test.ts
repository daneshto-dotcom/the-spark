/**
 * SPARK — S188 P6 — **THE POWER OF RA GESTURE, driven through the REAL `Controls` handlers.**
 *
 * > *"you click on it and then you have to click on the area of the map where you want it to land"*
 *
 * The button → aim → board-click → intent chain, and every way out of it (RMB, Escape, a second
 * press). Driven through the real `FooterBand` after a real `sync`, so the button the click hits is
 * the button that was drawn — a source-text guard proves a line exists, this proves it is REACHED.
 *
 * ⚠ The harness stubs only what a headless run lacks: `window` (listeners), a canvas with a 1:1
 * bounding rect, and the UI sound cues.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../render/audioManager.ts', () => ({
  playUiClickSFX: vi.fn(async () => {}),
  playUiRefusedSFX: vi.fn(async () => {}),
}));

import { Container, type Graphics } from 'pixi.js';
import { PLAYER_COLORS, RA_COLUMN_COUNT, RA_COLUMN_RADIUS } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { dispatch, makeWorld, type GameAction, type World } from '../state/world.ts';
import { Controls } from './controls.ts';
import { FooterBand } from '../render/footerBand.ts';
import {
  RA_PENDING_TIMEOUT_TICKS,
  clearRaPendingCasts,
  raAimPreview,
  raCastsInWaveLocal,
  setRaAimPreview,
} from '../render/raAimPreview.ts';
import { playUiRefusedSFX } from '../render/audioManager.ts';
import { drawBossAuras } from '../render/bossAuras.ts';
import { raStrikeColumnPos } from '../state/racial/powerOfRa.ts';

const P0 = asPlayerId(0);

beforeAll(() => {
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('document', { activeElement: null });
});
afterEach(() => {
  setRaAimPreview(null);
  clearRaPendingCasts(); // S190 W-4 — module view state, like the aim
});

function rig(tookRa = true): { w: World; c: Controls; band: FooterBand; sent: GameAction[] } {
  const w = makeWorld(0xc0);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'solo', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0]!, raceId: 'mummies' }],
  });
  dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P0, pick: tookRa ? 'racial' : 'hp' });
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
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

type Ptr = { button: number; clientX: number; clientY: number; pointerId: number };
const down = (c: Controls, x: number, y: number, button = 0): void =>
  (c as unknown as { onDown(e: Ptr): void }).onDown({ button, clientX: x, clientY: y, pointerId: 1 });
const move = (c: Controls, x: number, y: number): void =>
  (c as unknown as { onMove(e: Ptr): void }).onMove({ button: 0, clientX: x, clientY: y, pointerId: 1 });
const key = (c: Controls, k: string): void =>
  (c as unknown as { onKeyDown(e: { key: string }): void }).onKeyDown({ key: k });
const buttonMid = (band: FooterBand): { x: number; y: number } => {
  const r = band.getUiPoints().ra!;
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};
const casts = (sent: GameAction[]) => sent.filter((a) => a.type === 'CAST_POWER_OF_RA');

describe('S188 P6 — button → aim → click → CAST_POWER_OF_RA', () => {
  it('⭐⭐ pressing the button aims; the aim follows the cursor; the board click casts THERE', () => {
    const { w, c, band, sent } = rig();
    const b = buttonMid(band);
    down(c, b.x, b.y);
    expect(raAimPreview(), 'the press starts aiming').not.toBeNull();
    expect(casts(sent), 'the press itself casts nothing').toHaveLength(0);

    move(c, 700.4, 300.6);
    expect(raAimPreview()).toMatchObject({ seat: P0, x: 700.4, y: 300.6 });

    down(c, 700.4, 300.6);
    expect(casts(sent)).toEqual([{ type: 'CAST_POWER_OF_RA', playerId: P0, x: 700, y: 301 }]);
    expect(raAimPreview(), 'one cast, then the aim is put away').toBeNull();
    expect(w.players.get(P0)!.raStrikes[0], 'and it reached the reducer').toMatchObject({ x: 700, y: 301 });
  });

  it('⛔ RMB cancels — nothing is sent', () => {
    const { c, band, sent } = rig();
    const b = buttonMid(band);
    down(c, b.x, b.y);
    down(c, 700, 300, 2);
    expect(raAimPreview()).toBeNull();
    expect(casts(sent)).toHaveLength(0);
  });

  it('⛔ Escape cancels — nothing is sent', () => {
    const { c, band, sent } = rig();
    const b = buttonMid(band);
    down(c, b.x, b.y);
    key(c, 'Escape');
    expect(raAimPreview()).toBeNull();
    down(c, 700, 300);
    expect(casts(sent)).toHaveLength(0);
  });

  it('⛔ a second press on the button puts the aim away', () => {
    const { c, band, sent } = rig();
    const b = buttonMid(band);
    down(c, b.x, b.y);
    expect(raAimPreview()).not.toBeNull();
    down(c, b.x, b.y);
    expect(raAimPreview()).toBeNull();
    expect(casts(sent)).toHaveLength(0);
  });

  it('⛔ a click on the footer surface while aiming is swallowed, and the aim survives it', () => {
    const { c, band, sent } = rig();
    const b = buttonMid(band);
    down(c, b.x, b.y);
    const chip = band.getUiPoints().chips[0]!;
    down(c, chip.x + chip.w / 2, chip.y + chip.h / 2); // a chip press is the chip's, not a cast
    expect(casts(sent)).toHaveLength(0);
    expect(raAimPreview()).not.toBeNull();
  });
});

describe("S188 audit F4 — while aiming, the character card's own buttons still work", () => {
  /** A card at (1500..1800, 300..600) with one FIX button at (1550..1650, 520..560). */
  function withCard(c: Controls): unknown[] {
    const calls: unknown[] = [];
    const inCard = (x: number, y: number) => x >= 1500 && x <= 1800 && y >= 300 && y <= 600;
    const inBtn = (x: number, y: number) => x >= 1550 && x <= 1650 && y >= 520 && y <= 560;
    c.setCharacterSheet({
      select() {}, selection: () => null, ownedRowAt: () => null, setHover() {},
      isOver: inCard,
      actionAt: (x: number, y: number) => (inBtn(x, y) ? { kind: 'FIX' } : null),
      isOverAnyAction: inBtn,
      actionPrimitiveId: () => 7 as never,
      actionFeedSpawnerId: () => null,
    });
    c.setSheetActionHandler((action, primitiveId) => calls.push([action.kind, primitiveId]));
    return calls;
  }

  it("⭐ a FIX press while aiming is the card's, not a cast — and the aim survives it", () => {
    const { c, band, sent } = rig();
    const calls = withCard(c);
    const b = buttonMid(band);
    down(c, b.x, b.y);
    down(c, 1600, 540);
    expect(calls, 'the card button acted').toEqual([['FIX', 7]]);
    expect(casts(sent)).toHaveLength(0);
    expect(raAimPreview(), 'still aiming').not.toBeNull();
  });

  it('⛔ the card BODY is still ground the player cannot see: swallowed, no cast, still aiming', () => {
    const { c, band, sent } = rig();
    const calls = withCard(c);
    const b = buttonMid(band);
    down(c, b.x, b.y);
    down(c, 1700, 400);
    expect(calls).toHaveLength(0);
    expect(casts(sent)).toHaveLength(0);
    expect(raAimPreview()).not.toBeNull();
  });
});

describe('S188 P6 — the button refuses, and says so, when the reducer would', () => {
  it('⛔ in BUILD the press does not aim and plays the refused cue', () => {
    const { w, c, band, sent } = rig();
    w.matchPhase = 'BUILD';
    band.sync(w);
    const before = vi.mocked(playUiRefusedSFX).mock.calls.length;
    const b = buttonMid(band);
    down(c, b.x, b.y);
    expect(raAimPreview()).toBeNull();
    expect(vi.mocked(playUiRefusedSFX).mock.calls.length).toBe(before + 1);
    expect(casts(sent)).toHaveLength(0);
  });

  it('⛔ after the cast the button is USED — a second press does not aim', () => {
    const { w, c, band } = rig();
    let b = buttonMid(band);
    down(c, b.x, b.y);
    down(c, 700, 300);
    band.sync(w);
    b = buttonMid(band);
    down(c, b.x, b.y);
    expect(raAimPreview()).toBeNull();
  });

  it('⛔ the fight ends mid-aim — the next board click sends nothing and drops the aim', () => {
    const { w, c, band, sent } = rig();
    const b = buttonMid(band);
    down(c, b.x, b.y);
    w.matchPhase = 'BUILD';
    down(c, 700, 300);
    expect(casts(sent)).toHaveLength(0);
    expect(raAimPreview()).toBeNull();
  });

  it('⛔ a seat without the perk has no button, and the ground there stays board', () => {
    const { band } = rig(false);
    expect(band.getUiPoints().ra).toBeNull();
  });
});

/*
 * ⭐⭐ S190 W-4 — **A JOINER'S QUICK SECOND WRATH CAST.** A joiner does not apply CAST_POWER_OF_RA
 * locally (it is not predicted): its synced `raStrikes` catch up only when a host snapshot arrives. The
 * charge index seeds the column pattern, so an aim made inside that window used to preview charge 0
 * while the host landed charge 1. The rig below is that joiner: its `dispatchFn` SENDS (records) and
 * applies nothing, and a "snapshot" is the host applying what was sent.
 */
describe('S190 W-4 — the JOINER preview, pips and refusal count the casts it has sent', () => {
  function joinerWrathRig(): { w: World; c: Controls; band: FooterBand; sent: GameAction[] } {
    const w = makeWorld(0xc1);
    w.gameState = 'TITLE';
    dispatch(w, {
      type: 'START_GAME', mode: 'solo', isHost: true,
      roster: [{ seat: 0, color: PLAYER_COLORS[0]!, raceId: 'mummies' }],
    });
    w.draft = null;
    w.players.get(P0)!.draftPicks.splice(0, Infinity, 'racial', 'hp', 'racial'); // WRATH OF RA
    w.waveNumber = 11;
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    const canvas = {
      addEventListener() {},
      setPointerCapture() {},
      releasePointerCapture() {},
      style: { cursor: '' },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080, right: 1920, bottom: 1080, x: 0, y: 0 }),
    };
    const sent: GameAction[] = [];
    const c = new Controls({ canvas } as never, w, P0, (a) => { sent.push(a); }); // SENT, not applied
    const stage = new Container();
    const band = new FooterBand({ stage } as never, stage);
    c.setFooterBand(band);
    band.sync(w);
    return { w, c, band, sent };
  }
  /** Aim with the slot, then click the board at (x, y). */
  function castAt(c: Controls, band: FooterBand, x: number, y: number): void {
    const b = buttonMid(band);
    down(c, b.x, b.y);
    move(c, x, y);
    down(c, x, y);
  }
  /** The host applies everything sent so far — what the next snapshot shows the joiner. */
  function hostApplies(w: World, sent: GameAction[]): void {
    for (const a of casts(sent)) dispatch(w, a);
  }
  function aimCircles(w: World): string[] {
    const ops: string[] = [];
    const g = {
      circle(x: number, y: number, r: number) { if (r === RA_COLUMN_RADIUS) ops.push(`${x.toFixed(3)} ${y.toFixed(3)}`); return g; },
      moveTo() { return g; }, lineTo() { return g; }, fill() { return g; }, stroke() { return g; },
    } as unknown as Graphics;
    drawBossAuras(g, w);
    return [...new Set(ops)].sort();
  }

  it('⭐⭐ the second aim, made before the first cast has synced, shows the circles the host will land', () => {
    const { w, c, band, sent } = joinerWrathRig();
    castAt(c, band, 700, 300);
    expect(casts(sent)).toHaveLength(1);
    expect(w.players.get(P0)!.raStrikes, 'the joiner has not seen its own cast yet').toEqual([]);
    band.sync(w);
    expect(band.getUiPoints().raSlot, 'one pip spent at once').toMatchObject({ refusal: null, charges: 3, left: 2 });

    const b = buttonMid(band);
    down(c, b.x, b.y);
    move(c, 1100, 520);
    expect(raCastsInWaveLocal(w, P0), 'the next charge is 1, not the synced 0').toBe(1);
    const shown = aimCircles(w);
    down(c, 1100, 520);
    expect(casts(sent)).toHaveLength(2);

    hostApplies(w, sent);
    const strike = w.players.get(P0)!.raStrikes[1]!;
    const landed = Array.from({ length: RA_COLUMN_COUNT }, (_, k) => {
      const p = raStrikeColumnPos(P0, k, strike, 1);
      return `${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
    });
    expect(shown).toEqual([...new Set(landed)].sort());
    expect(new Set(landed).size, 'anti-vacuity: five distinct spots').toBe(RA_COLUMN_COUNT);
    // And once synced, the count is the host's — the sent casts are not counted twice.
    expect(raCastsInWaveLocal(w, P0)).toBe(2);
    band.sync(w);
    expect(band.getUiPoints().raSlot).toMatchObject({ left: 1 });
  });

  it('⛔ three unsynced casts spend the slot: the fourth press is refused, not aimed', () => {
    const { w, c, band, sent } = joinerWrathRig();
    castAt(c, band, 600, 300);
    castAt(c, band, 700, 300);
    castAt(c, band, 800, 300);
    expect(casts(sent)).toHaveLength(3);
    band.sync(w);
    expect(band.getUiPoints().raSlot).toMatchObject({ refusal: 'USED', left: 0 });
    const before = vi.mocked(playUiRefusedSFX).mock.calls.length;
    const b = buttonMid(band);
    down(c, b.x, b.y);
    expect(raAimPreview(), 'no fourth aim').toBeNull();
    expect(vi.mocked(playUiRefusedSFX).mock.calls.length).toBe(before + 1);
    expect(casts(sent)).toHaveLength(3);
  });

  it('⛔ a cast the host never applies frees its charge after the timeout', () => {
    const { w, c, band } = joinerWrathRig();
    castAt(c, band, 700, 300);
    expect(raCastsInWaveLocal(w, P0)).toBe(1);
    w.tick += RA_PENDING_TIMEOUT_TICKS;
    expect(raCastsInWaveLocal(w, P0), 'still trusted at the edge').toBe(1);
    w.tick += 1;
    expect(raCastsInWaveLocal(w, P0), 'expired: back to synced').toBe(0);
    band.sync(w);
    expect(band.getUiPoints().raSlot).toMatchObject({ refusal: null, left: 3 });
  });
});
