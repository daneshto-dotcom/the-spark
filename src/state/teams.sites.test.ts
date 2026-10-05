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
  'bots/botBrain.ts': 12, // S194 — + master S193 FEED: the bot's OWN spawners (`sp.ownerPlayerId === seat`); S195 T22 — +3 `prim.placedBy !== seat` (ownStructures / entropySafeSources / freshStructurePos: the bot's OWN structures, is-this-MINE)
  'dev/probeHarness.ts': 1,
  'game/invariants.ts': 1,
  'input/controls.ts': 3,
  'render/castlePanel.ts': 1,
  // S194 — `lifestealPctFor(…ownerPlayerId) === 0` (does THIS creature's seat hold lifesteal) — a regex false positive.
  'render/goblinRenderer.ts': 1,
  'render/characterSheetModel.ts': 3,
  'state/bombLifecycle.ts': 2,
  'state/bossSkillsPharaoh.ts': 1,
  'state/bossSkillsWarlord.ts': 1,
  'state/creatures/creatureAI.ts': 2,
  'state/creatures/creatureLifecycle.ts': 1,
  'state/disruptionManager.ts': 3,
  // ⭐ S194 (master S192/S193 endgame) — the PANTS' chosen VICTIM seat: its units / its colour's buildings. A
  // monster (owner 255) has no team; "whose things this pants hunts" is one seat by the endgame spec (MINE).
  'state/endgameMonsters.ts': 5, // S194 R194-27 (s194/rules) — the pants' unit victim filter is now the per-tick index KEYED by ownerPlayerId (`ownedBy`): one ownership comparison fewer, same verdict
  'state/exploredMemory.ts': 1,
  'state/gameMode.ts': 1,
  'state/gatherers/gathererLifecycle.ts': 5,
  'state/goblinAutoFeed.ts': 1, // S194 (master S193 T4) — your OWN spawner's auto-build toggle
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
  // ⭐ S193 (merged from master) — `voltkinTvOwner` counts a chain's members by COLOUR: whose TV it is (MINE).
  'state/godlyRecipes/voltkinChainWalk.ts': 1,
  'state/placeFromFree.ts': 1,
  'state/placePrimitive.ts': 3,
  'state/raceUnitEmit.ts': 1,
  'state/racial/corpseEater.ts': 1,
  'state/racial/endlessDynasty.ts': 1,
  // ⭐ S193 — two regex FALSE POSITIVES, not comparisons of seats: `spared(d.ownerPlayerId) || d.ehp === null`
  // and `spared(p.placedBy) || p.bonds.size !== 0` (the seat test is the team-aware `spared` closure).
  'state/racial/raColumn.ts': 2,
  'state/repairJobs.ts': 3, // S194 (master R191-B) — FIX jobs: your own gatherers, shapes, bank reservations
  'state/spawners/spawnerLifecycle.ts': 1, // S194 — a remembered goblin tower re-binds to its OWN owner
  'state/structureRepair.ts': 2, // S194 — + master: a weld with someone else's shape is not yours to repair
  'state/territory.ts': 2,
  'state/towerUnit.ts': 2, // S194 (master S191) — a tower's members share ONE placer (structural identity)
  'state/vision.ts': 2,
};

/** Team-predicate calls per converted file (spec §A–D). */
const PINNED_PREDICATE: Readonly<Record<string, number>> = {
  'bots/botBrain.ts': 7, // S194 — + `leaderTargetSeat` (master S193 Saboteur) never names a teammate
  'bots/botController.ts': 1,
  'bots/botRa.ts': 3,
  'bots/botScorchedEarth.ts': 1, // S193 — the bot never scorches a teammate's zone
  'input/controls.ts': 4,
  'render/characterSheetModel.ts': 7, // S194 — + master's three building cards print ALLY BUILDING
  'render/creatureProjectile.ts': 1,
  'render/damageNumbers.ts': 4,
  'render/matchBoardModel.ts': 1, // S194 — the stat board stars the winner's whole TEAM
  'render/goblinRenderer.ts': 1, // S194 — master's lifesteal motes come from the nearest ENEMY creature (visuals-racial)
  'render/wallRenderer.ts': 1,
  'state/bossSkills.ts': 1,
  'state/bossSkillsArchdemon.ts': 3,
  'state/bossSkillsKraken.ts': 2,
  'state/creatures/creatureAI.ts': 14, // S194 LOW-2 — + a weld with a TEAMMATE's end is no Voltkin target
  'state/creatures/creatureLifecycle.ts': 1,
  'state/creatures/retaliation.ts': 1,
  'state/creatures/suicideBlast.ts': 2,
  'state/creatures/voltkinChain.ts': 1,
  'state/damage.ts': 3, // S193 — + master's `alsoSparePlayerId` (the hub-popped bag) spares its TEAM
  'state/defenders/defenderLifecycle.ts': 2,
  'state/defenders/stinkTower.ts': 1,
  'state/disruptionManager.ts': 1,
  'state/droneLifecycle.ts': 5, // ⭐ S195 B-10 — + `planDroneSplash`: the three arms of the split pool spare the drone's TEAM (sameTeam)
  'state/gameMode.ts': 1,
  'state/gameState.ts': 1,
  'state/magicResistCue.ts': 3, // S194 — the RESIST cue mirrors the sim's team spare (rot, stink aura, bag)
  'state/potatoLifecycle.ts': 8, // S193 — + master's `planHubBlast`: 4 arms isEnemySeat, the connector arm 2× sameTeam
  'state/racial/corpseEater.ts': 1,
  // S193 — master moved the column to `raColumn.ts` (perk AND Pharaoh boss) and the scorch's resistance into
  // `isScorchImmune` (`scorchedEarthRules.ts`, the ONE site its docblock names); `powerOfRa.ts` and
  // `scorchedGround.ts` now hold no seat decision of their own.
  'state/racial/raColumn.ts': 2,
  'state/racial/scorchedEarthRules.ts': 1,
  'state/racial/theRisen.ts': 1,
  'state/racial/zombieDeathBlast.ts': 6, // S194 — R193-B3 "his own side" = his TEAM (5 arms; a structure: either end)
  'state/territory.ts': 3,
  'state/walls.ts': 2,
  'state/world.ts': 5,
};

/**
 * ⭐⭐ S193 — **THE SEAT-VARIABLE CENSUS: the hole the INLINE regex had.** `INLINE` only sees a comparison that
 * names a FIELD (`ownerPlayerId` / `placerColor` / `placedBy`). Master's S191–S192 work added enemy decisions
 * that compare two seat VARIABLES instead — `owner === spare` (raColumn), `seat === sparePlayerId` (damage),
 * `owner === spared` (isScorchImmune), `other === seat` (the bot scorch picker) — and every one of them was
 * invisible to the S192 census; the bot scorch picker was a live friendly-fire choice when this was written.
 *
 * `SEATVAR` matches `===`/`!==` where one side NAMES a seat (seat, other, owner, caster, spare…, allies…,
 * victim…, playerId, localPlayerId, …Seat, …Owner) and the other is not null/undefined/a literal. Each
 * file's count is PINNED; every pinned hit below was READ and classified MINE (your gatherer, your seat,
 * the local viewer, a seat-table lookup, a creature-id false positive) — none asks "is this an ENEMY?".
 * A new one turns this red until somebody routes it through `sameTeam` or pins it with the reason.
 *
 * ⚠ S193 (audit F3) — **THE HOLE THIS STILL HAS: AN ALIASED OPERAND.** Both regexes read NAMES. A seat
 * copied into a local whose name is on neither list — `const a = c.ownerPlayerId; const b = me; if (a === b)`
 * — is a seat comparison neither census can see (the auditor's mutation M4 stayed green). Widening the name
 * list until it catches `a`/`b` would pin every loop index in the tree and bury the real sites. So the
 * census is the FIRST net, not the only one: the REACH tests (`teams.reach.test.ts`,
 * `teams.reachMaster.test.ts`, `teams.reachSites.test.ts`) drive each enemy decision through the real host
 * tick with a TEAMMATE and an ENEMY side by side, and they go red on a friendly-fire bug however its
 * comparison is spelled. A new damage/target site owes its REACH pair, census or no census.
 */
const SEATNAME = String.raw`(?:[\w.?]*\b(?:seat|other|owner|caster|spare\w*|alsoSpare\w*|alliesOf|allies|victim\w*|attackerSeat|ownerSeat|zoneSeat|hoverSeat|mySeat|selfSeat|playerId|localPlayerId|\w+Seat|\w+Owner))`;
const OPERAND = String.raw`[\w.?()]+`;
const SEATVAR = new RegExp(
  String.raw`(?:${SEATNAME}\s*(?:===|!==)\s*(?!null\b|undefined\b|\d|'|")${OPERAND})|(?:(?<![=!]==\s*)${OPERAND}\s*(?:===|!==)\s*${SEATNAME}\b)`,
  'g',
);
export function countSeatVar(src: string): number {
  return (stripComments(src).match(SEATVAR) ?? []).filter(
    (x) => !/(===|!==)\s*(null|undefined)\b/.test(x) && !/^(null|undefined)\b/.test(x),
  ).length;
}
function seatVarCensus(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of productionFiles(SRC).sort()) {
    const r = rel(f);
    if (r.startsWith('arcade/') || r === 'state/teams.ts') continue; // Pitch Masters is off-limits (owner, S192)
    const n = countSeatVar(readFileSync(f, 'utf8'));
    if (n > 0) out[r] = n;
  }
  return out;
}

/** Every hit READ and classified MINE / not-a-side-decision (S193). The reason is per file. */
const PINNED_SEATVAR: Readonly<Record<string, number>> = {
  'bots/botBrain.ts': 13, // S194: + `h.targetPlayerId === seat` (is the hunter after ME?). The bot's OWN shapes/gatherers/hunter; `targetSeat` filters the already-chosen enemy's things. S195 T22: +3 own-structure sites (entropy knowledge), is-this-MINE
  'dev/fxLab.ts': 1, // dev-only effect lab: pick any other seat to stage an effect
  'dev/probeHarness.ts': 1, // dev probe: the local seat's shapes
  'input/controls.ts': 3, // your gatherer, the spark you carry
  'input/controlsCore.ts': 1, // the spark you carry
  'main.ts': 2, // the spark you carry; your own seat row
  'net/successionWarrant.ts': 1, // seat-table lookup
  'net/sync.ts': 1, // the spark you carry
  'render/avatarRenderer.ts': 3, // the local avatar
  'render/botSetupOverlay.ts': 1, // lobby seat swap
  'render/castlePanel.ts': 3, // your gatherers, the viewed seat, the selected seat
  'render/characterSheetModel.ts': 8, // S194: + master's structure/tower cards. YOURS vs not (the ALLY/ENEMY split is below it, team-aware). S195 info-ui: + `entropyRowsFor` `owner === seat` — the owner-only LOST-TO-ENTROPY row (B-17: "only the player itself will see it"), is-this-MINE, never allegiance
  'render/coherence/unitDeparture.ts': 1, // S194 T9: a host kill record matched to the SAME creature by its owner (identity, not allegiance)
  'render/concealment.ts': 1, // the local viewer's own things are never concealed
  'render/damageNumbers.ts': 2, // a kill-hit keyed by its owner; `o.id === victim` is a creature id
  'render/lobbyStateMachine.ts': 2, // seat-table rows
  // ⭐ S194 T10 — the stat board v2 (render-only, reads INERT counters; none of these is an ENEMY decision):
  'render/matchBoard.ts': 4, // the heatmap diagonal (a seat's SELF-hits cell); the hovered cell's grid INDICES; the page's own seat's per-wave dealt/taken series (×2)
  'render/matchBoardModel.ts': 7, // the MONSTERS sentinel label + colour (×2); a wave-sample row lookup; the seat's own peak-connector scan; TAKEN FROM skips the seat itself (its self-hits are listed as ITSELF); the LOCAL viewer's row; DEALT TO drops the self-hit key
  'render/matchBoardTips.ts': 3, // the heatmap's diagonal cell (→ ITSELF); the ledger's own seat's dealt/taken series (×2)
  'render/raAimPreview.ts': 1, // memo key
  'render/scorchedEarthAim.ts': 1, // memo key
  'render/severToastRenderer.ts': 2, // a toast for YOUR bond; actor === victim (self-sever wording)
  'render/sudokuOverlay.ts': 1, // who solved it
  'render/ui.ts': 1, // the local row
  'render/zoneBackgroundRenderer.ts': 1, // the hovered zone
  'state/bossSkillsArchdemon.ts': 2, // `allies` is a COUNT compared for the best cluster
  'state/creatures/creatureAI.ts': 1, // S194 (master endgame) — the PANTS marches on its ONE chosen seat (monster, no team)
  'state/creatures/creatureLifecycle.ts': 1, // whose bond a creature was cutting (victim bookkeeping)
  'state/creatures/retaliation.ts': 3, // creature ids
  'state/damage.ts': 4, // S194: + master CF-1 `mixedWeld` (a weld's carry owner). CARRY-1: the carry stays on the struck bond's OWNER (MINE, narrower than team); `alliesOf` excludes his own seat
  'state/endgameMonsters.ts': 1, // S194 — the pants' victim seat's units (monster, no team); R194-27 (s194/rules) moved the unit half into the owner-keyed index
  'state/exploredMemory.ts': 1, // the local viewer's shapes
  'state/gatherers/gathererLifecycle.ts': 3, // your gatherer
  'state/goblinAutoFeed.ts': 1, // S194 — your own spawner
  'state/goblinKinds.ts': 2, // the goblin tower's owner
  'state/goblinTowerFeed.ts': 1, // your goblin tower
  'state/godlyMatcherCore.ts': 3, // a recipe's owner
  'state/godlyOrchestration.ts': 2, // cinematic owner / the local seat
  'state/hostTick.ts': 1, // seat-table lookup (forfeit)
  'state/matchStats.ts': 2, // S194 (master S191) — stat credit: a seat's damage to ITSELF is not "dealt" (a teammate's cannot happen)
  'state/placeFromFree.ts': 2, // the local seat's own action
  'state/placePrimitive.ts': 1, // the local seat's own action
  'state/potatoLifecycle.ts': 1, // `alliesOf` excludes the boss's own seat (spec Q5)
  'state/raceUnitEmit.ts': 1, // your race units
  'state/racial/corpseEater.ts': 1, // creature id
  'state/racial/endlessDynasty.ts': 1, // your mummies
  'state/racial/raColumn.ts': 1, // `alliesOf` excludes the Pharaoh's own seat
  'state/racial/scorchedEarthRules.ts': 1, // a fallen caster's OWN zone keeps burning
  'state/save.ts': 1, // default race for a seat
  'state/sparkLifecycle.ts': 1, // the local seat's own action
  'state/repairJobs.ts': 7, // S194 (master R191-B) — your own gatherers / jobs / shapes / bank
  'state/spawners/spawnerLifecycle.ts': 1, // S194 — a remembered goblin tower's own owner
  'state/structureRepair.ts': 3, // a zone's owner; you repair your own (S194: + the weld check)
  'state/towerMembers.ts': 1, // bond ids
  'state/voltkinTv.ts': 1, // a Voltkin claim binds to its OWN seat's TV
  'state/zones.ts': 1, // a zone's owner
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

  it('⛔ S193 — SEAT-VARIABLE comparisons are exactly the pinned, classified sites — a new one must be classified', () => {
    expect(
      seatVarCensus(),
      'A production file gained (or lost) a seat-VARIABLE comparison (`owner === spare`, `other === seat`). If it ' +
        'asks "is this an ENEMY?", route it through sameTeam / isEnemySeat (state/teams.ts). If it asks "is this ' +
        'MINE?", update PINNED_SEATVAR with the reason.',
    ).toEqual(PINNED_SEATVAR);
  });

  it('⭐ MUTATION (S193) — reverting the bot scorch picker to `other === seat` is SEEN by the seat-variable census', () => {
    const src = readFileSync(join(SRC, 'bots/botScorchedEarth.ts'), 'utf8');
    const site = 'sameTeam(world, other, seat)';
    expect(src.includes(site), 'the mutation target moved — update this test').toBe(true);
    const reverted = src.replace('if (sameTeam(world, other, seat)) continue;', 'if (other === seat) continue;');
    expect(countSeatVar(src)).toBe(0);
    expect(countSeatVar(reverted)).toBe(1);
    expect(countPredicate(reverted)).toBe(countPredicate(src) - 1);
    // master's pre-teams forms, each of which the S192 INLINE regex could not see:
    for (const old of ['return owner === spared;', 'spare !== null && owner === spare;', '(sparePlayerId !== null && seat === sparePlayerId)']) {
      expect(countInline(old), `INLINE is blind to ${old}`).toBe(0);
      expect(countSeatVar(old), `SEATVAR sees ${old}`).toBeGreaterThan(0);
    }
    expect(countSeatVar('// other === seat'), 'a comment does not count').toBe(0);
  });

  it('⭐ MUTATION (S194) — reverting the zombie death blast to the pre-teams `=== spare` is SEEN by all three counters', () => {
    const src = readFileSync(join(SRC, 'state/racial/zombieDeathBlast.ts'), 'utf8');
    const site = 'sameTeam(world, c.ownerPlayerId, spare)';
    expect(src.includes(site), 'the mutation target moved — update this test').toBe(true);
    const reverted = src.replace(site, 'c.ownerPlayerId === spare');
    expect(countInline(reverted)).toBe(countInline(src) + 1);
    expect(countSeatVar(reverted)).toBe(countSeatVar(src) + 1);
    expect(countPredicate(reverted)).toBe(countPredicate(src) - 1);
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
