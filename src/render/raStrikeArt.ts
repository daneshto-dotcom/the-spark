/**
 * SPARK — S188 `s188/ra-vfx` — **THE RA STRIKE, DRAWN FROM THE OWNER'S OWN SHEET.**
 *
 * > *"we need to rework the power of Ra, wrath of Ra … the beams from the sky … it doesn't look good
 * > the way you did it with code and just like an instantaneous fast beam of light, you can't even
 * > see it, it's super fast … it needs to be more gnarly"* — and then he generated the art himself:
 * > *"use whatever we have now, the same mechanics."*
 *
 * So this file changes what a column LOOKS like and nothing about when, where or how hard it lands.
 * It serves ONE drawer — `drawRaColumns` in `bossAuras.ts` — which both the Pharaoh's ritual and a
 * player's POWER OF RA go through, so both get the art in the same commit and cannot drift apart.
 *
 * ## ⭐⭐ THE TIMELINE IS HUNG ON THE COLUMN'S IMPACT TICK, AND NOTHING ELSE
 *
 * Every frame is a pure function of `(world.tick, impactTick)` — `raStrikeFrameAt` below — where
 * `impactTick` is the SIM's own `raColumnImpactTick(until, k)`. Nothing is pushed to `world.effects`
 * (lost ~5/6 of the time at the 10 Hz snapshot) and nothing is remembered between frames, so a
 * joiner, a late peer and a host that migrated mid-strike all show the same frame on the same tick.
 *
 *   slot   sheet frame   ticks   relative to the impact tick
 *   0-3    1-4           18 ea   −120 … −49   the rune ring swells   (the column is announced)
 *   4-5    5-6            6 ea    −48 … −37   the beam drops from the sky
 *   6-8    7-9           12 ea    −36 …  −1   the beam lands in the ring and burns
 *   9      10             6        0 …  +5   ⭐ THE FLASH — on the very tick the sim deals the damage
 *   10-13  11-14          6 ea     +6 … +29   cracks, then the debris explosion
 *   14-18  15-19          8 ea    +30 … +69   the mushroom cloud
 *   19-22  21-24         10 ea    +70 … +109  fire, smoke, embers, gone
 *
 * The nine frames before the impact sum to EXACTLY `RA_COLUMN_TICKS` (the two-second telegraph
 * window), so the ring appears on the tick the column is announced and the flash lands on the tick
 * it hits — `raStrikeArt.test.ts` pins both, and pins this table against the shipped manifest.
 * ⚠ MINE, the split within those windows: the owner's complaint was a beam too fast to see, so the
 * beam is on screen for ~1.3 s (slots 4-13) and the aftermath lingers ~1.8 s.
 *
 * ⛔ Sheet frame 20 is NOT in the table: it is a full beam again, drawn out of sequence between the
 * mushroom cloud and the dying fire. Dropped at intake (`atlas-specs.json`), not held or interpolated.
 *
 * ## ⭐ SIZED TO THE REAL DAMAGE RADIUS
 *
 * The widest blast footprint on the sheet (the rubble ring, frames 13-16) is measured at intake into
 * `blastWidthPx`, and the sprite is scaled so that footprint is exactly `2 × RA_COLUMN_RADIUS` wide —
 * the explosion reads AT the kill circle, not near it. (196 px → 140 px: × 0.714.)
 *
 * ## ⭐ THE BEAM COMES FROM THE SKY, NOT FROM THE TOP OF A 214-PX CELL
 *
 * The sheet cuts every beam at its cell's top edge (sheet frames 5-14). `beamTop` records where, and
 * the drawer continues the beam upward by stretching a 2-px strip of that very row — the beam's own
 * cross-section, colours and halo — in fading bands. No second drawing of the beam exists to disagree
 * with the first.
 *
 * ## ⚠ LOAD CONTRACT
 *
 * Lazy, once, never retried — the `structureRampRenderer` contract. Until it arrives, or if it fails,
 * `raStrikeArt()` is `null` and `drawRaColumns` draws exactly the pre-S188 code beam. The unit suite
 * has no DOM, so it never fetches and always exercises that fallback unless a test injects art.
 */

import { Assets, Rectangle, Texture, type Graphics } from 'pixi.js';
import { RA_COLUMN_RADIUS } from '../constants.ts';

/** `<base>-atlas.png` + `<base>-anim.json`, served from `public/art/ra-strike/`. */
export const RA_STRIKE_ATLAS_BASE = '/art/ra-strike/ra-strike';

/** Ticks each atlas slot is held, in playback order. Pinned against the manifest's `frameTicks`. */
export const RA_STRIKE_FRAME_TICKS: readonly number[] = [
  18, 18, 18, 18, 6, 6, 12, 12, 12, // before the impact — sums to RA_COLUMN_TICKS
  6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 10, 10, 10, 10, // from the impact on
];
/** The slot that starts ON the impact tick — sheet frame 10, the flash. */
export const RA_STRIKE_IMPACT_FRAME = 9;
/** How long before the impact the first frame shows. Must equal `RA_COLUMN_TICKS` (tested). */
export const RA_STRIKE_LEAD_TICKS = RA_STRIKE_FRAME_TICKS.slice(0, RA_STRIKE_IMPACT_FRAME).reduce((a, b) => a + b, 0);
/** How long after the impact the last frame is gone. */
export const RA_STRIKE_TAIL_TICKS = RA_STRIKE_FRAME_TICKS.slice(RA_STRIKE_IMPACT_FRAME).reduce((a, b) => a + b, 0);

/* ── dials. ⚠ MINE, not the owner's: he asked for gnarly and readable, and gave no numbers. */
/** The blast footprint's drawn width as a multiple of the kill DIAMETER. 1 = the explosion IS the hitbox. */
export const RA_STRIKE_BLAST_FILL = 1;
/** How far above the sprite's own cut the beam is continued, in screen px (the old code beam stood 520 tall). */
export const RA_BEAM_SKY_PX = 400;
/** The continuation fades out over this many bands — enough that no single step reads as a seam. */
export const RA_BEAM_SKY_BANDS = 16;
/**
 * The strip is sampled this many atlas px BELOW the cut, clear of the gutter's anti-aliased edge row
 * (the intake uses the same inset for its wash profile).
 *
 * ⚠ RAVFX-8 — AND THE FIRST SKY BAND REACHES DOWN UNDER THE CUT BY THE SAME INSET. The cut row itself
 * is that anti-aliased gutter row: on slots 6-11 it ships at alpha 72-96 of 255 (MEASURED, the row
 * max) between the opaque strip above and the opaque beam below, so a continuation that stopped AT
 * the cut left a faint horizontal seam across the beam. Band 0 now covers the inset rows too and the
 * sprite is composited over it, so those rows read opaque; where the sprite is already opaque
 * nothing changes.
 */
export const RA_BEAM_STRIP_INSET = 2;

/**
 * ⭐ PURE — the atlas slot a column shows at `tick`, given the tick its damage lands, or `null` when
 * the column is not on screen (not announced yet, or its smoke has cleared).
 */
export function raStrikeFrameAt(tick: number, impactTick: number): number | null {
  const t = tick - (impactTick - RA_STRIKE_LEAD_TICKS);
  if (t < 0) return null;
  let acc = 0;
  for (let i = 0; i < RA_STRIKE_FRAME_TICKS.length; i++) {
    acc += RA_STRIKE_FRAME_TICKS[i]!;
    if (t < acc) return i;
  }
  return null;
}

/** The shipped manifest (see `scripts/build-light-sheet-atlas.mjs`). */
export interface RaStrikeManifest {
  cellW: number;
  cellH: number;
  footAnchor: { x: number; y: number };
  subjectFill: number;
  states: Record<string, { row: number; frames: number }>;
  sourceFrames: number[];
  droppedFrames: number[];
  frameTicks: number[];
  impactFrame: number;
  beamTop: Array<number | null>;
  blastWidthPx: number;
}

/** What the drawer needs, in atlas pixels plus the one scale that maps them to the board. */
export interface RaStrikeArt {
  readonly frames: readonly Texture[];
  /** Per slot: a 2-px strip just below the row the beam was cut at, or null for a slot with no beam to continue. */
  readonly beamStrips: readonly (Texture | null)[];
  readonly beamTop: readonly (number | null)[];
  readonly cellW: number;
  readonly cellH: number;
  /** The IMPACT point inside a cell, in atlas px. */
  readonly anchorX: number;
  readonly anchorY: number;
  /** Atlas px → board px. */
  readonly scale: number;
}

/** Board px per atlas px, such that the widest blast footprint spans the column's kill diameter. */
export function raStrikeDrawScale(blastWidthPx: number): number {
  return (2 * RA_COLUMN_RADIUS * RA_STRIKE_BLAST_FILL) / blastWidthPx;
}

/**
 * Slices a loaded sheet by its manifest. `null` when the manifest does not describe the timeline
 * this code plays — a sheet re-authored without the code following is shown as the fallback, never
 * as frames played at the wrong ticks.
 */
export function raStrikeArtFrom(sheet: Texture, m: RaStrikeManifest): RaStrikeArt | null {
  if (m.frameTicks.length !== RA_STRIKE_FRAME_TICKS.length) return null;
  if (m.frameTicks.some((t, i) => t !== RA_STRIKE_FRAME_TICKS[i])) return null;
  if (m.impactFrame !== RA_STRIKE_IMPACT_FRAME) return null;
  if (!(m.blastWidthPx > 0)) return null;
  const rows = Object.values(m.states).sort((a, b) => a.row - b.row);
  const frames: Texture[] = [];
  const strips: (Texture | null)[] = [];
  for (const st of rows) {
    for (let c = 0; c < st.frames; c++) {
      const slot = frames.length;
      const x = c * m.cellW;
      const y = st.row * m.cellH;
      frames.push(new Texture({ source: sheet.source, frame: new Rectangle(x, y, m.cellW, m.cellH) }));
      const bt = m.beamTop[slot] ?? null;
      strips.push(bt === null ? null : new Texture({
        source: sheet.source,
        frame: new Rectangle(x, y + bt + RA_BEAM_STRIP_INSET, m.cellW, 2),
      }));
    }
  }
  if (frames.length !== RA_STRIKE_FRAME_TICKS.length) return null;
  return {
    frames,
    beamStrips: strips,
    beamTop: frames.map((_, i) => m.beamTop[i] ?? null),
    cellW: m.cellW,
    cellH: m.cellH,
    anchorX: m.footAnchor.x * m.cellW,
    anchorY: m.footAnchor.y * m.cellH,
    scale: raStrikeDrawScale(m.blastWidthPx),
  };
}

let art: RaStrikeArt | null = null;
let loadStarted = false;

/** The loaded art, or `null` (not asked for yet, still loading, failed, or no DOM). */
export function raStrikeArt(): RaStrikeArt | null {
  return art;
}

/**
 * Starts the one fetch. Called wherever a strike could soon be drawn, so the art is usually in before
 * the first column lands — all in `bossAuras.ts`: a Pharaoh on the board (`drawRaRitual`), a mummies
 * seat in the match and a player aiming (`drawPowerOfRa`, RAVFX-7), and a strike's own first frame
 * (`drawRaColumns`, the last resort).
 */
export function ensureRaStrikeArt(): void {
  if (loadStarted) return;
  if (typeof document === 'undefined') return; // the unit suite: no DOM, no fetch, the fallback draws
  loadStarted = true;
  void (async () => {
    try {
      const manifest = (await (await fetch(`${RA_STRIKE_ATLAS_BASE}-anim.json`)).json()) as RaStrikeManifest;
      const sheet = (await Assets.load(`${RA_STRIKE_ATLAS_BASE}-atlas.png`)) as Texture;
      art = raStrikeArtFrom(sheet, manifest);
      if (art === null) console.warn('[ra-strike] manifest disagrees with RA_STRIKE_FRAME_TICKS — drawing the code beam');
    } catch {
      art = null; // final and harmless: the code beam draws for the rest of the session
    }
  })();
}

/** ⚠ TEST SEAM — inject (or clear) the art without a DOM. Production never calls this. */
export function setRaStrikeArtForTests(a: RaStrikeArt | null): void {
  art = a;
}

/**
 * Draw slot `slot` of the strike with its impact point on `(x, y)`, into an EXISTING Graphics (a new
 * display object on `fogHiddenLayer` would shift the child indices two e2e probes hardcode — see
 * `bossAuras.ts`). `Graphics.texture()` draws the sub-texture by its own UVs; its alpha is the
 * context's current fill alpha, so each quad sets it first.
 */
export function drawRaStrikeFrame(g: Graphics, a: RaStrikeArt, slot: number, x: number, y: number): void {
  const tex = a.frames[slot];
  if (tex === undefined) return;
  const s = a.scale;
  const w = a.cellW * s;
  const left = x - a.anchorX * s;
  const top = y - a.anchorY * s;

  const strip = a.beamStrips[slot] ?? null;
  const bt = a.beamTop[slot] ?? null;
  if (strip !== null && bt !== null) {
    const cut = top + bt * s;
    const band = RA_BEAM_SKY_PX / RA_BEAM_SKY_BANDS;
    for (let b = 0; b < RA_BEAM_SKY_BANDS; b++) {
      // Full strength where it meets the sprite, thinning to nothing at the top of the sky.
      const alpha = Math.pow(1 - b / RA_BEAM_SKY_BANDS, 1.3);
      g.setFillStyle({ color: 0xffffff, alpha });
      // Band 0 overlaps the inset rows under the cut (RAVFX-8) — the sprite is drawn over it.
      const under = b === 0 ? RA_BEAM_STRIP_INSET * s : 0;
      g.texture(strip, 0xffffff, left, cut - (b + 1) * band, w, band + under);
    }
  }
  g.setFillStyle({ color: 0xffffff, alpha: 1 });
  g.texture(tex, 0xffffff, left, top, w, a.cellH * s);
}
