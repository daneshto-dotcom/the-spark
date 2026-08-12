/**
 * SPARK — S139 P1: `damageEntity` IS WIRED TO THE RUNNING GAME.
 *
 * ## Why this test exists, and why it is a filesystem scan rather than a behavioural test
 *
 * S138 P1 built the damage substrate: `damageEntity`, `Primitive.hp`, `PRIMITIVE_MAX_HP`, real
 * per-kind defender hp, `razePrimitives`, an integer guard, 22 passing unit tests, a serialized
 * field and a hash projection. Everything about it was correct. It shipped, it was documented as
 * "the ONE way anything in the world takes damage", the handoff recorded the blocker as GONE — and
 * the S139 A.0 sweep discovered it had **zero production call sites**. The only importer in the
 * entire repo was its own test file, while three live damage paths went on calling `damageCreature`
 * directly. It was perfect, tested, dead code for a full session.
 *
 * No behavioural test could have caught that. Each of the 22 unit tests called `damageEntity`
 * itself, so they all passed while the game never invoked it once. The failure was not in the
 * behaviour of the function; it was in the *absence of an edge* from the game to the function. That
 * is a property of the import graph, so the guard has to read the import graph.
 *
 * This is the cheap, durable form of the PRIME-AUDIT "boot-then-smoke" question: would this work
 * after the game actually runs, or does it only static-parse? A dispatcher with no callers is the
 * canonical answer of "only static-parses".
 *
 * ## What a failure here means
 *
 * NOT "add a call to satisfy the test". It means a session has removed the last production caller
 * of the damage dispatcher, and the game has silently gone back to having no unified damage path.
 * Find out which caller went away and why.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');

/** Every non-test .ts file under src/, recursively. */
function productionFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      productionFiles(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip line and block comments so a docblock *mentioning* `damageEntity(` cannot masquerade as a
 * call site. This project has been bitten repeatedly by the inverse of this bug — an assertion
 * matching the comment that explains the code rather than the code itself — so the scan is done on
 * comment-free source deliberately.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('S139 P1 — the damage dispatcher is reachable from the running game', () => {
  const files = productionFiles(SRC);

  it('finds production files to scan (guards against a vacuous pass)', () => {
    // If the walk broke, every assertion below would pass trivially against an empty set.
    expect(files.length).toBeGreaterThan(100);
  });

  it('`damageEntity` has at least one PRODUCTION call site outside its own module', () => {
    const callers = files
      .filter((f) => !f.endsWith(join('state', 'damage.ts')))
      .filter((f) => /\bdamageEntity\s*\(/.test(stripComments(readFileSync(f, 'utf8'))));

    // The exact condition that was FALSE for all of S138 and is the reason this file exists.
    expect(
      callers,
      'damageEntity has no production callers — the damage substrate is dead code again (see this file\'s docblock)',
    ).not.toHaveLength(0);
  });

  it('the three S139-routed callers are all present', () => {
    // Named explicitly rather than counted, so deleting one and adding an unrelated one elsewhere
    // cannot keep this green. These are the three paths A.0 measured as bypassing the dispatcher:
    // a Voltkin zap, a turret beam / HELGA slap, and a player RAID.
    const expected = [
      join('state', 'creatures', 'creatureAttack.ts'),
      join('state', 'defenders', 'defenderLifecycle.ts'),
      join('state', 'world.ts'),
    ];
    for (const suffix of expected) {
      const file = files.find((f) => f.endsWith(suffix));
      expect(file, `${suffix} not found`).toBeDefined();
      const body = stripComments(readFileSync(file!, 'utf8'));
      expect(/\bdamageEntity\s*\(/.test(body), `${suffix} should call damageEntity`).toBe(true);
    }
  });

  it('no production file calls `damageCreature` directly any more — the dispatcher is the only door', () => {
    // `damage.ts` itself delegates to it (that is the design: damageCreature stays THE creature
    // death path), and `creatureLifecycle.ts` declares it. Everyone else must go through the front.
    const bypassers = files
      .filter((f) => !f.endsWith(join('state', 'damage.ts')))
      .filter((f) => !f.endsWith(join('state', 'creatures', 'creatureLifecycle.ts')))
      .filter((f) => /\bdamageCreature\s*\(/.test(stripComments(readFileSync(f, 'utf8'))));

    expect(bypassers, `these files bypass damageEntity: ${bypassers.join(', ')}`).toHaveLength(0);
  });
});
