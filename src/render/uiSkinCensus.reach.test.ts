/**
 * ⭐ S195 T18 #2 — **EVERY SKINNED CENSUS ROW HAS A REACH TEST, AND THE PAIRING IS MECHANICAL.**
 *
 * `uiSkinCensus.test.ts` is a SOURCE-TEXT claim list: a SKINNED row proves a skin call EXISTS on that
 * line. S182 rule 2: that is not proof the line is REACHED. The `uiSkinReach.*.test.ts` files are the
 * proof — each drives a real surface (a real `sync` / `render`, real Pixi handlers) and asserts the skin
 * lands on the rect the hit-test claims. This file ties the two together so a SKINNED row cannot exist
 * without its REACH:
 *
 *   · the SKINNED rows are PARSED from the census file's own source (never retyped here);
 *   · a REACH test claims a row with a marker line `// CENSUS-REACH <file> :: <match>`, verbatim;
 *   · every SKINNED row needs ≥ 1 marker, or a NOT_DONE row naming the tree that owns the file;
 *   · a marker that names no SKINNED row, or a NOT_DONE row that has a marker, is STALE and fails.
 *
 * The markers live in the REACH files so the claim sits beside the code that proves it; this file only
 * checks the two lists agree. It cannot prove a REACH test is a GOOD one — the auditor reads those.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CENSUS_FILE = join(__dirname, 'uiSkinCensus.test.ts');

interface Row { readonly file: string; readonly match: string }
const key = (r: Row): string => `${r.file} :: ${r.match}`;

/**
 * ⛔ NOT DONE on `s195/ui-4` — SKINNED rows whose file another tree owns (S195_CLOUD_AGENT_RULES: no REACH
 * test may drive an off-limits file from here), or that no node test can reach. Stale-checked: a marker
 * for any of these fails until the row is removed.
 */
const NOT_DONE: ReadonlyArray<Row & { why: string }> = [
  { file: 'src/render/lobbyScreen.ts', match: 'this.joinButton.', why: 'teams tree owns lobby*.ts (S195 off-limits) — Connect chip: drive LobbyScreen, chip inside/outside + sheen' },
  { file: 'src/render/lobbyScreen.ts', match: 'attachButtonFeedback(', why: 'teams tree owns lobby*.ts — Host/Join/Begin/Back/Quick/Test/READY: sheen rect = hitArea, sweep inside' },
];

/** The SKINNED rows + the Controls-driven files, read out of the census test's own source. */
function censusRows(): { skinned: Row[]; controlsDriven: string[] } {
  const src = readFileSync(CENSUS_FILE, 'utf8');
  const skinned: Row[] = [];
  const re = /\{\s*file:\s*'([^']+)',\s*match:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"),\s*status:\s*([SE])\b/g;
  for (const m of src.matchAll(re)) if (m[4] === 'S') skinned.push({ file: m[1]!, match: (m[2] ?? m[3] ?? '').replace(/\\'/g, "'") });
  const cd = src.slice(src.indexOf('const CONTROLS_DRIVEN'), src.indexOf('];', src.indexOf('const CONTROLS_DRIVEN')));
  const controlsDriven = [...cd.matchAll(/file:\s*'([^']+)'/g)].map((m) => m[1]!);
  return { skinned, controlsDriven };
}

/** Every `CENSUS-REACH` marker in every REACH file. */
function markers(): Array<Row & { in: string }> {
  const out: Array<Row & { in: string }> = [];
  for (const n of readdirSync(__dirname)) {
    if (!/^uiSkinReach\..+\.test\.ts$/.test(n)) continue;
    const src = readFileSync(join(__dirname, n), 'utf8');
    for (const m of src.matchAll(/^\s*\/\/\s*CENSUS-REACH\s+(\S+)\s+::\s+(.+?)\s*$/gm)) out.push({ file: m[1]!, match: m[2]!, in: n });
  }
  return out;
}

describe('⛔ S195 T18 — every SKINNED census row is paired with a REACH test (or named NOT DONE with its tree)', () => {
  const { skinned, controlsDriven } = censusRows();
  const marks = markers();

  it('anti-vacuity: the parse sees the census and the markers', () => {
    expect(skinned.length).toBeGreaterThan(15);
    expect(controlsDriven).toEqual(['src/render/footerBand.ts', 'src/render/characterSheet.ts']);
    expect(marks.length).toBeGreaterThan(10);
    expect(new Set(marks.map((m) => m.in)).size, 'markers come from several REACH files').toBeGreaterThan(4);
  });

  it('every SKINNED row has a REACH marker or a NOT_DONE row', () => {
    const missing = skinned.filter((r) => !marks.some((m) => m.file === r.file && m.match === r.match) && !NOT_DONE.some((n) => n.file === r.file && n.match === r.match));
    expect(missing.map(key), 'SKINNED with no REACH — write the uiSkinReach.* test, then mark it').toEqual([]);
  });

  it('every Controls-driven surface has a REACH marker (keyed by file)', () => {
    for (const f of controlsDriven) expect(marks.some((m) => m.file === f && m.match === '*'), `${f} :: *`).toBe(true);
  });

  it('no stale marker: each names a SKINNED row (or a Controls-driven file with "*")', () => {
    const stale = marks.filter((m) => !(m.match === '*' ? controlsDriven.includes(m.file) : skinned.some((r) => r.file === m.file && r.match === m.match)));
    expect(stale.map((m) => `${m.in}: ${key(m)}`)).toEqual([]);
  });

  it('⛔ no stale NOT_DONE: a row that gained a marker, or lost its census row, must go', () => {
    for (const n of NOT_DONE) {
      expect(n.why.length).toBeGreaterThan(20);
      expect(skinned.some((r) => r.file === n.file && r.match === n.match), `${key(n)} is still a SKINNED census row`).toBe(true);
      expect(marks.some((m) => m.file === n.file && m.match === n.match), `${key(n)} now has a REACH marker — remove it from NOT_DONE`).toBe(false);
    }
  });

  it('the pairing, for the report', () => {
    const reached = skinned.filter((r) => marks.some((m) => m.file === r.file && m.match === r.match)).length;
    expect(reached + NOT_DONE.length).toBe(skinned.length);
    expect(reached).toBeGreaterThan(NOT_DONE.length * 2);
  });
});
