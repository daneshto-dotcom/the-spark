/**
 * SPARK — S159 P2 (owner R77): **VOLTKIN CHAIN LIGHTNING.**
 *
 * Owner R77, describing the unit: *"voltkin - 3 atk (chain lightning …) 6 pierce. 8hp, and 3 def"*,
 * and on the mechanic itself: *"multiple connectors/targets that are within range of one another …
 * maybe we do max6"*. `VOLTKIN_CHAIN_MAX_TARGETS` has held that 6 since S151 as a number waiting for
 * an implementation, and `constants.ts` carried *"⚠ CHAIN LIGHTNING IS NOT IMPLEMENTED"* beside it
 * for the eight sessions since. This is the implementation.
 *
 * ## Three phases, and the order IS the determinism argument
 *
 *   1. **COMPUTE** the whole chain from the pre-strike world (`voltkinChainFrom`, pure).
 *   2. **DAMAGE** every link.
 *   3. **SEVER** whichever connectors that damage broke.
 *
 * Phase 1 finishes before anything mutates, which is what makes the chain a pure function of the
 * world at the fire tick. Interleaving would make it depend on its own side effects:
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
 * (*"connectors/targets"*). Each takes the Voltkin's own `attackFifths(atk, pen)` — the same hit the
 * primary took, with **no falloff**; both that and the hop range are flagged as MINE at
 * `VOLTKIN_CHAIN_HOP_RANGE`.
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
import { bondMidpoint, distSq, isEnemyBond } from './creatureAI.ts';
import { getCreatureConfig } from './voltkin-config.ts';
import { damageConnector, damageEntity } from '../damage.ts';
import { attackFifths } from '../stats.ts';
import { VOLTKIN_CHAIN_HOP_RANGE, VOLTKIN_CHAIN_MAX_TARGETS } from '../../constants.ts';

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
export function applyVoltkinChain(world: World, attacker: Creature, seed: ChainLink): number {
  const links = voltkinChainFrom(world, attacker, seed);
  if (links.length === 0) return 0;

  const cfg = getCreatureConfig(attacker.type);
  const hit = attackFifths(cfg.atk, cfg.pen);
  const toSever: BondId[] = [];

  let from = seed.pos;
  for (const link of links) {
    world.effects.push({
      kind: 'ARC_FLASH',
      tick: world.tick,
      start: { x: from.x, y: from.y },
      end: { x: link.pos.x, y: link.pos.y },
      creatureId: attacker.id,
    });
    if (link.kind === 'creature') {
      const died = damageEntity(world, { kind: 'creature', id: link.id }, hit, 'creature');
      if (died) attacker.killCount += 1;
    } else if (damageConnector(world, link.id, hit)) {
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
