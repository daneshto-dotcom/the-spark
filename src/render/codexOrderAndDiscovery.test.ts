/**
 * SPARK — S175 P5: THE CODEX'S TIER ORDER (c), AND THE DISCOVERY-REMOVAL ASSERTIONS (b) THAT WERE OWED.
 *
 * ⛔ **THIS FILE PAYS A DEBT THAT WAS EXPLICITLY LOGGED AS UNPAID.** S174's codex agent died on a
 * usage limit mid-edit. Its work landed; its TESTS did not, and the imports it had staged as
 * scaffolding (fs/join, the module namespaces, FOOTER_BASE, drawEmblem) had to be stripped because
 * `noUnusedLocals` turns an orphaned import into a build failure. The marker left at the top of
 * `codexOverlay.test.ts` says it plainly: *"the ASSERTIONS ARE STILL OWED. Do not read their absence
 * as coverage."* Two sessions later, this is them.
 *
 * (b) is the DISCOVERY GATE. Owner: *"all the ones that are hidden, that are undiscovered yet —
 * that's silly, because I've obviously discovered all of them, I play all the games … It should ALL
 * be discovered right from the start."*
 *
 * (c) is the TIER ORDER. Owner S174: *"stink tower is last. It should be by tier as well — tier
 * three, tier four, tier five."* Owner S175, asked whether tier means nodes or connectors:
 * *"Yes. It's by connectors. So if it's in the wrong one in game, so let's move them as well to tier
 * three or whatnot."*
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FOOTER_BASE } from './codexOverlay.ts';
import { ALL_BLUEPRINT_IDS, blueprintCost, blueprintFor } from '../state/blueprints.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';

const SRC = (rel: string): string => readFileSync(join(process.cwd(), 'src', rel), 'utf8');

/* ─────────────────────────── (b) THE DISCOVERY GATE IS GONE ─────────────────────────── */

describe('S175 P5 (b) — the discovery gate is removed, and stays removed', () => {
  it('⛔ codexStore.ts does not exist anywhere in the tree', () => {
    for (const p of ['state/codexStore.ts', 'render/codexStore.ts']) {
      expect(() => SRC(p), `${p} came back — the discovery gate was re-introduced`).toThrow();
    }
  });

  /**
   * ⚠ SOURCE-TEXT ASSERTION, DELIBERATELY. The removed thing is the ABSENCE of a mechanism, and an
   * absence cannot be exercised. The alternative — asserting some observable is now always true —
   * would pass just as well against a gate that had been re-added but defaulted to unlocked, which
   * is precisely the regression the owner would notice and this test would not.
   */
  it('⛔ the "entries reveal through play" footer clause is gone from the footer constant', () => {
    expect(FOOTER_BASE).not.toMatch(/reveal/i);
    expect(FOOTER_BASE).toBe('press G+C in-game to open the codex');
  });

  it('⛔ no discovery vocabulary survives in the codex overlay OUTSIDE its own history comments', () => {
    const code = SRC('render/codexOverlay.ts')
      // Strip block and line comments: this file documents the deleted gate at length, on purpose,
      // and those paragraphs must not be what keeps this test green OR what turns it red.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    for (const banned of ['codexStore', 'isDiscovered', 'connect to reveal', 'reveal through play']) {
      expect(code, `"${banned}" is live code in codexOverlay.ts`).not.toContain(banned);
    }
  });

  it('the ??? placeholder card is not rendered by live code', () => {
    const code = SRC('render/codexOverlay.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/['"`]\?\?\?['"`]/);
  });
});

/* ─────────────────────────── (c) THE TIER ORDER ─────────────────────────── */

/** The ladder exactly as `main.ts` computes it for the grid. */
function ladderRank(id: GodlyId): readonly [number, number] {
  const bp = blueprintFor(id);
  return [bp.bonds.length, blueprintCost(id)];
}

function sortedIds(): GodlyId[] {
  return ALL_BLUEPRINT_IDS.slice().sort((a, b) => {
    const [at, ac] = ladderRank(a);
    const [bt, bc] = ladderRank(b);
    return at - bt || ac - bc || a.localeCompare(b);
  });
}

describe('S175 P5 (c) — the grid is ordered by CONNECTOR count (owner R175-A)', () => {
  it('⭐ tier is bonds, not nodes — and for the stink tower those two DISAGREE', () => {
    const bp = blueprintFor('stinkTower');
    expect(bp.nodes.length, 'a hub and three leaves').toBe(4);
    expect(bp.bonds.length, 'but only three connectors — which is the tier').toBe(3);
  });

  it('⭐ the order is non-decreasing in connector count', () => {
    const tiers = sortedIds().map((id) => blueprintFor(id).bonds.length);
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]!).toBeGreaterThanOrEqual(tiers[i - 1]!);
  });

  it('⭐ the six tier-9 boss towers are LAST, and the tier-3 race towers FIRST', () => {
    const ids = sortedIds();
    expect(ids.slice(0, 6).every((i) => i.startsWith('t3Tower'))).toBe(true);
    expect(ids.slice(-6).every((i) => i.startsWith('t9Tower'))).toBe(true);
  });

  /**
   * ⚠ THIS CASE RECORDS A DELIBERATE PARTIAL ANSWER, so a later session does not "fix" it.
   * He said *"stink tower is last"* (S174) and *"it's by connectors"* (S175). Those two sentences
   * disagree, because the stink tower has only three bonds. The later, more specific ruling wins:
   * it sorts into tier 3, and the COST tie-break puts it last within that tier — the most the
   * ordering can honour the earlier sentence without contradicting the newer one. Moving it up a
   * tier is a recipe change in the game, which is exactly what he said to do about it.
   */
  it('⚠ the stink tower is last WITHIN tier 3, not last overall — the ruling, not a bug', () => {
    const tier3 = sortedIds().filter((id) => blueprintFor(id).bonds.length === 3);
    expect(tier3).toHaveLength(7);
    expect(tier3.at(-1)).toBe('stinkTower');
    expect(blueprintCost('stinkTower')).toBeGreaterThan(blueprintCost('t3TowerOrcs'));
  });

  it('⛔ the order does not depend on module-evaluation order (the defect this replaces)', () => {
    // Reversing the input must produce the identical ordering: a total order, not a stable shuffle.
    const forward = sortedIds();
    const backward = ALL_BLUEPRINT_IDS.slice().reverse().sort((a, b) => {
      const [at, ac] = ladderRank(a);
      const [bt, bc] = ladderRank(b);
      return at - bt || ac - bc || a.localeCompare(b);
    });
    expect(backward).toEqual(forward);
  });

  it('main.ts sorts the codex grid rather than trusting registry order', () => {
    const main = SRC('main.ts');
    expect(main).toMatch(/listRecipes\(\)[\s\S]{0,200}\.sort\(/);
    expect(main).toContain('blueprintFor');
  });
});
