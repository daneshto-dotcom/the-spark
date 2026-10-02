/**
 * ⛔ S193 (owner R193-B4) — EVERY BLAST FALLS OFF WITH DISTANCE. MECHANICAL, NOT PROSE.
 *
 * > *"The closer you are to the blast side, the more damage you take … that's obviously for every blast."*
 *
 * Three censuses over every production source (`src/arcade/**` excluded — Pitch Masters is off-limits):
 *
 *  1. every `applyRadialDamage(` call passes a falloff literal, and only the named damage-over-time
 *     areas may pass `'flat'`;
 *  2. every file that sets off a blast (pushes a `BOMB_EXPLODE` effect) reaches the shared falloff —
 *     a `'distance'` radial call, `blastHitAtDistance(` or `splitBlastPool(` — or is a named exemption;
 *  3. a blast's own connector arm (the suicide goblin's) scales its hit with `blastHitAtDistance`.
 *
 * A new blast producer that does none of these fails here, naming its file.
 * ⚠ A SOURCE-TEXT GUARD PROVES A LINE EXISTS, NOT THAT IT IS REACHED (S182). Reach is proven per family
 * through the real host tick: `zombieDeathBlast.test.ts`, `hubSelfDestructLadder.test.ts`,
 * `creatures/suicideGoblin.test.ts` (suicide goblin + drone), `defenders/stinkCloud.test.ts` (bag burst).
 * ⚠ CRLF-normalised and comment-stripped before parsing.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BLAST_EDGE_FLOOR_PERCENT, blastHitAtDistance, blastSplitWeight, splitBlastPool } from './blastFalloff.ts';

const ROOT = process.cwd();

function productionSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'arcade') continue; // ⛔ Pitch Masters — off-limits, never enumerated
      productionSources(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')
      && !entry.name.endsWith('.fixtures.ts')) out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const t = line.trimStart();
      if (t.startsWith('//') || t.startsWith('*')) return '';
      const i = line.indexOf(' // ');
      return i === -1 ? line : line.slice(0, i);
    })
    .join('\n');
}

const SOURCES = productionSources(join(ROOT, 'src')).map((file) => ({
  rel: relative(ROOT, file).replace(/\\/g, '/'),
  code: stripComments(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')),
}));

/** The text of a call starting at `at` (the index of its name), up to its balanced closing paren. */
function callText(code: string, at: number): string {
  const open = code.indexOf('(', at);
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')') {
      depth--;
      if (depth === 0) return code.slice(at, i + 1);
    }
  }
  return code.slice(at);
}

interface RadialSite { readonly key: string; readonly falloff: 'distance' | 'flat' | null }

function radialSites(): RadialSite[] {
  const out: RadialSite[] = [];
  for (const { rel, code } of SOURCES) {
    let from = 0;
    let index = 0;
    for (;;) {
      const at = code.indexOf('applyRadialDamage(', from);
      if (at === -1) break;
      from = at + 1;
      if (/function\s+$/.test(code.slice(Math.max(0, at - 20), at))) continue; // the declaration
      const text = callText(code, at);
      const falloff = text.includes("'distance'") ? 'distance' : text.includes("'flat'") ? 'flat' : null;
      out.push({ key: `${rel}#${index}`, falloff });
      index += 1;
    }
    // The stink module takes the bridge as a PARAMETER (`radialDamage(`) to keep the graph acyclic.
    if (rel.startsWith('src/state/defenders/')) {
      let f = 0;
      let i = 0;
      for (;;) {
        const at = code.indexOf('radialDamage(', f);
        if (at === -1) break;
        f = at + 1;
        if (code[at - 1] !== undefined && /[A-Za-z]/.test(code[at - 1]!)) continue; // applyRadialDamage
        const text = callText(code, at);
        const falloff = text.includes("'distance'") ? 'distance' : text.includes("'flat'") ? 'flat' : null;
        out.push({ key: `${rel}#radial${i}`, falloff });
        i += 1;
      }
    }
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** The ONLY areas allowed `'flat'` — damage over time, not blasts — and why. */
const FLAT_OK: Readonly<Record<string, string>> = {
  'src/state/defenders/stinkCloud.ts#radial0': "a landed bag's lingering cloud: 1 fifth a second, damage over time (its LANDING hit is a blast)",
  'src/state/defenders/stinkTower.ts#radial2': "the stink tower's aura: 1 fifth a second, damage over time",
};

/** Files that push a `BOMB_EXPLODE` without damaging anything through the falloff, and why. */
const BLAST_EXEMPT: Readonly<Record<string, string>> = {
  'src/state/bombLifecycle.ts': 'the player bomb — ARCHIVED (canon §1; unreachable in a shipped build)',
  'src/state/save.ts': 'deserialises a BOMB_EXPLODE effect off the wire / disk — sets nothing off',
  'src/dev/fxLab.ts': 'the dev-only visual lab — draws a burst, deals nothing',
};

describe('⛔ S193 R193-B4 — every blast reaches the ONE falloff (mechanical census)', () => {
  const sites = radialSites();

  it('anti-vacuity: the radial census sees every call — 7 production sites today', () => {
    expect(sites.map((s) => s.key)).toEqual([
      'src/state/creatures/suicideBlast.ts#0',
      'src/state/damage.ts#0', // a landed bag's BURST (`damageStinkCloud`)
      'src/state/defenders/stinkCloud.ts#radial0',
      'src/state/defenders/stinkTower.ts#radial0', // the tower's death blast
      'src/state/defenders/stinkTower.ts#radial1', // a thrown bag's landing
      'src/state/defenders/stinkTower.ts#radial2', // the aura
      'src/state/droneLifecycle.ts#0',
    ]);
  });

  it('every radial call names its falloff, and only the damage-over-time areas say flat', () => {
    expect(sites.filter((s) => s.falloff === null).map((s) => s.key), 'a radial call with no falloff literal').toEqual([]);
    const flat = sites.filter((s) => s.falloff === 'flat').map((s) => s.key);
    expect(flat.filter((k) => FLAT_OK[k] === undefined), 'a BLAST passing flat — R193-B4 says closer = more').toEqual([]);
    for (const k of Object.keys(FLAT_OK)) expect(flat, `stale FLAT_OK entry ${k}`).toContain(k);
  });

  it('every file that sets off a blast reaches the shared falloff, or is a named exemption', () => {
    const producers = SOURCES.filter((s) => /kind:\s*'BOMB_EXPLODE',/.test(s.code) || /kind: 'BOMB_EXPLODE', tick/.test(s.code))
      .map((s) => s.rel)
      .filter((rel) => !rel.startsWith('src/render/') && rel !== 'src/game/effects.ts')
      .sort();
    expect(producers, 'anti-vacuity: the blast producers today').toEqual([
      'src/dev/fxLab.ts',
      'src/state/bombLifecycle.ts',
      'src/state/creatures/suicideBlast.ts',
      'src/state/damage.ts',
      'src/state/defenders/stinkTower.ts',
      'src/state/droneLifecycle.ts',
      'src/state/potatoLifecycle.ts',
      'src/state/racial/zombieDeathBlast.ts',
      'src/state/save.ts',
    ]);
    const radial = new Set(sites.filter((s) => s.falloff === 'distance').map((s) => s.key.split('#')[0]!));
    const missing = producers.filter((rel) => {
      if (BLAST_EXEMPT[rel] !== undefined) return false;
      const code = SOURCES.find((s) => s.rel === rel)!.code;
      return !(radial.has(rel) || code.includes('blastHitAtDistance(') || code.includes('splitBlastPool('));
    });
    expect(missing, 'a blast producer that never reaches blastFalloff.ts').toEqual([]);
  });

  it('the suicide goblin\'s CONNECTOR arm scales its hit by distance too', () => {
    const code = SOURCES.find((s) => s.rel === 'src/state/creatures/suicideBlast.ts')!.code;
    const at = code.indexOf('damageConnector(');
    expect(at, 'anti-vacuity').toBeGreaterThan(-1);
    expect(callText(code, at)).toContain('blastHitAtDistance(');
  });

  it('both split-pool blasts weight their split through the shared helpers', () => {
    for (const rel of ['src/state/potatoLifecycle.ts', 'src/state/racial/zombieDeathBlast.ts']) {
      const code = SOURCES.find((s) => s.rel === rel)!.code;
      expect(code, rel).toContain('splitBlastPool(');
      expect(code, rel).toContain('blastSplitWeight(');
    }
  });
});

describe('S193 R193-B4 — the falloff itself (pure arithmetic)', () => {
  it('⚠ MINE: a full-hit blast falls linearly from 100 % at the centre to 50 % at the rim, floor 1', () => {
    expect(BLAST_EDGE_FLOOR_PERCENT).toBe(50);
    expect(blastHitAtDistance(20, 0, 70), 'full at the centre').toBe(20);
    expect(blastHitAtDistance(20, 35 * 35, 70), 'three quarters halfway').toBe(15);
    expect(blastHitAtDistance(20, 70 * 70, 70), 'half at the rim').toBe(10);
    expect(blastHitAtDistance(1, 70 * 70, 70), 'never below 1 on a real hit').toBe(1);
    expect(blastHitAtDistance(0, 0, 70), 'no hit stays no hit').toBe(0);
    expect(blastHitAtDistance(20, 100 * 100, 70), 'past the rim = the rim').toBe(10);
    for (let d = 0; d < 70; d++) {
      expect(blastHitAtDistance(30, d * d, 70), `monotone at ${d}`).toBeGreaterThanOrEqual(blastHitAtDistance(30, (d + 1) * (d + 1), 70));
      expect(Number.isInteger(blastHitAtDistance(30, d * d, 70))).toBe(true);
    }
  });

  it('a split pool sums to EXACTLY the pool, is integral, and the nearer never takes less', () => {
    for (const pool of [120, 312]) {
      for (const n of [1, 2, 5, 13, 120, 200]) {
        const w = Array.from({ length: n }, (_, i) => blastSplitWeight((i * 3) ** 2, 240));
        const s = splitBlastPool(pool, w);
        expect(s.reduce((a, x) => a + x, 0), `pool ${pool} n ${n}`).toBe(pool);
        expect(s.every((x) => Number.isInteger(x) && x >= 0)).toBe(true);
        for (let i = 1; i < n; i++) expect(s[i]!).toBeLessThanOrEqual(s[i - 1]! + 1);
      }
    }
    expect(splitBlastPool(120, []), 'nobody in range').toEqual([]);
  });

  it('the kind weight multiplies, and must be a positive integer', () => {
    expect(blastSplitWeight(0, 240, 2)).toBe(480);
    expect(() => blastSplitWeight(0, 240, 0)).toThrow();
    expect(() => blastSplitWeight(0, 240, 1.5)).toThrow();
  });
});
