/**
 * SPARK — S188 `s188/ra-vfx` — THE RA STRIKE ART: the timeline, the shipped manifest, and the drawer.
 *
 * Three promises, each of which fails silently on screen and nowhere else:
 *   1. THE CLOCK — every frame is a pure function of `(tick, impactTick)`, the ring opens on the tick
 *      the column is announced and the FLASH lands on the tick the sim deals the damage;
 *   2. THE MANIFEST — the sheet that ships is the sheet this code plays (a re-authored atlas without
 *      the code following would play frames at the wrong ticks);
 *   3. THE ONE DRAWER — the Pharaoh's ritual and a player's POWER OF RA, given the same deadline, show
 *      the same frame of the same art on the same tick; and with no art loaded the pre-S188 code beam
 *      draws and nothing throws.
 *
 * ⚠ The art is injected through `setRaStrikeArtForTests` and CLEARED after every test, so no other
 * file in the suite ever sees it (the unit suite has no DOM and otherwise always draws the fallback).
 */

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Texture, TextureSource, type Graphics } from 'pixi.js';
import { drawBossAuras } from './bossAuras.ts';
import {
  RA_BEAM_SKY_BANDS,
  RA_STRIKE_FRAME_TICKS,
  RA_STRIKE_IMPACT_FRAME,
  RA_STRIKE_LEAD_TICKS,
  raStrikeArtFrom,
  raStrikeDrawScale,
  raStrikeFrameAt,
  setRaStrikeArtForTests,
  type RaStrikeArt,
  type RaStrikeManifest,
} from './raStrikeArt.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { PLAYER_COLORS, RA_COLUMN_COUNT, RA_COLUMN_RADIUS, RA_COLUMN_TICKS, RA_RITUAL_TICKS } from '../constants.ts';
import { asCreatureId, asPlayerId } from '../types.ts';
import { raStrikeColumnPos } from '../state/racial/powerOfRa.ts';
import type { RaStrike } from '../state/racial/powerOfRaRules.ts';
import { raColumnImpactTick, raColumnPos } from '../state/bossSkillsPharaohRitual.ts';
import { T9_BOSS_TYPE } from '../state/t9BossIds.ts';
import type { Creature } from '../state/creatures/creature.ts';

const MANIFEST_PATH = 'public/art/ra-strike/ra-strike-anim.json';
const ATLAS_PATH = 'public/art/ra-strike/ra-strike-atlas.png';
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as RaStrikeManifest;

const P0 = asPlayerId(0);
const PHARAOH_ID = 41;
const PHARAOH_AT = { x: 800, y: 500 };

afterEach(() => setRaStrikeArtForTests(null));

/* ── fixtures ──────────────────────────────────────────────────────────────────────────────────── */

/** The shipped manifest sliced over a sheet-sized source — the REAL slicing, anchor and scale. */
function shippedArt(): RaStrikeArt {
  const sheet = new Texture({
    source: new TextureSource({ width: manifest.cellW * 12, height: manifest.cellH * 2, label: 'ra-strike' }),
  });
  const art = raStrikeArtFrom(sheet, manifest);
  if (art === null) throw new Error('the shipped manifest was refused by raStrikeArtFrom');
  return art;
}

interface Quad { tex: Texture; x: number; y: number; w: number; h: number; alpha: number }

/** Records the primitive ops the Ra path uses, plus every textured quad with the alpha it was drawn at. */
function recorder(): { g: Graphics; ops: string[]; quads: Quad[] } {
  const ops: string[] = [];
  const quads: Quad[] = [];
  let alpha = 1;
  const g = {
    circle(x: number, y: number, r: number) { ops.push(`circle ${x.toFixed(3)} ${y.toFixed(3)} ${r.toFixed(3)}`); return g; },
    moveTo(x: number, y: number) { ops.push(`moveTo ${x.toFixed(3)} ${y.toFixed(3)}`); return g; },
    lineTo(x: number, y: number) { ops.push(`lineTo ${x.toFixed(3)} ${y.toFixed(3)}`); return g; },
    fill(o: { alpha: number }) { ops.push(`fill ${o.alpha.toFixed(3)}`); return g; },
    stroke(o: { alpha: number; width: number }) { ops.push(`stroke ${o.width} ${o.alpha.toFixed(3)}`); return g; },
    setFillStyle(o: { alpha: number }) { alpha = o.alpha; return g; },
    texture(tex: Texture, _tint: number, x: number, y: number, w: number, h: number) {
      ops.push('texture');
      quads.push({ tex, x, y, w, h, alpha });
      return g;
    },
  } as unknown as Graphics;
  return { g, ops, quads };
}

/** Seat 0 = mummies holding POWER OF RA; FIGHT; an empty board. */
function strikeBoard(): World {
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

/**
 * Seat 0 calls POWER OF RA at (700, 400); returns the synced strike record the renderer reads.
 * ⚠ MERGE NOTE: the ONE line that reads the player's strike field. `s188/wrath` turns
 * `Player.raStrike` into `Player.raStrikes[]` — after that merge this becomes `.raStrikes[0]!`.
 */
function castStrike(w: World): RaStrike {
  dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P0, x: 700, y: 400 });
  return w.players.get(P0)!.raStrike!;
}

/** A Pharaoh channelling the ritual whose deadline is `until`, alone on a board. */
function pharaohBoard(until: number): World {
  const w = makeWorld(3);
  w.gameState = 'PLAYING';
  w.creatures.clear();
  const boss = {
    id: asCreatureId(PHARAOH_ID), type: T9_BOSS_TYPE.mummies, ownerPlayerId: P0,
    pos: { ...PHARAOH_AT }, prevPos: { ...PHARAOH_AT }, state: 'SEEKING', ticksInState: 0,
    stateEnteredTick: 0, spawnTick: 0, despawnAtTick: 1_000_000, ehp: 1, sourceSpawnerId: null,
    targetBondId: null, targetCreatureId: null, targetPrimitiveId: null,
    raRitualUntilTick: until,
  } as unknown as Creature;
  w.creatures.set(boss.id, boss);
  return w;
}

const key = (x: number, y: number): string => `${x.toFixed(3)} ${y.toFixed(3)}`;

/**
 * The (column, slot) pairs a draw put on screen, found by inverting each sprite quad back to the
 * impact point it was anchored on and matching that to the sim's own landing spot for column k.
 */
function drawnSlots(art: RaStrikeArt, quads: Quad[], columnPos: (k: number) => { x: number; y: number }): Array<[number, number]> {
  const byPos = new Map<string, number>();
  for (let k = 0; k < RA_COLUMN_COUNT; k++) byPos.set(key(columnPos(k).x, columnPos(k).y), k);
  const out: Array<[number, number]> = [];
  for (const q of quads) {
    const slot = art.frames.indexOf(q.tex);
    if (slot < 0) continue; // a beam-continuation strip, not a frame
    const k = byPos.get(key(q.x + art.anchorX * art.scale, q.y + art.anchorY * art.scale));
    expect(k, 'every sprite stands on a spot the sim lands a column on').toBeDefined();
    out.push([k!, slot]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** What the sim's clock says each column shows at `tick`. */
function expectedSlots(tick: number, until: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 0; k < RA_COLUMN_COUNT; k++) {
    const s = raStrikeFrameAt(tick, raColumnImpactTick(until, k));
    if (s !== null) out.push([k, s]);
  }
  return out;
}

/* ── 1. THE CLOCK ──────────────────────────────────────────────────────────────────────────────── */

describe('S188 ra-vfx — the strike timeline is hung on the column\'s impact tick', () => {
  const impact = 10_000;

  it('⭐⭐ the frames before the flash sum to EXACTLY the two-second telegraph window', () => {
    const pre = RA_STRIKE_FRAME_TICKS.slice(0, RA_STRIKE_IMPACT_FRAME).reduce((a, b) => a + b, 0);
    expect(pre).toBe(RA_COLUMN_TICKS);
    expect(RA_STRIKE_LEAD_TICKS).toBe(RA_COLUMN_TICKS);
  });

  it('⭐ the flash is ON the impact tick, the ring opens on the announcement tick, the smoke clears at +110', () => {
    expect(raStrikeFrameAt(impact, impact), 'the flash on the damage tick').toBe(9);
    expect(raStrikeFrameAt(impact - 1, impact), 'the last burning frame just before it').toBe(8);
    expect(raStrikeFrameAt(impact - RA_COLUMN_TICKS, impact), 'the ring on the tick the column is announced').toBe(0);
    expect(raStrikeFrameAt(impact - RA_COLUMN_TICKS - 1, impact), 'not before it').toBeNull();
    expect(raStrikeFrameAt(impact + 109, impact), 'the last ember').toBe(22);
    expect(raStrikeFrameAt(impact + 110, impact), 'gone').toBeNull();
  });
});

/* ── 2. THE MANIFEST ───────────────────────────────────────────────────────────────────────────── */

describe('S188 ra-vfx — the shipped manifest is the timeline this code plays', () => {
  it('⭐ frameTicks and impactFrame are the code\'s own', () => {
    expect(manifest.frameTicks).toEqual([...RA_STRIKE_FRAME_TICKS]);
    expect(manifest.impactFrame).toBe(RA_STRIKE_IMPACT_FRAME);
    expect(manifest.impactFrame).toBe(9);
  });

  it('⭐ 23 frames ship, sheet frame 20 is dropped, and slot 9 IS sheet frame 10 (the flash)', () => {
    expect(manifest.sourceFrames).toHaveLength(23);
    expect(manifest.sourceFrames).not.toContain(20);
    expect(manifest.droppedFrames).toEqual([20]);
    expect(manifest.sourceFrames[9]).toBe(10);
    expect(manifest.states).toEqual({ strike: { row: 0, frames: 12 }, aftermath: { row: 1, frames: 11 } });
  });

  it('⭐ the PNG on disk is exactly the grid the manifest describes (IHDR = cellW×12 by cellH×2)', () => {
    const png = readFileSync(ATLAS_PATH);
    expect(png.toString('latin1', 12, 16)).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(manifest.cellW * 12);
    expect(png.readUInt32BE(20)).toBe(manifest.cellH * 2);
  });

  it('⭐ a beam is continued into the sky for exactly sheet frames 5-14 — the frames the sheet cuts', () => {
    expect(manifest.beamTop).toHaveLength(manifest.sourceFrames.length);
    const cut = manifest.sourceFrames.filter((_, i) => manifest.beamTop[i] !== null);
    expect(cut).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it('⭐ sized to the real damage radius: the widest blast footprint spans the kill diameter', () => {
    expect(raStrikeDrawScale(manifest.blastWidthPx) * manifest.blastWidthPx).toBeCloseTo(2 * RA_COLUMN_RADIUS, 9);
  });

  it('⭐ the shipped manifest slices into 23 frames with a strip exactly where there is a beam', () => {
    const art = shippedArt();
    expect(art.frames).toHaveLength(RA_STRIKE_FRAME_TICKS.length);
    expect(art.beamStrips.map((s) => s !== null)).toEqual(manifest.beamTop.map((b) => b !== null));
    // Row 0 carries the strike, row 1 the aftermath — slot 12 is the first cell of row 1.
    expect(art.frames[11]!.frame.y).toBe(0);
    expect(art.frames[12]!.frame.y).toBe(manifest.cellH);
    expect(art.frames[12]!.frame.x).toBe(0);
  });

  it('⛔ a manifest re-timed without the code following is REFUSED (the fallback draws, never wrong ticks)', () => {
    const sheet = new Texture({ source: new TextureSource({ width: manifest.cellW * 12, height: manifest.cellH * 2 }) });
    const retimed = { ...manifest, frameTicks: manifest.frameTicks.map((t, i) => (i === 0 ? t + 1 : t)) };
    expect(raStrikeArtFrom(sheet, retimed)).toBeNull();
    expect(raStrikeArtFrom(sheet, { ...manifest, impactFrame: 8 })).toBeNull();
  });
});

/* ── 3. THE ONE DRAWER ─────────────────────────────────────────────────────────────────────────── */

describe('S188 ra-vfx — the Pharaoh and POWER OF RA play the same art on the sim\'s clock', () => {
  it('⭐⭐ the same `until` picks the same slot for every column, for both callers, at every probe tick', () => {
    const art = shippedArt();
    setRaStrikeArtForTests(art);

    const sw = strikeBoard();
    const strike = castStrike(sw);
    const until = strike.untilTick;
    const pw = pharaohBoard(until);

    const impact0 = raColumnImpactTick(until, 0);
    const probes = [until - RA_RITUAL_TICKS, impact0 - 1, impact0, impact0 + 50];
    const column0: number[] = [];
    for (const tick of probes) {
      sw.tick = tick;
      pw.tick = tick;
      const a = recorder(); drawBossAuras(a.g, sw);
      const b = recorder(); drawBossAuras(b.g, pw);
      const player = drawnSlots(art, a.quads, (k) => raStrikeColumnPos(P0, k, strike));
      const pharaoh = drawnSlots(art, b.quads, (k) => raColumnPos(PHARAOH_ID, k, PHARAOH_AT.x, PHARAOH_AT.y));
      const want = expectedSlots(tick, until);
      expect(player, `a called strike at tick ${tick}`).toEqual(want);
      expect(pharaoh, `the Pharaoh at tick ${tick}`).toEqual(want);
      column0.push(player.find(([k]) => k === 0)![1]);
    }
    // Anti-vacuity, read off the table: the ring, the last burn, THE FLASH, the mushroom cloud.
    expect(column0).toEqual([0, 8, 9, 16]);
  });

  it('⭐ the beam is continued into the sky — RA_BEAM_SKY_BANDS strips, fading, above the cut — only while a beam is on the sheet', () => {
    const art = shippedArt();
    setRaStrikeArtForTests(art);
    const sw = strikeBoard();
    const strike = castStrike(sw);
    const impact0 = raColumnImpactTick(strike.untilTick, 0);

    sw.tick = impact0; // column 0 flashes (slot 9, a beam); column 1 is a rune ring (slot 0, none)
    let r = recorder(); drawBossAuras(r.g, sw);
    const strips = r.quads.filter((q) => art.beamStrips.includes(q.tex));
    expect(strips).toHaveLength(RA_BEAM_SKY_BANDS);
    expect(strips.every((q) => q.tex === art.beamStrips[9])).toBe(true);
    for (let i = 1; i < strips.length; i++) expect(strips[i]!.alpha).toBeLessThan(strips[i - 1]!.alpha);
    const frame = r.quads.find((q) => q.tex === art.frames[9])!;
    const cutY = frame.y + art.beamTop[9]! * art.scale;
    expect(strips[0]!.y + strips[0]!.h, 'the continuation starts AT the cut').toBeCloseTo(cutY, 9);

    sw.tick = impact0 + 50; // slot 16 (the mushroom cloud) and slot 2 (a ring): no beam anywhere
    r = recorder(); drawBossAuras(r.g, sw);
    expect(r.quads.filter((q) => art.beamStrips.includes(q.tex))).toHaveLength(0);
  });

  it('⭐ the aftermath is the art\'s alone: at impact+50 the sprite draws where the code fallback draws nothing', () => {
    const sw = strikeBoard();
    const strike = castStrike(sw);
    const spot0 = raStrikeColumnPos(P0, 0, strike);
    sw.tick = raColumnImpactTick(strike.untilTick, 0) + 50;

    const fallback = recorder(); drawBossAuras(fallback.g, sw);
    expect(fallback.ops.some((o) => o.startsWith(`circle ${key(spot0.x, spot0.y)}`)), 'the fallback has faded').toBe(false);
    expect(fallback.ops.length, 'anti-vacuity: column 1 is still telegraphing').toBeGreaterThan(0);

    const art = shippedArt();
    setRaStrikeArtForTests(art);
    const withArt = recorder(); drawBossAuras(withArt.g, sw);
    const slots = drawnSlots(art, withArt.quads, (k) => raStrikeColumnPos(P0, k, strike));
    expect(slots.find(([k]) => k === 0), 'column 0 still shows its mushroom cloud').toEqual([0, 16]);
  });

  it('⭐ sprites are painted back to front (by y), so a later ring never covers a nearer cloud', () => {
    const art = shippedArt();
    setRaStrikeArtForTests(art);
    const sw = strikeBoard();
    const strike = castStrike(sw);
    // A column lives 230 ticks and they fall 120 apart, so two are on screen at once. Pick a pair
    // where the LATER column stands NEARER the top of the screen — the case a k-order draw gets wrong.
    const pos = (k: number) => raStrikeColumnPos(P0, k, strike);
    const k = [0, 1, 2, 3].find((i) => pos(i + 1).y < pos(i).y);
    expect(k, 'anti-vacuity: some later column stands behind an earlier one').toBeDefined();
    sw.tick = raColumnImpactTick(strike.untilTick, k!) + 5; // column k mid-flash, column k+1 a fresh ring
    const r = recorder(); drawBossAuras(r.g, sw);
    const order = drawnSlots(art, r.quads, pos); // sorted by k: [[k, slot], [k+1, slot]]
    expect(order.map(([c]) => c)).toEqual([k!, k! + 1]);
    const frames = r.quads.filter((q) => art.frames.includes(q.tex));
    expect(frames).toHaveLength(2);
    expect(frames[0]!.tex, 'the farther (later) ring is painted first').toBe(art.frames[order[1]![1]]);
    expect(frames[1]!.tex, 'the nearer flash is painted over it').toBe(art.frames[order[0]![1]]);
  });
});

describe('S188 ra-vfx — ⛔ no atlas (still loading, failed, or no DOM): the code beam, and nothing throws', () => {
  it('⭐ a channelling Pharaoh draws his telegraph with no texture op when the art is missing', () => {
    setRaStrikeArtForTests(null);
    const until = 5_000;
    const pw = pharaohBoard(until);
    pw.tick = raColumnImpactTick(until, 0) - RA_COLUMN_TICKS / 2; // column 0 half grown
    const r = recorder();
    expect(() => drawBossAuras(r.g, pw)).not.toThrow();
    const spot = raColumnPos(PHARAOH_ID, 0, PHARAOH_AT.x, PHARAOH_AT.y);
    expect(r.ops.some((o) => o.startsWith(`circle ${key(spot.x, spot.y)}`)), 'the telegraph still draws').toBe(true);
    expect(r.ops).not.toContain('texture');

    pw.tick = raColumnImpactTick(until, 0) + 1; // just after impact: the pre-S188 shaft from the sky
    const r2 = recorder(); drawBossAuras(r2.g, pw);
    expect(r2.ops.some((o) => o.startsWith('moveTo')), 'the code column').toBe(true);
    expect(r2.ops).not.toContain('texture');
  });

  it('⛔ the fallback never reaches for the texture API — a Graphics without it does not throw', () => {
    const until = 5_000;
    const pw = pharaohBoard(until);
    const bare = {
      circle() { return bare; }, moveTo() { return bare; }, lineTo() { return bare; },
      fill() { return bare; }, stroke() { return bare; },
    } as unknown as Graphics;
    for (const tick of [until - RA_RITUAL_TICKS, raColumnImpactTick(until, 0), raColumnImpactTick(until, 3) + 5]) {
      pw.tick = tick;
      expect(() => drawBossAuras(bare, pw), `tick ${tick}`).not.toThrow();
    }
  });
});
