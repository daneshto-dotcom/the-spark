/**
 * S193 `s193/visuals-board` (V24) — the noise-textured ground stain, and `drawRaceGround`'s
 * `skipBase` (the motif-only drawing laid over it). The S185 rules are re-asserted on the TEXELS:
 * never near-black, always in the race's own colour, the core opaque, nothing outside the ellipse.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ALL_RACES, RACE_COLORS } from '../../state/races.ts';
import { drawRaceGround, type GroundTarget } from '../raceGround.ts';
import { GROUND_STAIN_VARIANTS, fbm, groundStainPick, groundStainTexel, valueNoise } from './groundStainFx.ts';

function luma(c: number): number {
  return 0.2126 * ((c >> 16) & 0xff) + 0.7152 * ((c >> 8) & 0xff) + 0.0722 * (c & 0xff);
}

const GRID: Array<[number, number]> = [];
for (let y = -1; y <= 1.0001; y += 0.08) for (let x = -1; x <= 1.0001; x += 0.04) GRID.push([x, y]);

describe('V24 — the stain texel', () => {
  it('noise is bounded and deterministic', () => {
    for (const [x, y] of GRID.slice(0, 200)) {
      const n = valueNoise(5, x * 7, y * 7);
      expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThan(1);
      const f = fbm(5, x, y);
      expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThanOrEqual(1);
      expect(fbm(5, x, y)).toBe(f);
    }
  });

  it('⛔ nothing outside the S185 ellipse: alpha is 0 at ρ ≥ 1 (the zone does not grow)', () => {
    for (const race of ALL_RACES) {
      for (const [u, v] of GRID) {
        if (Math.hypot(u, v) >= 1) expect(groundStainTexel(race, 0, u, v).alpha, `${race} ${u},${v}`).toBe(0);
      }
    }
  });

  it('the core is OPAQUE (alpha 1, the S185 overwrite rule) and the edge is soft (some 0 < alpha < 1)', () => {
    for (const race of ALL_RACES) {
      expect(groundStainTexel(race, 0, 0, 0).alpha).toBe(1);
      expect(groundStainTexel(race, 1, 0.2, -0.1).alpha).toBe(1);
      const soft = GRID.map(([u, v]) => groundStainTexel(race, 0, u, v).alpha).filter((a) => a > 0.05 && a < 0.95);
      expect(soft.length, race).toBeGreaterThan(20);
    }
  });

  it('⛔ no visible texel is near-black, and every one leads with the race colour\'s channel', () => {
    for (const race of ALL_RACES) {
      const base = RACE_COLORS[race];
      const lead = [16, 8, 0].reduce((a, b) => (((base >> a) & 0xff) >= ((base >> b) & 0xff) ? a : b));
      for (const [u, v] of GRID) {
        const s = groundStainTexel(race, 1, u, v);
        if (s.alpha === 0) continue;
        expect(luma(s.color), `${race} ${s.color.toString(16)}`).toBeGreaterThan(12);
        const ch = [(s.color >> 16) & 0xff, (s.color >> 8) & 0xff, s.color & 0xff];
        expect(Math.max(...ch), race).toBe((s.color >> lead) & 0xff);
      }
    }
  });

  it('it is TEXTURED — the colour varies across the stain — and the six races and two variants differ', () => {
    const sig = (race: typeof ALL_RACES[number], variant: number) => GRID.map(([u, v]) => groundStainTexel(race, variant, u, v).color).join(',');
    for (const race of ALL_RACES) {
      const cols = new Set(GRID.map(([u, v]) => groundStainTexel(race, 0, u, v)).filter((s) => s.alpha > 0.5).map((s) => s.color));
      expect(cols.size, race).toBeGreaterThan(8);
      expect(sig(race, 0)).not.toBe(sig(race, 1));
    }
    expect(new Set(ALL_RACES.map((r) => sig(r, 0))).size).toBe(ALL_RACES.length);
  });

  it('a structure picks a variant and a mirror from its id, deterministically', () => {
    const seen = new Set<string>();
    for (let id = 0; id < 64; id++) {
      const p = groundStainPick(id);
      expect(p).toEqual(groundStainPick(id));
      expect(p.variant).toBeLessThan(GROUND_STAIN_VARIANTS);
      seen.add(`${p.variant}${p.flip}`);
    }
    expect(seen.size).toBe(GROUND_STAIN_VARIANTS * 2);
  });
});

describe('V24 — `drawRaceGround(…, { skipBase })` draws the motifs only', () => {
  function calls(race: typeof ALL_RACES[number], skipBase: boolean, tick = 0): string[] {
    const out: string[] = [];
    const g: GroundTarget = {
      ellipse: (...a) => { out.push(`e${a.map((n) => Math.round(n as number)).join(',')}`); return g; },
      poly: () => g,
      fill: (s) => { out.push(`f${s.color}`); return g; },
      moveTo: () => { out.push('m'); return g; },
      lineTo: () => g,
      stroke: (s) => { out.push(`s${s.color}`); return g; },
    };
    drawRaceGround(g, race, 7, 400, 300, 50, 50, tick, { skipBase });
    return out;
  }
  const BODY = 'e400,300,50,17'; // the full-size body ellipse (rx 50, ry 50·0.34)

  /** The full-size body ellipse FILLED (the naga's outermost ring is the same ellipse, stroked — a motif). */
  const bodyFills = (c: string[]) => c.filter((x, i) => x === BODY && (c[i + 1] ?? '').startsWith('f')).length;
  it('the full body ellipse fill is gone for every race, and is there without the flag', () => {
    for (const race of ALL_RACES) {
      expect(bodyFills(calls(race, false)), race).toBe(1);
      expect(bodyFills(calls(race, true)), race).toBe(0);
    }
  });

  it('the motifs stay: demon cracks, zombie bubbles, vampire droplets, naga rings, orc scuffs', () => {
    expect(calls('demons', true).filter((c) => c === 'm')).toHaveLength(5);
    expect(calls('orcs', true).filter((c) => c === 'm')).toHaveLength(5);
    expect(calls('nagas', true).filter((c) => c.startsWith('s'))).toHaveLength(3);
    expect(calls('vampires', true).filter((c) => c.startsWith('e'))).toHaveLength(3);
    // the animated races still animate with the tick
    expect(calls('demons', true, 0)).not.toEqual(calls('demons', true, 30));
  });

  /*
   * ⭐ S194 `s194/visuals-6` — the decal renderer's three paths: legacy = the S185 drawing exactly; fx HIGH =
   * the stain sprite (this file) as the BODY under the animated per-race background; fx LOW = the flat S185
   * body only (`baseOnly`). The S185 Graphics MOTIFS are legacy-only now — the background is the motif layer.
   * Behavioural reach: `towerBackdrop.test.ts`; the stain path needs a canvas, so it is pinned here by source.
   */
  it('REACH — the decal renderer draws the stain from the HIGH switch, the flat body on LOW, S185 on legacy', () => {
    const src = readFileSync(new URL('../groundDecalRenderer.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/this\.textured = this\.live && fxHighQuality\(\);/);
    expect(src).toMatch(/this\.live = fxActive\(\);/);
    expect(src).toMatch(/if \(this\.textured\) \{\s*this\.stain\(/);
    expect(src).toMatch(/\{ baseOnly: true \}/);
    expect(src).toMatch(/if \(!this\.live\) \{[^}]*drawRaceGround\(this\.graphics as unknown as GroundTarget, race, id, cx, feetY, hw, hh, world\.tick\);/);
  });
});
