/**
 * SPARK — S188: **EVERY PRODUCTION `damageConnector` CALL SITE, AND WHO EACH ONE SAYS SWUNG.**
 *
 * The twin of `damage.callSites.test.ts`. S188 gave `damageConnector` a REQUIRED `attacker` so that
 * BLOOD DEBT heals a unit for chewing a building — the commonest hit in the game, and one the entity
 * funnel never sees. `tsc` forces every site to pass something, but `null` is legal, so the compiler
 * cannot tell a considered `null` from a lazy one. This pins both populations: a new site moves a
 * number, and that is the moment to decide whether it knows its attacker.
 *
 * ⚠ A SOURCE-TEXT GUARD PROVES EXISTENCE, NOT REACHABILITY (S182). What proves the heal lands is
 * `racial/lifesteal.test.ts`, which drives the real host tick.
 *
 * ⚠ CRLF-normalised before parsing, for the reason the sibling census gives.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function productionSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) productionSources(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith('//') && !t.startsWith('*');
    })
    .join('\n');
}

function callArgs(src: string, start: number): string[] {
  const open = src.indexOf('(', start);
  let depth = 0;
  let argStart = open + 1;
  const args: string[] = [];
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    else if (ch === ')' || ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) {
        args.push(src.slice(argStart, i));
        break;
      }
    } else if (ch === ',' && depth === 1) {
      args.push(src.slice(argStart, i));
      argStart = i + 1;
    }
  }
  return args.map((a) => a.trim()).filter((a) => a.length > 0);
}

interface Site {
  readonly file: string;
  readonly attacker: string;
}

function collect(): Site[] {
  const sites: Site[] = [];
  for (const file of productionSources(join(ROOT, 'src'))) {
    const src = stripComments(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
    let from = 0;
    for (;;) {
      const at = src.indexOf('damageConnector(', from);
      if (at === -1) break;
      from = at + 1;
      if (/function\s+$/.test(src.slice(Math.max(0, at - 20), at))) continue; // the declaration
      const args = callArgs(src, at);
      if (args.length < 4) continue;
      sites.push({ file: file.slice(ROOT.length + 1).replace(/\\/g, '/'), attacker: args[3]! });
    }
  }
  return sites;
}

describe('S188 — the damageConnector call-site census', () => {
  const sites = collect();

  it('finds every production call site (and not zero — a vacuous parser would pass everything)', () => {
    expect(sites.length).toBe(5);
  });

  it('pins which sites name the striker and which deliberately pass null', () => {
    const tally = (pred: (s: Site) => boolean): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const s of sites.filter(pred)) out[s.file] = (out[s.file] ?? 0) + 1;
      return out;
    };
    expect(sites.every((s) => s.attacker.startsWith('{') || s.attacker === 'null')).toBe(true);
    // A creature struck the building: BLOOD DEBT heals it.
    expect(tally((s) => s.attacker.startsWith('{'))).toEqual({
      'src/state/creatures/creatureAttack.ts': 1, // the creature bond strike
      'src/state/creatures/voltkinChain.ts': 1, // every building link of the bolt
    });
    // Nobody to heal: an area blast whose bomber is deleted on the same call, a player raid, and
    // (S188 merge of racial-c) the POWER OF RA sky strike — a player's column, not a creature's blow.
    expect(tally((s) => s.attacker === 'null')).toEqual({
      'src/state/creatures/suicideBlast.ts': 1,
      'src/state/world.ts': 1,
      'src/state/racial/powerOfRa.ts': 1,
    });
  });
});
