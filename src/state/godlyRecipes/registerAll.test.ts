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
