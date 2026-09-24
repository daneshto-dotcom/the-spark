/**
 * SPARK — S180: **THE CANON IS PINNED TO THE CODE.**
 *
 * `SPARK_CANON.md` is the page a session reads to answer "is X still in the game?" and "how much
 * does Y hit for?". This file is what stops it becoming a liar.
 *
 * ⛔ WHY IT EXISTS. `UNIT_STAT_TABLE.md` is the repo's other generated stat page and it is **stale by
 * roughly 3× on the bosses** — it lists Vlad at 90 pool while `T9_BOSS_STATS` is hp 20 / def 8 = 260.
 * Nothing went red when the retune landed, so the document simply went on being wrong, and a
 * character sheet built from it would have printed a wrong number for every boss in the game. A
 * prose doc with no assertions behind it rots silently. This one cannot.
 *
 * ⛔ AND THE OWNER'S COMPLAINT IS THE SPEC HERE, not a style note. S180, after being asked a third
 * time about mechanics that were archived long ago:
 *
 * > *"let's resolve all of this once and for all so I don't have to go over all those things …
 * > this should be in our canonical document somewhere that you go to to see how things are."*
 *
 * The seagull miss is the shape of the failure: `constants.ts` already said, in as many words, that
 * four whole subsystems are unreachable in production. The information was never missing. It was not
 * read. So the canon states it in one place AND a test holds it there.
 *
 * ⚠ HOW TO ADD TO IT: a number goes in the canon only with the constant it came from, and its
 * assertion lands here in the SAME commit.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CASTLE_ATTACK_RANGE,
  CASTLE_ATK,
  CASTLE_MAX_HP,
  CASTLE_PEN,
  HAZARD_SPAWN_ENABLED,
  CANVAS_HEIGHT,
  FOOTER_TOP_Y,
  FREE_SPARK_POOL_CEILING,
  FREE_SPARK_SOFT_CAP,
  PHASE_1_WIN_SCORE,
  WIN_SCORE_BANDS,
  WAVE_SPAWN_BANDS,
  freeSparkSoftCapForWave,
  waveSpawnBandFactor,
  waveSpawnMultiplier,
  hunterTriggerScoreForWave,
  winScoreForWave,
  LONE_PRIMITIVE_POOL_FIFTHS,
  PRIMITIVE_MAX_HP,
  PRINCESS_SLAP_RANGE,
  SparkType,
  STINK_BAG_DEF,
  STINK_BAG_HP,
  STINK_TOWER_ATTACK_RANGE,
  TURRET_ATTACK_RANGE,
  WORLD_EDGE_MARGIN,
} from './constants.ts';
import { PROTOCOL_VERSION } from './net/protocol.ts';
import {
  DRAFT_BUFF_PCT,
  DRAFT_WAVE_INTERVAL,
  GENERAL_TRACK,
  draftIndexForWave,
  generalPickForWave,
  isDamagePick,
  isDraftWave,
  isPoolPick,
  raceUnitPoolAfterPicks,
} from './state/draft.ts';
import {
  CASTLE_HP_GAIN_BY_BAND,
  CASTLE_STATS,
  CASTLE_UPGRADE_MAX_LEVEL,
  CASTLE_UPGRADE_PRICE,
  applyUpgradeCastleStat,
  castleMaxHpFor,
  castleShotFifthsFor,
  emptyCastleUpgrades,
} from './state/castleUpgrades.ts';
// S189 P10 — §3d as it is LIVE since S188: the draft's offer rules, its panel, the castle buttons.
import { autoPickFor, pickIsOffered } from './state/draftEvent.ts';
import { PANEL_H, PANEL_W, generalTileRect, racialTileRect } from './render/draftOverlay.ts';
import { CASTLE_ROW_KEYS } from './render/castlePanel.ts';
import type { World } from './state/worldTypes.ts';
import { asPlayerId, type PlayerId } from './types.ts';
import { DRONE_ATK, DRONE_PEN } from './constants.ts';
import { attackFifths, structurePoolFifths, unitPoolFifths } from './state/stats.ts';
import { castleShotFifths } from './state/castleGuns.ts';
import { castleRegenPerSecond } from './state/castleRegen.ts';
// S182 — §7 the damage ramp, §8 the repair fee, §9 the open blast.
import { RAMP_SPECS, rampDeathFirstFrame, rampFrameForHealth } from './render/structureRamp.ts';
import { TOWER_DAMAGED_BELOW } from './render/towerFrames.ts';
import { STAR_SELFDESTRUCT_BELOW_FRAC } from './state/structureStarHealth.ts';
import { repairFeeShapeFor } from './state/structureRepair.ts';
// S184 — §9b retaliation. The canon names these sets; these imports are what hold it to them.
import { NEVER_RETALIATES, creatureRetaliates } from './state/creatures/retaliation.ts';
import { CREATURE_TARGETS } from './state/stats.ts';
import { getCreatureConfig } from './state/creatures/voltkin-config.ts';
import type { CreatureType } from './state/creatures/creature.ts';
import type { GodlyId } from './state/godlyRecipes/types.ts';
// S189 P10 — §3e, THE TWELVE RACIAL UPGRADES. Every number in its table is read off these.
import {
  CANVAS_WIDTH,
  CHEWER_ATK,
  CHEWER_DEF,
  CHEWER_HP,
  CHEWER_PEN,
  GOBLIN_ATTACK_CADENCE_TICKS,
  GOBLIN_ATTACK_FIRE_TICK,
  GOBLIN_MAX_PER_SPAWNER,
  PHYSICS_HZ,
  RACE_UNIT_DEF,
  RACE_UNIT_EMIT_INTERVAL_TICKS,
  RACE_UNIT_HP,
  RA_COLUMN_ATK,
  RA_COLUMN_COUNT,
  RA_COLUMN_PEN,
  RA_COLUMN_RADIUS,
  RA_COLUMN_TICKS,
  T3_STATS,
  WARLORD_RAGE_MULTIPLIER,
  ZOMBIE_AURA_PER_MILLE,
} from './constants.ts';
import {
  BLOOD_DEBT_LIFESTEAL_PCT,
  CRIMSON_TIDE_LIFESTEAL_PCT,
  lifestealFifths,
  lifestealPctFor,
} from './state/racial/lifesteal.ts';
import { isZombieRacialType } from './state/racial/theRisen.ts';
import {
  CORPSE_EATER_HEAL_PCT,
  CORPSE_EATER_LEASH_RADIUS,
  CORPSE_EATER_TICKS,
  CORPSE_EATER_TRIGGER_PCT,
} from './state/racial/corpseEater.ts';
import { RA_STRIKE_FIFTHS } from './state/racial/powerOfRa.ts';
import { raAimPoint } from './state/racial/powerOfRaRules.ts';
import {
  DYNASTY_HP_PER_PHARAOH,
  DYNASTY_LIVE_PHARAOH_SENTINEL,
  pharaohsOwed,
} from './state/racial/endlessDynasty.ts';
import { isOrcRacialCreatureType } from './state/racial/bloodFrenzy.ts';
import { HORDE_CASTLE_EMIT_SPEEDUP, HORDE_GOBLIN_MAX_PER_SPAWNER } from './state/racial/hordeGrows.ts';
import { SCORCHED_GROUND_PER_MILLE } from './state/racial/scorchedGround.ts';
import { dotIntervalTicks, maxPoolFifths } from './state/damageOverTime.ts';
import {
  HELLSPAWN_CHILDREN,
  HELLSPAWN_MAX_GEN,
  HELLSPAWN_PCT_BY_GEN,
  hellspawnChildPool,
  hellspawnStrikeFifths,
} from './state/racial/hellspawn.ts';
import { APEX_PREDATOR_STAT_MUL, T3_PIRANHA_ELITE_STATS } from './state/creatures/voltkin-config.ts';
import { PIRANHA_ELITE_SPRITE_SCALE_MUL } from './render/towerFrames.ts';
import { ragedFireTick } from './state/creatures/creature.ts';
// S189 P10 — CANON-2: the deploy-#2 fix rounds (F1 lifesteal batch, F3 rage latch, F4 fallen demon
// seat, racial-d F1 re-anchor + F5 whistle cut), which the S188 text predates.
import { PHASE_DURATION_TICKS } from './constants.ts';
import { FIELD_COVERAGE } from './state/stateHashFull.ts';
import { makeWorld } from './state/world.ts';
import { applyLifesteal, applyPendingLifesteal } from './state/racial/lifesteal.ts';
import {
  asCreatureId,
  attackCycleMultiplier,
  makeCreature,
  type Creature,
} from './state/creatures/creature.ts';
import { scorchedZones } from './state/racial/scorchedGround.ts';
import { SCORCHED_ZONE_TINT, zoneBackdropTint } from './render/zoneBackgroundRenderer.ts';
import { showsCorpseEaterFeed } from './render/corpseEaterFrames.ts';
import { corpseEaterOwnStepPx } from './state/racial/corpseEater.ts';

const CANON = readFileSync(new URL('../SPARK_CANON.md', import.meta.url), 'utf8');

/** The canon must SAY it, not merely be consistent with it — a fact nobody wrote down is not canon. */
function canonSays(needle: string): boolean {
  return CANON.includes(needle);
}

describe('SPARK_CANON.md is bound to the code', () => {
  it('names every archived subsystem, and they really are unreachable in production', () => {
    // ⛔ THE ONE THE OWNER HAD TO SAY THREE TIMES. `readTestHazardsEnabled` can only return true from
    // a Playwright seam, so a shipped build can never spawn any of these.
    expect(HAZARD_SPAWN_ENABLED).toBe(false);
    for (const archived of ['Seagulls and poop', 'Potato blast', 'Bombs', 'Rainbow flyover']) {
      expect(canonSays(archived), `canon must list ${archived} as archived`).toBe(true);
    }
  });

  /**
   * ⭐⭐ S186 — §3b, THE DYNAMIC WIN BAR. The canon carries his spoken table, so the table has to be
   * the one the code computes. Every row is DERIVED from `winScoreForWave` rather than written as a
   * literal here, so a retune of the bands turns this red instead of leaving the doc quietly wrong.
   */
  it('⭐ prints the win-score ladder the owner dictated, derived from the shipped bands', () => {
    for (const band of WIN_SCORE_BANDS) {
      const bar = winScoreForWave(band.lastWave).toLocaleString('en-US');
      expect(canonSays(`**${bar}**`), `canon must print the ${bar} band`).toBe(true);
      expect(canonSays(`×${band.multiplier}`), `canon must print the x${band.multiplier} multiplier`).toBe(true);
    }
    // His boundary, in his words. If someone widens a band, this goes red before a match does.
    expect(winScoreForWave(5)).toBe(PHASE_1_WIN_SCORE);
    expect(winScoreForWave(6)).toBe(PHASE_1_WIN_SCORE * 2);
    expect(canonSays('Each band is INCLUSIVE of its top wave')).toBe(true);
  });

  it('⛔ records that the bar OVERTAKES a banked score, because that is the whole mechanic', () => {
    // The anti-coast property is the feature. A session that reads only the table might "fix" the
    // bar into never passing a banked score; the canon has to say out loud that it may.
    expect(canonSays('THE BANKED SCORE IS NEVER RESET')).toBe(true);
    expect(canonSays('is reversing this ruling')).toBe(true);
  });

  it('⚠ keeps MY two calls flagged as mine, so he can overrule either', () => {
    // Past wave 25 clamps, and the hunter follows the bar. Neither is his ruling.
    expect(winScoreForWave(26)).toBe(winScoreForWave(25));
    expect(hunterTriggerScoreForWave(6)).toBe(Math.floor(winScoreForWave(6) * 0.75));
    expect(canonSays('TWO THINGS HERE ARE MINE, NOT HIS')).toBe(true);
  });

  it('⛔ surfaces that the castle pool no longer matches the points race', () => {
    // CASTLE_MAX_HP's own docblock claims equality with PHASE_1_WIN_SCORE. That is now only true
    // for waves 1-5, and the canon must say so rather than let him find it mid-match.
    /*
     * ⚠ THIS USED TO ASSERT `CASTLE_MAX_HP === PHASE_1_WIN_SCORE`, which turns a coincidence into an
     * invariant R88 never granted: a future owner retune of the OPENING bar would then red a castle
     * assertion, and the tempting green would be to move the castle pool with it — retuning every
     * castle relationship S181 measured. What matters is the CONSEQUENCE, so that is what is pinned.
     */
    expect(winScoreForWave(6)).toBeGreaterThan(CASTLE_MAX_HP);
    expect(canonSays('castle-rush becomes the correct')).toBe(true);
  });

  it('⛔ records that the dynamic bar cost no FIELD but DID earn a protocol bump', () => {
    /*
     * ⛔ THIS TEST USED TO PIN THE OPPOSITE, AND IT WAS GREEN OVER A REAL DEFECT — the exact
     * S182-lesson-2 shape. It asserted the canon said "no PROTOCOL_VERSION bump", which was the
     * conclusion S186 reached from "no new field" and which its own end-of-session audit refuted:
     * `tickGameState` runs on every peer and gates on `winScoreForWave`, so two builds advertising
     * 47 would shake hands and disagree about when the match ends. The canon now carries the
     * correction AND the 39->40 precedent that was already in protocol.ts when the wrong call was
     * made, so the next session inherits the reasoning rather than the mistake.
     */
    expect(canonSays('no new field and no four-sites work')).toBe(true);
    expect(canonSays('IT STILL EARNED A PROTOCOL BUMP')).toBe(true);
    expect(canonSays('THE BUMP IS FOR THE RULE, NOT FOR THE')).toBe(true);
    // ⭐ S187 — 49. The S186 reasoning this test guards is UNCHANGED; only the live version moved,
    // and it moved for its own reason (a new CLIENT INTENT), which the canon records separately.
    // ⭐ S188 — 50, again for its own reason (the racial upgrades; canon §6).
    expect(PROTOCOL_VERSION).toBe(50);
  });

  it('⭐ §3c — the quarry bands land on the owner’s four waves, and band 1 is untouched', () => {
    // ⛔ The S157 ruling (wave 1 normal, +0.2 a wave) must survive the S186 step-up. Band 1's factor
    // being exactly 1 is what proves waves 1-5 are byte-identical to what he dictated then.
    expect(waveSpawnBandFactor(5)).toBe(1);
    expect(waveSpawnMultiplier(5)).toBeCloseTo(1.8);
    expect(WAVE_SPAWN_BANDS.map((band) => band.lastWave)).toEqual([5, 10, 15, 20, 25]);
    expect(canonSays('after wave 5, then')).toBe(true);
    // The RATE stays uncapped forever, which is the other half of his S157 ruling.
    expect(waveSpawnMultiplier(500)).toBeGreaterThan(waveSpawnMultiplier(100));
    expect(canonSays('the RATE is')).toBe(true);
  });

  it('⚠ §3c — records that the POOL ceiling is a perf bound, NOT the rate cap he refused', () => {
    // Conflating the two would read as a reversal of "dont cap". The canon has to keep them apart.
    expect(freeSparkSoftCapForWave(1)).toBe(FREE_SPARK_SOFT_CAP);
    expect(FREE_SPARK_POOL_CEILING).toBe(FREE_SPARK_SOFT_CAP * 4);
    expect(canonSays('never a bound on the arrival rate')).toBe(true);
  });

  it('⛔ §3c — keeps the EMPTY-QUARRY finding visible, since it is unfixed by design', () => {
    // It is the half of his complaint that a faster faucet cannot fix. If this paragraph is ever
    // tidied away, the next session re-diagnoses "waiting in line" from scratch.
    expect(canonSays('opens onto a COMPLETELY EMPTY quarry')).toBe(true);
    expect(canonSays('NOT FIXED, ON PURPOSE')).toBe(true);
  });

  it('⛔ §3c — states that ONE quarry serves the whole table', () => {
    // Reasoning about the faucet per-seat is wrong by the seat count, and is the easiest mistake to
    // make from inside gathererLifecycle.
    expect(canonSays('THERE IS EXACTLY ONE QUARRY FOR THE WHOLE TABLE')).toBe(true);
  });

  it('⭐ §4b — the edge rule: NOT a bottom rule, and bounded by a ground attacker’s reach', () => {
    // ⛔ The two facts a session must not re-derive: the bottom is NOT special, and the thing that
    // stops the rule going further is that a tower below 1075 cannot be attacked at all.
    // ⛔ THIS USED TO ASSERT canonSays('It is SYMMETRICAL'), AND THE CANON SAID IT BECAUSE I
    // GENERALISED FROM THE ONE RECIPE I HAD MEASURED. 15 of 19 are vertically asymmetric (a tier-3
    // tower is 46 top / 29 bottom); the laser turret I measured happens to be 56/56. The claim that
    // survives is that the rule is NOT a bottom rule, which is what actually matters to a reader.
    expect(canonSays('IT IS NOT A BOTTOM RULE')).toBe(true);
    expect(canonSays('THE FOUR BANDS ARE NOT THE SAME SIZE')).toBe(true);
    expect(canonSays('the lowest strikeable y')).toBe(true);
    // Derived, so a retune of either constant moves the canon with it.
    expect(CANVAS_HEIGHT - WORLD_EDGE_MARGIN + 35).toBe(1075);
    expect(canonSays('**1075**')).toBe(true);
  });

  it('⛔ §4b — records that the FOOTER is the bigger half, so nobody edits the wrong constant', () => {
    // Geometry alone cannot give him the bottom band; lowering the rule further puts towers under a
    // plate whose guards refuse them anyway. The open question is the footer, not EDGE_PAD.
    expect(canonSays('GEOMETRY ALONE CANNOT GIVE HIM THE BOTTOM BAND')).toBe(true);
    expect(canonSays('THE OPEN QUESTION IS THE FOOTER')).toBe(true);
    expect(FOOTER_TOP_Y).toBe(CANVAS_HEIGHT - 84);
  });

  it('prints the castle numbers that are actually shipped', () => {
    expect(canonSays(`**${CASTLE_MAX_HP}** (\`CASTLE_MAX_HP\`)`)).toBe(true);
    // ⭐ S180: the flat constant is RETIRED. The canon must say the ladder, not the number.
    expect(canonSays('its own `attackFifths(atk, pen)`')).toBe(true);
    /*
     * ⭐⭐ S181 — the gun's own shot is now a canon number, so it is pinned like every other one.
     * It is DERIVED from the constants here, so the owner can retune the gun and this asserts the
     * doc followed him rather than asserting a literal that must be hand-edited twice.
     */
    expect(canonSays(`**${castleShotFifths()}** fifths`)).toBe(true);
    expect(canonSays(`\`attackFifths(${CASTLE_ATK}, ${CASTLE_PEN})\``)).toBe(true);
  });

  /**
   * ⭐⭐ S181 — **THE CANON MUST CARRY THE CLARIFY-THEN-DECIDE HISTORY OF THE 2500, NOT JUST THE
   * NUMBER.** In S180 the owner said 2500 was the WIN SCORE and the pool was 1500; in S181 he moved
   * the pool to 2500. A session reading only the first statement would "fix" the pool back to 1500
   * and think it was restoring his ruling. So the doc has to say both things and say they are not a
   * contradiction — and this case is what keeps that paragraph from being tidied away.
   */
  it('records that 2500 was the win score FIRST and the pool SECOND, as two owner statements', () => {
    expect(canonSays('This is not a contradiction of his S180 ruling'.toUpperCase())
      || canonSays('NOT A CONTRADICTION OF HIS S180 RULING')).toBe(true);
    expect(canonSays('he was correcting what 2500')).toBe(true);
    expect(canonSays('PHASE_1_WIN_SCORE')).toBe(true);
  });

  /**
   * ⚠ THE REGEN BUFF THE POOL CHANGE CARRIED WITH IT. R128 was given in PERCENT, so raising the pool
   * raised the absolute rates — a change the owner did not ask for in words. It is surfaced in the
   * canon rather than left for him to discover mid-match, and this pins that it stays surfaced.
   */
  it('surfaces the regen rates the pool change moved, derived from the shipped ladder', () => {
    const rates = [1, 2, 3, 4, 5].map((l) => castleRegenPerSecond(l)).join(' / ');
    expect(canonSays(`**${rates}** HP per second`)).toBe(true);
  });

  /**
   * ⭐ THE LONE-SHAPE AND STINK-BAG RULE, which the owner has now stated twice and which the code
   * already implements. Derived, never typed: 1 HP / 0 DEF is pool 5 because of the ladder, not
   * because someone wrote 5 down.
   */
  it('states the one-hit rule for a loose built shape and a stink bag, off the ladder', () => {
    expect(LONE_PRIMITIVE_POOL_FIFTHS).toBe(unitPoolFifths(1, 0));
    expect(unitPoolFifths(STINK_BAG_HP, STINK_BAG_DEF)).toBe(LONE_PRIMITIVE_POOL_FIFTHS);
    expect(canonSays(`| **${LONE_PRIMITIVE_POOL_FIFTHS}** |`)).toBe(true);
  });

  it('prints the structure ladder exactly as `structurePoolFifths` computes it', () => {
    const row = [5, 4, 3, 2, 1].map((n) => structurePoolFifths(n)).join(' | ');
    expect(canonSays(`| pool | ${row} |`)).toBe(true);
    // And the total for a 5-connector tower, which is the number he quotes.
    const total = [5, 4, 3, 2, 1].reduce((sum, n) => sum + structurePoolFifths(n), 0);
    expect(canonSays(`costs **${total}**`)).toBe(true);
  });

  it('prints the shipped tower ranges, so the who-shoots-what table cannot drift', () => {
    expect(canonSays(`| Laser turret | creatures only | ${TURRET_ATTACK_RANGE} |`)).toBe(true);
    expect(canonSays(`| ${STINK_TOWER_ATTACK_RANGE} |`)).toBe(true);
    expect(canonSays(`| Helga | units only | ${PRINCESS_SLAP_RANGE} |`)).toBe(true);
    expect(canonSays(`| ${CASTLE_ATTACK_RANGE} |`)).toBe(true);
  });

  it('⭐ §3d — the draft schedule, the floor-at-one rule and the castle bands', () => {
    // The canon must carry the RULINGS, not just the handoff. Every number is derived from the
    // constant it describes, so a retune turns this RED instead of quietly misleading.
    expect(DRAFT_WAVE_INTERVAL).toBe(5);
    expect([1, 6, 11, 16, 21].every(isDraftWave)).toBe(true);
    expect([5, 10, 15, 20].some(isDraftWave)).toBe(false);
    expect(canonSays('waves 6, 11, 16, 21')).toBe(true);
    // His worked example, the one that makes a percentage expressible at all.
    expect(canonSays('Instead of six health he will have seven')).toBe(true);
    expect(raceUnitPoolAfterPicks(0)).toBe(6);
    expect(raceUnitPoolAfterPicks(1)).toBe(7);
    // The castle band table, read off the constant rather than retyped.
    expect(CASTLE_HP_GAIN_BY_BAND).toEqual([250, 350, 450, 550, 650]);
    for (const g of CASTLE_HP_GAIN_BY_BAND) expect(canonSays(String(g))).toBe(true);
    // ⛔ And the canon must SAY the racial buffs are unbuilt, or the next session assumes they are.
    expect(canonSays('**NOT BUILT**')).toBe(true);
  });

  /**
   * ⭐ S189 P10 — §3d AS IT IS LIVE SINCE S188. The S188 canon text was written on a branch and
   * never got its assertions; these are they. Each fact is read off the function that decides it,
   * not off a comment, so a changed offer rule turns this RED before the canon can mislead.
   */
  it('⭐ §3d — level 0 / level 5, the general track, and who may take what', () => {
    expect(draftIndexForWave(1)).toBe(0);
    expect(draftIndexForWave(6)).toBe(1);
    expect(canonSays('(draft index 0)')).toBe(true);
    expect(canonSays('(draft index 1)')).toBe(true);
    expect(GENERAL_TRACK).toEqual(['hp', 'def', 'atk', 'pen']);
    expect(generalPickForWave(21)).toBe('hp'); // the wrap — MINE, and the canon says so
    expect(canonSays('HP → DEF → ATK → PEN, **cycling** (⚠ the wrap is MINE')).toBe(true);

    // The offer: this wave's general axis, plus `'racial'` exactly when the race has a built perk.
    // A minimal world — both functions read only `players.get(seat).raceId`.
    const seat: PlayerId = asPlayerId(0);
    const w = { players: new Map([[seat, { raceId: 'vampires', draftPicks: [] }]]) } as unknown as World;
    expect(pickIsOffered(w, seat, 1, 'hp')).toBe(true);
    expect(pickIsOffered(w, seat, 1, 'def')).toBe(false); // a modified client cannot take DEF at the HP draft
    expect(pickIsOffered(w, seat, 1, 'racial')).toBe(true); // level 0
    expect(pickIsOffered(w, seat, 6, 'racial')).toBe(true); // level 5
    expect(pickIsOffered(w, seat, 11, 'racial')).toBe(false); // level 10+: COMING SOON
    expect(canonSays('`pickIsOffered` admits exactly two things')).toBe(true);
    // ⛔ His R106 reversal: the deadline takes the RACIAL whenever one is on offer, else the general.
    expect(autoPickFor(w, seat, 1)).toBe('racial');
    expect(autoPickFor(w, seat, 6)).toBe('racial');
    expect(autoPickFor(w, seat, 11)).toBe(generalPickForWave(11));
    expect(canonSays('`autoPickFor` returns `\'racial\'` whenever a perk is on offer')).toBe(true);
    // A racial pick moves no pool and no damage number.
    expect(isPoolPick('racial')).toBe(false);
    expect(isDamagePick('racial')).toBe(false);
    expect(canonSays('`isPoolPick(\'racial\')`')).toBe(true);
  });

  /**
   * ⛔⛔ S189 P10 — CANON-3. §3d says LIVE, and the HP/DEF half is. The ATK/PEN half is recorded and
   * applied NOWHERE: `draftedAttackFifths` has no production caller. The enumeration is MECHANICAL —
   * every non-test source file is read — so it cannot be green over a caller it forgot to look at, and
   * it turns RED the day `s188/draft-atk` wires the damage half. That is the moment to replace the
   * canon's PENDING paragraph with the live rule, in the same commit.
   */
  it('⛔ §3d — PENDING TRAIN D: a drafted ATK/PEN pick reaches no strike on the live build', () => {
    const root = new URL('.', import.meta.url);
    const prod = (readdirSync(root, { recursive: true }) as string[])
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'state/draft.ts');
    const callers = (name: string) =>
      prod.filter((f) => readFileSync(new URL(f, root), 'utf8').includes(name)).sort();
    expect(callers('draftedPoolFifths')).toEqual(['state/creatures/creature.ts']); // the pool half: live
    expect(callers('draftedAttackFifths')).toEqual([]); // the damage half: NOT wired
    expect(canonSays('PENDING TRAIN D — ON THE LIVE BUILD A DRAFTED ATK OR PEN PICK REACHES NO STRIKE')).toBe(true);
    expect(canonSays('has **no production caller**')).toBe(true);
    // The panel promises it anyway — which is what makes this worth a canon line.
    const overlay = readFileSync(new URL('./render/draftOverlay.ts', import.meta.url), 'utf8');
    expect(overlay).toContain('hits ${DRAFT_BUFF_PCT}% harder');
    expect(canonSays(`*"hits ${DRAFT_BUFF_PCT}% harder"*`)).toBe(true);
    // And the two drafts where the general tile is the ONLY choice are exactly the two dead ones.
    expect([generalPickForWave(11), generalPickForWave(16)]).toEqual(['atk', 'pen']);
    expect(canonSays('the general pick at waves 11 and')).toBe(true);
  });

  it('⭐ §3d — the draft panel geometry the canon prints is the one the renderer draws', () => {
    expect(canonSays(`**${PANEL_W} × ${PANEL_H}**`)).toBe(true);
    const g = generalTileRect();
    const r = racialTileRect();
    expect([r.w, r.h]).toEqual([g.w, g.h]); // two EQUAL tiles
    expect(canonSays(`two tiles of **${g.w} × ${g.h}**`)).toBe(true);
  });

  /**
   * ⭐ S189 P10 — §3d's castle buttons. S187 built the four stats in the sim and nothing dispatched
   * them; S188 put them on the panel. The canon's numbers are read off the reducer and the panel.
   */
  it('⭐ §3d — the four castle buttons: order, price, cap, and what one point buys', () => {
    expect(CASTLE_STATS).toEqual(['hp', 'atk', 'def', 'pen']);
    expect(canonSays(
      `**HP / ATK / DEF / PEN**, ${CASTLE_UPGRADE_PRICE} VP a point, ${CASTLE_UPGRADE_MAX_LEVEL} per axis`,
    )).toBe(true);
    // Four rows directly under REGEN, in HIS order.
    const regen = CASTLE_ROW_KEYS.indexOf('castleRegen');
    expect(CASTLE_ROW_KEYS.slice(regen + 1)).toEqual(['castleHp', 'castleAtk', 'castleDef', 'castlePen']);
    expect(canonSays('**four rows under REGEN — HP, ATK, DEF, PEN**')).toBe(true);
    expect(canonSays(`out of **${CASTLE_UPGRADE_MAX_LEVEL}** (\`CASTLE_UPGRADE_MAX_LEVEL\`)`)).toBe(true);
    expect(canonSays(`its price **${CASTLE_UPGRADE_PRICE}**`)).toBe(true);
    // Every disabled reason the canon names is one the panel can print.
    const panel = readFileSync(new URL('./render/castlePanel.ts', import.meta.url), 'utf8');
    const rows = panel.slice(panel.indexOf('const statRows = CASTLE_STAT_ROWS.map('));
    const block = rows.slice(0, 900);
    for (const reason of ['NOT YOURS', 'LOCKED', 'CASTLE LOST', 'MAX']) {
      expect(block, reason).toContain(`'${reason}'`);
      expect(canonSays(`\`${reason}\``), reason).toBe(true);
    }
    expect(panel).toContain('const needStat = `NEED ${CASTLE_UPGRADE_PRICE}`');
    expect(canonSays(`\`NEED ${CASTLE_UPGRADE_PRICE}\``)).toBe(true);
    // One ATK point, off the ladder.
    const oneAtk = castleShotFifthsFor({ ...emptyCastleUpgrades(), atkLevel: 1 });
    expect(oneAtk).toBe(attackFifths(CASTLE_ATK + 1, CASTLE_PEN));
    expect(canonSays(`**${castleShotFifths()}** shot into **${oneAtk}**`)).toBe(true);
  });

  it('⛔ §3d — a bought HP point is HP the keep HAS, a fallen keep buys nothing, and absent means the ceiling', () => {
    // Through the real reducer: a 2000-HP keep buying at wave 1 gains the band-1 250 in BOTH numbers.
    const seat: PlayerId = asPlayerId(0);
    const buy = (castleHp: number) => {
      const w = {
        players: new Map([[seat, { castleHp, castleUpgrades: emptyCastleUpgrades() }]]),
        scoreByPlayer: new Map([[seat, CASTLE_UPGRADE_PRICE]]),
        waveNumber: 1,
      };
      applyUpgradeCastleStat(w, { type: 'UPGRADE_CASTLE_STAT', playerId: seat, stat: 'hp' }, () => {});
      return w.players.get(seat)!;
    };
    const bought = buy(2000);
    expect(castleMaxHpFor(bought.castleUpgrades)).toBe(CASTLE_MAX_HP + CASTLE_HP_GAIN_BY_BAND[0]!);
    expect(bought.castleHp).toBe(2000 + CASTLE_HP_GAIN_BY_BAND[0]!);
    expect(canonSays('**adds its band gain to the keep\'s CURRENT HP too**')).toBe(true);
    const fallen = buy(0);
    expect(fallen.castleHp).toBe(0); // R131 — never revives an eliminated seat
    expect(canonSays('never on a fallen keep (R131)')).toBe(true);
    // The wire default is the SEAT's ceiling, and the rematch resets the stats BEFORE the pool.
    const save = readFileSync(new URL('./state/save.ts', import.meta.url), 'utf8');
    expect(save).toContain('?? castleMaxHpFor(castleUpgrades)');
    expect(canonSays('reads as **that seat\'s upgraded ceiling** (`castleMaxHpFor`)')).toBe(true);
    const mode = readFileSync(new URL('./state/gameMode.ts', import.meta.url), 'utf8');
    const reset = mode.indexOf('player.castleUpgrades = emptyCastleUpgrades();');
    expect(reset).toBeGreaterThan(-1);
    expect(mode.indexOf('player.castleHp = castleMaxHpFor(player.castleUpgrades);')).toBeGreaterThan(reset);
    expect(canonSays('**every bought stat resets**')).toBe(true);
  });

  /* ══ S189 P10 — §3e, THE TWELVE RACIAL UPGRADES: every table number off its constant ═══════ */

  it('⭐ §3e — the vampires: BLOOD DEBT 20 %, CRIMSON TIDE 50 % that REPLACES it, his 20 → 4', () => {
    expect(canonSays(`\`BLOOD_DEBT_LIFESTEAL_PCT\` = **${BLOOD_DEBT_LIFESTEAL_PCT}** %`)).toBe(true);
    expect(canonSays(`\`CRIMSON_TIDE_LIFESTEAL_PCT\` = **${CRIMSON_TIDE_LIFESTEAL_PCT}** %`)).toBe(true);
    // ⛔ L5 REPLACES L0 — a seat holding both is at 50, never 70; another race's racial steals nothing.
    expect(lifestealPctFor({ raceId: 'vampires', draftPicks: ['racial', 'racial'] })).toBe(CRIMSON_TIDE_LIFESTEAL_PCT);
    expect(lifestealPctFor({ raceId: 'vampires', draftPicks: ['racial'] })).toBe(BLOOD_DEBT_LIFESTEAL_PCT);
    expect(lifestealPctFor({ raceId: 'zombies', draftPicks: ['racial', 'racial'] })).toBe(0);
    expect(canonSays('REPLACES 20 — never 70')).toBe(true);
    // His worked example, exact on the ladder, and the floor-at-one.
    expect(lifestealFifths(20, BLOOD_DEBT_LIFESTEAL_PCT)).toBe(4);
    expect(lifestealFifths(1, BLOOD_DEBT_LIFESTEAL_PCT)).toBe(1);
    expect(canonSays('a **20**-fifth hit heals **4**')).toBe(true);
  });

  it('⭐ §3e — the zombies: THE RISEN raises a 1/1/1/1 soldier; CORPSE EATER’s four numbers', () => {
    expect(unitPoolFifths(RACE_UNIT_HP, RACE_UNIT_DEF)).toBe(6);
    expect(canonSays('pool **6** — `unitPoolFifths(RACE_UNIT_HP, RACE_UNIT_DEF)`')).toBe(true);
    // "any racial characters kill … so not like Voltkin or Helga or Pencil Chewers".
    for (const t of ['raceUnit', 't3Hound', 't9BossZombies'] as CreatureType[]) expect(isZombieRacialType(t), t).toBe(true);
    for (const t of ['voltkin', 'chewer', 'goblinMelee'] as CreatureType[]) expect(isZombieRacialType(t), t).toBe(false);
    expect(CORPSE_EATER_TICKS).toBe(8 * PHYSICS_HZ); // his "for like eight seconds"
    expect(canonSays(
      `\`CORPSE_EATER_TRIGGER_PCT\` = **${CORPSE_EATER_TRIGGER_PCT}** · \`CORPSE_EATER_TICKS\` = **${CORPSE_EATER_TICKS}**` +
      ` · \`CORPSE_EATER_HEAL_PCT\` = **${CORPSE_EATER_HEAL_PCT}** · \`CORPSE_EATER_LEASH_RADIUS\` = **${CORPSE_EATER_LEASH_RADIUS}** px`,
    )).toBe(true);
    expect(canonSays(`The **${CORPSE_EATER_LEASH_RADIUS} px** leash is MINE`)).toBe(true);
    // ⚠ The overkill-included heal is a READING, and the canon has to say so.
    expect(canonSays('that is the S188 brief\'s reading')).toBe(true);
  });

  it('⭐ §3e — the mummies: POWER OF RA is the Pharaoh’s strike; the aim is REFUSED off the board', () => {
    expect(RA_STRIKE_FIFTHS).toBe(attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN));
    expect(RA_COLUMN_TICKS).toBe(2 * PHYSICS_HZ); // "five columns two seconds apart"
    expect(canonSays(
      `\`RA_COLUMN_COUNT\` = **${RA_COLUMN_COUNT}**, one every \`RA_COLUMN_TICKS\` = **${RA_COLUMN_TICKS}**` +
      ` · \`RA_STRIKE_FIFTHS\` = **${RA_STRIKE_FIFTHS}** over \`RA_COLUMN_RADIUS\` = **${RA_COLUMN_RADIUS}** px`,
    )).toBe(true);
    expect(canonSays(`= **${RA_STRIKE_FIFTHS}** fifths a column over \`RA_COLUMN_RADIUS\` **${RA_COLUMN_RADIUS}** px`)).toBe(true);
    // ⛔ CANON-6 — REFUSED, not clamped: every one of these is a no-op at the host.
    expect(raAimPoint(-1, 10)).toBeNull();
    expect(raAimPoint(CANVAS_WIDTH + 1, 10)).toBeNull();
    expect(raAimPoint(Number.NaN, 10)).toBeNull();
    expect(raAimPoint('5', 5)).toBeNull();
    expect(raAimPoint(10.4, 20.6)).toEqual({ x: 10, y: 21 }); // on the board: rounded
    expect(canonSays('The host REFUSES an aim that is off the')).toBe(true);
    expect(canonSays('rounds the aim to integers and clamps it')).toBe(false); // the S188 wording, wrong
    // ENDLESS DYNASTY — his 1,000; the sentinel is MINE and a PERFORMANCE bound, never a cap.
    expect(canonSays(
      `\`DYNASTY_HP_PER_PHARAOH\` = **${DYNASTY_HP_PER_PHARAOH}** · \`DYNASTY_LIVE_PHARAOH_SENTINEL\` = **${DYNASTY_LIVE_PHARAOH_SENTINEL}**`,
    )).toBe(true);
    expect(canonSays(`(**${DYNASTY_LIVE_PHARAOH_SENTINEL}** live Pharaohs a seat) is a **PERFORMANCE sentinel`)).toBe(true);
    expect(pharaohsOwed(DYNASTY_HP_PER_PHARAOH - 1, 2 * DYNASTY_HP_PER_PHARAOH + 1)).toBe(2);
    expect(canonSays('one hit crossing two thousands raises two')).toBe(true);
  });

  it('⭐ §3e — the orcs: BLOOD FRENZY is ownership AND type; THE HORDE GROWS raises a LOAD-BEARING ceiling', () => {
    expect(canonSays(`\`WARLORD_RAGE_MULTIPLIER\` = **${WARLORD_RAGE_MULTIPLIER}**`)).toBe(true);
    for (const t of ['raceUnit', 't3Warband', 't9BossOrcs'] as CreatureType[]) expect(isOrcRacialCreatureType(t), t).toBe(true);
    // ⛔ HIS ruling: goblins never rage — any race can build a goblin tower. Nor do the direwolves (MINE).
    const goblins = (Object.keys(CREATURE_TARGETS) as CreatureType[]).filter((t) => t.startsWith('goblin'));
    expect(goblins.length).toBeGreaterThan(0);
    for (const t of [...goblins, 'direwolf'] as CreatureType[]) expect(isOrcRacialCreatureType(t), t).toBe(false);
    // The S168 defect's numbers: the cadence and the fire tick BOTH halve.
    const raged = ragedFireTick(GOBLIN_ATTACK_FIRE_TICK, { attackCycleRaged: true });
    expect(raged).toBeLessThan(Math.round(GOBLIN_ATTACK_CADENCE_TICKS / WARLORD_RAGE_MULTIPLIER));
    expect(canonSays(`(${GOBLIN_ATTACK_CADENCE_TICKS} → ${Math.round(GOBLIN_ATTACK_CADENCE_TICKS / WARLORD_RAGE_MULTIPLIER)})`)).toBe(true);
    expect(canonSays(`(${GOBLIN_ATTACK_FIRE_TICK} → **${raged}**)`)).toBe(true);
    // THE HORDE GROWS — 10 → 20 a tower, the castle every 15 s instead of 30.
    const every = RACE_UNIT_EMIT_INTERVAL_TICKS / HORDE_CASTLE_EMIT_SPEEDUP / PHYSICS_HZ;
    expect(canonSays(
      `\`HORDE_GOBLIN_MAX_PER_SPAWNER\` = **${HORDE_GOBLIN_MAX_PER_SPAWNER}** · \`HORDE_CASTLE_EMIT_SPEEDUP\` = **${HORDE_CASTLE_EMIT_SPEEDUP}** (every **${every}** s)`,
    )).toBe(true);
    // ⚠ CANON-4 — the ceiling is load-bearing because goblins never age out.
    for (const t of goblins) expect(getCreatureConfig(t).persistent, t).toBe(true);
    expect(canonSays('THE GOBLIN CEILING IS LOAD-BEARING, NOT COSMETIC')).toBe(true);
    expect(canonSays(`**${GOBLIN_MAX_PER_SPAWNER} → ${HORDE_GOBLIN_MAX_PER_SPAWNER}**`)).toBe(true);
  });

  it('⭐ §3e — the demons: SCORCHED GROUND is his 2 % on the aura’s clock; HELLSPAWN ends by generation', () => {
    expect(canonSays(`\`SCORCHED_GROUND_PER_MILLE\` = **${SCORCHED_GROUND_PER_MILLE}**`)).toBe(true);
    expect(canonSays(`\`ZOMBIE_AURA_PER_MILLE\` **${ZOMBIE_AURA_PER_MILLE}**`)).toBe(true);
    // Seconds to burn a whole pool at the TYPE's rate: one fifth per interval.
    const burnS = (typePool: number, pool: number) => (dotIntervalTicks(typePool, SCORCHED_GROUND_PER_MILLE) * pool) / PHYSICS_HZ;
    const soldier = maxPoolFifths('raceUnit');
    expect(burnS(soldier, soldier)).toBe(50);
    expect(burnS(maxPoolFifths('chewer'), maxPoolFifths('chewer'))).toBe(50);
    const boss = maxPoolFifths('t9BossVampires');
    expect(boss).toBe(260);
    expect(burnS(boss, boss)).toBe(52); // the interval rounds — "exact" only where it divides
    expect(Math.round(burnS(soldier, soldier + 1))).toBe(58); // a soldier drafted 6 → 7
    expect(canonSays('burn in **50 s**, a 260-fifth boss in **52 s**')).toBe(true);
    expect(canonSays('burns in about **58 s**')).toBe(true);
    // HELLSPAWN — his 2, his 50 / 25, and the end of the chain.
    expect(canonSays(
      `\`HELLSPAWN_CHILDREN\` = **${HELLSPAWN_CHILDREN}** · \`HELLSPAWN_PCT_BY_GEN\` = ${HELLSPAWN_PCT_BY_GEN[0]} / ${HELLSPAWN_PCT_BY_GEN[1]} / ${HELLSPAWN_PCT_BY_GEN[2]}` +
      ` · \`HELLSPAWN_MAX_GEN\` = **${HELLSPAWN_MAX_GEN}**`,
    )).toBe(true);
    const p0 = unitPoolFifths(CHEWER_HP, CHEWER_DEF);
    const p1 = hellspawnChildPool(p0);
    const p2 = hellspawnChildPool(p1);
    const b0 = attackFifths(CHEWER_ATK, CHEWER_PEN);
    const b1 = hellspawnStrikeFifths({ hellspawnGen: 1 }, b0);
    const b2 = hellspawnStrikeFifths({ hellspawnGen: 2 }, b0);
    expect(p2).toBeGreaterThanOrEqual(1); // floor-at-one: no child is born dead (Council A2)
    expect(b2).toBeGreaterThanOrEqual(1);
    expect(canonSays(`pool ${p0} → ${p1} → ${p2}, bite ${b0} → ${b1} → ${b2}`)).toBe(true);
    let descendants = 0;
    for (let g = 1; g <= HELLSPAWN_MAX_GEN; g++) descendants += HELLSPAWN_CHILDREN ** g;
    expect(canonSays(`chewer has at most **${descendants}** descendants`)).toBe(true);
  });

  it('⭐ §3e — the nagas: APEX PREDATOR triples every STAT, which is ×3 health but ×4 bite', () => {
    const base = T3_STATS.piranha;
    const elite = T3_PIRANHA_ELITE_STATS;
    expect([elite.hp, elite.def, elite.atk, elite.pen])
      .toEqual([base.hp, base.def, base.atk, base.pen].map((s) => s * APEX_PREDATOR_STAT_MUL));
    expect(elite.speedMul).toBe(base.speedMul); // "stats" — not its speed (MINE)
    expect(canonSays(
      `\`APEX_PREDATOR_STAT_MUL\` = **${APEX_PREDATOR_STAT_MUL}** → **${elite.hp} / ${elite.def} / ${elite.atk} / ${elite.pen}**` +
      ` · \`PIRANHA_ELITE_SPRITE_SCALE_MUL\` = **${PIRANHA_ELITE_SPRITE_SCALE_MUL}**`,
    )).toBe(true);
    expect(canonSays(`pool **${unitPoolFifths(base.hp, base.def)} → ${unitPoolFifths(elite.hp, elite.def)}**`)).toBe(true);
    expect(canonSays(`**${attackFifths(base.atk, base.pen)} → ${attackFifths(elite.atk, elite.pen)}**`)).toBe(true);
  });

  /* ══ S189 P10 — CANON-2: what deploy #2 changed under the same 50 ══════════════════════════ */

  it('⛔ §3e — inside the strike batch a lifesteal heal is SUMMED, then landed before the sweep (F1)', () => {
    const w = makeWorld(0x189);
    const seat: PlayerId = asPlayerId(0);
    w.players.set(seat, { raceId: 'vampires', draftPicks: ['racial'] } as never);
    const unit = (id: number): Creature => {
      const c = makeCreature(getCreatureConfig('raceUnit'), {
        id: asCreatureId(id), ownerPlayerId: seat, pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 }, spawnedAtTick: 0,
      });
      c.ehp = 1;
      w.creatures.set(c.id, c);
      return c;
    };
    const alive = unit(1);
    const dying = unit(2);
    expect(w.pendingLifestealFifths).toBeNull(); // null at every tick boundary
    w.pendingLifestealFifths = new Map();
    w.pendingCreatureDeaths = new Set([dying.id]);
    applyLifesteal(w, { kind: 'creature', id: alive.id }, 20);
    applyLifesteal(w, { kind: 'creature', id: dying.id }, 20);
    expect(alive.ehp).toBe(1); // summed, NOT applied mid-batch
    applyPendingLifesteal(w);
    expect(alive.ehp).toBe(1 + lifestealFifths(20, BLOOD_DEBT_LIFESTEAL_PCT));
    expect(dying.ehp).toBe(1); // killed this tick → never healed back over the line
    // Transient, so never hashed; and the host lands it BEFORE the deferred sweep.
    expect(FIELD_COVERAGE.pendingLifestealFifths).toBe('acknowledged');
    const host = readFileSync(new URL('./state/hostTick.ts', import.meta.url), 'utf8');
    const land = host.indexOf('applyPendingLifesteal(world);');
    expect(land).toBeGreaterThan(-1);
    expect(host.indexOf('sweepDeferredDeaths(world, world.pendingCreatureDeaths);')).toBeGreaterThan(land);
    expect(canonSays('INSIDE THE HOST\'S STRIKE BATCH A HEAL IS SUMMED, NOT APPLIED')).toBe(true);
    expect(canonSays('**before the deferred death sweep**')).toBe(true);
  });

  it('⛔ §3e — a rage change mid-swing waits for the next cycle: the latch, not the live bit (F3)', () => {
    expect(attackCycleMultiplier({ attackCycleRaged: true })).toBe(WARLORD_RAGE_MULTIPLIER);
    expect(attackCycleMultiplier({})).toBe(1);
    // A creature that is enraged NOW but started this cycle calm swings on the CALM fire tick.
    const liveOnly: Pick<Creature, 'attackCycleRaged' | 'enraged'> = { enraged: true };
    expect(ragedFireTick(GOBLIN_ATTACK_FIRE_TICK, liveOnly)).toBe(GOBLIN_ATTACK_FIRE_TICK);
    // The latch is taken on the cycle's first tick, and it is on the wire and in the hash.
    const fsm = readFileSync(new URL('./state/creatures/creatureLifecycle.ts', import.meta.url), 'utf8');
    const latch = fsm.indexOf('creature.attackCycleRaged = true');
    expect(latch).toBeGreaterThan(-1);
    expect(fsm.slice(latch - 200, latch)).toContain('creature.ticksInState === 1');
    const save = readFileSync(new URL('./state/save.ts', import.meta.url), 'utf8');
    expect(save).toContain('c.attackCycleRaged === true ? { attackCycleRaged: true }');
    const hash = readFileSync(new URL('./state/stateHashFull.ts', import.meta.url), 'utf8');
    expect(hash).toContain("| 'attackCycleRaged'"); // the union…
    expect(hash).toContain(':ar${'); // …and the hand-written projection
    expect(canonSays('**`Creature.attackCycleRaged`**')).toBe(true);
    expect(canonSays('One blow per cycle, always.')).toBe(true);
  });

  it('⛔ §3e — a fallen demon seat’s land stops burning, and stops LOOKING like it (F4)', () => {
    const layout = makeWorld(0x189).layout;
    const seat: PlayerId = asPlayerId(0);
    const zonesFor = (castleHp: number) => scorchedZones({
      players: new Map([[seat, { raceId: 'demons', draftPicks: ['racial'], castleHp }]]),
      layout,
    } as unknown as World);
    expect(zonesFor(1)).toHaveLength(1);
    expect(zonesFor(0)).toHaveLength(0);
    expect(zoneBackdropTint({ raceId: 'demons', draftPicks: ['racial'], castleHp: 1 })).toBe(SCORCHED_ZONE_TINT);
    expect(zoneBackdropTint({ raceId: 'demons', draftPicks: ['racial'], castleHp: 0 })).toBe(0xffffff);
    expect(canonSays('A FALLEN SEAT\'S LAND STOPS BURNING')).toBe(true);
  });

  it('⛔ §3e — CORPSE EATER: a shoved boss is re-anchored, and the whistle cuts the feed short (F1, F5)', () => {
    // His own step, the backstop that tells a shove from a shuffle.
    const step = corpseEaterOwnStepPx({ type: 't9BossZombies' } as Creature);
    expect(canonSays(`about **${step.toFixed(1)}** px for the zombie boss`)).toBe(true);
    const eater = readFileSync(new URL('./state/racial/corpseEater.ts', import.meta.url), 'utf8');
    const feed = eater.slice(eater.indexOf('function feedStep('));
    expect(feed.indexOf('reanchorIfDisplaced(world, boss)')).toBeGreaterThan(-1);
    expect(feed.indexOf('reanchorIfDisplaced(world, boss)')).toBeLessThan(feed.indexOf('pickFeedTarget(world, boss)'));
    expect(canonSays('HE IS NEVER SNAPPED BACK')).toBe(true);
    // F5 — the window can never reach the next FIGHT, and the feed is not drawn in BUILD.
    expect(CORPSE_EATER_TICKS).toBeLessThan(PHASE_DURATION_TICKS);
    expect(canonSays(`(\`PHASE_DURATION_TICKS\`, **${PHASE_DURATION_TICKS}** ticks)`)).toBe(true);
    expect(canonSays(`outlasts the window (**${CORPSE_EATER_TICKS}**)`)).toBe(true);
    const feeding = { corpseEaterUntilTick: 100 };
    expect(showsCorpseEaterFeed(feeding, { tick: 50, matchPhase: 'FIGHT' })).toBe(true);
    expect(showsCorpseEaterFeed(feeding, { tick: 50, matchPhase: 'BUILD' })).toBe(false);
  });

  it('⚠ §6 — `attackCycleRaged` rides 50, and the canon records that the 50 docblock omits it', () => {
    const proto = readFileSync(new URL('./net/protocol.ts', import.meta.url), 'utf8');
    const constAt = proto.indexOf('export const PROTOCOL_VERSION');
    const doc = proto.slice(proto.lastIndexOf('/**', constAt), constAt);
    expect(doc).toContain('BUMPED 49 -> 50'); // the right docblock
    // ⚠ The GAP this sentence records. When the merge owner amends the docblock, this goes RED on
    // purpose: delete the canon's "does not list" sentence in the same commit.
    expect(doc).not.toContain('attackCycleRaged');
    expect(canonSays('THE DOCBLOCK DOES NOT LIST: `Creature.attackCycleRaged`')).toBe(true);
    // CANON-10 is the owner's, and the canon must say it is OPEN rather than answer it.
    expect(canonSays('DEPLOY #1 AND DEPLOY #2 BOTH ADVERTISE 50')).toBe(true);
  });

  it('⛔ §9d — the four recurring questions are CLOSED, and §10 no longer lists them as open', () => {
    // The owner: "Resolve all of this now. Don't bring this up again." Each of these was raised
    // with him in more than one session AFTER he had answered it. This test is what stops a
    // future session quietly moving them back to the open list.
    expect(canonSays('CLOSED. It is NOT a defect he wants fixed')).toBe(true);
    expect(canonSays('CLOSED at **120 fifths**')).toBe(true);
    // ⭐ S187 — he WIDENED this from one denominator swap to three rules. All three must be in the
    // canon or the next session re-asks the half that is missing.
    expect(canonSays('ONE NUMBER, THREE SURFACES')).toBe(true);
    expect(canonSays('WIDTH IS BOUNDED AND PROPORTIONAL')).toBe(true);
    expect(canonSays('the damage art follows that same health')).toBe(true);
    // ⛔ And the two bounds are explicitly NOT ruled — they must be measured, not invented.
    expect(canonSays('THE TWO BOUNDS ARE NOT RULED')).toBe(true);
    expect(canonSays('so it is never "owed" again')).toBe(true);
    // ⛔ And the two that used to sit in §10 must be marked ANSWERED there, not merely moved.
    expect(canonSays('§9d')).toBe(true);
    // The lightning hub number is DERIVED, so a drone retune moves it and this goes red.
    expect(4 * attackFifths(DRONE_ATK, DRONE_PEN)).toBe(120);
  });

  it('prints the live PROTOCOL_VERSION', () => {
    expect(canonSays(`is **${PROTOCOL_VERSION}**`)).toBe(true);
  });

  it('still records `PRIMITIVE_MAX_HP` as the area-damage pool for a member shape', () => {
    expect(canonSays(`(\`PRIMITIVE_MAX_HP\` (${PRIMITIVE_MAX_HP})`) || canonSays(`(${PRIMITIVE_MAX_HP})`)).toBe(true);
  });

  /**
   * ⭐ S180 — BOTH CASTLE QUESTIONS WERE ANSWERED, so the canon must now record the ANSWERS and the
   * consequence, not the questions. This asserts the ruling is written down where the next session
   * reads it, and that the retired constant is described as retired rather than as live behaviour.
   */
  it('records the castle rulings the owner gave, and the siege cost they moved', () => {
    // ⭐ S181 — REWORDED, not deleted: the canon now states the clarification AND the later
    // decision (see the dedicated case above). The old exact phrase is gone because the pool IS
    // 2500 now, and asserting it would force the doc to keep a sentence that is no longer true.
    expect(canonSays('2,500 is how many points someone needs to win')).toBe(true);
    expect(canonSays('the flat 6 is gone')).toBe(true);
    expect(canonSays('retired in place, unread')).toBe(true);
    expect(canonSays('between eight and ten')).toBe(true);
  });

  /**
   * ⚠ THE GUARD THAT OUTLIVES THE FIX: the keep must keep taking LADDER damage. If a future session
   * reintroduces a bespoke castle constant, the canon stops being true and this goes red.
   */
  it('keeps the castle on the ladder — no second damage scale may come back', () => {
    const attack = readFileSync(new URL('./state/creatures/creatureAttack.ts', import.meta.url), 'utf8');
    const castleArm = attack.slice(attack.indexOf("kind: 'castle'"));
    expect(castleArm.slice(0, 400)).toContain('attackFifths(');
    expect(castleArm.slice(0, 400)).not.toContain('GOBLIN_DAMAGE_VS_CASTLE');
  });

  /* ══ S182 — §6 correction, §7 the ramp, §8 repair, §9 the open blast ═══════════════════════ */

  /**
   * ⭐ S182 — **THE WIRE LIST WAS MISSING THE MOST LOAD-BEARING FIELD ON IT.** §6 named creature
   * `ehp`, defender `ehp`, primitive `hp` and `castleHp`, and omitted `Bond.damageFifths` — the field
   * a BUILDING's entire health is made of. A session reading the old list would have concluded that
   * building health was not synced and gone looking for a protocol bump it did not need.
   */
  it('§6 lists `Bond.damageFifths`, and it really is serialized AND hashed', () => {
    expect(canonSays('`Bond.damageFifths`')).toBe(true);
    const save = readFileSync(new URL('./state/save.ts', import.meta.url), 'utf8');
    const hash = readFileSync(new URL('./state/stateHashFull.ts', import.meta.url), 'utf8');
    expect(save).toContain('damageFifths');
    expect(hash).toContain('damageFifths'); // the union
    expect(hash).toContain(':dmg'); // …and the hand-written projection, which the union alone misses
  });

  /**
   * ⭐⭐ S183 — **THE REGISTRY IS FIVE, AND THE SELF-DESTRUCT IS STILL ONE.**
   *
   * This asserted `['lightningHub']` from S182, and that single entry was the owner's ruling
   * (*"one at a time … I will present them one after another"*). In S183 he played the pilot,
   * approved it, and presented the next four, so the list moved — as it was always going to.
   *
   * ⛔ **WHAT MUST NEVER MOVE WITH IT IS R182-A**, and that is now the assertion doing the real
   * work here. *"We won't do it for every building."* The ramp generalises; the suicide threshold
   * is earned by the hub being a suicide-drone building. A future session adding tower six gets
   * the ramp for free and turns this test RED the moment it copies `selfDestructBelow` along
   * with it.
   *
   * ⚠ **AND ONE CANON SENTENCE IS NOW STALE, DELIBERATELY LEFT FOR THE MERGE OWNER.** §7 still
   * reads *"THE OTHER TWELVE TOWERS ARE DELIBERATELY NOT MIGRATED"*; four of them now are. The
   * assertion that bound this test to that sentence is replaced by one bound to R182-A, which is
   * the part of §7 that stays true. Branch A does not edit `SPARK_CANON.md` — see its brief §7.
   */
  it('§7 records the ramp, and the self-destruct is still the hub alone', () => {
    expect(RAMP_SPECS.map((s) => s.recipeId))
      .toEqual(['lightningHub', 'goblinTower', 'laserTurret', 'pentagram', 'helga']);
    expect(RAMP_SPECS.filter((s) => s.selfDestructBelow !== null).map((s) => s.recipeId))
      .toEqual(['lightningHub']);
    expect(canonSays('the hub self-destructs. HUB ONLY')).toBe(true);
    expect(canonSays('We won\'t do it for every')).toBe(true);
    // The table's own boundary, derived rather than typed: 8 of 24 frames IS the threshold.
    const spec = RAMP_SPECS[0]!;
    const death = rampDeathFirstFrame(spec)!;
    expect((spec.frames - death + 1) / spec.frames).toBeCloseTo(STAR_SELFDESTRUCT_BELOW_FRAC, 10);
    expect(canonSays(`| **below 33 %** | **${death} → ${spec.frames}** |`)).toBe(true);
    // And the two rows the owner gave by number.
    expect(rampFrameForHealth(1, spec.frames)).toBe(1);
    expect(rampFrameForHealth(TOWER_DAMAGED_BELOW, spec.frames)).toBe(12);
  });

  it('§7 prints the measured balance change, not an estimate of it', () => {
    // banked 34 of a 50 pool: 3 melee-goblin swings (12 each) and 5 chewer bites (7 each).
    const pool = structurePoolFifths(5);
    const trigger = Math.floor(pool * (1 - STAR_SELFDESTRUCT_BELOW_FRAC)) + 1;
    expect(trigger).toBe(34);
    expect(Math.ceil(trigger / 12)).toBe(3);
    expect(Math.ceil(trigger / 7)).toBe(5);
    expect(canonSays('(banked 50 of a 50 pool) to "below a third" (banked 34)')).toBe(true);
  });

  it('§8 records that a dent costs ONE shape, and the fee is still derived', () => {
    // ⚠ The RULING, quoted, not a paraphrase that a tidy-up could soften back to "free".
    expect(canonSays('So far it takes NO shape — that\'s not correct')).toBe(true);
    expect(canonSays('whether it\'s one HP or fifty HP')).toBe(true);
    expect(repairFeeShapeFor('pentagram' as GodlyId)).toBe(SparkType.Triangle);
    expect(repairFeeShapeFor('goblinTower' as GodlyId)).toBe(SparkType.Circle);
    expect(canonSays('pentagram → Triangle, goblin tower → Circle')).toBe(true);
  });

  /**
   * ⛔⛔ THE OPEN QUESTION, AND THE ASSERTION THAT KEEPS IT OPEN. §9's own rule is that an open item
   * gets a test so a later session cannot quietly tidy it away. R182-C is the blast's DAMAGE: the
   * owner ruled 120 fifths believing it was undefined, and it is in fact an instant-kill radial
   * clear. Until he answers, the blast must stay exactly as S157 left it.
   */
  it('§9d RULED R182-C at 120 fifths — but the CODE is still the radial clear, and says so', () => {
    /*
     * ⭐ S187 — the premise of this test moved, its teeth did not. The QUESTION is closed (the owner
     * killed the raze and his "four times a drone" number stands), but the CODE is unchanged, so the
     * canon says RULED-NOT-YET-BUILT and this asserts BOTH halves. A canon that claimed behaviour the
     * tree does not have would be the exact rot this file exists to prevent, pointing the other way.
     */
    expect(canonSays('R182-C')).toBe(true);
    expect(canonSays('RULED, NOT YET BUILT')).toBe(true);
    const lifecycle = readFileSync(new URL('./state/potatoLifecycle.ts', import.meta.url), 'utf8');
    const arm = lifecycle.slice(lifecycle.indexOf('export function applyStructureSelfDestruct'));
    const body = arm.slice(0, 1200);
    expect(body).toContain('applyRadialClear'); // still the raze…
    expect(body).not.toContain('attackFifths'); // …and NOT quietly converted to ladder damage
    // And S157 P0's owner-exemption is still the thing that spares his own base.
    expect(body).toContain('ownerPlayerId');
  });

  /**
   * S182 - THE ARCADE BOARD (R182-G) AND ADAPTIVE DIFFICULTY (R182-H).
   *
   * Both are OWNER RULINGS that lived only in commit messages and code comments on an unmerged
   * branch until this merge. The canon rule is that a ruling lands HERE, with its assertion, or it
   * rots - so these pin the two claims a future session is most likely to undo by accident.
   */
  it('records that the arcade ranks by AVERAGE, from run 1, on a random puzzle set', () => {
    expect(canonSays('RANKING IS AN AVERAGE, NOT A BEST TIME')).toBe(true);
    // The load-bearing half: the average is only FAIR because puzzles are random and many.
    expect(canonSays('washes')).toBe(true);
    // No minimum run count - he ruled this explicitly against Claude's proposal.
    expect(canonSays('No minimum run count')).toBe(true);
    // Lossless storage: a mean-of-means would silently drift and cannot be recovered.
    expect(canonSays('never a mean')).toBe(true);
  });

  /**
   * R182-H - the difficulty dial must stay BUILT and UNWIRED. A session tidying dead code would
   * delete it; a session being helpful would wire it. Both are wrong, and this is the tripwire.
   */
  it('keeps the difficulty dial unwired, and records why', () => {
    expect(canonSays('nothing passes it')).toBe(true);
    expect(canonSays('do not delete it as dead code, and do not wire it')).toBe(true);
    // The collision that must be solved BEFORE H ships, stated so it cannot be rediscovered late.
    expect(canonSays('improving would make you')).toBe(true);
    // And that H and the Steam login are ONE dependency, not two.
    expect(canonSays('ONE dependency, not two')).toBe(true);
  });

  /**
   * §9b — RETALIATION. The canon states four owner rulings and two exclusions; these bind the two
   * that are SETS, because a set is the thing a future session widens by accident.
   */
  it('§9b pins the ONE named exception, and that it is a name rather than a category', () => {
    expect([...NEVER_RETALIATES]).toEqual(['chewer']);
    expect(canonSays('`NEVER_RETALIATES` is a **one-member set of NAMES**')).toBe(true);
    // R183-D is the reason it cannot become a predicate: the bomber shares the chewer's flag.
    expect(getCreatureConfig('goblinSuicide').targetsStructures).toBe(true);
    expect(creatureRetaliates('goblinSuicide')).toBe(true);
    expect(creatureRetaliates('chewer')).toBe(false);
  });

  it('§9b pins the lightning drone as the ONE unit excluded that the owner did not name', () => {
    const missiles = (Object.keys(CREATURE_TARGETS) as CreatureType[]).filter((type) => {
      const cfg = getCreatureConfig(type);
      return cfg.selfExplode && !cfg.targetsStructures;
    });
    expect(missiles).toEqual(['lightningDrone']);
    expect(canonSays('(`selfExplode && !targetsStructures`)')).toBe(true);
  });

  /**
   * §9b — R184-A. The kiting collapse was PUT to the owner with the three-arm control and he chose
   * to ship it as ruled, declining both narrowings. That makes it intended behaviour, and the risk
   * flips: the danger is no longer that someone forgets to ask him, it is that a future session
   * rediscovers 980 → 230, reads it as a bug and "fixes" a ruling. The control table and the
   * do-not-fix sentence both have to survive.
   */
  it('§9b records R184-A: the kiting collapse is RULED, and the control table survives', () => {
    expect(canonSays('archer present, retaliation DISABLED')).toBe(true);
    expect(canonSays('THIS IS NOT A CODING ERROR')).toBe(true);
    expect(canonSays('HE CHOSE TO SHIP IT AS RULED')).toBe(true);
    expect(canonSays('DO NOT "FIX" IT')).toBe(true);
  });

  it('§9b records that retaliation cost no protocol bump, and that is still true', () => {
    /*
     * ⚠ S186 — THIS USED TO ASSERT `PROTOCOL_VERSION === 47` TO PROVE A CLAIM ABOUT RETALIATION, so
     * S186's bump (taken for the dynamic win bar, nothing to do with retaliation) turned it red and
     * the tempting green would have been to edit the number — quietly re-pinning an unrelated fact to
     * the next version, and the next. The claim is STATIC: retaliation added no serialized field and
     * no new discriminant, so it never owed a bump. That is what is asserted now.
     */
    expect(canonSays('retaliation added NO serialized field and NO new')).toBe(true);
    expect(canonSays('needed no bump of its own')).toBe(true);
  });

  /**
   * §7 — R185-A/B. The weld was an OPEN CALL for two sessions and is now ruled, which flips the
   * risk exactly as §9b's docblock describes: the danger is no longer that nobody asked him, it is
   * that a future session reads "a shape shows through a tower" or "one weld makes a structure
   * unrepairable" as an obvious defect and helpfully reverses him. Both do-not-touch sentences and
   * both quotes have to survive, or the next audit re-opens what he closed.
   *
   * ⚠ The 48/32 line is pinned deliberately: R185-B is endorsed but NOT verified, and the sentence
   * recording that is the only thing standing between "he ruled it" and "it actually works".
   */
  it('§7 records R185-A: a welded shape stays at FULL OPACITY, and the gap is closed', () => {
    expect(canonSays('R185-A — THE WELD STAYS AT FULL OPACITY')).toBe(true);
    expect(canonSays("that's not from your tower, should be at full opacity")).toBe(true);
    expect(canonSays('SO DO NOT HIDE IT AND DO NOT "SWALLOW" IT')).toBe(true);
    // The superseded wording must NOT come back — it is what would re-open the question.
    expect(canonSays("the owner's call whether a weld should be swallowed")).toBe(false);
  });

  it('§7 records R185-B: welding buys pool and costs repair, on purpose', () => {
    expect(canonSays('R185-B — AND THE UNREPAIRABLE CONSEQUENCE IS A DELIBERATE TRADE')).toBe(true);
    expect(canonSays('they have a lot higher HP. But they cannot be repaired')).toBe(true);
    // The unverified half is load-bearing: it must not be quietly upgraded to "shipped".
    // Single-line needle on purpose — the prose wraps, and a needle that spans the wrap would
    // pass or fail on reflow rather than on meaning.
    expect(canonSays('ONE THING REMAINS UNVERIFIED AND MUST NOT BE')).toBe(true);
    expect(canonSays('**48%**')).toBe(true);
    expect(canonSays('**32%**')).toBe(true);
  });

  /**
   * §9c — R185-C/D. Two S184 audit findings the owner overruled. These are the cheapest possible
   * tests to write and among the most valuable in this file: both findings were produced by an
   * audit, so an audit will produce them again. Without these lines the next session "fixes" a
   * skill expression and a visual he likes.
   */
  it('§9c records R185-C: clicking an enemy building through fog is INTENDED', () => {
    expect(canonSays('R185-C — CLICKING AN ENEMY BUILDING THROUGH FOG IS INTENDED')).toBe(true);
    expect(canonSays('more knowledgeable players would be doing')).toBe(true);
    expect(canonSays('DO NOT GATE IT ON `isConcealed`')).toBe(true);
  });

  it('§9c records R185-D: the connector damage numbers stay exactly as they are', () => {
    expect(canonSays('R185-D — THE CONNECTOR DAMAGE NUMBERS ARE GOOD AS THEY ARE')).toBe(true);
    expect(canonSays('it just looks epic')).toBe(true);
    expect(canonSays('DO NOT SUPPRESS AND DO NOT RE-ANCHOR')).toBe(true);
  });
});
