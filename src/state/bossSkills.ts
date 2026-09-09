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
  VLAD_LIFE_SAP_HEAL_PCT,
  VLAD_LIFE_SAP_TRIGGER_PCT,
  VLAD_LIFE_SAP_USES,
  VLAD_SAP_FLASH_TICKS,
  ZOMBIE_AURA_PER_MILLE,
  ZOMBIE_AURA_RADIUS,
} from '../constants.ts';
import { damageEntity } from './damage.ts';
import { dotDueThisTick } from './damageOverTime.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { unitPoolFifths } from './stats.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
// S169 R152 — a stunned boss takes no action; see `stunGates.test.ts`.
import { isStunned } from './creatures/creature.ts';
import type { CreatureId } from '../types.ts';
import type { CreatureType } from './creatures/creature.ts';
import type { World } from './world.ts';

/** How many life saps each live Vlad has already spent, by creature id. Host-local. */
export type SapLedger = Map<CreatureId, number>;

/**
 * ⭐ S168 — live creatures of one type, ids SORTED.
 *
 * Every boss-skill scan in this family starts here, and the sort is the point rather than tidiness:
 * `Map` iteration is insertion order, and letting it decide which boss acts first is how S155 N1
 * handed one seat every melee exchange for a whole match. Shared so the six skills cannot each
 * re-derive it slightly differently.
 */
export function liveIdsOfType(world: World, type: CreatureType): CreatureId[] {
  const out: CreatureId[] = [];
  for (const [id, c] of world.creatures) if (c.type === type) out.push(id);
  out.sort((a, b) => (a as number) - (b as number));
  return out;
}

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
    /*
     * ⭐⭐ S169 (owner R152) — A STUNNED VLAD DOES NOT SAP. Owner: *"cant do anything"*.
     *
     * ⚠ AND THE LEDGER IS NOT TOUCHED, which is the point of gating here rather than lower down: a
     * stun must COST him nothing. Skipping after the `spent` bookkeeping would be the same shape of
     * mistake as gating the FSM above its end-of-life bookkeeping — the stun would silently consume
     * one of his three uses.
     */
    if (isStunned(vlad, world.tick)) continue;
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
    /*
     * ⭐⭐ S170 P7 (owner) — STAMP THE FLASH SO EVERY PEER CAN DRAW IT, not just the host.
     * Owner: *"we do need enemies to be able to see Vlad's tether, not just the player that owns
     * Vlad."* `sapFlashUntilTick` is serialized and hashed; see the field's docblock in
     * `creatures/creature.ts` for why a stamped deadline is the only shape that survives a 10 Hz
     * snapshot against a one-tick trigger.
     */
    vlad.sapFlashUntilTick = world.tick + VLAD_SAP_FLASH_TICKS;
  }

  // A Vlad who is gone frees his ledger row, so a later Vlad on the same seat starts with three.
  // (Creature ids are never reused, so this is housekeeping rather than correctness.)
  for (const id of [...ledger.keys()]) {
    if (!world.creatures.has(id)) ledger.delete(id);
  }
}

/**
 * ⭐⭐ R138, AS HE CORRECTED IT TWICE — **THE ZOMBIE BOSS'S ROT AURA.**
 *
 * The ruling took three messages to settle and every one of them moved it:
 *
 *   1. *"an aura that damages enemies around him - 3% health per second"* — whose health, unstated.
 *   2. *"not 3% of the enemies health but i think we can do 3% because its in fifths right? need to
 *      do 2.5%"* — so I built 2.5% of the BOSS's pool, a flat 3 fifths a second.
 *   3. ⭐ *"no for the zombie boss aura it has to be 2.5% of the enemy that is effected - essentially
 *      we need to build a new mechanic - debuff OR damage over time. its not fair if its 2.5% of his
 *      own health..."*
 *
 * ⭐ **AND HE IS RIGHT ABOUT WHY.** A percentage of the BOSS is a FLAT rate: it deleted a chewer in
 * 1.7 s and needed 47.7 s on a Pharaoh. A percentage of the VICTIM is a UNIFORM time-to-kill —
 * 100/2.5 = **40 seconds for everything on the board**. That is the "fair" he is describing, and it
 * is why the flat version felt wrong in the first place.
 *
 * The arithmetic that makes a fractional percentage expressible at all lives in
 * `state/damageOverTime.ts`, which is the MECHANIC he asked for: the tick always deals exactly one
 * fifth and the RATE carries the percentage. See that file for the measurement.
 *
 * ⚠ ENEMIES ONLY — and deliberately different from the same boss's DEATH explosion, which he ruled
 * hits *"everything"*. Two skills on one boss, worded differently by him, built differently.
 */
export function runZombieRotAura(world: World): void {
  if (world.gameState !== 'PLAYING') return;

  const bosses: CreatureId[] = [];
  for (const [id, c] of world.creatures) {
    if (c.type === T9_BOSS_TYPE.zombies) bosses.push(id);
  }
  if (bosses.length === 0) return;
  bosses.sort((a, b) => (a as number) - (b as number));

  const rSq = ZOMBIE_AURA_RADIUS * ZOMBIE_AURA_RADIUS;
  for (const bossId of bosses) {
    const boss = world.creatures.get(bossId);
    if (boss === undefined || boss.ehp <= 0) continue;
    /*
     * ⭐⭐ S169 (owner R152) — A STUNNED BOSS TAKES NO ACTION. Owner: *"cant do anything"*.
     *
     * Placed beside the corpse guard because it is the same kind of statement: a boss who cannot act
     * does not act. The stun is also the ONLY counterplay a player has against a boss, so leaving
     * the skills running would make it cosmetic on the one unit it matters most against.
     *
     * ⚠ `runWarlordRage` is DELIBERATELY NOT gated — rage is a LATCH over the boss's own health, not
     * an action he takes. See `stunGates.test.ts`, which asserts that exception explicitly.
     */
    if (isStunned(boss, world.tick)) continue;

    const victims: CreatureId[] = [];
    for (const [id, c] of world.creatures) {
      if (id === bossId) continue;
      if (c.ownerPlayerId === boss.ownerPlayerId) continue; // "damages ENEMIES around him"
      const dx = c.pos.x - boss.pos.x;
      const dy = c.pos.y - boss.pos.y;
      if (dx * dx + dy * dy > rSq) continue;
      // ⭐ THE RATE IS THE VICTIM'S OWN, which is the whole of his correction. Each victim carries
      // its own cadence derived from its own pool, so the aura costs everything the same FRACTION
      // of its life rather than the same number of fifths.
      if (!dotDueThisTick(world.tick, id as number, c.type, ZOMBIE_AURA_PER_MILLE)) continue;
      victims.push(id);
    }
    // Total order before mutating: damage can DELETE a creature, so the scan must finish first.
    victims.sort((a, b) => (a as number) - (b as number));
    for (const id of victims) damageEntity(world, { kind: 'creature', id }, 1, 'aura');
  }
}