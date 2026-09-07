/**
 * SPARK — S167 — **EVERY SPAWNER RECIPE MUST BE NAMED IN THE EMIT CHAIN.**
 *
 * ## ⛔ THE DEFECT CLASS THIS ENDS, AND IT HAS FIRED TWICE
 *
 * `hostTick`'s spawner-emit chain is a hand-written `if / else if` ladder, and until S167 its FINAL
 * arm was the pencil-chewer emit reached as a bare `else`. So every recipeId nobody had thought
 * about became a chewer factory, silently, with `tsc` green and the whole suite green.
 *
 * That is not hypothetical. Owner, S152 A1, reporting it from a playtest:
 *
 *   > *"goblin tower is passively generating pencil chewers. i think you have made this tower also
 *   > have same specs as pentagram... WRONG."*
 *
 * S166 came within one line of reproducing it six times (the tier-3 towers) and S167 would have made
 * it twelve (the tier-9 towers). Both were caught by a human reading the chain, which is exactly the
 * kind of luck a guard exists to replace.
 *
 * S167 inverted the chain — the chewer arm is now `sp.recipeId === 'pentagram'` and the default is
 * INERT — so a forgotten recipe now produces nothing instead of the wrong thing. **This file is the
 * other half:** producing nothing is a better failure, but it is still a failure, and it should be a
 * RED TEST rather than a quiet tower a player reports weeks later.
 *
 * ## Why it reads the SOURCE
 *
 * The same technique, and the same justification, as `registerAll.test.ts`'s ignition guard: the
 * chain is a hand-written ladder with no runtime table to inspect, so the only way to ask "is this
 * recipe named?" is to read the text. Comments are stripped first, so a recipe id mentioned only in
 * a docblock cannot satisfy it — which matters here, because these arms are heavily commented and an
 * id appears in prose more often than in code.
 *
 * ⚠ SO THIS GUARD IS DELIBERATELY DUMB. It asks only *"does this id appear in the chain?"*, never
 * *"does the arm do the right thing?"* A guard that tried to judge behaviour would need to model the
 * chain, and a wrong model is worse than none. Correctness of each arm is the job of
 * `goblinTowerCadence.test.ts` and `t9BossTower.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listRecipes } from './godlyRecipes/index.ts';
import './godlyRecipes/registerAll.ts';

const SRC = readFileSync(fileURLToPath(new URL('./hostTick.ts', import.meta.url)), 'utf8');

/**
 * The emit chain's own text, comments stripped.
 *
 * ⚠ BOUNDED TO THE CHAIN, not to the whole file. `hostTick.ts` is ~1700 lines and mentions most of
 * these ids somewhere; a whole-file scan would pass on a recipe that is merely *discussed* and never
 * emitted, which is precisely the failure being guarded against.
 */
function emitChainSource(): string {
  const start = SRC.indexOf("if (sp.recipeId === 'lightningHub')");
  expect(start, 'the emit chain must still start at the lightningHub arm').toBeGreaterThan(0);
  /*
   * ⚠ ANCHORED ON THE CHEWER'S OWN `creatureType`, NOT ON `sourceSpawnerId` — my first version used
   * the latter and silently sliced only the lightningHub arm, because THAT arm dispatches with a
   * `sourceSpawnerId` too. The guard reported fourteen missing recipes and was right to: it was
   * reading four lines of source. An extraction anchor has to be unique to the thing it ends at.
   */
  const end = SRC.indexOf("creatureType: 'chewer'", start);
  expect(end, 'the emit chain must still end at the chewer dispatch').toBeGreaterThan(start);
  return SRC.slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments — where these ids are mostly discussed
    .replace(/\/\/[^\n]*/g, ' '); //     line comments
}

describe('S167 — the spawner emit chain names every recipe that can reach it', () => {
  const chain = emitChainSource();
  const spawnerIds = listRecipes()
    .filter((r) => r.kind === 'spawner')
    .map((r) => r.id as string)
    .sort();

  it('is not vacuous — the registry and the extracted chain are both non-empty', () => {
    // A guard over an empty id list, or an empty source slice, passes forever.
    expect(spawnerIds.length).toBeGreaterThanOrEqual(15);
    expect(chain.length).toBeGreaterThan(500);
  });

  it('⛔ every kind:"spawner" recipe is named in the chain, by id or by its family predicate', () => {
    /*
     * The two family predicates stand in for their six ids each — `isRaceTowerId` and `isT9TowerId`
     * are exhaustive over `RACE_TOWER_IDS` / `T9_TOWER_IDS` by construction (both walk `ALL_RACES`),
     * so naming the predicate genuinely covers every member. A SEVENTH race would extend both tables
     * and stay covered; a new recipe FAMILY would not, which is the case this test is for.
     */
    const familyCovered = (id: string): boolean =>
      (id.startsWith('t3Tower') && chain.includes('isRaceTowerId(sp.recipeId)')) ||
      (id.startsWith('t9Tower') && chain.includes('isT9TowerId(sp.recipeId)'));

    const unnamed = spawnerIds.filter(
      (id) => !chain.includes(`'${id}'`) && !familyCovered(id),
    );
    expect(
      unnamed,
      `⛔ ${unnamed.join(', ')} is a kind:'spawner' recipe with NO arm in hostTick's emit chain. `
        + 'Before S167 it would have silently produced PENCIL CHEWERS (the owner-reported S152 A1 '
        + 'defect); since the chain was inverted it produces nothing at all. Either give it an arm, '
        + 'or give it an EXPLICIT EMPTY arm the way the race towers have — a recipe that emits on a '
        + 'cadence and a recipe that is fed both need to be stated, and the difference is invisible '
        + 'from here.',
    ).toEqual([]);
  });

  it('⛔ the chewer emit is NAMED, never a bare else — the default must stay inert', () => {
    /*
     * ⭐ THE ASSERTION THIS FILE EXISTS FOR. Reverting the S167 inversion — dropping back to
     * `} else if (world.tick >= sp.nextSpawnTick) {` — restores a default that turns every future
     * unnamed recipe into a chewer nest, and nothing else in the tree would notice.
     */
    expect(
      chain.includes("sp.recipeId === 'pentagram'"),
      'the chewer arm must be guarded by an explicit pentagram check',
    ).toBe(true);
    expect(
      /\}\s*else\s+if\s*\(\s*world\.tick\s*>=\s*sp\.nextSpawnTick\s*\)/.test(chain),
      '⛔ the chewer arm has been reverted to a bare tick check — the default is a trap again',
    ).toBe(false);
  });

  it('the tier-3 and tier-9 towers keep EXPLICIT arms rather than sharing one', () => {
    /*
     * They behave differently — tier-3 is FED and emits nothing on a cadence, tier-9 releases once
     * and razes itself — so a merged arm would have to branch internally, which is the shape that
     * made the original `else` dangerous. Two predicates, two arms, stated separately.
     */
    expect(chain).toContain('isRaceTowerId(sp.recipeId)');
    expect(chain).toContain('isT9TowerId(sp.recipeId)');
  });
});
