/**
 * ⛔ S191 C-2 — WRATH-F5: **THE W-4 PENDING-CAST RECORD WENT INERT WHEN A SNAPSHOT MOVED `world.tick`
 * BACKWARDS.**
 *
 * A joiner advances `world.tick` itself every fixed step (`main.ts`, the client branch's
 * `world.tick++`) and every 10 Hz snapshot then sets it to the HOST's tick (`applySnapshotCore`:
 * `world.tick = snap.tick`). A local clock that ran a tick or two ahead therefore steps BACK on apply —
 * and the step lands exactly in the window S190 W-4 exists for: the cast is sent, the host has not yet
 * shown it, and a snapshot arrives. `livePending` read `age < 0` as dead, so the preview, the pips and
 * the refusal all fell back to the synced count: the W-4 bug again, for as long as the clock sat below
 * the send tick. And the record was not dropped, only ignored, so it came BACK once the clock passed
 * the send tick again — for a cast the host may have refused long before.
 *
 * Driven through the real `Controls` gesture, the real `FooterBand` pips, the real `drawBossAuras` aim
 * preview and the real `netSnapshot` → `applyNetSnapshot` round-trip that moves the clock.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../render/audioManager.ts', () => ({
  playUiClickSFX: vi.fn(async () => {}),
  playUiRefusedSFX: vi.fn(async () => {}),
}));

import { Container, type Graphics } from 'pixi.js';
import { PLAYER_COLORS, RA_COLUMN_COUNT, RA_COLUMN_RADIUS } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { applyNetSnapshot, netSnapshot } from '../state/save.ts';
import { dispatch, makeWorld, type GameAction, type World } from '../state/world.ts';
import { Controls } from './controls.ts';
import { FooterBand } from '../render/footerBand.ts';
import {
  RA_PENDING_TIMEOUT_TICKS,
  clearRaPendingCasts,
  raCastsInWaveLocal,
  setRaAimPreview,
} from '../render/raAimPreview.ts';
import { drawBossAuras } from '../render/bossAuras.ts';
import { raStrikeColumnPos } from '../state/racial/powerOfRa.ts';

const P0 = asPlayerId(0);

beforeAll(() => {
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('document', { activeElement: null });
});
afterEach(() => {
  setRaAimPreview(null);
  clearRaPendingCasts();
});

/** The S190 W-4 joiner: WRATH OF RA, FIGHT, and a `dispatchFn` that SENDS (records) and applies nothing. */
function joinerWrathRig(): { w: World; c: Controls; band: FooterBand; sent: GameAction[] } {
  const w = makeWorld(0xc2);
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
  const c = new Controls({ canvas } as never, w, P0, (a) => { sent.push(a); });
  const stage = new Container();
  const band = new FooterBand({ stage } as never, stage);
  c.setFooterBand(band);
  band.sync(w);
  return { w, c, band, sent };
}

type Ptr = { button: number; clientX: number; clientY: number; pointerId: number };
const down = (c: Controls, x: number, y: number): void =>
  (c as unknown as { onDown(e: Ptr): void }).onDown({ button: 0, clientX: x, clientY: y, pointerId: 1 });
const move = (c: Controls, x: number, y: number): void =>
  (c as unknown as { onMove(e: Ptr): void }).onMove({ button: 0, clientX: x, clientY: y, pointerId: 1 });
const casts = (sent: GameAction[]) => sent.filter((a) => a.type === 'CAST_POWER_OF_RA');
function buttonMid(band: FooterBand): { x: number; y: number } {
  const r = band.getUiPoints().ra!;
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
function castAt(c: Controls, band: FooterBand, x: number, y: number): void {
  const b = buttonMid(band);
  down(c, b.x, b.y);
  move(c, x, y);
  down(c, x, y);
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

/**
 * The host's snapshot from `ahead` ticks BEFORE the joiner's cast: taken now, the joiner's local clock
 * then runs `ahead` fixed steps (main.ts' client `world.tick++`), and the returned `land()` applies it
 * through the real `applyNetSnapshot` — which moves `world.tick` back by `ahead`.
 */
function hostSnapshotBehind(w: World, ahead: number): { land(): void; hostTick: number } {
  const snap = netSnapshot(w);
  const hostTick = w.tick;
  w.tick += ahead;
  return { land: () => applyNetSnapshot(snap, w), hostTick };
}

describe('S191 C-2 — WRATH-F5: a snapshot that moves world.tick BACK keeps the unsynced cast counted', () => {
  it('⛔ the cast is still counted after the clock steps back — pips, refusal and the next aim', () => {
    const { w, c, band, sent } = joinerWrathRig();
    const host = hostSnapshotBehind(w, 2);
    castAt(c, band, 700, 300);
    expect(casts(sent)).toHaveLength(1);
    expect(raCastsInWaveLocal(w, P0)).toBe(1);

    host.land();
    expect(w.tick, 'the real apply moved the clock BACK').toBe(host.hostTick);
    expect(w.players.get(P0)!.raStrikes, 'the host has not shown the cast yet').toEqual([]);
    expect(raCastsInWaveLocal(w, P0), 'pre-fix: 0 — the record went inert').toBe(1);
    band.sync(w);
    expect(band.getUiPoints().raSlot).toMatchObject({ refusal: null, charges: 3, left: 2 });

    // The second aim, made now, previews the circles the host will land for charge 1.
    const b = buttonMid(band);
    down(c, b.x, b.y);
    move(c, 1100, 520);
    const shown = aimCircles(w);
    down(c, 1100, 520);
    expect(casts(sent)).toHaveLength(2);
    for (const a of casts(sent)) dispatch(w, a); // what the next snapshot shows
    const strike = w.players.get(P0)!.raStrikes[1]!;
    const landed = Array.from({ length: RA_COLUMN_COUNT }, (_, k) => {
      const p = raStrikeColumnPos(P0, k, strike, 1);
      return `${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
    });
    expect(new Set(landed).size, 'anti-vacuity: five distinct spots').toBe(RA_COLUMN_COUNT);
    expect(shown).toEqual([...new Set(landed)].sort());
    expect(raCastsInWaveLocal(w, P0), 'synced now — never counted twice').toBe(2);
  });

  it('⭐ re-anchored, not immortal: after the step back the record still expires one window later', () => {
    const { w, c, band } = joinerWrathRig();
    const host = hostSnapshotBehind(w, 3);
    castAt(c, band, 700, 300);
    host.land();
    expect(raCastsInWaveLocal(w, P0)).toBe(1);
    w.tick = host.hostTick + RA_PENDING_TIMEOUT_TICKS;
    expect(raCastsInWaveLocal(w, P0), 'still trusted at the edge of the re-anchored window').toBe(1);
    w.tick += 1;
    expect(raCastsInWaveLocal(w, P0), 'expired: back to synced').toBe(0);
    band.sync(w);
    expect(band.getUiPoints().raSlot).toMatchObject({ refusal: null, left: 3 });
  });

  it('⛔ an EXPIRED record stays dead — a later step back cannot bring it back to life', () => {
    // Pre-fix an expired record was only ignored, never dropped: any clock that later sat within one
    // window of its send tick read it as live again — a refused cast re-spending the seat's charge.
    const { w, c, band } = joinerWrathRig();
    const host = hostSnapshotBehind(w, 2);
    castAt(c, band, 700, 300);
    const sentAt = w.tick;
    w.tick = sentAt + RA_PENDING_TIMEOUT_TICKS + 1;
    expect(raCastsInWaveLocal(w, P0), 'expired: the host never applied it').toBe(0);
    host.land(); // the clock falls back below the send tick
    expect(raCastsInWaveLocal(w, P0)).toBe(0);
    w.tick = sentAt + 5; // and climbs back past it, inside what WAS its window
    expect(raCastsInWaveLocal(w, P0), 'pre-fix: 1 — resurrected').toBe(0);
    band.sync(w);
    expect(band.getUiPoints().raSlot).toMatchObject({ left: 3 });
  });

  it('negative — a clock that only moves FORWARD behaves exactly as S190 shipped it', () => {
    const { w, c, band } = joinerWrathRig();
    castAt(c, band, 700, 300);
    const sentAt = w.tick;
    for (let t = 1; t <= RA_PENDING_TIMEOUT_TICKS; t++) {
      w.tick = sentAt + t;
      if (raCastsInWaveLocal(w, P0) !== 1) throw new Error(`dropped early at +${t}`);
    }
    w.tick = sentAt + RA_PENDING_TIMEOUT_TICKS + 1;
    expect(raCastsInWaveLocal(w, P0)).toBe(0);
  });
});
