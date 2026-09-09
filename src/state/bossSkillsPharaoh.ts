/**
 * SPARK — S171 (owner R142) — **THE PHARAOH'S LOCUST LAUNCH.**
 *
 * > *"he lunches a cone of locusts that fly around in locust clouds targeting units and building for
 * > 15 sec. he lunches it when the first enemy is in range. locusts attack with 10 atk and 10 pen and
 * > they cannot be targeted."*
 *
 * ## ⛔ THE CONE IS THE LAUNCH, NOT THE MECHANIC
 *
 * Every carrier of this ruling had compressed it to "the locust cone" — the boot snapshot, the
 * session state, and the S170 PDR, which hardened it further to "wedge". All of those describe a
 * persistent cone volume that damages what stands inside it. His words are *a cone of locusts **that
 * then fly around in clouds***: the wedge decides only WHERE THEY ARE BORN, and from the next tick
 * each cloud is an ordinary autonomous unit that hunts on its own.
 *
 * That makes `runWarlordDirewolves` the template for this file, not `runKrakenSonar`. Same shape:
 * corpse guard, stun guard, tick-derived cadence phase-spread by boss id, a population count, and a
 * deterministic fixed-angle formation. Nothing here is new machinery — which is the point.
 *
 * ⚠ `inCone` IS NOT USED HERE, AND THAT IS DELIBERATE. It is a MEMBERSHIP test (is this point inside
 * the wedge). The launch does not test membership, it PLACES clouds inside one, which is `cos`/`sin`
 * at fixed angles. `inCone` earns its keep as this file's TEST ORACLE — the spec asserts every
 * launched cloud lies inside the wedge by feeding it back through that exact predicate — but calling
 * the launch "a reuse of inCone" would have invited a later session to write ad-hoc trigonometry and
 * believe it was covered.
 *
 * ## The trigger, and why it re-arms rather than firing once
 *
 * *"he lunches it when the first enemy is in range"* is a CONDITION, not a one-shot: it names the
 * moment the first fan goes out, and says nothing about him never doing it again over a whole match
 * in which he is meant to survive multiple FIGHT phases. So the launcher fires whenever an enemy is
 * within `PHARAOH_LOCUST_TRIGGER_RANGE` and his cadence slot comes round, bounded by
 * `PHARAOH_LOCUST_MAX_PER_OWNER` live clouds. With no enemy in range nothing is spent — the fan
 * genuinely waits for the first one to arrive.
 *
 * ⛔ THE CADENCE IS `(world.tick + bossId) % INTERVAL`, phase-spread by id, never an accumulated
 * remainder. Two Pharaohs never launch on the same tick, nothing is remembered between launches so
 * there is no ledger to desync, and a mid-match host migration can neither skip nor double a fan.
 */

import {
  PHARAOH_LOCUST_CADENCE_TICKS,
  PHARAOH_LOCUST_CONE_HALF_ANGLE,
  PHARAOH_LOCUST_COUNT,
  PHARAOH_LOCUST_MAX_PER_OWNER,
  PHARAOH_LOCUST_SPAWN_DIST,
  PHARAOH_LOCUST_TRIGGER_RANGE,
} from '../constants.ts';
import { liveIdsOfType } from './bossSkills.ts';
import { nearestEnemyFor } from './bossSkillsKraken.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import { isStunned } from './creatures/creature.ts';
import { dispatch } from './world.ts';
import type { World } from './world.ts';

/**
 * ⭐⭐ **THE FAN.** Host-only, on a cadence, phase-spread by boss id.
 *
 * ⚠ THE AIM IS `nearestEnemyFor`, WHICH CARRIES THE UNTARGETABLE GATE (S171 P2A). That matters more
 * than it looks: without it a Pharaoh would aim his fan at another Pharaoh's locust cloud, and two
 * Pharaohs on a board would spend the whole fight firing swarms at each other's swarms.
 */
export function runPharaohLocusts(world: World): void {
  if (world.gameState !== 'PLAYING') return;

  for (const bossId of liveIdsOfType(world, T9_BOSS_TYPE.mummies)) {
    const boss = world.creatures.get(bossId);
    if (boss === undefined || boss.ehp <= 0) continue;
    // ⭐ S169 (owner R152) — a stunned boss takes no action. *"cant do anything."* Same placement and
    // same reasoning as every other boss runner: a boss who cannot act does not act, and the stun is
    // the only counterplay a player has against one.
    if (isStunned(boss, world.tick)) continue;
    if ((world.tick + (bossId as number)) % PHARAOH_LOCUST_CADENCE_TICKS !== 0) continue;

    /*
     * *"he lunches it when the first enemy is in range."* The aim doubles as the trigger: if there is
     * no reachable enemy there is nothing to aim at and nothing is spent. Reusing the Kraken's scan
     * rather than writing a second one keeps both bosses' notion of "close enough" identical — and
     * keeps the untargetable gate in one place rather than two.
     */
    const aim = nearestEnemyFor(world, boss, PHARAOH_LOCUST_TRIGGER_RANGE * PHARAOH_LOCUST_TRIGGER_RANGE);
    if (aim === null) continue;

    /*
     * ⛔ THE POPULATION COUNT IS NOT OPTIONAL BOOKKEEPING — it is the bound that replaces the one the
     * spawn latch used to impose. `locustCloud` is EXEMPT from the one-live-per-(owner, type) gate
     * (it has to be: a fan of three cannot pass a one-per-type bound), so if this count went missing
     * a re-arming launcher would fill the board. Counted the direwolf way, walking live creatures,
     * because a stored tally is a thing that can desync.
     */
    let live = 0;
    for (const c of world.creatures.values()) {
      if (c.type === 'locustCloud' && c.ownerPlayerId === boss.ownerPlayerId) live++;
    }
    if (live >= PHARAOH_LOCUST_MAX_PER_OWNER) continue;

    /*
     * The wedge, aimed at `aim`. Integer `Math.atan2` inputs and a fixed angular step: no
     * `Math.random`, no accumulated remainder, and `Math.round` on the way out so two peers computing
     * this land on identical integer positions.
     *
     * ⚠ THE SPREAD IS EVEN ACROSS THE FAN AND THE MIDDLE CLOUD FLIES STRAIGHT AT THE AIM. With
     * `PHARAOH_LOCUST_COUNT` odd, `i - (n-1)/2` puts one cloud exactly on the axis; with it even the
     * axis sits between two. Either reads correctly, so the count stays a free dial.
     */
    const axis = Math.atan2(aim.pos.y - boss.pos.y, aim.pos.x - boss.pos.x);
    const n = PHARAOH_LOCUST_COUNT;
    const step = n > 1 ? (2 * PHARAOH_LOCUST_CONE_HALF_ANGLE) / (n - 1) : 0;

    for (let i = 0; i < n && live < PHARAOH_LOCUST_MAX_PER_OWNER; i++, live++) {
      const angle = axis + (n > 1 ? -PHARAOH_LOCUST_CONE_HALF_ANGLE + step * i : 0);
      const pos = {
        x: boss.pos.x + Math.round(Math.cos(angle) * PHARAOH_LOCUST_SPAWN_DIST),
        y: boss.pos.y + Math.round(Math.sin(angle) * PHARAOH_LOCUST_SPAWN_DIST),
      };
      dispatch(world, {
        type: 'SPAWN_CREATURE',
        creatureType: 'locustCloud',
        ownerPlayerId: boss.ownerPlayerId,
        pos,
        /*
         * Aimed OUTWARD along its own spoke rather than at the boss's victim, so the fan opens up
         * before the clouds start hunting on their own. `targetPos` is only the initial heading; the
         * nav layer re-targets from the next tick.
         */
        targetPos: {
          x: boss.pos.x + Math.round(Math.cos(angle) * PHARAOH_LOCUST_TRIGGER_RANGE),
          y: boss.pos.y + Math.round(Math.sin(angle) * PHARAOH_LOCUST_TRIGGER_RANGE),
        },
        // A SUMMON, so there is no spawner behind it — the direwolf's provenance, not a tower's.
        sourceSpawnerId: null,
      });
    }
  }
}
