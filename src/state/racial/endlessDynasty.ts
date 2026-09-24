/**
 * SPARK — S188 — ENDLESS DYNASTY (`mummies.l5`): every 1,000 HP your castle loses raises a Pharaoh.
 *
 * > *"every time a castle loses 1,000 points, it spawns a pharaoh. So 1,000 points of health. So from
 * > now on and until the end of the game."* — owner, S187
 *
 * ## HOW IT COUNTS
 *
 * `accrueDynastyLoss` is called from the ONE site a castle takes damage (`damage.ts`, the castle arm)
 * with the HP the keep ACTUALLY lost — after its purchased DEF (`castleDamageAfterDefence`) and after
 * the clamp at zero, so the overkill on a killing blow is not a loss (MINE). While the seat holds the
 * perk the loss is added to `Player.dynastyHpLost`, and every whole `DYNASTY_HP_PER_PHARAOH` it
 * crosses queues one Pharaoh. A single huge hit that crosses two thousands queues two — legal, and
 * the tier-9 boss is already exempt from the one-live-per-(owner,type) latch (S169).
 *
 * ⚠ ALL MINE, EACH STATED AT ITS LINE:
 * · "from now on" = losses taken while the perk is held. Damage before the level-5 draft counts for
 *   nothing, exactly as a draft buff does not reach units already on the board.
 * · Regeneration never un-counts a loss (the field is monotonic).
 * · A fallen castle raises nobody: the castle emitter's rule, applied at birth time.
 *
 * ## ⛔ THE SENTINEL IS A PERFORMANCE BACKSTOP, NEVER A GAMEPLAY CAP (Council A3)
 *
 * A Pharaoh that would take the seat past `DYNASTY_LIVE_PHARAOH_SENTINEL` live Pharaohs is not born,
 * and its 1,000 is still consumed (the count is never rewound). The §9B / chewer-cap philosophy: a
 * ceiling a real match should never reach, there so a pathological one cannot put hundreds of
 * 143-fifth bosses and their locust fans on the wire.
 *
 * ## BORN AFTER THE SWEEP (Council A5)
 *
 * A castle is struck inside the strike batch, so the Pharaoh is queued (`queueAfterStrike`) and
 * born after the death sweep — never inserted into `world.creatures` while the batch iterates it.
 */

import { asCreatureId, type PlayerId } from '../../types.ts';
import type { World } from '../worldTypes.ts';
import { dispatch } from '../world.ts';
import { castleAnchor } from '../gatherers/gatherer.ts';
import { spreadTargetPos } from '../creatures/creatureAI.ts';
import { seatHoldsPerk } from '../racialPerks.ts';
import { T9_BOSS_TYPE } from '../t9BossIds.ts';
import { queueAfterStrike } from './racialTick.ts';

/** ⭐ HIS NUMBER: *"every time a castle loses 1,000 points, it spawns a pharaoh."* */
export const DYNASTY_HP_PER_PHARAOH = 1000;

/**
 * ⚠ MINE, a PERFORMANCE SENTINEL, NEVER A GAMEPLAY CAP (Council A3). Live Pharaohs per seat — every
 * Pharaoh the seat owns counts, however it was raised. See the module docblock.
 */
export const DYNASTY_LIVE_PHARAOH_SENTINEL = 40;

/**
 * ⚠ MINE. How far around the keep a dynasty Pharaoh rises — the castle soldier's own 46 px spread, so a
 * run of Pharaohs reads as a court at the keep rather than a stack on one pixel. Cosmetic only.
 */
export const DYNASTY_PHARAOH_SPREAD = 46;

/** How many whole thousands a running loss crosses going from `before` to `after`. Pure. */
export function pharaohsOwed(before: number, after: number): number {
  if (after <= before) return 0;
  return Math.floor(after / DYNASTY_HP_PER_PHARAOH) - Math.floor(before / DYNASTY_HP_PER_PHARAOH);
}

/** Live Pharaohs owned by `seat`. Counted, never cached (a cache is a second source of truth). */
export function livePharaohs(world: World, seat: PlayerId): number {
  let n = 0;
  for (const c of world.creatures.values()) {
    if (c.type === T9_BOSS_TYPE.mummies && c.ownerPlayerId === seat) n++;
  }
  return n;
}

/**
 * Called from the castle arm of `damageEntity` with the HP the keep actually lost. A no-op for a
 * seat without the perk, and for a zero loss.
 */
export function accrueDynastyLoss(world: World, seat: PlayerId, lost: number): void {
  if (lost <= 0) return;
  const p = world.players.get(seat);
  if (p === undefined || !seatHoldsPerk(p, 'mummies.l5')) return;
  const before = p.dynastyHpLost;
  p.dynastyHpLost = before + lost;
  const owed = pharaohsOwed(before, p.dynastyHpLost);
  for (let i = 0; i < owed; i++) {
    queueAfterStrike(world, () => {
      risePharaoh(world, seat);
    });
  }
}

/**
 * One Pharaoh at `seat`'s keep, owned by the seat, through the same `SPAWN_CREATURE` the tier-9
 * tower's release arm dispatches (no `sourceSpawnerId`, so the boss routes to the null branch it is
 * exempt in). Sized by the seat's draft picks inside `applySpawnCreature`, like every creature.
 *
 * @returns whether a Pharaoh was actually born.
 */
export function risePharaoh(world: World, seat: PlayerId): boolean {
  if (world.gameState !== 'PLAYING') return false;
  const p = world.players.get(seat);
  if (p === undefined || p.castleHp <= 0) return false; // ⚠ MINE — a fallen keep raises nobody
  if (livePharaohs(world, seat) >= DYNASTY_LIVE_PHARAOH_SENTINEL) return false; // A3 — consumed anyway
  const id = asCreatureId(world.nextCreatureId);
  const pos = spreadTargetPos(castleAnchor(seat as unknown as number, world.layout), id, DYNASTY_PHARAOH_SPREAD);
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: T9_BOSS_TYPE.mummies,
    ownerPlayerId: seat,
    pos,
    targetPos: pos,
  });
  return world.creatures.has(id);
}
