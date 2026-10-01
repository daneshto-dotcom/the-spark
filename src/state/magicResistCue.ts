/**
 * SPARK — S192 (owner) — ⭐ WHEN MAGIC RESISTANCE SWALLOWS A TICK, SAY SO.
 *
 * > *"A very magic resistant unit … can be totally resistant to very low level magic, I accept that, but
 * > we need to predefine … how it would look like."* — owner, S192
 *
 * Only a one-fifth magic DoT beat can land 0 (a single magic hit is floored at 1 — `magicHitFifths`), so
 * the cue is about the DoT sources: the zombie boss ROT, SCORCHED GROUND (passive) and SCORCHED EARTH (cast), the STINK TOWER aura and the
 * landed-bag stink cloud. This module answers one question: **did a magic DoT beat land 0 on creature `c`
 * on tick `t`?** — so the renderer can print a RESIST floater (`render/damageNumbers.ts`).
 *
 * ⭐ DERIVED, NOT SENT. A swallowed beat changes nothing on the board, so there is nothing for the
 * frame-to-frame watch to diff — and a one-shot event would be lost ~5/6 of the time (effects are sampled
 * at 10 Hz). Instead every input here is ALREADY synced state: creature positions/owners/types/stuns,
 * defenders, stink clouds, the seats' race + draft picks (SCORCHED GROUND's zones) and `world.tick`. Each
 * source's due rule and beat number is the SAME pure function the sim uses, so on any tick the answer is
 * the sim's answer. No new field, no wire cost, no protocol bump.
 *
 * ⚠ PURE READ — never writes the world. ⚠ MINE (S192): it mirrors each source's own reach test (radius,
 * enemy-only, FIGHT for the zone and the stink); a source whose runner adds a gate this file does not
 * mirror could cue a beat that did not run — cosmetic only.
 */
import { STINK_AURA_CADENCE_TICKS, STINK_AURA_RADIUS, ZOMBIE_AURA_PER_MILLE, ZOMBIE_AURA_RADIUS } from '../constants.ts';
import type { Creature } from './creatures/creature.ts';
import { isStunned } from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { dotDueThisTick } from './damageOverTime.ts';
import { dotBeat, landedFifths, magicDot, mresFor } from './magicResist.ts';
import { SCORCHED_EARTH_CAST_PER_MILLE, SCORCHED_GROUND_PER_MILLE, scorchedEarthZones, scorchedZones } from './racial/scorchedGround.ts';
import { isScorchImmune } from './racial/scorchedEarthRules.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import type { World } from './worldTypes.ts';
import { zoneOf } from './zones.ts';

const within = (ax: number, ay: number, bx: number, by: number, r: number): boolean => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy <= r * r;
};

/** Did a magic DoT beat, due for `c` on `tick`, land 0 because of its MRES? */
export function magicBeatResistedAt(world: World, c: Creature, tick: number): boolean {
  if (c.ehp <= 0) return false;
  const def = getCreatureConfig(c.type).def;
  const mres = mresFor(c.type, world.players.get(c.ownerPlayerId)?.raceId ?? null);
  if (mres <= def) return false; // never swallowed: every beat lands ≥ 1
  const id = c.id as unknown as number;
  const zero = (beat: number): boolean => landedFifths(1, magicDot(beat), def, mres, id) === 0;

  // 1 · the zombie boss ROT (`bossSkills.ts` runZombieRotAura)
  if (dotDueThisTick(tick, id, c.type, ZOMBIE_AURA_PER_MILLE)) {
    for (const b of world.creatures.values()) {
      if (b.type !== T9_BOSS_TYPE.zombies || b.id === c.id || b.ehp <= 0) continue;
      if (b.ownerPlayerId === c.ownerPlayerId || isStunned(b, tick)) continue;
      if (!within(c.pos.x, c.pos.y, b.pos.x, b.pos.y, ZOMBIE_AURA_RADIUS)) continue;
      if (zero(dotBeat(tick, id, c.type, ZOMBIE_AURA_PER_MILLE))) return true;
      break;
    }
  }
  if (world.matchPhase !== 'FIGHT') return false;

  // 2 · SCORCHED GROUND, the passive (`racial/scorchedGround.ts` burnCreatures). The spare rule is the
  // sim's ONE predicate (`isScorchImmune`), never a copy, so a change to who is spared flows here too.
  if (dotDueThisTick(tick, id, c.type, SCORCHED_GROUND_PER_MILLE)) {
    for (const { seat, zone } of scorchedZones(world)) {
      if (isScorchImmune(c.ownerPlayerId, seat) || zoneOf(c.pos, world.layout) !== zone) continue;
      if (zero(dotBeat(tick, id, c.type, SCORCHED_GROUND_PER_MILLE))) return true;
    }
  }
  // 2b · ⭐ S193 (audit MED) — SCORCHED EARTH, the aimed CASTS (same file, `scorchedEarthZones`): each on
  // its own clock at `SCORCHED_EARTH_CAST_PER_MILLE`, the caster spared. Until S193 only the passive was
  // mirrored, so a cast beat the victim's MRES swallowed never printed RESIST (R192-M12).
  if (dotDueThisTick(tick, id, c.type, SCORCHED_EARTH_CAST_PER_MILLE)) {
    for (const { caster, zone } of scorchedEarthZones(world)) {
      if (isScorchImmune(c.ownerPlayerId, caster) || zoneOf(c.pos, world.layout) !== zone) continue;
      if (zero(dotBeat(tick, id, c.type, SCORCHED_EARTH_CAST_PER_MILLE))) return true;
    }
  }

  // 3 · the STINK TOWER aura and 4 · the landed-bag cloud (`stinkTower.ts` / `stinkCloud.ts`)
  const stinkBeat = Math.floor(tick / STINK_AURA_CADENCE_TICKS);
  for (const d of world.defenders.values()) {
    if (d.kind !== 'stinkTower' || d.ownerPlayerId === c.ownerPlayerId) continue;
    if (tick % STINK_AURA_CADENCE_TICKS !== (d.id as unknown as number) % STINK_AURA_CADENCE_TICKS) continue;
    if (within(c.pos.x, c.pos.y, d.pos.x, d.pos.y, STINK_AURA_RADIUS) && zero(stinkBeat)) return true;
  }
  for (const s of world.stinkClouds.values()) {
    if (s.ownerPlayerId === c.ownerPlayerId) continue;
    if (tick % STINK_AURA_CADENCE_TICKS !== (s.id as unknown as number) % STINK_AURA_CADENCE_TICKS) continue;
    if (within(c.pos.x, c.pos.y, s.pos.x, s.pos.y, s.radius) && zero(stinkBeat)) return true;
  }
  return false;
}
