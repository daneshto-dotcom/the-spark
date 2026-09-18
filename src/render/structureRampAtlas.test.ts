/**
 * SPARK — S182: **THE CODE AND THE SHIPPED SHEET MUST AGREE, AND ONLY A TEST CAN SAY SO.**
 *
 * ⛔ THE DEFECT THIS EXISTS FOR IS ALREADY IN THIS PROJECT'S HISTORY, TWICE. `t3TowerAtlasBase` had
 * 7.4 MiB of matted, guarded, disk-tested art and ZERO production callers for two sessions — every
 * signal green, a renderer simply never written. And the Voltkin TV shipped drawing at 61 px because
 * its size constant was derived against a MODEL of the sheet rather than against the sheet.
 *
 * Both are the same shape: the atlas and the code that reads it drifting apart with nothing watching.
 * So every number the renderer holds about this sheet is asserted here against the file on disk.
 *
 * ⚠ **NO PNG DECODER IS USED, DELIBERATELY.** The unit suite has none and the CI unit job installs no
 * pixel toolchain, so a test that needed one would be skipped and therefore worthless. The builder
 * writes its measurements into the manifest (`subjectFill`, `footAnchor`) and the sheet's own
 * dimensions come from the PNG's IHDR header, which is 8 bytes at a fixed offset of every PNG.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HUB_ART_PX, HUB_RAMP_TICKS_PER_FRAME, HUB_SPRITE_PX, HUB_SUBJECT_FILL, RAMP_SPECS,
} from './structureRamp.ts';

interface RowMeta { row: number; frames: number; ticksPerFrame: number }
interface Manifest {
  cellW: number;
  cellH: number;
  footAnchor: { x: number; y: number };
  subjectFill: number;
  states: Record<string, RowMeta>;
}

/** Width and height straight out of the PNG's IHDR chunk — no decoder, no dependency. */
function pngSize(path: string): { w: number; h: number } {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('ascii'), `${path} is not a PNG`).toBe('PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe.each(RAMP_SPECS.map((s) => [s.recipeId, s] as const))(
  'the %s ramp atlas on disk',
  (_id, spec) => {
    // `atlasBase` is a SERVED path ("/art/…"); on disk that is `public/art/…`.
    const base = join(process.cwd(), 'public', spec.atlasBase.replace(/^\//, ''));
    const manifest = JSON.parse(readFileSync(`${base}-anim.json`, 'utf-8')) as Manifest;

    it('ships every row the spec names, at the row index the spec assumes', () => {
      spec.rows.forEach((row, i) => {
        const meta = manifest.states[row.state];
        expect(meta, `manifest has no row "${row.state}"`).toBeDefined();
        expect(meta.row, `${row.state} row index`).toBe(i);
        expect(meta.frames, `${row.state} frame count`).toBe(row.count);
      });
    });

    it('ships no rows the spec does not know about', () => {
      // A row the renderer cannot reach is art that will never be seen — the `t3TowerAtlasBase`
      // failure, which passed every existence check it had.
      expect(Object.keys(manifest.states).sort()).toEqual(spec.rows.map((r) => r.state).sort());
    });

    it('the manifest cadence IS the constant the cursor walks at', () => {
      for (const row of spec.rows) {
        expect(manifest.states[row.state].ticksPerFrame).toBe(spec.ticksPerFrame);
      }
      expect(spec.ticksPerFrame).toBe(HUB_RAMP_TICKS_PER_FRAME);
    });

    it('the sheet is exactly as wide and tall as the rows it declares', () => {
      const { w, h } = pngSize(`${base}-atlas.png`);
      const cols = Math.max(...spec.rows.map((r) => r.count));
      expect(w).toBe(manifest.cellW * cols);
      expect(h).toBe(manifest.cellH * spec.rows.length);
    });

    it('⛔ the foot anchor is NOT the cell bottom — the builder leaves room for the fade', () => {
      // If this ever reads 1.0 the alignment pass has been removed and every ramp building will
      // hover above its own shapes (the S178 Voltkin defect). The renderer corrects by (1 - y).
      expect(manifest.footAnchor.y).toBeGreaterThan(0.8);
      expect(manifest.footAnchor.y).toBeLessThan(1);
      expect(manifest.footAnchor.x).toBe(0.5);
    });
  },
);

describe('the hub sprite size is pinned to the art it draws', () => {
  const base = join(process.cwd(), 'public', 'art', 'lightning-hub', 'lightning-hub');
  const manifest = JSON.parse(readFileSync(`${base}-anim.json`, 'utf-8')) as Manifest;

  it('HUB_SUBJECT_FILL is the builder\'s own measurement, not a hand-copied number', () => {
    expect(HUB_SUBJECT_FILL).toBeCloseTo(manifest.subjectFill, 4);
  });

  it('so the hub DRAWS at HUB_ART_PX, whatever the box happens to be', () => {
    expect(HUB_SPRITE_PX * manifest.subjectFill).toBeCloseTo(HUB_ART_PX, 0);
  });
});
