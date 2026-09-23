/**
 * SPARK — S183: **EVERY PRODUCTION `damageEntity` CALL SITE, ENUMERATED MECHANICALLY.**
 *
 * ## Why this exists rather than a comment saying "there are fourteen"
 *
 * Retaliation (`creatures/retaliation.ts`) is only as complete as the set of damage paths that
 * name their attacker. `tsc` guarantees every site passes SOMETHING — the parameter is required
 * exactly so it does — but `null` is a legal answer and the right one for area damage, a hazard,
 * the castle gun and a player raid. So the compiler cannot tell a considered `null` from a lazy
 * one, and a NEW site that quietly took the lazy option would be a dead feature with green gates:
 * the S182 tolerant-`default` defect wearing a different hat.
 *
 * ⭐ THIS COUNTS THE TWO POPULATIONS AND PINS BOTH. Add a call site and a number moves, which is
 * the moment to decide whether the new path knows an attacker. Re-pin it in the same commit, the
 * way `SPARK_CANON.md` requires of a number and its constant.
 *
 * ⚠ **IT IS A SOURCE-TEXT GUARD AND THEREFORE PROVES EXISTENCE, NOT REACHABILITY** — S182's own
 * warning, recorded here so nobody reads a green run as "retaliation works". What proves the
 * behaviour is `creatures/retaliation.test.ts`, which drives the shipped selectors. This file's
 * single job is that no damage path is added without someone answering the question.
 *
 * ⚠ CRLF-NORMALISED BEFORE PARSING. A `ci.*`-style guard that reads a repo file false-reds on
 * Windows only, where CI stays green and it looks like somebody else's broken test.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function productionSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      productionSources(full, out);
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip comments so a docblock that QUOTES a call (`damage.ts` has two) is not counted as one.
 * Crude on purpose: block comments, and lines whose first non-space character opens a comment or
 * continues a docblock. No file under `src/` puts a live `damageEntity(` after a trailing `//`.
 */
function stripComments(src: string): string {
  const withoutBlocks = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return withoutBlocks
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith('//') && !t.startsWith('*');
    })
    .join('\n');
}

/** The top-level arguments of the call whose `damageEntity` token starts at `start`. */
function callArgs(src: string, start: number): string[] {
  const open = src.indexOf('(', start);
  let depth = 0;
  let i = open;
  let argStart = open + 1;
  const args: string[] = [];
  for (; i < src.length; i++) {
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
      const at = src.indexOf('damageEntity(', from);
      if (at === -1) break;
      from = at + 1;
      // the declaration itself, and any `import { damageEntity }`-style token, are not calls
      const before = src.slice(Math.max(0, at - 20), at);
      if (/function\s+$/.test(before)) continue;
      const args = callArgs(src, at);
      if (args.length < 5) continue; // not a call of this signature — tsc already forbids it
      sites.push({
        file: file.slice(ROOT.length + 1).replace(/\\/g, '/'),
        attacker: args[4],
      });
    }
  }
  return sites;
}

describe('S183 — the damageEntity call-site census', () => {
  const sites = collect();

  it('finds every production call site and no comment quotation', () => {
    // ⚠ Both halves: a parser that matched nothing, or one that swallowed the two docblock
    // quotations in `damage.ts`, would silently pass every assertion below.
    expect(sites.length).toBe(15); // S188 +1: SCORCHED GROUND (a null site — burning ground is no entity)
    expect(sites.every((s) => s.file.startsWith('src/state/'))).toBe(true);
  });

  it('pins WHICH sites name an attacker and which deliberately pass null', () => {
    const named = sites.filter((s) => s.attacker.startsWith('{'));
    const nulled = sites.filter((s) => s.attacker === 'null');
    /*
     * ⛔ NOTHING ELSE IS ALLOWED. A forwarded variable is a perfectly reasonable future shape —
     * `applyRadialDamage` would use one the day a blast gets an owner that can be retaliated
     * against — but it must be a DECISION. Failing here is the prompt to make it.
     */
    expect(named.length + nulled.length).toBe(sites.length);

    expect(named.length).toBe(8);
    expect(nulled.length).toBe(7);
  });

  it('names the files on each side, so a moved call is visible and not merely counted', () => {
    const tally = (pred: (s: Site) => boolean): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const s of sites.filter(pred)) out[s.file] = (out[s.file] ?? 0) + 1;
      return out;
    };

    // Every path that knows WHO swung. `retaliation.ts` decides what each one means.
    expect(tally((s) => s.attacker.startsWith('{'))).toEqual({
      'src/state/bossSkills.ts': 1, // the zombie rot aura — named, and refused as a splash
      'src/state/creatures/creatureAttack.ts': 5, // creature / Helga / shape / bag / keep
      'src/state/creatures/voltkinChain.ts': 1, // the seed retaliates; the five hops do not
      'src/state/defenders/defenderLifecycle.ts': 1, // named, and unusable until a creature can hold it
    });

    // And every path where there is genuinely nobody to turn on. Each `null` carries its reason
    // at the call site; this is the list, so a fifteenth one cannot join it unremarked.
    expect(tally((s) => s.attacker === 'null')).toEqual({
      'src/state/castleGuns.ts': 1, // a KEEP is not an entity
      'src/state/damage.ts': 3, // applyRadialDamage — a splash names nobody
      'src/state/racial/scorchedGround.ts': 1, // S188 — burning ground: nobody to turn on or heal
      'src/state/world.ts': 2, // the player RAID — the avatar is untargetable by ruling
    });
  });
});
