/**
 * ⛔ S192 (audit CARRY-2) — EVERY PRODUCTION `damageConnector` SITE SEVERS THROUGH `severWithCarry`, OR IS A
 * NAMED EXEMPTION. MECHANICAL, NOT PROSE.
 *
 * The owner ruled that overkill CARRIES (S191). `damageConnector` returns `true` when the connector should
 * fall, and the caller does the sever — so a caller that severs with a bare `SEVER_BOND` (the pre-S191 shape)
 * silently deletes the overkill again, and nothing else in the suite would notice. This census walks every
 * production source, and for each `damageConnector(` call requires a `severWithCarry(` call on THAT CALL'S
 * OWN "true" path, unless the site is listed in `EXEMPT` with its reason. A new site that does neither
 * fails here, naming its file.
 *
 * ⛔⛔ S193 (audit CF-2) — **THE WINDOW IS THE CALL'S RESULT, NOT THE REST OF THE FUNCTION.** It used to be
 * "anywhere later in the same top-level function", and `dispatchReducer` is one function holding every
 * reducer arm: a new arm with `damageConnector` + a bare `SEVER_BOND` passed, because the RAID arm further
 * down calls `severWithCarry`. The true path is now PARSED per site, in one of four shapes only
 * (`carryWindow` below); any other shape is not carried until someone teaches the census it:
 *   1. `if (damageConnector(…)) { BODY }`                     — BODY (also `else if`);
 *   2. `const X = damageConnector(…); … if (X) { BODY }`       — BODY;
 *   3. `const X = damageConnector(…); … if (!X) { …leave… }  REST` — REST, to the end of the enclosing block;
 *   4. shape 1 whose BODY only `LIST.push(…)`es               — the body of a later `for (… of LIST)`.
 *
 * ⚠ A SOURCE-TEXT GUARD PROVES THE CALL EXISTS, NOT THAT IT IS REACHED (S182). Reach is proven per path by
 * `connectorCarry.test.ts` (creature strike, the swarm through `applyCreatureAttack`) and
 * `connectorCarryOwner.test.ts` (the hub blast).
 * ⚠ CRLF-normalised and comment-stripped before parsing, like its sibling `damageConnector.callSites.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

/** `<file>#<0-based site index in that file>` → why that site does not sever through `severWithCarry`. */
const EXEMPT: Readonly<Record<string, string>> = {
  'src/state/damage.ts#0':
    'the carry itself: `severWithCarry` re-applies the leftover with `damageConnector` and its own loop severs `next` on the following iteration',
};

function productionSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) productionSources(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')
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

interface Site { readonly key: string; readonly carried: boolean }

/** Index of the bracket matching the one at `open` (`(` or `{`), or -1. */
function matchClose(src: string, open: number): number {
  const o = src[open]!;
  const c = o === '(' ? ')' : '}';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === o) depth++;
    else if (src[i] === c && --depth === 0) return i;
  }
  return -1;
}

/** The `{ … }` body whose `{` is the first non-space at or after `from`, or null. */
function bodyAt(src: string, from: number): { text: string; end: number } | null {
  const m = /^\s*\{/.exec(src.slice(from));
  if (m === null) return null;
  const open = from + m[0].length - 1;
  const close = matchClose(src, open);
  return close === -1 ? null : { text: src.slice(open + 1, close), end: close };
}

/** From `from` to the end of the block enclosing it (the first `}` that closes past depth 0). */
function restOfBlock(src: string, from: number): string {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth < 0) return src.slice(from, i);
  }
  return src.slice(from);
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * ⛔ S193 CF-2 — the text that runs ONLY when the `damageConnector(` call at `at` returned true (the
 * header's four shapes), or null when the call is in none of them. `at` indexes the call's `d`.
 */
function carryWindow(src: string, at: number): string | null {
  const callOpen = at + 'damageConnector'.length;
  const callClose = matchClose(src, callOpen);
  if (callClose === -1) return null;
  const before = src.slice(0, at);
  // Shapes 1 + 4 — the call IS the whole `if (` condition.
  if (/\bif\s*\(\s*$/.test(before)) {
    const tail = /^\s*\)/.exec(src.slice(callClose + 1));
    if (tail === null) return null; // `if (damageConnector(…) && …)` — not taught
    const body = bodyAt(src, callClose + 1 + tail[0].length);
    if (body === null) return null;
    const push = /^\s*(\w+)\.push\([^;]*\);\s*$/.exec(body.text);
    if (push === null) return body.text;
    const loop = new RegExp(`for\\s*\\(\\s*const\\s+\\w+\\s+of\\s+${esc(push[1]!)}\\s*\\)`).exec(src.slice(body.end));
    if (loop === null) return null;
    const loopBody = bodyAt(src, body.end + loop.index + loop[0].length);
    return loopBody === null ? null : loopBody.text;
  }
  // Shapes 2 + 3 — `const X = damageConnector(…);`, then X's own test.
  const decl = /\b(?:const|let)\s+(\w+)\s*=\s*$/.exec(before);
  if (decl === null) return null;
  const after = callClose + 1;
  const test = new RegExp(`\\bif\\s*\\(\\s*(!?)\\s*${esc(decl[1]!)}\\s*\\)`).exec(src.slice(after));
  if (test === null) return null;
  const body = bodyAt(src, after + test.index + test[0].length);
  if (body === null) return null;
  if (test[1] === '') return body.text;
  // Shape 3 — `if (!X) { … }` must LEAVE (return / continue / break), or the "rest" also runs on false.
  if (!/\b(?:return|continue|break)\b[^;]*;\s*$/.test(body.text)) return null;
  return restOfBlock(src, body.end + 1);
}

function sitesIn(src: string, rel: string): Site[] {
  const sites: Site[] = [];
  let from = 0;
  let index = 0;
  for (;;) {
    const at = src.indexOf('damageConnector(', from);
    if (at === -1) break;
    from = at + 1;
    if (/function\s+$/.test(src.slice(Math.max(0, at - 20), at))) continue; // the declaration
    const window = carryWindow(src, at);
    sites.push({ key: `${rel}#${index}`, carried: window !== null && window.includes('severWithCarry(') });
    index += 1;
  }
  return sites;
}

function collect(): Site[] {
  const sites: Site[] = [];
  for (const file of productionSources(join(ROOT, 'src'))) {
    const src = stripComments(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
    sites.push(...sitesIn(src, relative(ROOT, file).replace(/\\/g, '/')));
  }
  return sites.sort((a, b) => a.key.localeCompare(b.key));
}

describe('⛔ S192 CARRY-2 — every damageConnector site severs through severWithCarry, or is a named exemption', () => {
  const sites = collect();

  it('the census sees every site (anti-vacuity: 9 production sites today)', () => {
    expect(sites.map((s) => s.key)).toEqual([
      'src/state/creatures/creatureAttack.ts#0',
      'src/state/creatures/suicideBlast.ts#0',
      'src/state/creatures/voltkinChain.ts#0',
      'src/state/damage.ts#0',
      'src/state/potatoLifecycle.ts#0',
      'src/state/racial/raColumn.ts#0',
      'src/state/racial/scorchedGround.ts#0', // ⭐ S192 OWN-1 — the SCORCHED EARTH structure burn
      'src/state/racial/zombieDeathBlast.ts#0', // ⭐ S192 T3 — the zombie boss's death blast
      'src/state/world.ts#0',
    ]);
  });

  it('each site is carried, or exempt with a reason — never neither', () => {
    const untagged = sites.filter((s) => !s.carried && EXEMPT[s.key] === undefined).map((s) => s.key);
    expect(untagged, 'a damageConnector site with no severWithCarry after it and no EXEMPT entry').toEqual([]);
  });

  it('⛔ S193 CF-2 — the census itself: a bare sever is caught even when a LATER arm of the same function carries', () => {
    const carried = (src: string): boolean[] => sitesIn(src, 'fixture.ts').map((s) => s.carried);
    // The audit's false pass: two reducer arms in ONE function, only the second carries.
    expect(carried([
      'function reducer(world, action) {',
      '  switch (action.type) {',
      "    case 'NEW_ARM': {",
      '      if (damageConnector(world, action.id, 3, null)) {',
      "        dispatch(world, { type: 'SEVER_BOND', bondId: action.id, cause: 'unit' });",
      '      }',
      '      return world;',
      '    }',
      "    case 'RAID': {",
      '      const shouldSever = damageConnector(world, action.id, 3, null);',
      '      if (shouldSever) {',
      '        severWithCarry(world, action.id, sever);',
      '      }',
      '      return world;',
      '    }',
      '  }',
      '}',
    ].join('\n'))).toEqual([false, true]);
    // Shape 3, and its trap: an `if (!X)` that does not LEAVE carries nothing.
    const shape3 = (inner: string): string => [
      'function f(world) {',
      '  const broke = damageConnector(world, b, 1, null);',
      `  if (!broke) { ${inner} }`,
      '  severWithCarry(world, b, sever);',
      '}',
    ].join('\n');
    expect(carried(shape3('return world;'))).toEqual([true]);
    expect(carried(shape3("log('held');"))).toEqual([false]);
    // Shape 4, and its trap: a list that is pushed and then severed bare.
    const shape4 = (sever: string): string => [
      'function f(world) {',
      '  const toSever = [];',
      '  for (const l of links) { if (damageConnector(world, l, 1, null)) { toSever.push(l); } }',
      `  for (const id of toSever) { ${sever} }`,
      '  severWithCarry(world, other, sever);',
      '}',
    ].join('\n');
    expect(carried(shape4('severWithCarry(world, id, sever);'))).toEqual([true]);
    expect(carried(shape4("dispatch(world, { type: 'SEVER_BOND', bondId: id });"))).toEqual([false]);
    // An untaught shape is never carried.
    expect(carried('function f(world) { return damageConnector(world, b, 1, null) && severWithCarry(world, b, s) > 0; }'))
      .toEqual([false]);
  });

  it('every exemption names a live site that really does not carry (no stale or redundant entries)', () => {
    for (const key of Object.keys(EXEMPT)) {
      const s = sites.find((x) => x.key === key);
      expect(s, `EXEMPT names ${key}, which is not a damageConnector site`).toBeDefined();
      expect(s!.carried, `${key} carries — its exemption is redundant`).toBe(false);
    }
  });
});
