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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { Texture, TextureSource, type Graphics } from 'pixi.js';
import { drawBossAuras } from './bossAuras.ts';
import {
  RA_BEAM_SKY_BANDS,
  RA_BEAM_SKY_PX,
  RA_BEAM_STRIP_INSET,
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
import { raColumnImpactTick, raColumnPos, runPharaohRitual } from '../state/bossSkillsPharaohRitual.ts';
import { T9_BOSS_TYPE } from '../state/t9BossIds.ts';
import type { Creature } from '../state/creatures/creature.ts';

const MANIFEST_PATH = 'public/art/ra-strike/ra-strike-anim.json';
const ATLAS_PATH = 'public/art/ra-strike/ra-strike-atlas.png';
const SPEC_PATH = 'assets-source/ra-strike/atlas-specs.json';
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
 * ⭐ S190 (s188/wrath merge) — `Player.raStrike` became `Player.raStrikes[]`; this is the first
 * (charge 0) strike, the one POWER OF RA alone can call.
 */
function castStrike(w: World): RaStrike {
  dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P0, x: 700, y: 400 });
  return w.players.get(P0)!.raStrikes[0]!;
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

/**
 * The one PNG shape the intake writes — 8-bit RGBA, non-interlaced — decoded with `node:zlib`, so the
 * unit suite (which has no pixel toolchain) can still read the SHIPPED atlas's alpha.
 */
function decodeRgbaPng(buf: Buffer): { w: number; h: number; px: Uint8Array } {
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  expect([buf[24], buf[25], buf[28]], 'bit depth 8, colour type 6 (RGBA), no interlace').toEqual([8, 6, 0]);
  const idat: Buffer[] = [];
  for (let off = 8; off < buf.length;) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
    if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const r = raw[src + x]!;
      const a = x >= 4 ? px[dst + x - 4]! : 0;
      const b = y > 0 ? px[dst - stride + x]! : 0;
      const c = x >= 4 && y > 0 ? px[dst - stride + x - 4]! : 0;
      let v: number;
      if (f === 0) v = r;
      else if (f === 1) v = r + a;
      else if (f === 2) v = r + b;
      else if (f === 3) v = r + ((a + b) >> 1);
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = r + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`PNG filter ${f}`);
      px[dst + x] = v & 0xff;
    }
  }
  return { w, h, px };
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

  it('⛔ RAVFX-1 — no frame that is not continued into the sky reaches its cell top with more than a trace of alpha', () => {
    // Sheet frames 21-23's fire-and-smoke column was cut by its source cell's top and shipped as a
    // sawn-off flat top. The intake now feathers that edge and GUARDS it; this reads the shipped pixels.
    const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf-8')) as { topEdgeGuardRows: number; topEdgeMaxAlpha: number; featherPx: number };
    const m = manifest as RaStrikeManifest & { cellTop: number[] };
    expect(m.cellTop).toHaveLength(m.sourceFrames.length);
    const { w, px } = decodeRgbaPng(readFileSync(ATLAS_PATH));
    const rows = Object.values(m.states).sort((a, b) => a.row - b.row);
    const cellOf = (slot: number): { x0: number; y0: number } => {
      let s = slot;
      for (const st of rows) {
        if (s < st.frames) return { x0: s * m.cellW, y0: st.row * m.cellH };
        s -= st.frames;
      }
      throw new Error(`slot ${slot}`);
    };
    const rowMaxAlpha = (slot: number, y: number): number => {
      const { x0, y0 } = cellOf(slot);
      let best = 0;
      for (let x = x0; x < x0 + m.cellW; x++) best = Math.max(best, px[((y0 + y) * w + x) * 4 + 3]!);
      return best;
    };
    for (let slot = 0; slot < m.sourceFrames.length; slot++) {
      const top = m.cellTop[slot]!;
      if (m.beamTop[slot] !== null) {
        expect(m.beamTop[slot], `slot ${slot}: a beam is cut AT its cell top`).toBe(top);
        continue;
      }
      for (let i = 0; i < spec.topEdgeGuardRows; i++) {
        expect(rowMaxAlpha(slot, top + i), `slot ${slot} (sheet ${m.sourceFrames[slot]}), cell-top row +${i}`)
          .toBeLessThanOrEqual(spec.topEdgeMaxAlpha);
      }
    }
    // Anti-vacuity: the fire column is still THERE (faded in, not erased), and a beam's top stays hard.
    const fire = m.sourceFrames.indexOf(21);
    expect(rowMaxAlpha(fire, m.cellTop[fire]! + spec.featherPx)).toBeGreaterThanOrEqual(200);
    const beam = m.sourceFrames.indexOf(5);
    expect(rowMaxAlpha(beam, m.beamTop[beam]!)).toBeGreaterThanOrEqual(200);
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
    // ⚠ RAVFX-8 — band 0 reaches DOWN under the cut by the strip inset, over the anti-aliased cut row
    // (drawn first, so the sprite composites over it); every other band abuts the one below, no gap.
    const band = RA_BEAM_SKY_PX / RA_BEAM_SKY_BANDS;
    expect(strips[0]!.alpha, 'full strength at the join').toBe(1);
    expect(strips[0]!.y, 'the continuation starts one band above the cut').toBeCloseTo(cutY - band, 9);
    expect(strips[0]!.y + strips[0]!.h, 'and overlaps the inset rows under it').toBeCloseTo(cutY + RA_BEAM_STRIP_INSET * art.scale, 9);
    for (let i = 1; i < strips.length; i++) expect(strips[i]!.y + strips[i]!.h).toBeCloseTo(strips[i - 1]!.y, 9);
    expect(r.quads.indexOf(strips[0]!), 'the sky is drawn BEFORE the sprite').toBeLessThan(r.quads.indexOf(frame));

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

/* ── 3b. THE PHARAOH'S FINALE (RAVFX-5) ──────────────────────────────────────────────────────── */

describe("S188 ra-vfx — RAVFX-5: the Pharaoh's FIFTH column plays out after the host removes him", () => {
  const UNTIL = 5_000;
  const finale = (k: number) => raColumnPos(PHARAOH_ID, k, PHARAOH_AT.x, PHARAOH_AT.y);

  /** He is seen channelling on his last tick, then the REAL sim lands column 4 and removes him. */
  function finaleBoard(): World {
    const pw = pharaohBoard(UNTIL);
    pw.tick = UNTIL - 1;
    drawBossAuras(recorder().g, pw);
    pw.tick = UNTIL;
    runPharaohRitual(pw);
    expect(pw.creatures.has(asCreatureId(PHARAOH_ID)), 'anti-vacuity: the sim removed him on the deadline').toBe(false);
    return pw;
  }

  it('⭐⭐ with the art: the flash ON the deadline, then the explosion and the cloud, then gone', () => {
    const art = shippedArt();
    setRaStrikeArtForTests(art);
    const pw = finaleBoard();
    for (const [dt, slot] of [[0, 9], [6, 10], [50, 16], [109, 22]] as const) {
      pw.tick = UNTIL + dt;
      const r = recorder(); drawBossAuras(r.g, pw);
      expect(drawnSlots(art, r.quads, finale), `deadline + ${dt}`).toEqual([[4, slot]]);
    }
    pw.tick = UNTIL + 110;
    const r = recorder(); drawBossAuras(r.g, pw);
    expect(r.ops, 'the smoke has cleared').toHaveLength(0);
  });

  it('⭐ without the art: the code column from the sky still lands on the finale spot', () => {
    setRaStrikeArtForTests(null);
    const pw = finaleBoard();
    pw.tick = UNTIL + 1;
    const r = recorder(); drawBossAuras(r.g, pw);
    const at4 = `circle ${key(finale(4).x, finale(4).y)}`;
    expect(r.ops.some((o) => o.startsWith('moveTo')), 'the shaft').toBe(true);
    expect(r.ops.some((o) => o.startsWith(at4)), 'on column 4').toBe(true);
  });

  it('⛔ a Pharaoh cleared away EARLY (a match reset) never had his finale land, and none is drawn', () => {
    setRaStrikeArtForTests(shippedArt());
    const pw = pharaohBoard(UNTIL);
    pw.tick = UNTIL - RA_RITUAL_TICKS + 10; // seen only at the start of his ritual
    drawBossAuras(recorder().g, pw);
    pw.creatures.clear();
    pw.tick = UNTIL;
    const r = recorder(); drawBossAuras(r.g, pw);
    expect(r.ops).toHaveLength(0);
  });

  it('⛔ the tail belongs to ITS world, and to a match still PLAYING', () => {
    setRaStrikeArtForTests(shippedArt());
    const pw = finaleBoard();
    const other = pharaohBoard(UNTIL); // another world at the same tick, with no finale of its own
    other.creatures.clear();
    other.tick = UNTIL;
    const a = recorder(); drawBossAuras(a.g, other);
    expect(a.ops, 'another world').toHaveLength(0);

    pw.gameState = 'WIN'; // the sim lands nothing outside PLAYING
    pw.tick = UNTIL + 6;
    const b = recorder(); drawBossAuras(b.g, pw);
    expect(b.ops, 'not PLAYING').toHaveLength(0);
  });

  it('⛔ S190 RAVFX-A — a deadline that falls in BUILD lands nothing: he is still standing, so no finale is drawn', () => {
    setRaStrikeArtForTests(shippedArt());
    const pw = pharaohBoard(UNTIL); // matchPhase BUILD: hostTick never runs the ritual here
    pw.tick = UNTIL - 1;
    drawBossAuras(recorder().g, pw); // seen channelling on his last tick
    pw.tick = UNTIL; // the deadline passes with no landing — the sim did NOT remove him
    expect(pw.creatures.has(asCreatureId(PHARAOH_ID)), 'anti-vacuity: he is still on the board').toBe(true);
    for (const dt of [0, 6, 50]) {
      pw.tick = UNTIL + dt;
      const r = recorder(); drawBossAuras(r.g, pw);
      expect(r.ops, `deadline + ${dt}`).toHaveLength(0);
    }
  });

  it('⛔ S190 RAVFX-B — a GODLY_ABORT inside the sighting slack clears him WITHOUT leaving PLAYING: no finale', () => {
    setRaStrikeArtForTests(shippedArt());
    const pw = pharaohBoard(UNTIL);
    pw.tick = UNTIL - 10;
    drawBossAuras(recorder().g, pw); // seen channelling 10 ticks before the deadline (inside the slack)
    pw.creatures.clear(); // what applyGodlyAbort does …
    pw.structureWatchEpoch += 1; // … together with its mass-clear epoch bump (godlyActions.ts)
    pw.tick = UNTIL;
    expect(pw.gameState, 'anti-vacuity: an abort does not leave PLAYING').toBe('PLAYING');
    const r = recorder(); drawBossAuras(r.g, pw);
    expect(r.ops).toHaveLength(0);
  });
});

/* ── 4. THE PREFETCH (RAVFX-7) ─────────────────────────────────────────────────────────────────── */

describe('S188 ra-vfx — RAVFX-7: the 1.68 MB strike atlas is fetched BEFORE the first strike', () => {
  const ANIM_URL = '/art/ra-strike/ra-strike-anim.json';
  afterEach(() => { vi.unstubAllGlobals(); });

  /**
   * FRESH copies of the render modules — the loader latches once per module instance, so every case
   * gets its own — imported BEFORE a DOM exists, then a `document` and a `fetch` that never answers
   * (so nothing reaches `Assets.load`).
   */
  async function freshAurasWithFetch() {
    vi.resetModules();
    const auras = await import('./bossAuras.ts');
    const aim = await import('./raAimPreview.ts');
    const fetchSpy = vi.fn((_url: string) => new Promise<never>(() => {}));
    vi.stubGlobal('document', {});
    vi.stubGlobal('fetch', fetchSpy);
    return { drawBossAuras: auras.drawBossAuras, setRaAimPreview: aim.setRaAimPreview, fetchSpy };
  }

  /** Two orc seats: nobody can call POWER OF RA and no Pharaoh can be on the board. */
  function orcBoard(): World {
    const w = makeWorld(0x2b);
    w.gameState = 'TITLE';
    dispatch(w, {
      type: 'START_GAME', mode: '1v1', isHost: true,
      roster: [
        { seat: 0, color: PLAYER_COLORS[0]!, raceId: 'orcs' },
        { seat: 1, color: PLAYER_COLORS[1]!, raceId: 'orcs' },
      ],
    });
    w.creatures.clear();
    return w;
  }

  it('⭐ a mummies seat in the match starts the fetch — no strike called, no Pharaoh, no aim — and only once', async () => {
    const { drawBossAuras: draw, fetchSpy } = await freshAurasWithFetch();
    const w = strikeBoard();
    w.matchPhase = 'BUILD';
    expect(w.players.get(P0)!.raStrikes, 'anti-vacuity: nothing to draw a column from').toEqual([]);
    draw(recorder().g, w);
    draw(recorder().g, w);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toBe(ANIM_URL);
  });

  it('⭐ entering the aim branch starts the fetch', async () => {
    const { drawBossAuras: draw, setRaAimPreview: aimAt, fetchSpy } = await freshAurasWithFetch();
    const w = orcBoard(); // no mummies seat, so only the aim can be what asked
    aimAt({ seat: P0, x: 600, y: 300 });
    draw(recorder().g, w);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toBe(ANIM_URL);
  });

  it('⛔ a board with no mummies seat, no Pharaoh, no strike and no aim fetches nothing', async () => {
    const { drawBossAuras: draw, fetchSpy } = await freshAurasWithFetch();
    const w = orcBoard();
    const r = recorder();
    draw(r.g, w);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r.ops).toHaveLength(0);
  });
});
