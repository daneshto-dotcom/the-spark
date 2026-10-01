/**
 * SPARK — S192 (owner T2 + T3) — **THE ZOMBIE BOSS'S DEATH BLAST: ONE DAMAGE POOL, SPLIT BY DISTANCE.**
 *
 * > *"the zombie boss is way too strong in explosion … destroys everything around him. I need the exact
 * > stats … there should be like … a total damage pool that is split … between … anyone who's in the
 * > vicinity. Obviously being closer to the explosion will give you more damage and further is less
 * > damage … but we need to define the exact damage."* — owner, S192 (T3)
 *
 * > *"when the zombie boss explodes and he killed like 10 of the enemy units around, it didn't produce
 * > the 10 zombies … every zombie that kills another unit, doesn't matter if it's through an explosion
 * > … that creates a regular zombie from the castle."* — owner, S192 (T2)
 *
 * ## What it replaced
 *
 * Until S192 the blast was a RAZE (`STRUCTURE_SELFDESTRUCT` → `applyRadialClear`): every creature and
 * every shape within 380 px was DELETED — no damage, no HP, no kill decision. Measured S192 through the
 * real host tick: 15/15 enemy creatures, 3/3 of his own, both buildings, 0 risen. Now it is ladder damage
 * through the two funnels (`damageEntity`, `damageConnector`), so every victim reaches the death decision
 * and THE RISEN sees each kill with the credit captured when he died.
 *
 * ## The split (⭐ S193: the pool, the 2:1 and "not his own side" are HIS — R193-B1..B3; the curve is MINE)
 *
  *   · the pool is `T9_ZOMBIE_DEATH_BLAST_POOL_FIFTHS` = 312 (⭐ RULED R193-B1 — 3 of his own bites);
 *   · each target's weight is `kind × max(1, floor(R − d))` (`blastFalloff.ts`, the ONE falloff every
 *     blast uses — R193-B4): kind 2 for a creature or Helga, 1 for a structure, lone shape or bag
 *     (⭐ RULED R193-B2); `d = Math.sqrt(d²)` (IEEE correctly rounded — never `Math.hypot`);
 *   · shares are `floor(312 × w / Σw)`, the leftover fifths one each nearest-first, summing to EXACTLY
 *     312 (`splitBlastPool`). A far target among very many may take 0;
 *   · the total order is squared distance, then kind, then id (the S191 tune Ra convention).
 *
 * ## Who is a target
 *
 * Every ENEMY creature with pool left (⭐ R193-B3 *"It does not hit his own side"* — superseding R138's
 * *"hurting everything"*), enemy Helga, a lone built shape, a landed stink bag, and a STRUCTURE as ONE
 * target: its share lands on its connector nearest the centre (tune's Ra rule). The castle is not a
 * target. A corpse-in-waiting and a Pharaoh between realities take nothing, so they take no share.
 *
 * ⚠ SELF-CONTAINED ON PURPOSE. `s191/tune`'s `raSplitShares` is an EQUAL split (no falloff) and its
 * `raColumnTargets` spares a caster, so neither is this rule; the merge owner may fold the target
 * enumeration into one helper once both have landed.
 */

import { T9_ZOMBIE_DEATH_BLAST_RADIUS } from '../../constants.ts';
import type { BondId, PlayerId, StinkCloudId } from '../../types.ts';
import { componentOf } from '../../game/structure.ts';
import { isChannellingRa } from '../creatures/creature.ts';
import { getCreatureConfig } from '../creatures/voltkin-config.ts';
import { damageConnector, damageEntity, damageStinkCloud, severWithCarry, type DamageTarget } from '../damage.ts';
import { blastSplitWeight, splitBlastPool } from '../blastFalloff.ts'; // ⭐ S193 R193-B4 — the ONE falloff
import { applySeverBond } from '../severBond.ts';
import { attackFifths } from '../stats.ts';
import { T9_BOSS_TYPE } from '../t9BossIds.ts';
import type { World } from '../world.ts';

import type { KillCredit } from './killCredit.ts';

/**
 * ⭐⭐ RULED (owner R193-B1, S193): *"312 blast pool, but split over, you know, everyone who's around."*
 * **Three of his own bites**, `3 × attackFifths(8, 8)` = **312** — the S192 research number, now HIS.
 * Below his own 360 pool, so the explosion is never worth more than killing him. Read off his TYPE's base
 * strike, not a drafted one (the carry hub precedent, *"priced off a drone"*).
 */
export const T9_ZOMBIE_DEATH_BLAST_BITES = 3;
export const T9_ZOMBIE_DEATH_BLAST_POOL_FIFTHS =
  T9_ZOMBIE_DEATH_BLAST_BITES *
  attackFifths(getCreatureConfig(T9_BOSS_TYPE.zombies).atk, getCreatureConfig(T9_BOSS_TYPE.zombies).pen);

/**
 * ⭐⭐ RULED (owner R193-B3, S193): *"It does not hit his own side"* — it SUPERSEDES R138's *"hurting
 * everything"* (S168) and the S192 MINE default for this blast. His units, Helga, structures, lone shapes
 * and bags are spared, and a bag of another seat's that the blast pops bursts without hitting his side
 * either (the hub's BLAST-1 rule, `damageStinkCloud`'s `burstAlsoSpares`). Pinned `false`; not a lever.
 */
export const T9_ZOMBIE_DEATH_BLAST_HITS_OWN_SIDE = false;

/**
 * ⭐⭐ RULED (owner R193-B2, S193): *"creatures get twice as much damage as towers do from that blast."*
 * In the distance split a creature (any unit, a boss) and Helga weigh **2**; a structure (one target),
 * a lone shape and a stink bag weigh **1**. The kind weight multiplies the distance weight
 * (`blastSplitWeight`), so at the same distance a creature takes twice a tower's share.
 */
export const T9_ZOMBIE_DEATH_BLAST_CREATURE_WEIGHT = 2;
export const T9_ZOMBIE_DEATH_BLAST_STRUCTURE_WEIGHT = 1;

/** The kind weight of one target — 2 for a creature or Helga, 1 for a structure, lone shape or bag. */
export function zombieBlastKindWeight(kind: ZombieBlastTarget['kind']): number {
  return kind === 'creature' || kind === 'defender'
    ? T9_ZOMBIE_DEATH_BLAST_CREATURE_WEIGHT
    : T9_ZOMBIE_DEATH_BLAST_STRUCTURE_WEIGHT;
}

/** One thing the blast can hit, with its squared distance from the centre. */
export type ZombieBlastTarget =
  | { readonly kind: 'structure'; readonly id: number; readonly d2: number; readonly bondId: BondId }
  | {
    readonly kind: 'creature' | 'defender' | 'primitive' | 'stinkCloud';
    readonly id: number;
    readonly d2: number;
    readonly target: DamageTarget;
  };

/** The kind tie-break of the total order — the S191 tune Ra ranks. ⚠ MINE. */
const KIND_RANK: Readonly<Record<ZombieBlastTarget['kind'], number>> = {
  structure: 0, creature: 1, defender: 2, primitive: 3, stinkCloud: 4,
};

/**
 * ⭐ PURE (reads the world, writes nothing) — everything the blast at `at` catches, in the total order.
 * `spare` is the seat whose own things are skipped, or `null` for an owner-agnostic blast.
 */
export function zombieBlastTargets(
  world: World,
  at: { x: number; y: number },
  spare: PlayerId | null,
  r = T9_ZOMBIE_DEATH_BLAST_RADIUS,
): ZombieBlastTarget[] {
  const r2 = r * r;
  const d2At = (x: number, y: number): number => {
    const dx = x - at.x;
    const dy = y - at.y;
    return dx * dx + dy * dy;
  };
  const out: ZombieBlastTarget[] = [];

  // ── structures: every connector whose MIDPOINT is in the circle, grouped by its component ──
  const candidate = new Map<BondId, number>(); // a LOOKUP of d2; decisions never iterate it
  const candidateIds: BondId[] = [];
  for (const [bondId, bond] of world.bonds) {
    const a = world.primitives.get(bond.aId);
    const b = world.primitives.get(bond.bId);
    if (a === undefined || b === undefined) continue;
    if (spare !== null && (a.placedBy === spare || b.placedBy === spare)) continue;
    const d2 = d2At((a.pos.x + b.pos.x) / 2, (a.pos.y + b.pos.y) / 2);
    if (d2 > r2) continue;
    candidate.set(bondId, d2);
    candidateIds.push(bondId);
  }
  candidateIds.sort((x, y) => (x as unknown as number) - (y as unknown as number));
  const grouped = new Set<BondId>();
  for (const first of candidateIds) {
    if (grouped.has(first)) continue; // its structure is already a target
    const bond = world.bonds.get(first)!;
    const anchor = world.primitives.get(bond.aId)!;
    let best = first;
    let bestD2 = candidate.get(first)!;
    for (const id of componentOf(anchor, world.primitives, world.bonds).bondIds) {
      grouped.add(id);
      const d2 = candidate.get(id);
      if (d2 === undefined) continue;
      if (d2 < bestD2 || (d2 === bestD2 && (id as unknown as number) < (best as unknown as number))) {
        best = id;
        bestD2 = d2;
      }
    }
    out.push({ kind: 'structure', id: best as unknown as number, d2: bestD2, bondId: best });
  }

  // ── units, Helga, lone shapes, bags ──
  for (const c of world.creatures.values()) {
    if (spare !== null && c.ownerPlayerId === spare) continue;
    if (c.ehp <= 0 || isChannellingRa(c, world.tick)) continue;
    if (world.pendingCreatureDeaths?.has(c.id) === true) continue;
    const d2 = d2At(c.pos.x, c.pos.y);
    if (d2 <= r2) out.push({ kind: 'creature', id: c.id as unknown as number, d2, target: { kind: 'creature', id: c.id } });
  }
  for (const d of world.defenders.values()) {
    if (spare !== null && d.ownerPlayerId === spare) continue;
    if (d.ehp === null || d.ehp <= 0) continue;
    const d2 = d2At(d.pos.x, d.pos.y);
    if (d2 <= r2) out.push({ kind: 'defender', id: d.id as unknown as number, d2, target: { kind: 'defender', id: d.id } });
  }
  for (const p of world.primitives.values()) {
    if (spare !== null && p.placedBy === spare) continue;
    if (p.bonds.size !== 0) continue; // a shape inside a structure is not a target (canon §4)
    const d2 = d2At(p.pos.x, p.pos.y);
    if (d2 <= r2) out.push({ kind: 'primitive', id: p.id as unknown as number, d2, target: { kind: 'primitive', id: p.id } });
  }
  for (const s of world.stinkClouds.values()) {
    if (spare !== null && s.ownerPlayerId === spare) continue;
    if (s.ehp <= 0) continue;
    const d2 = d2At(s.pos.x, s.pos.y);
    if (d2 <= r2) out.push({ kind: 'stinkCloud', id: s.id as unknown as number, d2, target: { kind: 'stinkCloud', id: s.id } });
  }

  out.sort((a, b) => a.d2 - b.d2 || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.id - b.id);
  return out;
}

/** The planned split, in the total order — exported so a test can see exactly what the sim will deal. */
export function planZombieDeathBlast(
  world: World,
  at: { x: number; y: number },
  owner: PlayerId,
): { target: ZombieBlastTarget; share: number }[] {
  const targets = zombieBlastTargets(world, at, T9_ZOMBIE_DEATH_BLAST_HITS_OWN_SIDE ? null : owner);
  // ⭐ S193 R193-B1/B2/B4 — the shared falloff: `kind × max(1, floor(R − d))`, then `floor(pool × w / Σw)`.
  const shares = splitBlastPool(
    T9_ZOMBIE_DEATH_BLAST_POOL_FIFTHS,
    targets.map((t) => blastSplitWeight(t.d2, T9_ZOMBIE_DEATH_BLAST_RADIUS, zombieBlastKindWeight(t.kind))),
  );
  return targets.map((target, i) => ({ target, share: shares[i] ?? 0 }));
}

/**
 * ⭐⭐ THE BLAST. Called by `hostTick`'s boss-roster compare one tick after a zombie boss died, with
 * where he stood and whose he was (captured in the roster, so his absence does not matter).
 *
 * PLAN, THEN MUTATE: the whole split is computed before a single fifth lands, so the order things die
 * in cannot change who was hit. Then STRUCTURES FIRST (a bag this blast pops BURSTS and the burst hits
 * shapes; a structure whose chosen connector it razed first would lose its share — tune's order), then
 * everything else, both in the one total order.
 *
 * ⚠ `null` ATTACKER, EXPLICIT CREDIT: a dead boss is nobody to retaliate against and heals nobody
 * (BLOOD DEBT), but every kill is credited `{ seat: owner, type: zombie boss }` for THE RISEN (T2).
 * ⚠ The cut connector is severed `cause: 'unit'` in his seat's name — the suicide goblin's honest cause.
 */
export function applyZombieDeathBlast(world: World, at: { x: number; y: number }, owner: PlayerId): void {
  world.effects.push({ kind: 'BOMB_EXPLODE', tick: world.tick, pos: { x: at.x, y: at.y }, radius: T9_ZOMBIE_DEATH_BLAST_RADIUS });
  const plan = planZombieDeathBlast(world, at, owner);
  const credit: KillCredit = { seat: owner, type: T9_BOSS_TYPE.zombies };
  for (const { target: t, share } of plan) {
    if (t.kind !== 'structure' || share === 0) continue;
    if (!world.bonds.has(t.bondId)) continue;
    if (damageConnector(world, t.bondId, share, null)) {
      // ⭐ S193 merge — `severWithCarry` (owner S191, canon §2): the struck connector falls and the overkill
      // carries on through the SAME structure, like every other connector-damage caller (CARRY-2 census).
      // ⭐ S193 — straight to `applySeverBond`, not `dispatch`: POWER OF RA's audit-F1 reason (the hub does
      // the same) — `dispatch`'s bench / elimination gates would REFUSE a sever in an eliminated seat's
      // name and leave a connector standing on a spent pool. `canSeverBond` still runs.
      severWithCarry(world, t.bondId, (id) => applySeverBond(world, { type: 'SEVER_BOND', bondId: id, playerId: owner, cause: 'unit' }));
    }
  }
  for (const { target: t, share } of plan) {
    if (t.kind === 'structure' || share === 0) continue;
    if (t.kind === 'stinkCloud') {
      // ⭐ S193 R193-B3 — a bag he pops bursts without hitting HIS side either (the hub's BLAST-1 rule).
      damageStinkCloud(world, t.id as unknown as StinkCloudId, share, null, owner);
      continue;
    }
    damageEntity(world, t.target, share, 'creature', null, credit);
  }
}
