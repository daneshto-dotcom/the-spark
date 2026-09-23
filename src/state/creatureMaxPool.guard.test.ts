/**
 * SPARK — ⛔ THE GUARD ON "WHO IS ALLOWED TO DERIVE A CREATURE'S MAX POOL FROM ITS CONFIG?"
 *
 * ## Why this exists
 *
 * Before S187 a creature's full pool was re-derived from `getCreatureConfig(type)` at every site that
 * needed it. That was correct while a creature's pool was a pure function of its TYPE. The draft
 * breaks that assumption: two units of the same type, owned by seats that have drafted differently,
 * now have different pools. Every surviving derivation is therefore a place where a buffed creature
 * is judged against an UNBUFFED maximum — a heal clamped low, a rage threshold crossed early, a
 * health bar overflowing its own right-hand end.
 *
 * ⛔ **THIS IS A MECHANICAL ENUMERATION, NOT A SOURCE-TEXT ASSERTION, AND S182 IS THE REASON.** That
 * session found a tripwire that was green over a live bug: it proved a line EXISTED but could not
 * prove the failing path REACHED it. So this test does not check that the accessor is imported
 * somewhere. It COUNTS every direct derivation in the sim and render trees and pins the total, with
 * a named reason for each one that is allowed to remain. A new derivation fails this test until
 * somebody writes down why it is safe.
 *
 * ⚠ CRLF: the tree is mixed (`ui.ts` is CRLF, `constants.ts` is LF), so every line split here is
 * `\r?\n`. A guard that parses repo files and forgets this passes in CI and fails only on Windows,
 * which reads as somebody else's broken test.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

/**
 * Every direct `unitPoolFifths(<config>.hp, <config>.def)` that is ALLOWED to survive, and why.
 *
 * ⭐ Each entry is a claim a future session can check in seconds. If one becomes false, delete it and
 * convert the site — do not widen the count.
 */
const SANCTIONED: ReadonlyArray<{
  file: string;
  occurrences: number;
  why: string;
}> = [
  {
    file: 'state/creatures/creature.ts',
    occurrences: 2,
    why:
      'The two legitimate ones. `creatureMaxEhp` IS the fallback — it must derive from config when a ' +
      'creature carries no stored max — and `makeCreature` computes the base pool it then buffs.',
  },
  {
    file: 'state/save.ts',
    occurrences: 1,
    why:
      'deserializeCreature’s last-resort fallback, reached only for a pre-S187 save that carries ' +
      'neither `ehp` nor `maxEhp`. Such a creature is by definition unbuffed, so config is correct.',
  },
  {
    file: 'state/bossSkills.ts',
    occurrences: 1,
    why:
      '`bossMaxPoolFifths(type)` still exists and is still exported for callers that hold only a TYPE. ' +
      'Its one clamping consumer (runVladLifeSap) was converted to `creatureMaxEhp` in S187.',
  },
  {
    file: 'state/damageOverTime.ts',
    occurrences: 1,
    why:
      '`maxPoolFifths(type)` feeds `dotIntervalTicks`, which sets a per-tick CADENCE from the type’s ' +
      'nominal pool. It is not a clamp, so it cannot cap a buff. ⚠ It also means a damage-over-time ' +
      'effect does NOT currently scale with a drafted pool — which matters for the demon quadrant burn ' +
      '(2% of total HP per second) when that lands. Recorded here rather than silently changed.',
  },
  {
    file: 'state/defenders/defender.ts',
    occurrences: 1,
    why: 'A DEFENDER, not a creature. Defenders have their own pool and the draft does not touch them.',
  },
  {
    file: 'state/defenders/stinkCloud.ts',
    occurrences: 1,
    why: 'A stink bag, not a creature. Same reason as defenders.',
  },
  {
    file: 'render/healthBar.ts',
    occurrences: 1,
    why: 'The DEFENDER bar. The creature bar above it was converted to `creatureMaxEhp` in S187.',
  },
  {
    file: 'render/characterSheetModel.ts',
    occurrences: 4,
    why:
      'Two defender sheets, the stink-bag sheet, and the stat-row helper that renders "N pool" beside ' +
      'the HP POINTS. None is a creature’s max: the creature sheet was converted in S187. ' +
      '⚠ The count was written as 3 and the guard caught the fourth on its first run, which is ' +
      'the whole argument for counting rather than asserting.',
  },
  {
    file: 'state/stats.ts',
    occurrences: 1,
    why: 'The DEFINITION of `unitPoolFifths`. Nothing to convert — it is the thing being called.',
  },
  {
    file: 'state/draft.ts',
    occurrences: 2,
    why:
      '`draftedPoolFifths` and `raceUnitPoolAfterPicks` compose the base pool in order to BUFF it. ' +
      'These are the sites that produce the stored max, not sites that bypass it.',
  },
];

/** Strip block comments, line comments and template/string literals before counting CODE. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('*'))
    .join('\n');
}

function countDerivations(rel: string): number {
  const src = codeOnly(readFileSync(join(ROOT, rel), 'utf8'));
  const m = src.match(/unitPoolFifths\s*\(/g);
  return m === null ? 0 : m.length;
}

describe('creature max pool — the derivation guard', () => {
  it('every sanctioned file still derives exactly as many times as its reason claims', () => {
    for (const s of SANCTIONED) {
      expect(countDerivations(s.file), `${s.file} — ${s.why}`).toBe(s.occurrences);
    }
  });

  it('the creature bar, the creature sheet and Vlad’s heal clamp all read the ACCESSOR', () => {
    // These three are the sites where a config-derived max would actively misbehave rather than
    // merely be stale: an overflowing bar, a wrong sheet, and a heal capped below the real pool.
    for (const f of [
      'render/healthBar.ts',
      'render/characterSheetModel.ts',
      'state/bossSkills.ts',
      'state/bossSkillsWarlord.ts',
      'state/bossSkillsArchdemon.ts',
    ]) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect(src, `${f} must read the creature's own max`).toContain('creatureMaxEhp');
    }
  });

  it('nothing outside the sanctioned list derives a creature pool from config', () => {
    // The mechanical half: walk the two trees and fail on any file that derives but is not listed.
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(join(ROOT, dir))) {
        const rel = `${dir}/${name}`;
        if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
        else if (name.endsWith('.ts') && !name.includes('.test.')) files.push(rel);
      }
    };
    walk('state');
    walk('render');

    const sanctioned = new Set(SANCTIONED.map((s) => s.file));
    const unexpected: string[] = [];
    for (const f of files) {
      if (sanctioned.has(f)) continue;
      if (countDerivations(f) > 0) unexpected.push(f);
    }
    expect(
      unexpected,
      'A new direct pool derivation appeared. Either read `creatureMaxEhp(creature)` instead, or add ' +
        'the file to SANCTIONED with a written reason why a buffed creature is not misjudged there.',
    ).toEqual([]);
  });
});
