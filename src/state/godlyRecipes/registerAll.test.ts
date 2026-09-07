/**
 * SPARK — S165: every recipe is registered from ONE place, and both entrypoints use it.
 *
 * ⛔ THE BUG. Recipes register by side-effect import. `main.ts` carried all seven; `src/simWorker.ts`
 * carried none. Under `?worker=1` — a shipped opt-in — `main.ts` SKIPS the main-thread matcher, so
 * the worker is the sole authority running `runGodlyMatcherCore`. With an empty registry
 * `findDefenderMatches` returns `[]` every tick, and the laser turret, Princess Helga, the stink
 * tower, the goblin tower, the pentagram, the lightning hub and the Voltkin cinematic were all
 * unbuildable in that mode. Nothing threw; the geometry just completed and nothing happened.
 *
 * ⚠ THIS FILE IMPORTS ONLY `registerAll.ts` — deliberately, and it is the whole design of the test.
 * Importing a recipe module directly would register it and mask exactly the omission being guarded.
 */
import { describe, expect, it } from 'vitest';

import './registerAll.ts';
import { listRecipes } from './index.ts';

/**
 * The full set, pinned as literals.
 *
 * ⚠ PINNED, NOT DERIVED. Deriving the expectation from the registry would make this test assert
 * `x === x` and pass with an empty one. A new recipe SHOULD turn this red — that failure is the
 * reminder to add its import to `registerAll.ts` rather than to an entrypoint.
 */
const EXPECTED = [
  'goblinTower',
  // ⚠ 'helga', not 'princessHelga' — the recipe ID and its MODULE NAME differ (the module is
  // princessHelga.ts). Worth stating, because a plausible-looking guess at the id is exactly what
  // this pinned list is here to refuse.
  'helga',
  'laserTurret',
  'lightningHub',
  'pentagram',
  'stinkTower',
  'voltkin',
].sort();

/** Recipe MODULE basenames, which do not all match their ids — see the note above. */
const MODULES = [
  'goblinTower', 'laserTurret', 'lightningHub', 'pentagram', 'princessHelga', 'stinkTower', 'voltkin',
];

describe('registerAll is the single registration point', () => {
  it('registers every recipe from that one import alone', () => {
    const ids = listRecipes().map((r) => r.id).sort();
    expect(ids).toEqual(EXPECTED);
  });

  it('⛔ BOTH entrypoints import it — main.ts AND simWorker.ts', () => {
    /*
     * Read as SOURCE rather than executed, because the failure being guarded is an ABSENT import:
     * there is nothing to observe at runtime when a module was never loaded. This is the same shape
     * as the project's other cross-file contracts that `tsc` cannot see.
     */
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    for (const entry of ['main.ts', 'simWorker.ts']) {
      const src = readFileSync(join(process.cwd(), 'src', entry), 'utf8');
      expect(src, `${entry} must import registerAll`).toContain('godlyRecipes/registerAll.ts');
    }
  });

  it('⛔ and NEITHER entrypoint imports a recipe module directly any more', () => {
    // A direct import in one entrypoint is exactly how the two drifted apart in the first place.
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    for (const entry of ['main.ts', 'simWorker.ts']) {
      const src = readFileSync(join(process.cwd(), 'src', entry), 'utf8');
      for (const mod of MODULES) {
        expect(src, `${entry} should not import ${mod} directly — put it in registerAll.ts`)
          .not.toContain(`godlyRecipes/${mod}.ts`);
      }
    }
  });
});

/**
 * S165 (sweep Lane 3) — THE IGNITION PATH NAMES ITS SPAWNER RECIPES BY HAND, AND THAT IS EXACTLY
 * HOW THE GOBLIN TOWER NEVER IGNITED.
 *
 * `godlyMatcherCore.ts` records the defect at its own call site: S151 P3 shipped the tower's recipe,
 * predicate, anchor finder, owner resolver, teardown and thirteen tests, and REGISTERED it — into a
 * registry whose spawner matcher (`findSpawnerMatch`) has zero production callers. `runSpawnerIgnition`
 * is the only live path, and it enumerates its three recipes as three hand-written lines. So the
 * tower could be built and would simply never become a spawner.
 *
 * ⛔ THE FIX AT THE TIME WAS TO ADD THE THIRD LINE, WHICH LEAVES THE DEFECT CLASS INTACT. Register a
 * FOURTH `kind: 'spawner'` recipe and it inherits the same silence: no error, no log, nothing red —
 * the structure just completes and never produces.
 *
 * ⭐ SO THIS PINS THE TWO LISTS AGAINST EACH OTHER. Every spawner recipe in the registry must appear
 * in the ignition function's source, and vice versa. It is a source-text check because the failure
 * is an ABSENT call — there is nothing to observe at runtime for a recipe nobody asks about — the
 * same shape as the entrypoint-import contract above.
 *
 * ⚠ What it cannot catch: an ignition line that names a recipe and passes the WRONG anchor finder.
 * `runSpawnerIgnition`'s own comment about registry-order parity is the guard for that, and it is
 * prose.
 */
describe('S165 — every spawner recipe is actually wired into the ignition path', () => {
  /**
   * ⛔ COMMENTS STRIPPED, AND THE FIRST VERSION OF THIS TEST WAS VACUOUS WITHOUT IT.
   *
   * `runSpawnerIgnition` carries a long block comment about the S152 P2 defect which NAMES
   * `'goblinTower'` in prose. So a plain substring scan found the id whether or not the ignition
   * LINE existed: I deleted the real call as a negative control and the test still passed. That is
   * the same failure mode this whole session has been fixing — an assertion matching the comment
   * that explains the code rather than the code — and `damage.wired.test.ts` already carries this
   * helper for exactly that reason.
   */
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ 	]*\/\/.*$/gm, '');

  /**
   * The recipe ids that `runSpawnerIgnition` actually passes to `igniteOneSpawnerRecipe`, read off
   * comment-free source. This is the narrowest thing that means "wired": not "the file mentions the
   * id" and not "the id appears after this function", both of which passed a deleted call.
   */
  const ignitedRecipeIds = (): string[] => {
    const core = readSrc('godlyMatcherCore.ts');
    const body = core.slice(core.indexOf('export function runSpawnerIgnition'));
    return [...body.matchAll(/igniteOneSpawnerRecipe\([^;]*?,\s*'([A-Za-z]+)'\s*\)/g)]
      .map((m) => m[1] as string);
  };

  const readSrc = (rel: string): string => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    return stripComments(readFileSync(join(process.cwd(), 'src', 'state', rel), 'utf8'));
  };

  it('the registry and godlyMatcherCore agree on the spawner set', () => {
    const spawnerIds = listRecipes().filter((r) => r.kind === 'spawner').map((r) => r.id).sort();
    // Anti-vacuity: zero spawner recipes would satisfy every assertion below.
    expect(spawnerIds.length, 'no spawner recipes found — the scan is broken, not the tree')
      .toBeGreaterThan(0);

    /*
     * ⛔ MATCH THE IGNITION CALLS, NOT THE FILE. Slicing from `runSpawnerIgnition` to EOF was the
     * SECOND vacuous version of this test: `recipeStillSatisfied` sits further down with a
     * `case 'goblinTower':` arm, so the id was found in that switch whether or not the ignition line
     * existed. Deleting the real call passed twice — once through a comment, once through a
     * downstream switch — before this narrowed to the calls themselves.
     */
    const ignited = ignitedRecipeIds();
    expect(ignited.length, 'no igniteOneSpawnerRecipe calls found — the scan is broken')
      .toBeGreaterThan(0);

    for (const id of spawnerIds) {
      expect(
        ignited.includes(id),
        `'${id}' is a kind:'spawner' recipe in the registry but runSpawnerIgnition never names it. `
          + `It can be BUILT and will never produce — silently, which is the S152 P2 defect. Add `
          + `an igniteOneSpawnerRecipe line, or make the ignition registry-driven.`,
      ).toBe(true);
    }
  });

  it('and the ignition path names nothing that is NOT a registered spawner recipe', () => {
    /*
     * The other direction, which catches the tidier mistake: a recipe RENAMED or downgraded from
     * 'spawner' while its ignition line stays behind, quietly scanning for anchors that can never
     * exist. Derived from the registry rather than hand-listed so it cannot go stale.
     */
    // Widened to `Set<string>`: `ignitedRecipeIds` reads raw source text, so it yields strings
    // rather than `GodlyId` - and asserting membership is exactly the point of the check.
    const spawners = new Set<string>(
      listRecipes().filter((r) => r.kind === 'spawner').map((r) => r.id as string),
    );
    for (const id of ignitedRecipeIds()) {
      expect(
        spawners.has(id),
        `runSpawnerIgnition ignites '${id}', which is not a kind:'spawner' recipe in the registry. `
          + `Either the recipe was renamed/downgraded and this line was left behind — scanning for `
          + `anchors that can never exist — or the registry entry is wrong.`,
      ).toBe(true);
    }
  });
});
