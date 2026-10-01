/**
 * ⛔ S192 (audit CARRY-2) — EVERY PRODUCTION `damageConnector` SITE SEVERS THROUGH `severWithCarry`, OR IS A
 * NAMED EXEMPTION. MECHANICAL, NOT PROSE.
 *
 * The owner ruled that overkill CARRIES (S191). `damageConnector` returns `true` when the connector should
 * fall, and the caller does the sever — so a caller that severs with a bare `SEVER_BOND` (the pre-S191 shape)
 * silently deletes the overkill again, and nothing else in the suite would notice. This census walks every
 * production source, and for each `damageConnector(` call requires a `severWithCarry(` call later in the
 * SAME top-level function (the window ends at the next top-level `function` declaration), unless the site
 * is listed in `EXEMPT` with its reason. A new site that does neither fails here, naming its file.
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

function collect(): Site[] {
  const sites: Site[] = [];
  for (const file of productionSources(join(ROOT, 'src'))) {
    const src = stripComments(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    let from = 0;
    let index = 0;
    for (;;) {
      const at = src.indexOf('damageConnector(', from);
      if (at === -1) break;
      from = at + 1;
      if (/function\s+$/.test(src.slice(Math.max(0, at - 20), at))) continue; // the declaration
      const next = src.slice(at).search(/\n(export )?function /);
      const window = next === -1 ? src.slice(at) : src.slice(at, at + next);
      sites.push({ key: `${rel}#${index}`, carried: window.includes('severWithCarry(') });
      index += 1;
    }
  }
  return sites.sort((a, b) => a.key.localeCompare(b.key));
}

describe('⛔ S192 CARRY-2 — every damageConnector site severs through severWithCarry, or is a named exemption', () => {
  const sites = collect();

  it('the census sees every site (anti-vacuity: 8 production sites today)', () => {
    expect(sites.map((s) => s.key)).toEqual([
      'src/state/creatures/creatureAttack.ts#0',
      'src/state/creatures/suicideBlast.ts#0',
      'src/state/creatures/voltkinChain.ts#0',
      'src/state/damage.ts#0',
      'src/state/potatoLifecycle.ts#0',
      'src/state/racial/raColumn.ts#0',
      'src/state/racial/scorchedGround.ts#0', // ⭐ S192 OWN-1 — the SCORCHED EARTH structure burn
      'src/state/world.ts#0',
    ]);
  });

  it('each site is carried, or exempt with a reason — never neither', () => {
    const untagged = sites.filter((s) => !s.carried && EXEMPT[s.key] === undefined).map((s) => s.key);
    expect(untagged, 'a damageConnector site with no severWithCarry after it and no EXEMPT entry').toEqual([]);
  });

  it('every exemption names a live site that really does not carry (no stale or redundant entries)', () => {
    for (const key of Object.keys(EXEMPT)) {
      const s = sites.find((x) => x.key === key);
      expect(s, `EXEMPT names ${key}, which is not a damageConnector site`).toBeDefined();
      expect(s!.carried, `${key} carries — its exemption is redundant`).toBe(false);
    }
  });
});
