/**
 * SPARK — S168 P7 — TIER-9 BOSS SKILLS THAT RUN ON A CADENCE.
 *
 * The DEATH skills live in `hostTick`'s end-of-tick roster compare (a death is an ABSENCE, and an
 * absence is path-independent). Everything that happens while a boss is ALIVE lives here.
 *
 * ## ⚠ Charges are HOST-LOCAL, and that is a decision with a cost
 *
 * `Creature.ehp` is serialized, so the HEAL itself reaches every peer for free. The charge COUNTER
 * is not: it lives in `HostTickState`, exactly like the boss roster, which keeps this skill off the
 * wire entirely — no `World` field, so no factory/serialize/hash/worker tax, no `FIELD_COVERAGE`
 * entry and no `PROTOCOL_VERSION` bump.
 *
 * It is safe against the `?worker=1` mirror because the worker runs the same sim and derives the
 * same counter from the same inputs; the counter is never compared across the wire, only used.
 *
 * ⛔ THE COST, NAMED: a HOST MIGRATION resets the counter, so a Vlad who had spent all three saps
 * gets them back under the new host. The alternative is a synced field with a protocol bump for an
 * edge case measured in one handover per match. Recorded here rather than discovered later.
 */

import {
  PHYSICS_HZ,
  VLAD_LIFE_SAP_HEAL_PCT,
  VLAD_LIFE_SAP_TRIGGER_PCT,
  VLAD_LIFE_SAP_USES,
  ZOMBIE_AURA_PER_MILLE,
  ZOMBIE_AURA_RADIUS,
} from '../constants.ts';
import { damageEntity } from './damage.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { unitPoolFifths } from './stats.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import type { CreatureId } from '../types.ts';
import type { World } from './world.ts';

/** How many life saps each live Vlad has already spent, by creature id. Host-local. */
export type SapLedger = Map<CreatureId, number>;

/** A boss's FULL pool in fifths, from its config — the denominator both thresholds are taken of. */
export function bossMaxPoolFifths(type: Parameters<typeof getCreatureConfig>[0]): number {
  const cfg = getCreatureConfig(type);
  return unitPoolFifths(cfg.hp, cfg.def);
}

/**
 * ⭐⭐ R140 — VLAD'S LIFE SAP.
 *
 * Owner: *"Also vlad can use a life sap ability that heals him 20% of his health. He can use it 3
 * times when his health drops below 40%."*
 *
 * ## ⭐ It is EXACTLY integral, which is why this one is safe and the zombie aura is not
 *
 * `damageEntity` throws on a fractional amount by design and float accumulators are banned in the
 * sim, so a percentage skill has to land on whole fifths or it needs a quantisation rule. Vlad's
 * pool is `unitPoolFifths(10, 4) = 90` fifths: **20% is 18** and **40% is 36**. Both whole. The
 * comparison below is still written as a cross-multiplication rather than a division, so it stays
 * exact if his stats are ever retuned to a pool that does not divide evenly.
 *
 * ⚠ TOTAL ORDER. Ids are sorted before use, so `Map` iteration order decides nothing — the standing
 * rule in this codebase, and the S155 N1 defect when it was broken.
 *
 * ⚠ Deliberately NO `GameEffect` is pushed. A new effect kind costs four exhaustive switches AND a
 * protocol bump, and the heal is already visible: `ehp` is serialized, so every peer sees the bar
 * jump. The VFX the owner asked for is an ART deliverable and will be re-derived from synced state
 * per frame, the way every other per-strike visual in this codebase is.
 */
export function runVladLifeSap(world: World, ledger: SapLedger): void {
  if (world.gameState !== 'PLAYING') return;

  const vlads: CreatureId[] = [];
  for (const [id, c] of world.creatures) {
    if (c.type === T9_BOSS_TYPE.vampires) vlads.push(id);
  }
  vlads.sort((a, b) => (a as number) - (b as number));

  for (const id of vlads) {
    const vlad = world.creatures.get(id);
    if (vlad === undefined) continue;
    const spent = ledger.get(id) ?? 0;
    if (spent >= VLAD_LIFE_SAP_USES) continue;

    const max = bossMaxPoolFifths(vlad.type);
    // `ehp / max < 40%` without dividing — exact in integers, and it cannot drift if the pool is
    // ever retuned to something that does not divide by five.
    if (vlad.ehp * 100 >= max * VLAD_LIFE_SAP_TRIGGER_PCT) continue;
    // A corpse is not a patient. `ehp <= 0` means the death path has already claimed him this tick.
    if (vlad.ehp <= 0) continue;

    const heal = Math.floor((max * VLAD_LIFE_SAP_HEAL_PCT) / 100);
    vlad.ehp = Math.min(max, vlad.ehp + heal);
    ledger.set(id, spent + 1);
  }

  // A Vlad who is gone frees his ledger row, so a later Vlad on the same seat starts with three.
  // (Creature ids are never reused, so this is housekeeping rather than correctness.)
  for (const id of [...ledger.keys()]) {
    if (!world.creatures.has(id)) ledger.delete(id);
  }
}

/**
 * ⭐⭐ R138 (as he amended it in S168) — **THE ZOMBIE BOSS'S ROT AURA.**
 *
 * Owner: *"zombie needs to have an aura that damages enemies around him"* … *"not 3% of the enemies
 * health but i think we can do 3% because its in fifths right? need to do 2.5%"*.
 *
 * ## ⭐ Why this deals exactly ONE fifth, and the percentage lives in the CADENCE
 *
 * The obvious implementation — "take 2.5% of the pool and subtract it" — is the one that cannot be
 * written here. `damageEntity` throws on a fractional amount BY DESIGN, and a float accumulator to
 * carry a remainder is banned in the sim, because it is precisely how a host and its `?worker=1`
 * mirror drift apart invisibly.
 *
 * So the arithmetic is inverted. 2.5% of the boss's 120-fifth pool is 3 fifths per second, which at
 * 60 Hz is **one fifth every twenty ticks**. The aura therefore deals a flat, always-integer 1
 * fifth, and the RATE is what encodes his percentage. `auraIntervalTicks` derives that interval
 * from the ruling rather than hardcoding 20, so a future stat retune shifts the cadence instead of
 * silently rounding the damage to zero.
 *
 * ⚠ PHASE-SPREAD BY ENTITY ID, never by an accumulated remainder — the standing rule in this
 * codebase. Two zombie bosses on the board pulse on different ticks.
 * ⚠ TOTAL ORDER: victims are collected then SORTED by id before being damaged, so `Map` iteration
 * order decides nothing. Damage can delete a creature, which is another reason not to mutate mid-scan.
 */
export function auraIntervalTicks(poolFifths: number): number {
  // fifths/second = pool * perMille / 1000 ⇒ ticks between single-fifth hits = HZ / that.
  const perSecond = (poolFifths * ZOMBIE_AURA_PER_MILLE) / 1000;
  if (perSecond <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.round(PHYSICS_HZ / perSecond));
}

export function runZombieRotAura(world: World): void {
  if (world.gameState !== 'PLAYING') return;

  const bosses: CreatureId[] = [];
  for (const [id, c] of world.creatures) {
    if (c.type === T9_BOSS_TYPE.zombies) bosses.push(id);
  }
  bosses.sort((a, b) => (a as number) - (b as number));

  for (const bossId of bosses) {
    const boss = world.creatures.get(bossId);
    if (boss === undefined || boss.ehp <= 0) continue;
    const interval = auraIntervalTicks(bossMaxPoolFifths(boss.type));
    if (!Number.isFinite(interval)) continue;
    // Phase-spread by id so several bosses never pulse on the same tick.
    if ((world.tick + (bossId as number)) % interval !== 0) continue;

    const rSq = ZOMBIE_AURA_RADIUS * ZOMBIE_AURA_RADIUS;
    const victims: CreatureId[] = [];
    for (const [id, c] of world.creatures) {
      if (id === bossId) continue;
      // ⭐ "damages ENEMIES around him" — unlike the DEATH explosion, which he ruled hits
      // *"everything"*. The two skills read differently in his own words and are built differently.
      if (c.ownerPlayerId === boss.ownerPlayerId) continue;
      const dx = c.pos.x - boss.pos.x;
      const dy = c.pos.y - boss.pos.y;
      if (dx * dx + dy * dy <= rSq) victims.push(id);
    }
    victims.sort((a, b) => (a as number) - (b as number));
    for (const id of victims) damageEntity(world, { kind: 'creature', id }, 1, 'aura');
  }
}