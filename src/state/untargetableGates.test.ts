/**
 * SPARK — S169 (owner R142, and R121) — **"CANNOT BE TARGETED", BUILT ONCE.**
 *
 * Owner on the Pharaoh's locusts: *"locusts attack with 10 atk and 10 pen and **they cannot be
 * targeted**."* R121 wants the identical verb for the submerged naga. Two rulings, one condition —
 * so it is built as a condition rather than as a Pharaoh feature, exactly the call the owner himself
 * made for STUN (R152) and for the damage-over-time mechanic before that.
 *
 * ## ⭐ THE ENUMERATION CAME BACK WITH GOOD NEWS, WHICH IS WORTH RECORDING
 *
 * The R142 note warned this would touch "every acquisition path" and asked where a single chokepoint
 * could live so future paths inherit it by construction. It already exists:
 * **`findNearestEnemyCreatureFrom`**. Creature-vs-creature acquisition, the standoff wrapper, the
 * CASTLE GUNS, every generic DEFENDER (laser turret, Helga, stink tower) and the gatherer renderer's
 * preview of the castle gun all funnel through it. One line covers them all.
 *
 * ⚠ THE BYPASSES WERE AUDITED RATHER THAN ASSUMED. Three places iterate `world.creatures` directly:
 * `underDroneCaps` (population counting), `recallArmies` (moves your OWN units home) and the
 * boss-death bookkeeping in `hostTick`. None of them picks a victim, so none needs the gate.
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
  it('⭐ NOTHING shipped today is untargetable — the flag changes no existing unit', () => {
    // The flag is optional and defaults to targetable, so introducing it must be behaviour-neutral
    // for every unit already in the game. This is the assertion that says so.
    for (const type of Object.keys(CREATURE_CONFIGS) as CreatureType[]) {
      expect(isUntargetableType(type), `${type} must still be targetable`).toBe(false);
    }
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

  it('⛔ ONE line, but it covers castle guns and every defender too — they share this function', () => {
    // Asserted at the source rather than by driving each subsystem: the claim is that these are not
    // separate acquisition paths at all. If any of them ever grows its own scan, this goes red and
    // the new path has to be gated explicitly.
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
