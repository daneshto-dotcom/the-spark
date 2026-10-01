/**
 * ⭐⭐ S192 (owner R192-T1) — **THE TEAMS SITE CENSUS. A friendly-fire bug is a site nobody converted.**
 *
 * `S192_TEAMS_SPEC.md` §(a) lists every "is this an enemy?" decision in the tree at file:line, and
 * every one now asks `state/teams.ts`. Prose cannot hold that list (CLAUDE.md, parallel-split lesson 2:
 * *"a source-text guard proves a line EXISTS"*), so this file makes it MECHANICAL, two ways:
 *
 *   1. **INLINE** — every production file's count of inline owner comparisons
 *      (`ownerPlayerId` / `placerColor` / `placedBy` beside `===` / `!==`) is PINNED. What remains are
 *      the OWNERSHIP sites the spec's list E names (*"is this MINE?"* — your gatherer, your shape, the
 *      tower's owner), which are correctly seat equality. A NEW inline comparison anywhere turns this
 *      red until somebody decides which kind it is: an ENEMY test goes through `sameTeam`/`isEnemySeat`/
 *      `sameTeamColor`; a MINE test raises the pin here with the reason in the commit.
 *   2. **PREDICATE** — every converted file's count of team-predicate calls is PINNED, so reverting a
 *      converted site to an inline comparison moves BOTH numbers and cannot pass unseen.
 *
 * The mutation test at the bottom proves the counter sees the shape it guards: it reverts one real
 * converted site in memory and asserts both pins would go red.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');

function productionFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) productionFiles(full, out);
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.includes('.fixtures.')) out.push(full);
  }
  return out;
}
const rel = (p: string): string => p.slice(SRC.length + 1).split('\\').join('/');

/** Comments are prose, not decisions — stripped so a docblock quoting `a === b` never counts. */
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const INLINE =
  /\b(ownerPlayerId|placerColor|placedBy)\b[^;\n]{0,24}(===|!==)|(===|!==)\s*[\w.?]*\b(ownerPlayerId|placerColor|placedBy)\b/g;
const PREDICATE = /\b(sameTeam|isEnemySeat|sameTeamColor|wallSeparatesSides)\(/g;

export function countInline(src: string): number {
  return (stripComments(src).match(INLINE) ?? []).length;
}
export function countPredicate(src: string): number {
  return (stripComments(src).match(PREDICATE) ?? []).length;
}

function census(): { inline: Record<string, number>; predicate: Record<string, number> } {
  const inline: Record<string, number> = {};
  const predicate: Record<string, number> = {};
  for (const f of productionFiles(SRC).sort()) {
    const r = rel(f);
    const src = readFileSync(f, 'utf8');
    const a = countInline(src);
    const b = countPredicate(src);
    if (a > 0) inline[r] = a;
    if (b > 0 && r !== 'state/teams.ts') predicate[r] = b;
  }
  return { inline, predicate };
}

/**
 * The OWNERSHIP sites that remain inline (spec §E). Every entry is "is this MINE?", never "is this an
 * ENEMY?" — e.g. `gathererLifecycle` (your hauler), `placePrimitive` (your shape), the recipe owner
 * resolvers, `disruptionManager` (whether a sever touches a shape that is not your COLOUR, which sets
 * the charge — the teammate refusal sits above it), `characterSheetModel` (YOURS vs not, before the
 * ALLY/ENEMY split).
 */
const PINNED_INLINE: Readonly<Record<string, number>> = {
  'bots/botBrain.ts': 8,
  'dev/probeHarness.ts': 1,
  'game/invariants.ts': 1,
  'input/controls.ts': 3,
  'render/castlePanel.ts': 1,
  'render/characterSheetModel.ts': 3,
  'state/bombLifecycle.ts': 2,
  'state/bossSkillsPharaoh.ts': 1,
  'state/bossSkillsWarlord.ts': 1,
  'state/creatures/creatureAI.ts': 2,
  'state/creatures/creatureLifecycle.ts': 1,
  'state/disruptionManager.ts': 3,
  'state/exploredMemory.ts': 1,
  'state/gameMode.ts': 1,
  'state/gatherers/gathererLifecycle.ts': 5,
  'state/goblinKinds.ts': 2,
  'state/goblinTowerFeed.ts': 1,
  'state/godlyMatcherCore.ts': 2,
  'state/godlyRecipes/goblinTower.ts': 1,
  'state/godlyRecipes/laserTurret.ts': 1,
  'state/godlyRecipes/lightningHub.ts': 1,
  'state/godlyRecipes/pentagram.ts': 1,
  'state/godlyRecipes/princessHelga.ts': 1,
  'state/godlyRecipes/raceTower.ts': 1,
  'state/godlyRecipes/stinkTower.ts': 1,
  'state/godlyRecipes/t9BossTower.ts': 1,
  'state/placeFromFree.ts': 1,
  'state/placePrimitive.ts': 3,
  'state/raceUnitEmit.ts': 1,
  'state/racial/corpseEater.ts': 1,
  'state/racial/endlessDynasty.ts': 1,
  'state/structureRepair.ts': 1,
  'state/territory.ts': 2,
  'state/vision.ts': 2,
};

/** Team-predicate calls per converted file (spec §A–D). */
const PINNED_PREDICATE: Readonly<Record<string, number>> = {
  'bots/botBrain.ts': 6,
  'bots/botController.ts': 1,
  'bots/botRa.ts': 3,
  'input/controls.ts': 4,
  'render/characterSheetModel.ts': 4,
  'render/creatureProjectile.ts': 1,
  'render/damageNumbers.ts': 4,
  'render/wallRenderer.ts': 1,
  'state/bossSkills.ts': 1,
  'state/bossSkillsArchdemon.ts': 3,
  'state/bossSkillsKraken.ts': 2,
  'state/creatures/creatureAI.ts': 13,
  'state/creatures/creatureLifecycle.ts': 1,
  'state/creatures/retaliation.ts': 1,
  'state/creatures/suicideBlast.ts': 2,
  'state/creatures/voltkinChain.ts': 1,
  'state/damage.ts': 2,
  'state/defenders/defenderLifecycle.ts': 2,
  'state/defenders/stinkTower.ts': 1,
  'state/disruptionManager.ts': 1,
  'state/droneLifecycle.ts': 2,
  'state/gameMode.ts': 1,
  'state/gameState.ts': 1,
  'state/potatoLifecycle.ts': 2,
  'state/racial/corpseEater.ts': 1,
  'state/racial/powerOfRa.ts': 2,
  'state/racial/scorchedGround.ts': 1,
  'state/racial/theRisen.ts': 1,
  'state/territory.ts': 3,
  'state/walls.ts': 2,
  'state/world.ts': 5,
};

describe('S192 — the teams site census (every enemy decision asks the team predicate)', () => {
  const { inline, predicate } = census();

  it('⭐ the census sees the tree (non-vacuous)', () => {
    expect(Object.keys(predicate).length).toBeGreaterThan(30);
    expect(Object.keys(inline).length).toBeGreaterThan(10);
  });

  it('⛔ INLINE owner comparisons are exactly the pinned OWNERSHIP sites — a new one must be classified', () => {
    expect(
      inline,
      'A production file gained (or lost) an inline owner comparison. If it asks "is this an ENEMY?", ' +
        'route it through sameTeam / isEnemySeat / sameTeamColor (state/teams.ts) — a missed one is a ' +
        'friendly-fire bug. If it asks "is this MINE?", update PINNED_INLINE with the reason in the commit.',
    ).toEqual(PINNED_INLINE);
  });

  it('⛔ every converted site still asks the team predicate', () => {
    expect(
      predicate,
      'A file lost (or gained) a team-predicate call. Reverting a converted site to an inline ' +
        'comparison re-opens friendly fire in team games — S192_TEAMS_SPEC.md §(a) lists them.',
    ).toEqual(PINNED_PREDICATE);
  });

  it('⭐ MUTATION — reverting one real converted site moves BOTH pins', () => {
    const path = join(SRC, 'state/creatures/creatureAI.ts');
    const src = readFileSync(path, 'utf8');
    const site = 'sameTeam(world, c.ownerPlayerId, ownerPlayerId)';
    expect(src.includes(site), 'the mutation target moved — update this test').toBe(true);
    const reverted = src.replace(site, 'c.ownerPlayerId === ownerPlayerId');
    expect(countInline(reverted)).toBe(countInline(src) + 1);
    expect(countPredicate(reverted)).toBe(countPredicate(src) - 1);
    // …and a comment quoting the old form does not count.
    expect(countInline(`${src}\n// c.ownerPlayerId === ownerPlayerId`)).toBe(countInline(src));
  });
});
