/**
 * SPARK — S168 (owner R149) — THE ORC WARLORD'S TWO SKILLS.
 *
 * > *"Orc warlord skills - 1) direwolf summon - Orc warlors summons 3 direwolves every 15 sec with
 * > stats 3, 3, 3, 3 each direworlf (i will generate the image for him.) 2) RAGE - he becomes
 * > enraged when drops to 25% health and attacks and moves x2 quicker for the rest of his
 * > lifetime."*
 *
 * Split out of `bossSkills.ts` rather than piled into it: six bosses now have skills, and one file
 * holding all twelve would be a merge surface with no cohesion. The shared pieces — `liveIdsOfType`
 * and the DoT mechanic — stay where every boss can reach them.
 */

import {
  DIREWOLF_MAX_PER_BOSS,
  DIREWOLF_SUMMON_COUNT,
  DIREWOLF_SUMMON_INTERVAL_TICKS,
  WARLORD_RAGE_TRIGGER_PCT,
} from '../constants.ts';
import { liveIdsOfType } from './bossSkills.ts';
import { maxPoolFifths } from './damageOverTime.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import { dispatch, type World } from './world.ts';

/**
 * ⭐ **RAGE — the LATCH.** What rage DOES is one multiplier, `rageMultiplier` in
 * `creatures/creature.ts`, read by the movement integrator (`physics/creatureVerlet.ts`) and by the
 * attack cadence (`creatures/creatureLifecycle.ts`). This function only decides WHEN.
 *
 * ⚠ IT LATCHES AND NEVER CLEARS — *"for the rest of his lifetime"*. A predicate over current HP
 * would switch back OFF if he were healed above the line, and this game now HAS healing: Vlad's life
 * sap shipped in the same session. So the difference is not hypothetical.
 *
 * ⚠ The threshold is an integer cross-multiplication rather than a division, so it stays exact for
 * any pool — the same shape as Vlad's 40% gate.
 */
export function runWarlordRage(world: World): void {
  if (world.gameState !== 'PLAYING') return;
  for (const id of liveIdsOfType(world, T9_BOSS_TYPE.orcs)) {
    const boss = world.creatures.get(id);
    if (boss === undefined || boss.enraged === true) continue;
    if (boss.ehp <= 0) continue; // a corpse does not get angry
    if (boss.ehp * 100 < maxPoolFifths(boss.type) * WARLORD_RAGE_TRIGGER_PCT) boss.enraged = true;
  }
}

/**
 * ⭐ **THE DIREWOLF SUMMON.** Three wolves every fifteen seconds, at 3/3/3/3 each.
 *
 * ⚠ STATELESS CADENCE, phase-spread by the boss's own id: `(tick + id) % interval`. Nothing has to
 * be remembered between summons, so no ledger exists to desync, and two Warlords on the board never
 * summon on the same tick.
 *
 * ⚠ THE CAP IS MINE. The ruling has none, and unbounded this is eighteen wolves across a 90 s fight
 * — 432 fifths a swing-round from one boss, against a Pharaoh's whole 143-fifth pool. See
 * `DIREWOLF_MAX_PER_BOSS` for the arithmetic. A number from him supersedes it.
 *
 * ⚠ The direwolf is EXEMPT from `applySpawnCreature`'s one-live-unit-per-(owner, type) gate, and it
 * has to be: a summon that arrives in threes cannot pass a one-per-type bound. The exemption is
 * written at that gate, with the reason.
 */
export function runWarlordDirewolves(world: World): void {
  if (world.gameState !== 'PLAYING') return;

  for (const bossId of liveIdsOfType(world, T9_BOSS_TYPE.orcs)) {
    const boss = world.creatures.get(bossId);
    if (boss === undefined || boss.ehp <= 0) continue;
    if ((world.tick + (bossId as number)) % DIREWOLF_SUMMON_INTERVAL_TICKS !== 0) continue;

    let pack = 0;
    for (const c of world.creatures.values()) {
      if (c.type === 'direwolf' && c.ownerPlayerId === boss.ownerPlayerId) pack++;
    }

    for (let i = 0; i < DIREWOLF_SUMMON_COUNT && pack < DIREWOLF_MAX_PER_BOSS; i++, pack++) {
      /*
       * A FIXED triangle around him, not a scatter. `Math.random` is banned in the sim — and a
       * deterministic formation also reads better on screen: the pack always arrives the same way.
       * 46 px mirrors `RACE_UNIT_SPAWN_SPREAD`, so a summon lands at the same remove as an emit.
       */
      const angle = (i * 2 * Math.PI) / DIREWOLF_SUMMON_COUNT;
      const pos = {
        x: boss.pos.x + Math.round(Math.cos(angle) * 46),
        y: boss.pos.y + Math.round(Math.sin(angle) * 46),
      };
      dispatch(world, {
        type: 'SPAWN_CREATURE',
        creatureType: 'direwolf',
        ownerPlayerId: boss.ownerPlayerId,
        pos,
        targetPos: { x: pos.x, y: pos.y },
        // A SUMMON, so there is no spawner behind it — the Voltkin's provenance, not a tower's.
        sourceSpawnerId: null,
      });
    }
  }
}
