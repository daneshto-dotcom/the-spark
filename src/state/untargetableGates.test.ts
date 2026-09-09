/**
 * SPARK — S169 (owner R142, and R121) — **"CANNOT BE TARGETED", BUILT ONCE.**
 *
 * Owner on the Pharaoh's locusts: *"locusts attack with 10 atk and 10 pen and **they cannot be
 * targeted**."* R121 wants the identical verb for the submerged naga. Two rulings, one condition —
 * so it is built as a condition rather than as a Pharaoh feature, exactly the call the owner himself
 * made for STUN (R152) and for the damage-over-time mechanic before that.
 *
 * ## ⭐ A REAL CHOKEPOINT EXISTS — AND ⛔ IT COVERS FAR LESS THAN THIS FILE ONCE CLAIMED
 *
 * The R142 note warned this would touch "every acquisition path" and asked where a single chokepoint
 * could live so future paths inherit it by construction. One does exist:
 * **`findNearestEnemyCreatureFrom`**. Creature-vs-creature acquisition, the standoff wrapper, the
 * CASTLE GUNS, every generic DEFENDER (laser turret, Helga, stink tower) and the gatherer renderer's
 * preview of the castle gun genuinely do funnel through it. That much survived verification.
 *
 * ⛔⛔ **CORRECTED S171 — THE PARAGRAPH THAT STOOD HERE WAS WRONG, AND IT IS RECORDED RATHER THAN
 * QUIETLY DELETED BECAUSE THE FAILURE MODE IS THE POINT.** It read:
 *
 * > *"⚠ THE BYPASSES WERE AUDITED RATHER THAN ASSUMED. Three places iterate `world.creatures`
 * > directly: `underDroneCaps` (population counting), `recallArmies` (moves your OWN units home) and
 * > the boss-death bookkeeping in `hostTick`. None of them picks a victim, so none needs the gate."*
 *
 * Twenty-five production files iterate `world.creatures`; fifteen filter by ownership. The three
 * named are correctly benign — and the audit missed the Kraken's sonar AIM pick, the Archdemon's
 * teleport victim, the Voltkin chain hop, the raid picker AND the authoritative `RAID_TARGET`
 * reducer, the projectile renderer's own scan, and the entire retention family. The sibling claim in
 * `creatures/creatureAI.ts` — *"THIS ONE LINE COVERS EVERY CREATURE-TARGETING PATH IN THE GAME"* —
 * was wrong the same way.
 *
 * Both were written by sessions that had genuinely looked. **A prose enumeration cannot stay true.**
 * The gates are now driven individually in `untargetableRetention.test.ts`, and the census itself is
 * re-counted on every run by `untargetableCallSites.test.ts`.
 *
 * ## ⛔ THE DISTINCTION THIS FILE EXISTS TO PIN: NOT TARGETABLE ≠ NOT DAMAGEABLE
 *
 * The gate makes a unit impossible to SELECT. It does not make it impossible to HURT. Area effects
 * that sweep a region rather than choose a victim — the potato's radial clear, the hub's
 * self-destruct, the zombie rot aura, the Kraken's own sonar cone — must still reach it. Reading
 * "cannot be targeted" as invulnerability would make a 15-second locust cloud unkillable by
 * anything at all, which is plainly not what he asked for, and it is the reading a future editor is
 * most likely to drift into. Both halves are asserted below.
 */

import { describe, expect, it } from 'vitest';
import { KRAKEN_SONAR_INTERVAL_TICKS, PLAYER_COLORS } from '../constants.ts';
import { runKrakenSonar } from './bossSkillsKraken.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { findNearestEnemyCreatureFrom } from './creatures/creatureAI.ts';
import { CREATURE_CONFIGS, isUntargetableType } from './creatures/voltkin-config.ts';
import type { CreatureType } from './creatures/creature.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId, type CreatureId } from '../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function twoSeat(): World {
  const world = makeWorld(0);
  world.isHost = true;
  world.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  world.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  world.matchPhase = 'FIGHT';
  world.phaseEndsAtTick = world.tick + 1_000_000;
  return world;
}

let spawner = 1;
function spawn(world: World, type: string, owner: ReturnType<typeof asPlayerId>, x: number): CreatureId {
  const before = world.creatures.size;
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: type as never,
    ownerPlayerId: owner,
    pos: { x, y: 500 },
    targetPos: { x, y: 500 },
    sourceSpawnerId: spawner++ as never,
  });
  if (world.creatures.size !== before + 1) throw new Error('fixture: spawn refused by a population gate');
  let newest: CreatureId | null = null;
  for (const c of world.creatures.values()) {
    if (newest === null || (c.id as number) > (newest as number)) newest = c.id;
  }
  return newest!;
}

/**
 * Run `fn` with `type` temporarily flagged untargetable.
 *
 * ⚠ MUTATES THE SHARED CONFIG TABLE AND RESTORES IN `finally`. Done deliberately rather than by
 * shipping a real untargetable unit just to have something to test: the CONDITION is what landed
 * this session, and the first unit that uses it (the Pharaoh's locusts) needs art that does not
 * exist yet. This keeps the gate under test today instead of untested until that art arrives.
 */
function withUntargetable(type: CreatureType, fn: () => void): void {
  const cfg = CREATURE_CONFIGS[type] as { untargetable?: boolean };
  const had = cfg.untargetable;
  cfg.untargetable = true;
  try {
    fn();
  } finally {
    if (had === undefined) delete cfg.untargetable;
    else cfg.untargetable = had;
  }
}

describe('S169 R142/R121 — the condition itself', () => {
  it('⭐ EXACTLY ONE type is untargetable, and it is the locust cloud', () => {
    /*
     * ⭐ S171 — REWRITTEN, AND THE REWRITE IS THE FEATURE LANDING. This read *"NOTHING shipped today
     * is untargetable — the flag changes no existing unit"*, which was the correct assertion for
     * S169: the condition shipped with no consumer, so behaviour-neutrality was the whole claim.
     *
     * R142's locust cloud is the first consumer the flag has ever had, so that assertion had to
     * become false for the feature to exist at all. It is replaced rather than deleted, and it is
     * now the STRONGER statement: exactly one type carries the flag. That still catches the thing
     * the original was guarding against — a stray `untargetable: true` making some existing unit
     * silently unclickable — while no longer forbidding the unit the flag was built for.
     */
    const untargetable = (Object.keys(CREATURE_CONFIGS) as CreatureType[])
      .filter((t) => isUntargetableType(t));
    expect(untargetable).toEqual(['locustCloud']);
  });

  it('⭐ and the predicate reads the flag when it is set', () => {
    withUntargetable('chewer', () => {
      expect(isUntargetableType('chewer')).toBe(true);
    });
    expect(isUntargetableType('chewer'), 'restored').toBe(false);
  });
});

describe('S169 R142/R121 — the chokepoint refuses to SELECT an untargetable unit', () => {
  it('⭐⭐ the nearest-enemy scan SKIPS it and takes the next one instead', () => {
    const world = twoSeat();
    const near = spawn(world, 'chewer', P1, 520); // closest, but will be untargetable
    const far = spawn(world, 'goblinMelee', P1, 700);
    void near;

    // CONTROL first: with nothing flagged, the near one is chosen.
    expect(findNearestEnemyCreatureFrom(world, { x: 500, y: 500 }, P0)).toBe(near);

    withUntargetable('chewer', () => {
      expect(
        findNearestEnemyCreatureFrom(world, { x: 500, y: 500 }, P0),
        'the scan must fall through to the farther, targetable enemy',
      ).toBe(far);
    });
  });

  it('⭐ a board of NOTHING BUT untargetable enemies yields no target at all', () => {
    const world = twoSeat();
    spawn(world, 'chewer', P1, 520);
    withUntargetable('chewer', () => {
      expect(findNearestEnemyCreatureFrom(world, { x: 500, y: 500 }, P0)).toBeNull();
    });
  });

  it('⛔ castle guns and every defender inherit it — they share this function', () => {
    /*
     * ⚠ REWRITTEN S171. This was a `readFileSync` substring check asserting that `castleGuns.ts` and
     * `defenderLifecycle.ts` each CONTAIN the string 'findNearestEnemyCreatureFrom'. Its comment
     * claimed *"If any of them ever grows its own scan, this goes red"* — which it could not do: the
     * assertion passes on a COMMENT mentioning the name, and a second ungated scan added beside the
     * routed one leaves it green. It was a grep dressed as a test, and it was the only thing standing
     * behind the file's coverage claim.
     *
     * The property it was reaching for is real, so it is now asserted where it can actually be
     * proven: the census in `untargetableCallSites.test.ts` re-counts every enemy-shaped scan in the
     * tree on every run and requires each to consult the gate or carry a written verdict. What is
     * kept here is the cheap, honest half — that these two files still route through the chokepoint
     * rather than having quietly grown a private scan.
     */
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const read = (rel: string) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');
    for (const f of ['state/castleGuns.ts', 'state/defenders/defenderLifecycle.ts']) {
      expect(read(f).includes('findNearestEnemyCreatureFrom'), `${f} routes through the chokepoint`).toBe(true);
    }
  });
});

describe('S169 R142/R121 — ⛔ untargetable is NOT invulnerable', () => {
  it('⭐⭐ an AREA effect still reaches it — the Kraken sonar cone hits an untargetable unit', () => {
    /*
     * THE DISTINCTION THIS WHOLE FILE IS FOR. A sweep over a region does not "target" anyone: it
     * asks who is standing in the shape. If untargetability blocked that too, a 15-second locust
     * cloud would be unkillable by anything in the game — and the owner asked for a cloud you cannot
     * click, not a cloud you cannot beat.
     */
    const world = twoSeat();
    // The Kraken needs a targetable enemy to AIM at, plus an untargetable one standing in the cone.
    const aim = spawn(world, 'goblinMelee', P1, 600);
    const ghost = spawn(world, 'chewer', P1, 620);
    dispatch(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 't9BossNagas' as never,
      ownerPlayerId: P0,
      pos: { x: 500, y: 500 },
      targetPos: { x: 500, y: 500 },
    });
    const boss = [...world.creatures.values()].find((c) => c.type === 't9BossNagas')!;

    withUntargetable('chewer', () => {
      for (let i = 0; i < KRAKEN_SONAR_INTERVAL_TICKS + 2; i++) {
        world.tick++;
        if ((world.tick + (boss.id as number)) % KRAKEN_SONAR_INTERVAL_TICKS === 0) {
          runKrakenSonar(world);
          break;
        }
      }
      expect(
        world.creatures.get(ghost)!.stunnedUntilTick,
        'an area sweep reaches an untargetable unit',
      ).toBeDefined();
      expect(world.creatures.get(aim)!.stunnedUntilTick, 'and the aimed one too').toBeDefined();
    });
  });
});
