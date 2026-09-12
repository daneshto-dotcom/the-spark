/**
 * SPARK — S169 (owner playtest) — THE GREEN PROCEDURAL GOBLIN WAS A LOAD WINDOW, 50 MiB WIDE.
 *
 * Owner, verbatim: *"why is this silly goblin warrior being generated from the castle all of a
 * sudden? you screwed something up. we have changed that a while ago"* and *"why is the castle
 * generating the race spawn + this goblin we had from like 15 sessions ago or more.... before we
 * even generated the normal goblins."*
 *
 * ## ⛔ IT WAS NEVER A SPAWN BUG, AND THAT IS WHY IT WAS WORTH CHASING
 *
 * Nothing in the sim emits a legacy goblin at a castle. `raceUnitEmit.ts` dispatches `raceUnit` and
 * nothing else; the tier-3 tower dispatches `RACE_TOWER_UNIT[race]`. What he was looking at is
 * `drawGoblin` — the procedural puppet, which draws in green and IS the pre-veo look of this game,
 * i.e. literally "the goblin we had before we even generated the normal goblins". It is the
 * atlas-load fallback, kept deliberately (`goblinRenderer.coverage.test.ts` records the trade:
 * visible-and-wrong beats invisible, because an unrendered creature still fights and kills).
 *
 * ## ⛔ SO THE DEFECT WAS THE WIDTH OF THE WINDOW, MEASURED
 *
 * `ensureAtlases` looped the whole `ATLASES` table on first sync: **50.53 MiB across 18 sheets** —
 * 8.18 MiB of goblins, 10.34 MiB of tier-3 units, and 32.02 MiB of tier-9 bosses. A seat has ONE
 * race (R110), so at most one tier-3 sheet and one boss sheet can ever be drawn on its behalf, and
 * the one the player actually needed was queued behind up to sixteen it never would. Every unit
 * emitted inside that window drew as a green puppet.
 *
 * The fix is the precedent this same file already set: `ensureRaceAtlas` went lazy-per-race in S165
 * on exactly this arithmetic (*"loading all six eagerly would spend ~31 MB of texture memory on
 * races nobody is playing"*). The tier-3 and tier-9 tables were the two that missed it.
 *
 * ## ⭐ WHAT THIS FILE PINS, AND WHY EACH ASSERTION EXISTS
 *
 * Going lazy trades a load-time cost for a REACHABILITY obligation: a sheet nobody fetches is a
 * permanent green puppet, which is strictly worse than the slow load it replaced. So the contract
 * is that every `ATLASES` key is reachable by SOME path — eager, per-race preload, or the draw-loop
 * safety net — and that is what is asserted here rather than the loading itself (fetch is async I/O
 * against a browser `Assets` cache; this suite has no DOM).
 */

import { describe, expect, it } from 'vitest';
import { ATLASES, EAGER_ATLAS_TYPES, GOBLIN_KINDS } from './goblinRenderer.ts';
import { RACE_TOWER_UNIT } from '../state/raceTowerIds.ts';
import { T9_BOSS_TYPE } from '../state/t9BossIds.ts';
import { ALL_RACES } from '../state/races.ts';
import type { CreatureType } from '../state/creatures/creature.ts';

/** Every type `preloadRaceKit` warms, across all six races — the per-race half of the contract. */
const PRELOADED: ReadonlySet<CreatureType> = new Set<CreatureType>([
  ...ALL_RACES.map((r) => RACE_TOWER_UNIT[r]),
  ...ALL_RACES.map((r) => T9_BOSS_TYPE[r]),
]);

describe('S169 — lazy race-keyed atlases stay reachable', () => {
  it('⛔⛔ EVERY `ATLASES` key is reachable — eager, preloaded, or drawn by this renderer', () => {
    // The draw-loop net (`ensureTypeAtlas`) only fires for types this renderer actually draws, so
    // "in GOBLIN_KINDS" is the third arm and not a catch-all. A key in none of the three would be
    // fetched by nobody: a permanent green puppet, silently.
    for (const key of Object.keys(ATLASES) as CreatureType[]) {
      const reachable =
        EAGER_ATLAS_TYPES.has(key) || PRELOADED.has(key) || GOBLIN_KINDS.has(key);
      expect(
        reachable,
        `'${key}' has an atlas path but no load path: it is not eager, not warmed by `
          + `preloadRaceKit, and not drawn by goblinRenderer — so it would render as the green `
          + `procedural puppet forever. Add it to EAGER_ATLAS_TYPES or to preloadRaceKit.`,
      ).toBe(true);
    }
  });

  it('⭐ the eager set is EXACTLY the six goblins — nothing race-keyed crept back in', () => {
    // This is the assertion that would go red if someone "fixed" a puppet by making a boss sheet
    // eager again, quietly restoring 32 MiB to first sync.
    expect([...EAGER_ATLAS_TYPES].sort()).toEqual(
      ['goblinArcher', 'goblinBat', 'goblinHound', 'goblinMelee', 'goblinShield', 'goblinSuicide'],
    );
  });

  it('⭐ and no race-keyed sheet is eager — the 50 MiB regression, stated as a rule', () => {
    for (const r of ALL_RACES) {
      expect(
        EAGER_ATLAS_TYPES.has(RACE_TOWER_UNIT[r]),
        `tier-3 unit for ${r} must be lazy`,
      ).toBe(false);
      expect(
        EAGER_ATLAS_TYPES.has(T9_BOSS_TYPE[r]),
        `tier-9 boss for ${r} must be lazy`,
      ).toBe(false);
    }
  });

  it('⭐ every race`s three sheets have an atlas path at all (a typo here is silent)', () => {
    // `ATLASES` is Partial<>, so a missing entry is not a type error — it is a green puppet. The
    // per-race sheets are the ones `preloadRaceKit` names, so a gap here defeats the preload.
    for (const r of ALL_RACES) {
      expect(ATLASES[RACE_TOWER_UNIT[r]], `tier-3 path for ${r}`).toBeTypeOf('string');
      expect(ATLASES[T9_BOSS_TYPE[r]], `tier-9 path for ${r}`).toBeTypeOf('string');
    }
  });

  it('CONTROL — the table is non-empty and the scan is not vacuous', () => {
    expect(Object.keys(ATLASES).length).toBeGreaterThanOrEqual(18);
  });
});

/**
 * ⭐⭐ S173 B5 (owner playtest) — **THE INVERSE OF THE CONTRACT ABOVE, AND IT IS THE HALF THAT WAS
 * MISSING.**
 *
 * Owner, playing ORCS over the internet: *"when you're playing as orcs, after wave three, the castle
 * starts spawning the original shitty little goblin melees ... we already have the right orc spawn
 * that the castle is supposed to spawn, the creature type, the little orc warriors. And then
 * starting with wave three it's like taking us back thirty sessions when we had those goblin, like,
 * the little tiny green. That's not correct. It should only generate the orcs."*
 *
 * ⛔ THE SIM IS NOT THE CULPRIT AND THAT IS PROVEN, NOT ASSUMED — `raceUnitEmit.test.ts`'s S173 B5
 * block drives the REAL `runHostTick` wave loop as orcs through wave 5 and every castle-born unit is
 * `raceUnit`, at every wave. `waveNumber` has exactly ONE consumer in the whole tree
 * (`waveSpawnMultiplier`, the shape-arrival rate), so there is no wave-indexed creature ladder to
 * fall off. Enumerating every production `SPAWN_CREATURE` site leaves ONE type an orc seat can field
 * that draws as the green procedural goblin: the Warlord's **direwolf**, which had no `ATLASES`
 * entry.
 *
 * ⛔ AND IT WAS AN EXEMPTION THIS SUITE HAD WRITTEN DOWN AND DEFENDED. `goblinRenderer.coverage`
 * states the principle exactly right for the locust cloud — *"satisfying it with the wrong drawing
 * would be gaming it"*, because a humanoid puppet is not a swarm of insects — and then let the
 * direwolf ship as that same humanoid puppet, on the grounds that the owner would supply art later.
 * He played it first. A wolf drawn as a green goblin with a cleaver is the wrong drawing by the
 * suite's own test, and it is orc-EXCLUSIVE, which is why the report names a race.
 *
 * ⚠ THE ASSERTION IS DELIBERATELY OVER ALL SIX RACES' UNITS, not over the direwolf alone. He
 * happened to be playing orcs; the rule is that NOTHING this renderer claims falls through to
 * `drawGoblin` in a shipped build.
 */
describe('S173 B5 — nothing this renderer claims draws as the legacy green goblin', () => {
  /**
   * `raceUnit` is the one legitimate absentee: it is ONE `CreatureType` for six races, so its sheet
   * is resolved at draw time from `player.raceId` (`RACE_UNIT_ATLAS_BASE`) rather than from this
   * type-keyed table. The six sheets it resolves to are pinned on disk by `raceUnitFrames.test.ts`.
   */
  const RACE_KEYED: ReadonlySet<CreatureType> = new Set<CreatureType>(['raceUnit']);

  it('⛔⛔ every GOBLIN_KINDS type has real art — a gap here IS the owner`s green goblin', () => {
    const puppets = [...GOBLIN_KINDS].filter(
      (t) => !RACE_KEYED.has(t) && ATLASES[t] === undefined,
    );
    expect(
      puppets,
      `these types are drawn by goblinRenderer but have no atlas, so they fall through to `
        + `drawGoblin — the green procedural puppet the owner calls "the little tiny green" and `
        + `"taking us back thirty sessions": ${puppets.join(', ')}. Give each one an ATLASES entry `
        + `(a placeholder sheet that reads as the right KIND of creature beats a humanoid goblin) `
        + `or move it to a renderer that draws it properly.`,
    ).toEqual([]);
  });

  it('⭐ the direwolf specifically — the type the owner reported, pinned by name', () => {
    // By name as well as by the sweep, the `hudLayout` rule: a regression report should say WHICH
    // defect came back, not merely that some member of a set is wrong.
    expect(ATLASES.direwolf, 'the Orc Warlord`s wolf must not draw as a goblin').toBeTypeOf('string');
  });

  it('CONTROL — the scan is not vacuous', () => {
    expect(GOBLIN_KINDS.size).toBeGreaterThanOrEqual(20);
  });
});
