/**
 * SPARK — S168 — **EVERY `CreatureType` IS DRAWN BY SOMEBODY.**
 *
 * ## ⛔ The prophecy this file exists to retire
 *
 * `goblinRenderer.ts` has carried the same warning since S166, restated in S167:
 *
 * > *"a `CreatureType` absent from here is simulated, serialized, hashed and INVISIBLE. Nothing in
 * > `tsc` or the suite catches that: this Set is hand-maintained and no test file in the tree
 * > imports it."*
 *
 * It was right, twice over. `GOBLIN_KINDS` was module-private, so no test COULD import it — the
 * warning named its own remedy and then ruled it out. In S168 the Orc Warlord's **direwolf** became
 * the first type to fall in: it summoned in threes on a 15 s cadence, walked, struck for 24 fifths a
 * swing, killed things and died, and **never drew a single pixel**. `tsc` was green, 4104 tests were
 * green, `check:atlas` was green.
 *
 * ## Why an exhaustive Record would not have caught it either
 *
 * The compile-time coverage contracts in this repo (`CREATURE_CONFIGS`, `CREATURE_TARGETS`,
 * `CREATURE_ROLES`) all worked perfectly for the direwolf — `tsc` demanded every one of them and I
 * filled them in. Rendering is not expressible that way: the three renderers are *filters*, not
 * tables, and "no renderer claims this type" is a property of their UNION, which no single
 * declaration can state. So it has to be a test, and this is it.
 */

import { describe, expect, it } from 'vitest';
import { CREATURE_CONFIGS } from '../state/creatures/voltkin-config.ts';
import { GOBLIN_KINDS } from './goblinRenderer.ts';
import type { CreatureType } from '../state/creatures/creature.ts';

/**
 * The types the OTHER two sprite renderers claim, transcribed from their own gates:
 *   · `creatureRenderer.ts` — `if (!isVoltkin && !isDrone) continue;`
 *   · `chewerRenderer.ts`   — `if (c.type !== 'chewer') continue;`
 *
 * ⚠ Hand-transcribed on purpose. Both gates are inline boolean expressions rather than Sets, so
 * there is nothing importable to point at; if either renderer ever drops a type, THIS list is the
 * thing that has to be corrected, and the test below will still be asking the right question.
 */
const OTHER_RENDERERS: ReadonlySet<CreatureType> = new Set<CreatureType>([
  'voltkin',
  'lightningDrone',
  'chewer',
  /*
   * ⭐ S171 (owner R142) — the locust cloud, drawn by `render/locustCloud.ts` into the goblin
   * renderer's existing Graphics (no new display object — the `fogHiddenLayer` index trap).
   *
   * ⚠ CLAIMED HERE RATHER THAN ADDED TO `GOBLIN_KINDS`, and the distinction is the point of this
   * file. Putting it in `GOBLIN_KINDS` would have satisfied this test by giving it the procedural
   * GOBLIN puppet — a humanoid — which is not a swarm of insects by any reading. This guard exists
   * to catch a type that DRAWS NOTHING; satisfying it with the wrong drawing would be gaming it.
   */
  'locustCloud',
]);

describe('S168 — no CreatureType is invisible', () => {
  it('CONTROL — the roster is populated, so an empty pass would not be a pass', () => {
    expect(Object.keys(CREATURE_CONFIGS).length).toBeGreaterThanOrEqual(22);
  });

  /*
   * ⭐⭐ THE ASSERTION. Every type the sim can mint must be claimed by exactly one of the three
   * renderers. A type in `GOBLIN_KINDS` but missing from `ATLASES` is FINE — it falls through to the
   * procedural puppet, which is the graceful case and is how the direwolf ships while the owner
   * generates its sprite. A type in NEITHER set is the invisible case, and that is what fails here.
   */
  it('⭐⭐ every CreatureType is claimed by a renderer — the direwolf was not', () => {
    const orphans = (Object.keys(CREATURE_CONFIGS) as CreatureType[]).filter(
      (t) => !GOBLIN_KINDS.has(t) && !OTHER_RENDERERS.has(t),
    );
    expect(
      orphans,
      `these types simulate, serialize and hash but DRAW NOTHING: ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('⛔ and no type is claimed TWICE — two renderers would double-draw it', () => {
    const doubled = [...GOBLIN_KINDS].filter((t) => OTHER_RENDERERS.has(t));
    expect(doubled, `claimed by two renderers: ${doubled.join(', ')}`).toEqual([]);
  });

  /*
   * The direwolf pinned by name as well as by the sweep, for the reason the hudLayout suite gives:
   * a regression report should say WHICH defect came back, not merely that some pair is wrong.
   */
  it('⭐ the direwolf specifically — the type that proved the warning was real', () => {
    expect(GOBLIN_KINDS.has('direwolf')).toBe(true);
  });
});
