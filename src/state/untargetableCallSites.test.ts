/**
 * SPARK — S171 — **THE ACQUISITION CENSUS: A GUARD THAT READS THE TREE.**
 *
 * ## Why this is a filesystem scan and not a behavioural test
 *
 * It is the same argument `damage.wired.test.ts` makes, and that file earned it the hard way: S138
 * shipped `damageEntity` with 22 green unit tests and **zero production call sites** — perfect,
 * tested, dead code for a whole session, because every test called the function itself. Its
 * docblock draws the conclusion this file inherits:
 *
 * > *"No behavioural test could have caught that ... The failure was not in the behaviour of the
 * > function; it was in the absence of an edge from the game to the function. That is a property of
 * > the import graph, so the guard has to read the import graph."*
 *
 * "Every path that picks a creature victim consults the targetability gate" is exactly that kind of
 * property. No behavioural test can assert it, because the failure mode is a path **that does not
 * exist yet** — the eighth scan, added next year by a session that never heard of R142.
 *
 * ## What went wrong before, and why the bar is here rather than in a docblock
 *
 * Two separate claims of completeness were made and both were false:
 *
 * · `creatureAI.ts` says of its one guarded line — *"⭐ THIS ONE LINE COVERS EVERY CREATURE-TARGETING
 *   PATH IN THE GAME, which is the happy finding of the enumeration."* It covers six paths of
 *   thirteen.
 * · `untargetableGates.test.ts` says — *"⚠ THE BYPASSES WERE AUDITED RATHER THAN ASSUMED. Three
 *   places iterate `world.creatures` directly ... none needs the gate."* Twenty-five production
 *   files iterate `world.creatures`; fifteen of them filter by ownership.
 *
 * Both were written in good faith by sessions that had genuinely looked. **Prose cannot hold an
 * enumeration; only a machine re-counts it on every run.** That is the whole of this file.
 *
 * ## ⚠ WHAT THIS TEST CAN AND CANNOT SEE — stated plainly, so nobody over-trusts it
 *
 * It works at FILE granularity: a file containing an enemy-shaped creature scan must also mention
 * the gate. It therefore CANNOT catch a file that has one guarded scan and one ungated one beside
 * it. It is a tripwire for the new subsystem that forgets the gate entirely — the failure that has
 * actually happened here, twice — and the per-path behavioural assertions in
 * `untargetableRetention.test.ts` are what prove each individual gate works.
 *
 * ## When this goes red
 *
 * A new production file grew a loop over `world.creatures` that filters by `ownerPlayerId`. Decide
 * which it is and act, do NOT just add it to the allowlist:
 *   · it PICKS a victim  ⇒ add the `isUntargetable(c, world.tick)` guard, and a behavioural test;
 *   · it SWEEPS an area  ⇒ allowlist it WITH A REASON. Area effects must still reach untargetable
 *     units — that is the standing ruling, and reading "cannot be targeted" as invulnerability
 *     would make a 15-second locust cloud unkillable by anything at all.
 *
 * ⭐ THE ANTI-ROT TEST BELOW CAUGHT ITS FIRST STALE ENTRY ON ITS FIRST RUN, AND IT WAS MINE.
 * `seagulls/seagullLifecycle.ts` was written into the verdict list because the S171 sweep had ruled
 * on it — the poop victim is an AREA hit and was deliberately left ungated — but that file carries
 * no ownership filter, so it was never in this census to begin with. The exemption described a
 * decision that was real about a file this test never examined, which is precisely the shape of a
 * stale allowlist entry: correct-sounding, and load-bearing for nothing. The seagull ruling lives in
 * the S171 PDR where it belongs; this list holds only files the census actually reaches.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');

/** Every non-test .ts file under src/, recursively — the same walk `damage.wired.test.ts` uses. */
function productionFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) productionFiles(full, out);
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const rel = (p: string): string => p.slice(SRC.length + 1).split('\\').join('/');

/**
 * NOT an acquisition, and the reason each one is not. Every entry was read in full during the S171
 * A.0 sweep — this list is a set of VERDICTS, not a set of exemptions.
 */
const NOT_ACQUISITION: Readonly<Record<string, string>> = {
  'bots/botBrain.ts':
    'AVOIDANCE, not acquisition. `nearestChewer` filters on `type !== chewer` and returns a position ' +
    'for the bot to steer AWAY from; the ownership filter in this file belongs to `nearestEnemyPrim`, ' +
    'which targets PRIMITIVES. A bot giving a locust cloud a wide berth is correct anyway.',
  'state/bossSkills.ts':
    'AREA + BOOKKEEPING. `runZombieRotAura` sweeps a radius and `liveIdsOfType` counts a population. ' +
    'The rot aura reaching an untargetable unit is required by the standing ruling, not a leak.',
  'state/bossSkillsWarlord.ts':
    'POPULATION COUNT. The direwolf pack census (`pack++`) and the rage latch over the boss OWN health. ' +
    'Neither selects a victim.',
  'state/creatures/creatureLifecycle.ts':
    'LIFECYCLE. Despawn/expiry sweeps and the deferred-death batch. Removal is not acquisition.',
  'state/damage.ts':
    'AREA. `applyRadialDamage` asks who is standing in a shape. This is the canonical case the ' +
    '"untargetable is NOT invulnerable" ruling exists to protect.',
  'state/defenders/stinkTower.ts':
    'AREA. `stinkAggroTargets` collects everyone inside `STINK_AURA_RADIUS` (and only once the tower ' +
    'is depleted). The lob target is a scattered POSITION, not a chosen unit.',
  'state/potatoLifecycle.ts':
    'AREA, and deliberately the most total one — the radial clear that "obliterates regardless of hp". ' +
    'It is the counterplay that keeps an untargetable cloud killable.',
  'state/raceUnitEmit.ts':
    'POPULATION COUNT for the castle emit cadence.',
  'state/vision.ts':
    'FOG. Builds the vision set. Reads positions, selects no victim — and gating it would make ' +
    'untargetable units invisible rather than unclickable, which is a different (and wrong) feature.',
};

describe('S171 — the acquisition census cannot silently grow an ungated path', () => {
  const files = productionFiles(SRC);

  /** Files whose text loops over the creature map AND filters by ownership: the enemy-scan shape. */
  const enemyScans = files.filter((f) => {
    const src = readFileSync(f, 'utf8');
    const iterates = /of world\.creatures|of this\.world\.creatures/.test(src);
    const filtersOwner = /ownerPlayerId\s*(===|!==)/.test(src);
    return iterates && filtersOwner;
  });

  it('⭐ the census is non-empty — the scan itself still works', () => {
    // Guards against the whole test silently passing because a refactor renamed `world.creatures`
    // and the regex now matches nothing. A vacuous green here would be worse than a red.
    expect(enemyScans.length).toBeGreaterThan(8);
  });

  it('⭐⭐ every enemy-shaped creature scan either CONSULTS THE GATE or is a recorded verdict', () => {
    const offenders: string[] = [];
    for (const f of enemyScans) {
      const src = readFileSync(f, 'utf8');
      const guarded = src.includes('isUntargetable') || src.includes('findNearestEnemyCreatureFrom');
      if (guarded) continue;
      const r = rel(f);
      if (r in NOT_ACQUISITION) continue;
      offenders.push(r);
    }
    expect(
      offenders,
      'A new production file selects among enemy creatures without consulting the targetability ' +
        'gate. If it PICKS a victim, add `isUntargetable(c, world.tick)` and a behavioural test. If ' +
        'it SWEEPS AN AREA, add it to NOT_ACQUISITION with the reason — area effects must still ' +
        'reach untargetable units.',
    ).toEqual([]);
  });

  it('⛔ the verdict list cannot rot — every entry must still be a real file with a real scan', () => {
    // Without this, a file that is deleted or that loses its scan leaves a stale exemption behind,
    // and the next file to take that path inherits a pass it never earned.
    const live = new Set(enemyScans.map(rel));
    const stale = Object.keys(NOT_ACQUISITION).filter((k) => !live.has(k));
    expect(
      stale,
      'These files no longer contain an enemy-shaped creature scan. Remove them from ' +
        'NOT_ACQUISITION rather than leaving an exemption nothing is using.',
    ).toEqual([]);
  });

  it('⭐ and every verdict carries an actual REASON, not a bare exemption', () => {
    for (const [file, reason] of Object.entries(NOT_ACQUISITION)) {
      expect(reason.length, `${file} needs a real reason`).toBeGreaterThan(40);
    }
  });

  it('⭐⭐ the gate itself has exactly ONE definition, so there is one place to change', () => {
    // The whole design rests on `isUntargetable` being the single read — that is what let the STATE
    // source (the Ra ritual) be added in one place and inherited by every acquisition path. A second
    // definition would quietly fork that.
    const defs = files.filter((f) => /export function isUntargetable\b/.test(readFileSync(f, 'utf8')));
    expect(defs.map(rel)).toEqual(['state/creatures/creature.ts']);
  });
});
