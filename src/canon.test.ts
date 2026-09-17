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
  STINK_BAG_DEF,
  STINK_BAG_HP,
  STINK_TOWER_ATTACK_RANGE,
  TURRET_ATTACK_RANGE,
} from './constants.ts';
import { PROTOCOL_VERSION } from './net/protocol.ts';
import { structurePoolFifths, unitPoolFifths } from './state/stats.ts';
import { castleShotFifths } from './state/castleGuns.ts';
import { castleRegenPerSecond } from './state/castleRegen.ts';

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
});
