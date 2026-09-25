/**
 * SPARK — S159 P2 (owner R77): **VOLTKIN CHAIN LIGHTNING.**
 *
 * Owner R77, describing the unit: *"voltkin - 3 atk (chain lightning …) 6 pierce. 8hp, and 3 def"*,
 * and on the mechanic itself: *"multiple connectors/targets that are within range of one another …
 * maywe we do max6"*. `VOLTKIN_CHAIN_MAX_TARGETS` has held that 6 since S151 as a number waiting for
 * an implementation, and `constants.ts` carried *"⚠ CHAIN LIGHTNING IS NOT IMPLEMENTED"* beside it
 * for the eight sessions since. This is the implementation.
 *
 * ## Three phases, and the order IS the determinism argument
 *
 *   1. **COMPUTE** the whole chain from the pre-strike world (`voltkinChainFrom`, pure).
 *   2. **DAMAGE** every link.
 *   3. **SEVER** whichever connectors that damage broke.
 *
 * Phase 1 finishes before phases 2 and 3 mutate anything, which is what makes the chain a pure
 * function of the world at the fire tick.
 *
 * ⚠ S159 CHECK (GROK-ANALYST) CAUGHT A LOOSE CLAIM HERE, AND THE PRECISE VERSION IS STRONGER. This
 * used to say the chain is computed from "the pre-strike world", which sits badly beside the fact
 * that in the bond arm this runs AFTER the primary's `damageConnector`. The accurate statement:
 * **selection reads only geometry and ownership** — positions, bond endpoints, `placerColor`, ids —
 * and the primary strike touches NONE of those. `damageConnector` mutates `bond.damageFifths` and
 * nothing else; the creature arm's `damageEntity` can remove the seed from `world.creatures`, and the
 * seed is excluded from selection anyway. So both arms select the identical chain, and the phase
 * order matters for PRICING (capacity), not for selection. Interleaving would make the pricing depend
 * on its own side effects:
 * `damageConnector` re-reads a connector's capacity from the component it is *currently* part of
 * (`connectorCapacityFifths(count)` = `count + 4` fifths), so severing link 2 before pricing link 3
 * would change link 3's toughness — and a host and a replay that visited links in a different order
 * would then resolve the same bolt differently. Deferring the severs also prices every link against
 * the SAME component, which is both easier to reason about and fairer at the table.
 *
 * ## Why the arcs are ARC_FLASH and not a new effect kind
 *
 * `ARC_FLASH` already exists, already rides the wire, and is already the Voltkin's signature — its
 * single-target zap emits exactly one. A chain emits one PER HOP, from the previous link to the next,
 * so the bolt visibly walks. `creatureAttack.ts` records what a new `GameEffect` member would cost
 * instead: four exhaustive switches, a `deserializeEffect` with no default arm, and a protocol bump
 * (S154 P2 took one for exactly that). So the cheap answer is also the correct one.
 *
 * ⚠ THE HONEST CAVEAT, WHICH APPLIES TO THE ARCS AND NOT TO THE DAMAGE. A one-shot `world.effects`
 * push is an unreliable channel for a REMOTE client: the snapshot samples effects at 10 Hz while the
 * renderer wipes them every frame at 60, so a remote peer sees roughly one arc in six. That is
 * already true of the single zap that ships today, so the chain is no worse than the thing it
 * extends — and the damage is host-authoritative state either way, so the two sides never disagree
 * about what happened, only about how much of it they got to watch.
 *
 * ## What counts as a link
 *
 * Enemy CREATURES and enemy CONNECTORS, because the owner's sentence names both
 * (*"connectors/targets"*). Each takes the Voltkin's own `attackFifths(atk, pen)` **HALVED ONCE PER
 * JUMP** — 33 · 16 · 8 · 4 · 2 · 1 — after the owner's S178 ruling (*"it should be chain lightning
 * with a diminishing power per attack"*). ⛔ S178: this paragraph said *"the same hit the primary
 * took, with no falloff"* and was left contradicting the loop 160 lines below it in this same file.
 * The seed still takes the FULL hit, from the caller; jump 1 is the first link. See
 * `VOLTKIN_CHAIN_JUMP_DIVISOR`, where the curve is flagged as MINE.
 *
 * ⛔ NOT castles, NOT defenders, NOT landed bags. Each of those would be a new balance claim rather
 * than a reading of R77, and a chain that walked into a keep would let one unit bypass the whole
 * castle-strike ordering `creatureAttack.ts` spent two sessions getting right (S157 F1, S158 P7).
 * The chain extends the zap the Voltkin already has; it does not grant it new categories of victim.
 */

import { dispatch } from '../world.ts';
import type { World } from '../world.ts';
import type { BondId, CreatureId, Vec2 } from '../../types.ts';
import type { Creature } from './creature.ts';
import { creatureAttackFifths, isUntargetable } from './creature.ts';
import { bondMidpoint, distSq, isEnemyBond } from './creatureAI.ts';
import { damageConnector, damageEntity } from '../damage.ts';
import { VOLTKIN_CHAIN_HOP_RANGE, VOLTKIN_CHAIN_JUMP_DIVISOR, VOLTKIN_CHAIN_MAX_TARGETS } from '../../constants.ts';

/** One link in the bolt: what it is, which entity, and where the arc is drawn to. */
export type ChainLink =
  | { readonly kind: 'creature'; readonly id: CreatureId; readonly pos: Vec2 }
  | { readonly kind: 'bond'; readonly id: BondId; readonly pos: Vec2 };

/**
 * The links the bolt jumps to AFTER `seed`: nearest-first from the previous link, never revisiting
 * one, never leaving `VOLTKIN_CHAIN_HOP_RANGE` of the link it jumps FROM, and never more than
 * `VOLTKIN_CHAIN_MAX_TARGETS` links in total (the seed is the first).
 *
 * PURE: reads the world, mutates nothing, no RNG, no wall clock, squared distances only.
 *
 * ⚠ TIE-BREAKING IS A TOTAL ORDER ACROSS KINDS, WHICH TAKES MORE THAN "LOWEST ID". Creature ids and
 * bond ids are independent sequences, so "lowest id" alone cannot compare a creature with a bond —
 * and two candidates at the identical distance would then be settled by `Map` iteration order, which
 * is insertion order, which is exactly the accident S155 N1 records silently deciding whole matches.
 * So: strictly-nearer always wins; on an exact tie the lowest id wins WITHIN a kind; and a bond never
 * displaces a creature already chosen at the same distance. Creatures are scanned first, so that last
 * rule is what the loop below is doing when its bond arm requires `best.kind === 'bond'`.
 */
export function voltkinChainFrom(world: World, attacker: Creature, seed: ChainLink): ChainLink[] {
  const out: ChainLink[] = [];
  const usedCreatures = new Set<CreatureId>();
  const usedBonds = new Set<BondId>();
  if (seed.kind === 'creature') usedCreatures.add(seed.id);
  else usedBonds.add(seed.id);

  const hop2 = VOLTKIN_CHAIN_HOP_RANGE * VOLTKIN_CHAIN_HOP_RANGE;
  let from = seed.pos;

  while (out.length + 1 < VOLTKIN_CHAIN_MAX_TARGETS) {
    let best: ChainLink | null = null;
    let bestDistSq = Infinity;

    for (const [id, c] of world.creatures) {
      if (usedCreatures.has(id)) continue;
      if (id === attacker.id) continue; // never itself, even in a free-for-all
      if (c.ownerPlayerId === attacker.ownerPlayerId) continue; // enemy-only, like every target
      // ⭐ S171 (owner R142/R171-A) — a chain HOP is an acquisition: the arc chooses who it jumps
      // to. An untargetable unit is not a candidate, so the chain skips it and hops on past.
      if (isUntargetable(c, world.tick)) continue;
      const dSq = distSq(from, c.pos);
      if (dSq > hop2) continue;
      if (
        dSq < bestDistSq ||
        (dSq === bestDistSq &&
          best !== null &&
          best.kind === 'creature' &&
          (id as unknown as number) < (best.id as unknown as number))
      ) {
        bestDistSq = dSq;
        best = { kind: 'creature', id, pos: { x: c.pos.x, y: c.pos.y } };
      }
    }

    for (const [id, b] of world.bonds) {
      if (usedBonds.has(id)) continue;
      /*
       * ⚠ ENEMY-NESS COMES FROM `isEnemyBond`, NOT FROM A HAND-ROLLED COMPARE, and the first cut of
       * this file DID hand-roll one (`anchor.placedBy === attacker.ownerPlayerId`) which is a
       * different question with a different answer. The shipped discriminant is the endpoint
       * `placerColor` against the owner's LIVE colour, and `findNearestEnemyPrimitiveFrom` records
       * why that distinction is load-bearing rather than stylistic: *"a territory-captured primitive
       * keeps its original allegiance for targeting, which is the shipped semantics for bonds and
       * must not silently differ"*. It also resolves correctly after a rainbow colour shuffle, which
       * a `placedBy` compare would not. A degenerate bond with a missing endpoint reads as
       * non-enemy, so it is skipped here for free.
       */
      if (!isEnemyBond(world, attacker, b)) continue;
      const mid = bondMidpoint(b);
      const dSq = distSq(from, mid);
      if (dSq > hop2) continue;
      if (
        dSq < bestDistSq ||
        (dSq === bestDistSq &&
          best !== null &&
          best.kind === 'bond' &&
          (id as unknown as number) < (best.id as unknown as number))
      ) {
        bestDistSq = dSq;
        best = { kind: 'bond', id, pos: mid };
      }
    }

    if (best === null) return out; // nothing in hop range — the bolt dies here
    out.push(best);
    if (best.kind === 'creature') usedCreatures.add(best.id);
    else usedBonds.add(best.id);
    from = best.pos;
  }
  return out;
}

/**
 * Fire the chain: damage every link, emit one ARC_FLASH per hop so the bolt walks, then sever the
 * connectors that gave way. Returns how many links the bolt reached (0 when nothing was in range),
 * which the caller uses only for logging and tests — kill accounting happens here.
 *
 * ⚠ CALLED AFTER the primary strike has landed, and given that primary as `seed` so it can never be
 * hit twice. The seed carries its POSITION rather than being looked up again, because a severed
 * bond's endpoint primitives may already be gone by the time this runs — the same pre-mutation
 * snapshot discipline `creatureAttack.ts` uses for its own arc endpoints.
 */
/**
 * PURE — what the `jump`-th link of a chain takes, in fifths. Jump 0 is the seed (full strike).
 *
 * ⛔ INTEGER ONLY, AND THAT IS NOT A STYLE CHOICE. Float accumulators are banned in this sim: a
 * fractional per-link damage would drift between the host and the `?worker=1` mirror and drift in a
 * damage figure is a desync, not a rounding nit. `Math.floor` of an integer divisor keeps every term
 * a whole number on the owner's ×5 ladder, so the number the sim subtracts is still the number the
 * player reads.
 *
 * ⚠ THE FLOOR OF 1 IS DELIBERATE. Every link draws an ARC_FLASH, and an arc the player can SEE that
 * deals literally nothing reads as a bug. At the Voltkin's own 33 the floor never binds (33 · 16 · 8
 * · 4 · 2 · 1); it only matters for a weaker chainer, or a deeper chain, than ships today.
 */
export function chainJumpFifths(baseFifths: number, jump: number): number {
  if (jump <= 0) return baseFifths;
  const divided = Math.floor(baseFifths / Math.pow(VOLTKIN_CHAIN_JUMP_DIVISOR, jump));
  return Math.max(1, divided);
}

export function applyVoltkinChain(world: World, attacker: Creature, seed: ChainLink): number {
  const links = voltkinChainFrom(world, attacker, seed);
  if (links.length === 0) return 0;

  // ⭐ S190 (draft-atk) — the Voltkin's OWN baked strike (a drafted ATK/PEN pick), never its type's:
  // a Voltkin summoned by a drafted seat chains from the buffed number, halved per jump as before.
  const baseHit = creatureAttackFifths(attacker);
  const toSever: BondId[] = [];

  let from = seed.pos;
  /*
   * ⛔ THE FIRST CHAIN LINK IS JUMP **1**, NOT JUMP 0, AND A TEST CAUGHT THIS. `links` excludes the
   * SEED: the seed has already taken the attacker's full strike from `applyCreatureAttack`'s own
   * arm — `damageEntity` for a creature seed, `damageConnector` for a bond seed — before this
   * function is called at all. Starting the counter at 0 would hand the first ARC the full strike a
   * second time, so a bolt would land TWO undiminished hits and bank 96 fifths into a 50-fifth tower
   * instead of 64. Jump 0 is the seed, and it is spent elsewhere.
   */
  let jump = 1;
  for (const link of links) {
    /*
     * ⭐⭐⭐ S178 (owner) — **THE BOLT WEAKENS AS IT WALKS.** *"It should be chain lightning with a
     * diminishing power per attack."* This was `attackFifths(cfg.atk, cfg.pen)` computed once,
     * OUTSIDE the loop, so every one of up to six links took the Voltkin's full strike — and
     * because severs are dispatched only after the loop, the component never shrank mid-bolt and
     * all six banked into one unshrinking `structurePoolFifths` pool. See
     * `VOLTKIN_CHAIN_JUMP_DIVISOR` for the arithmetic that turned that into three connectors a bolt.
     */
    const hit = chainJumpFifths(baseHit, jump);
    jump += 1;
    world.effects.push({
      kind: 'ARC_FLASH',
      tick: world.tick,
      start: { x: from.x, y: from.y },
      end: { x: link.pos.x, y: link.pos.y },
      creatureId: attacker.id,
    });
    if (link.kind === 'creature') {
      /*
       * ⭐ S183 — THE VOLTKIN IS NAMED ON EVERY LINK, and `retaliation.ts` accepts the claim only
       * on the SEED (the one creature it is actually committed to). A bolt that made all six hops
       * turn round would be retaliation-by-splash, which the owner's *"whoever's targeting her"*
       * does not describe — and, because a hop is not in the victim's own target field, it would
       * be decided by `world.creatures` insertion order. The gate lives there, once.
       */
      const died = damageEntity(
        world,
        { kind: 'creature', id: link.id },
        hit,
        'creature',
        { kind: 'creature', id: attacker.id },
      );
      if (died) attacker.killCount += 1;
    } else if (damageConnector(world, link.id, hit, { kind: 'creature', id: attacker.id })) {
      // ⭐ S188 — named on every building link too, exactly as the creature links above are.
      toSever.push(link.id);
    }
    from = link.pos;
  }

  // Phase 3. Severance is a DISPATCH with its own topology split, SEVER_ERASE ordering and charge
  // settlement, so it runs only once every link has been priced — see the docblock above for why
  // that is not merely tidier. A bond a previous sever's cascade already removed is skipped.
  for (const bondId of toSever) {
    if (!world.bonds.has(bondId)) continue;
    dispatch(world, {
      type: 'SEVER_BOND',
      bondId,
      playerId: attacker.ownerPlayerId,
      cause: 'creature', // a Voltkin's lightning, never a chewer's gnaw — the chain is its alone
    });
    if (!world.bonds.has(bondId)) attacker.killCount += 1;
  }
  return links.length;
}
