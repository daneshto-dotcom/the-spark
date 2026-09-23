/**
 * SPARK — S188 P6 — POWER OF RA, the drawn half: the strike's telegraph + columns, and the aim.
 *
 * Two promises are pinned here, and both are the kind that fail silently on one screen:
 *   1. the five circles under the cursor BEFORE the click are exactly where the host will land the
 *      five columns AFTER it — same normalisation (`raAimPoint`), same landing fn;
 *   2. a called strike draws from synced state alone, for every seat, and only while the sim can
 *      actually land it (FIGHT).
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { Graphics } from 'pixi.js';
import { drawBossAuras } from './bossAuras.ts';
import { setRaAimPreview } from './raAimPreview.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { PLAYER_COLORS, RA_COLUMN_COUNT, RA_COLUMN_RADIUS, RA_COLUMN_TICKS } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { raStrikeColumnPos } from '../state/racial/powerOfRa.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function recorder(): { g: Graphics; ops: string[] } {
  const ops: string[] = [];
  const g = {
    circle(x: number, y: number, r: number) { ops.push(`circle ${x.toFixed(3)} ${y.toFixed(3)} ${r.toFixed(3)}`); return g; },
    moveTo(x: number, y: number) { ops.push(`moveTo ${x.toFixed(3)} ${y.toFixed(3)}`); return g; },
    lineTo(x: number, y: number) { ops.push(`lineTo ${x.toFixed(3)} ${y.toFixed(3)}`); return g; },
    fill(o: { alpha: number }) { ops.push(`fill ${o.alpha.toFixed(3)}`); return g; },
    stroke(o: { alpha: number; width: number }) { ops.push(`stroke ${o.width} ${o.alpha.toFixed(3)}`); return g; },
  } as unknown as Graphics;
  return { g, ops };
}

/** Seat 0 = mummies with POWER OF RA, seat 1 = mummies with it too; FIGHT. */
function board(): World {
  const w = makeWorld(0x2a);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0]!, raceId: 'mummies' },
      { seat: 1, color: PLAYER_COLORS[1]!, raceId: 'orcs' },
    ],
  });
  dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P0, pick: 'racial' });
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  return w;
}

const centres = (ops: string[], r: number): string[] =>
  ops.filter((o) => o.startsWith('circle') && o.endsWith(` ${r.toFixed(3)}`)).map((o) => o.split(' ').slice(1, 3).join(' '));
const at = (p: { x: number; y: number }): string => `${p.x.toFixed(3)} ${p.y.toFixed(3)}`;

afterEach(() => setRaAimPreview(null));

describe('S188 P6 — the AIM telegraph is the strike it promises', () => {
  it('⭐⭐ the five circles under the cursor are exactly where the host will land the five columns', () => {
    const w = board();
    const raw = { x: 612.4, y: 330.6 }; // a float cursor — the reducer rounds it, so must the preview
    setRaAimPreview({ seat: P0, ...raw });
    const { g, ops } = recorder();
    drawBossAuras(g, w);
    const shown = centres(ops, RA_COLUMN_RADIUS);

    dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P0, ...raw });
    const strike = w.players.get(P0)!.raStrike!;
    const landed = Array.from({ length: RA_COLUMN_COUNT }, (_, k) => at(raStrikeColumnPos(P0, k, strike)));
    // Each column is drawn twice (fill + outline) at the full kill radius.
    expect([...new Set(shown)].sort()).toEqual([...new Set(landed)].sort());
    expect(new Set(landed).size, 'anti-vacuity: five distinct spots').toBe(RA_COLUMN_COUNT);
  });

  it('⛔ no aim is drawn when the cast would be refused — BUILD, already used, or off the board', () => {
    const w = board();
    setRaAimPreview({ seat: P0, x: 600, y: 300 });
    w.matchPhase = 'BUILD';
    let r = recorder(); drawBossAuras(r.g, w);
    expect(r.ops, 'BUILD').toHaveLength(0);

    w.matchPhase = 'FIGHT';
    setRaAimPreview({ seat: P0, x: -5, y: 300 });
    r = recorder(); drawBossAuras(r.g, w);
    expect(r.ops, 'off the board').toHaveLength(0);

    setRaAimPreview({ seat: P1, x: 600, y: 300 });
    r = recorder(); drawBossAuras(r.g, w);
    expect(r.ops, 'a seat without the perk').toHaveLength(0);

    setRaAimPreview({ seat: P0, x: 600, y: 300 });
    dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P0, x: 600, y: 300 });
    w.tick += RA_COLUMN_TICKS * 10; // long after the strike, same fight
    r = recorder(); drawBossAuras(r.g, w);
    expect(r.ops, 'already used this fight').toHaveLength(0);
  });
});

describe('S188 P6 — a called strike draws the Pharaoh\'s telegraph + column, from synced state', () => {
  it('⭐ the growing shade, then the column from the sky, on the SIM\'s landing spot', () => {
    const w = board();
    dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P0, x: 700, y: 400 });
    const strike = w.players.get(P0)!.raStrike!;
    const spot0 = at(raStrikeColumnPos(P0, 0, strike));

    w.tick += RA_COLUMN_TICKS / 2; // column 0's telegraph is half grown
    let r = recorder(); drawBossAuras(r.g, w);
    expect(r.ops.some((o) => o.startsWith(`circle ${spot0}`)), 'the telegraph is on the landing spot').toBe(true);
    expect(r.ops.some((o) => o.startsWith('moveTo')), 'no beam before impact').toBe(false);

    w.tick += RA_COLUMN_TICKS / 2 + 1; // just after impact
    r = recorder(); drawBossAuras(r.g, w);
    expect(r.ops.some((o) => o.startsWith('moveTo')), 'the column from the sky').toBe(true);
  });

  it('⛔ nothing is drawn in BUILD — the sim does not land columns there', () => {
    const w = board();
    dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P0, x: 700, y: 400 });
    w.tick += RA_COLUMN_TICKS / 2;
    w.matchPhase = 'BUILD';
    const r = recorder(); drawBossAuras(r.g, w);
    expect(r.ops).toHaveLength(0);
  });

  it('⭐ CROSS-PLAYER — the victim sees it too: not gated on the local seat', () => {
    const mine = board();
    dispatch(mine, { type: 'CAST_POWER_OF_RA', playerId: P0, x: 700, y: 400 });
    mine.tick += 30;
    const a = recorder(); drawBossAuras(a.g, mine);

    const theirs = board();
    theirs.localPlayerId = P1;
    dispatch(theirs, { type: 'CAST_POWER_OF_RA', playerId: P0, x: 700, y: 400 });
    theirs.tick += 30;
    const b = recorder(); drawBossAuras(b.g, theirs);
    expect(a.ops.length).toBeGreaterThan(0);
    expect(b.ops).toEqual(a.ops);
  });
});
