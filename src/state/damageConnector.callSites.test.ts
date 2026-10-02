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

function collect(token = 'damageConnector(', argIndex = 3): Site[] {
  const sites: Site[] = [];
  for (const file of productionSources(join(ROOT, 'src'))) {
    const src = stripComments(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
    let from = 0;
    for (;;) {
      const at = src.indexOf(token, from);
      if (at === -1) break;
      from = at + 1;
      if (/function\s+$/.test(src.slice(Math.max(0, at - 20), at))) continue; // the declaration
      const args = callArgs(src, at);
      if (args.length < argIndex + 1) continue;
      sites.push({ file: file.slice(ROOT.length + 1).replace(/\\/g, '/'), attacker: args[argIndex]! });
    }
  }
  return sites;
}

describe('S188 — the damageConnector call-site census', () => {
  const sites = collect();

  it('finds every production call site (and not zero — a vacuous parser would pass everything)', () => {
    // S191 C-5 +1: the lightning hub's ladder blast (a null site). S191 (owner) +1: the overkill
    // CARRY in `damage.ts` (`severWithCarry`) — a null site, the lifesteal was paid on the whole hit.
    // ⭐ S191 +1 — SCORCHED EARTH's structure arm (null).
    // ⭐ S192 (zombies) +1: the zombie boss's death blast (a null site — he is dead).
    expect(sites.length).toBe(9);
  });

  it('pins which sites name the striker and which deliberately pass null', () => {
    const tally = (pred: (s: Site) => boolean): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const s of sites.filter(pred)) out[s.file] = (out[s.file] ?? 0) + 1;
      return out;
    };
    // ⭐ S193 BLAST-2 — a third shape: the carry FORWARDS its caller's seat (`carryBy`, typed `SeatAttacker`).
    expect(sites.every((s) => s.attacker.startsWith('{') || s.attacker === 'null' || s.attacker === 'carryBy')).toBe(true);
    // A creature struck the building: BLOOD DEBT heals it.
    expect(tally((s) => s.attacker.startsWith('{') && !s.attacker.includes("kind: 'seat'"))).toEqual({
      'src/state/creatures/creatureAttack.ts': 1, // the creature bond strike
      'src/state/creatures/voltkinChain.ts': 1, // every building link of the bolt
    });
    // ⭐ S193 BLAST-2 — NO `null` IS LEFT. Every hit with no creature to heal names the SEAT that caused it, for
    // the stat board; `'seat'` heals nobody (lifesteal reads `kind === 'creature'`), exactly as `null` did.
    expect(tally((s) => s.attacker === 'null')).toEqual({});
    expect(tally((s) => s.attacker.includes("kind: 'seat'"))).toEqual({
      'src/state/creatures/suicideBlast.ts': 1, // the bomber's owner
      'src/state/world.ts': 1, // the raider
      // ⭐ S191 C-5 — the lightning hub's self-destruct, 120 split across what it reaches: the hub's OWNER.
      'src/state/potatoLifecycle.ts': 1,
      'src/state/racial/raColumn.ts': 1, // the caster, or the Pharaoh's seat (S192: his column cuts connectors too)
      'src/state/racial/scorchedGround.ts': 1, // SCORCHED EARTH burning a structure: the caster
      'src/state/racial/zombieDeathBlast.ts': 1, // S192 T3 — the dead boss's SEAT (S193); heals nobody
    });
    // ⭐ S191 (owner) — the overkill carry: the SAME hit walking on, crediting the caller's seat (`carryBy`).
    expect(tally((s) => s.attacker === 'carryBy')).toEqual({ 'src/state/damage.ts': 1 });
  });

  it('⭐ S193 BLAST-2 — every PRODUCTION severWithCarry names the seat its carry is credited to', () => {
    // `carryBy` is optional only for the unit tests' sake, so `tsc` cannot enumerate these: this does.
    // A source-text guard proves the argument EXISTS; `matchStats.blast2.test.ts` proves the credit LANDS.
    const carries = collect('severWithCarry(', 3);
    const tally: Record<string, number> = {};
    for (const s of carries) tally[s.file] = (tally[s.file] ?? 0) + 1;
    expect(tally).toEqual({
      'src/state/creatures/creatureAttack.ts': 1,
      'src/state/creatures/suicideBlast.ts': 1,
      'src/state/creatures/voltkinChain.ts': 1,
      'src/state/potatoLifecycle.ts': 1,
      'src/state/racial/raColumn.ts': 1,
      'src/state/racial/scorchedGround.ts': 1,
      'src/state/world.ts': 1,
      'src/state/racial/zombieDeathBlast.ts': 1,
    });
    expect(carries.every((s) => s.attacker.includes("kind: 'seat'"))).toBe(true);
    // ⚠ And none was dropped by the 4-argument filter: every call TOKEN in production is one of the above.
    let tokens = 0;
    for (const file of productionSources(join(ROOT, 'src'))) {
      const src = stripComments(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
      tokens += src.split('severWithCarry(').length - 1;
    }
    expect(tokens).toBe(carries.length + 1); // + the declaration
  });
});
