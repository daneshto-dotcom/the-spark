/**
 * S194 T5 — a fixed-advance text canvas for vitest (node has no canvas; Pixi measures text through
 * one). The same stand-in `draftOverlay.test.ts` defines inline, lifted so the S194 REACH tests can
 * drive real panels whose sync measures labels. Nothing that uses it may assert a glyph width.
 */
import { afterAll, vi } from 'vitest';

class FakeContext2D {
  font = '10px sans-serif';
  letterSpacing = '0px';
  textLetterSpacing = '0px';
  measureText(s: string): { width: number; actualBoundingBoxLeft: number; actualBoundingBoxRight: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
    const px = Number(/(\d+)px/.exec(this.font)?.[1] ?? 10);
    const w = s.length * px * 0.6;
    return { width: w, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w, actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2 };
  }
}
class FakeOffscreenCanvas {
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext(): FakeContext2D {
    return new FakeContext2D();
  }
}

/** Install for the calling test file; removed again after it. */
export function installFakeTextCanvas(): void {
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal('CanvasRenderingContext2D', FakeContext2D);
  afterAll(() => {
    vi.unstubAllGlobals();
  });
}
