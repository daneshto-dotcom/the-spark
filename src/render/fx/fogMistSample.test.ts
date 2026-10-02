/**
 * S193 audit LOW 1 — the auditor's sample test (`.tmp-audit/mistSample.ts`), pinned. Random boards
 * (a seeded LCG, so the test itself is deterministic) are run through the REAL vision predicate
 * (`isPointVisible`) and a model of the smoke texture's alpha, and the composite mist alpha is
 * measured at points the player can SEE — inside a source's radius and inside the own quarter.
 */
import { describe, expect, it } from 'vitest';
import { computeMistField, fogMistFx, makeMistField } from './fogMistFx.ts';
import { fxHash, type FxSink } from './emitter.ts';
import { isPointVisible, type VisionSource } from '../../state/vision.ts';
import {
  CANVAS_HEIGHT, CANVAS_WIDTH, R_BEACON, R_CREATURE_VISION, R_PERSONAL, SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SPAWNER_RADIUS, VISION_FADE_PX,
} from '../../constants.ts';

// The 'smoke' texture's alpha (softTextures.ts: 64 px, 8 hashed radial blobs, source-over).
const S = 64;
const tex = new Float32Array(S * S);
{
  const r = S / 2;
  for (let i = 0; i < 8; i++) {
    const a = fxHash(0x5e0e, i) * Math.PI * 2; const d = fxHash(0x5e0e, i, 1) * r * 0.32; const br = r * (0.42 + fxHash(0x5e0e, i, 2) * 0.22);
    const bx = r + Math.cos(a) * d; const by = r + Math.sin(a) * d;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const q = Math.hypot(x + 0.5 - bx, y + 0.5 - by) / br;
      const al = q >= 1 ? 0 : q < 0.6 ? 0.42 + (0.16 - 0.42) * (q / 0.6) : 0.16 * (1 - (q - 0.6) / 0.4);
      const k = y * S + x; tex[k] = al + tex[k]! * (1 - al);
    }
  }
}
const texAlpha = (u: number, v: number): number => (u < 0 || v < 0 || u >= 1 || v >= 1 ? 0 : tex[Math.floor(v * S) * S + Math.floor(u * S)]!);
const zoneRect = (z: number) => ({ x: z === 0 || z === 3 ? 0 : 960, y: z === 0 || z === 1 ? 0 : 540, w: 960, h: 540 });

function sample(trials: number) {
  let seed = 12345;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
  let maxInsideRadius = 0, maxInsideOwn = 0, capHits = 0, frames = 0, maxBand = 0;
  for (let trial = 0; trial < trials; trial++) {
    const zr = zoneRect(Math.floor(rnd() * 4));
    const own = trial % 5 === 0 ? null : zr;
    const sources: VisionSource[] = [{ x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y, radius: SPAWNER_RADIUS }, { x: rnd() * CANVAS_WIDTH, y: rnd() * CANVAS_HEIGHT, radius: R_PERSONAL }];
    const nb = Math.floor(rnd() * 25);
    for (let i = 0; i < nb; i++) sources.push({ x: zr.x + rnd() * zr.w, y: zr.y + rnd() * zr.h, radius: R_BEACON });
    const nc = Math.floor(rnd() * 8);
    for (let i = 0; i < nc; i++) sources.push({ x: rnd() * CANVAS_WIDTH, y: rnd() * CANVAS_HEIGHT, radius: R_CREATURE_VISION });
    const field = makeMistField(CANVAS_WIDTH, CANVAS_HEIGHT);
    computeMistField(field, sources, own, VISION_FADE_PX);
    const edgeSrc = sources.map((s) => ({ ...s, radius: s.radius + VISION_FADE_PX }));
    const inOwn = (x: number, y: number) => own !== null && x >= own.x && x <= own.x + own.w && y >= own.y && y <= own.y + own.h;
    for (const tick of [0, 999]) {
      const puffs: Array<{ x: number; y: number; w: number; h: number; rot: number; alpha: number }> = [];
      const sink: FxSink = { emit(_t, x, y, w, h, rot, alpha) { if (alpha > 0.004) puffs.push({ x, y, w, h, rot, alpha }); } };
      const n = fogMistFx(sink, field, tick, 1);
      frames++; if (n >= 72) capHits++;
      for (let k = 0; k < 150; k++) {
        let x: number, y: number;
        const s = sources[Math.floor(rnd() * sources.length)]!; const a = rnd() * 6.283; const rr = Math.sqrt(rnd()) * (s.radius + VISION_FADE_PX);
        if (k % 4 === 0 && own !== null) { x = own.x + rnd() * own.w; y = own.y + rnd() * own.h; } else { x = s.x + Math.cos(a) * rr; y = s.y + Math.sin(a) * rr; }
        const vis = isPointVisible(sources, x, y); const ownIn = inOwn(x, y);
        const band = !vis && !ownIn && isPointVisible(edgeSrc, x, y);
        if (!vis && !ownIn && !band) continue;
        let acc = 0;
        for (const p of puffs) {
          const dx = x - p.x, dy = y - p.y; const c = Math.cos(-p.rot), sn = Math.sin(-p.rot);
          const al = texAlpha((dx * c - dy * sn) / p.w + 0.5, (dx * sn + dy * c) / p.h + 0.5) * p.alpha; acc = al + acc * (1 - al);
        }
        if (band) { maxBand = Math.max(maxBand, acc); continue; }
        if (vis) maxInsideRadius = Math.max(maxInsideRadius, acc); else maxInsideOwn = Math.max(maxInsideOwn, acc);
      }
    }
  }
  return { maxInsideRadius, maxInsideOwn, capHits, frames, maxBand };
}

describe('S193 audit — the mist sample, pinned', () => {
  it('no visible mist inside what you can see; the cap rarely binds', () => {
    const r = sample(80);
    console.log('mist sample', JSON.stringify(r));
    expect(r.maxInsideRadius).toBeLessThan(0.01);
    expect(r.maxInsideOwn).toBeLessThan(0.03);
    expect(r.capHits / r.frames).toBeLessThan(0.2);
  });
});
