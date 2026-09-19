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

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CASTLE_ATTACK_RANGE,
  CASTLE_ATK,
  CASTLE_MAX_HP,
  CASTLE_PEN,
  HAZARD_SPAWN_ENABLED,
  LONE_PRIMITIVE_POOL_FIFTHS,
  PRIMITIVE_MAX_HP,
  PRINCESS_SLAP_RANGE,
  SparkType,
  STINK_BAG_DEF,
  STINK_BAG_HP,
  STINK_TOWER_ATTACK_RANGE,
  TURRET_ATTACK_RANGE,
} from './constants.ts';
import { PROTOCOL_VERSION } from './net/protocol.ts';
import { structurePoolFifths, unitPoolFifths } from './state/stats.ts';
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
  it('§9 keeps R182-C open — the blast is STILL the radial clear, not a ladder number', () => {
    expect(canonSays('R182-C')).toBe(true);
    expect(canonSays('UNANSWERED. Nothing was built.')).toBe(true);
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
   * §9b's OPEN block. The measured kiting collapse is the one thing in this feature that needs the
   * owner, and the numbers are his evidence — so the canon must still be carrying them, and must
   * still say it is not a coding error rather than quietly reading as a bug report someone fixed.
   */
  it('§9b keeps the kiting measurement OPEN, with its three-arm control intact', () => {
    expect(canonSays('archer present, retaliation DISABLED')).toBe(true);
    expect(canonSays('THIS IS NOT A CODING ERROR')).toBe(true);
    expect(canonSays('is ours to pick')).toBe(true);
  });

  it('§9b records that retaliation cost no protocol bump, and that is still true', () => {
    expect(canonSays('stays 47')).toBe(true);
    expect(PROTOCOL_VERSION).toBe(47);
  });
});
