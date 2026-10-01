/**
 * S193 `s193/visuals-board` (V27) — the fog-edge mist. The fog is a game-rule surface, so the tests
 * that matter are the ones that prove it CANNOT reveal: it never sits inside what you can see, never
 * over your own quarter, and its inputs are the local seat's own vision and nothing else.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { recordingSink } from './emitter.ts';
import {
  FOG_MIST_CELL, FOG_MIST_MAX, computeMistField, fogMistFx, makeMistField, mistWeight, type MistRect, type MistSource,
} from './fogMistFx.ts';

const FADE = 40;
const W = 1920, H = 1080;

function run(sources: MistSource[], own: MistRect | null, tick = 600, alpha = 1) {
  const f = makeMistField(W, H);
  computeMistField(f, sources, own, FADE);
  const s = recordingSink();
  const n = fogMistFx(s, f, tick, alpha);
  return { out: s.out, n };
}

const CURSOR: MistSource = { x: 1400, y: 500, radius: 75 };
const SPAWNER: MistSource = { x: 960, y: 540, radius: 125 };
const OWN: MistRect = { x: 0, y: 0, w: 960, h: 540 };

describe('V27 — fog-edge mist', () => {
  it('the bump: zero at and inside the edge, 1 at the peak, zero far out', () => {
    expect(mistWeight(-50)).toBe(0);
    expect(mistWeight(0)).toBe(0);
    expect(mistWeight(40)).toBe(1);
    expect(mistWeight(120)).toBe(0);
    expect(mistWeight(Infinity)).toBe(0);
  });

  it('⛔ no puff sits inside what you can see — every centre is outside every source\'s FULL radius', () => {
    const srcs = [CURSOR, SPAWNER, { x: 300, y: 800, radius: 80 }, { x: 360, y: 820, radius: 80 }];
    for (let tick = 0; tick < 3000; tick += 97) {
      const r = run(srcs, null, tick);
      expect(r.n).toBeGreaterThan(0);
      for (const e of r.out) {
        for (const s of srcs) expect(Math.hypot(e.x - s.x, e.y - s.y), `tick ${tick}`).toBeGreaterThan(s.radius);
      }
    }
  });

  it('⛔ no puff sits inside your own quarter, and the quarter\'s BOARD border carries no mist', () => {
    const r = run([CURSOR], OWN);
    for (const e of r.out) {
      const inside = e.x > OWN.x + 1 && e.x < OWN.x + OWN.w - 1 && e.y > OWN.y + 1 && e.y < OWN.y + OWN.h - 1;
      // a puff centre may drift a little over the interior edge, never deep into the quarter
      if (inside) expect(Math.min(OWN.x + OWN.w - e.x, OWN.y + OWN.h - e.y), `${e.x},${e.y}`).toBeLessThan(FOG_MIST_CELL);
    }
    // the interior edges DO carry mist (x = 960 and y = 540 sides)
    expect(r.out.some((e) => e.x > 960 && e.y < 540)).toBe(true);
  });

  it('only ADDS over the fog: normal-blend smoke, scaled by the fog strength, nothing at alpha 0', () => {
    const full = run([CURSOR, SPAWNER], OWN, 600, 1);
    const half = run([CURSOR, SPAWNER], OWN, 600, 0.5);
    expect(full.out.every((e) => e.tex === 'smoke' && e.blend === 'normal')).toBe(true);
    expect(half.out[0]!.alpha).toBeCloseTo(full.out[0]!.alpha * 0.5, 9);
    expect(run([CURSOR], OWN, 600, 0).out).toHaveLength(0);
  });

  it('bounded, deterministic, and it drifts with the tick', () => {
    const many: MistSource[] = [];
    for (let i = 0; i < 200; i++) many.push({ x: (i * 97) % W, y: (i * 61) % H, radius: 80 });
    expect(run(many, OWN).n).toBeLessThanOrEqual(FOG_MIST_MAX);
    expect(run([CURSOR], OWN, 600)).toEqual(run([CURSOR], OWN, 600));
    expect(run([CURSOR], OWN, 900).out).not.toEqual(run([CURSOR], OWN, 600).out);
  });

  it('⛔ INFORMATION: the layout reads no world — only the sources and the quarter it is handed', () => {
    const src = readFileSync(new URL('./fogMistFx.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from '\.\.\/\.\.\/state/);
    expect(src).not.toMatch(/World/);
  });

  it('REACH — fogRenderer feeds it the SAME sources and own-zone rect the mask is cut from, and adds it after the shroud', () => {
    const src = readFileSync(new URL('../fogRenderer.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/const sources = computeVisionSources\(world, localCursor\);/);
    expect(src).toMatch(/computeMistField\(this\.mistField, sources, ownZone === null \? null : zoneRect\(ownZone, world\.layout\), VISION_FADE_PX\)/);
    expect(src.indexOf('this.container.addChild(this.fogSprite);')).toBeLessThan(src.indexOf('this.container.addChild(this.mist.container);'));
    expect(src).toMatch(/fogMistFx\(this\.mist, this\.mistField, world\.tick, this\.alpha\)/);
  });
});
