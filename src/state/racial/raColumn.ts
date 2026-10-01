/**
 * SPARK — S191 / S192 (owner) — **ONE COLUMN OF RA'S LIGHT, WHOEVER CALLS IT DOWN.**
 *
 * The ONE implementation of a Ra column landing: the player perk (POWER OF RA, each WRATH OF RA charge,
 * the bot cast — `powerOfRa.ts`) and the Pharaoh BOSS's ritual (`bossSkillsPharaohRitual.ts`) both land
 * through `landRaColumn`, and both take their number from `raColumnPoolFor`. Lives in its own module so
 * the boss ritual can import it without a `powerOfRa.ts` ↔ `bossSkillsPharaohRitual.ts` cycle.
 *
 * > *"each column that it does 30 damage it split right so if it hits a tower and an enemy at the same
 * > time then it split amongst those two … it's not like 30 to each thing in the vicinity … we can do it
 * > 35 per hit."* — owner, S191
 *
 * > *"the [Ra] column, Pharaoh boss should not keep … his 300. That's ridiculous. He goes down to 35 per
 * > column, just like a regular column attack. And once we have Ra's Wrath at … level 10, once we have
 * > that ability, then each column goes … up to 75. And also Pharaoh's become 75. Okay? If the player
 * > chose that ability."* — owner, S192
 *
 * ## Determinism
 *
 * No RNG, no clock, no accumulator. A column's targets are collected in full BEFORE any damage, then put
 * in ONE total order (squared distance to the column centre, then kind, then id — never `Map` order,
 * never `Math.hypot`), and that order alone decides who gets the remainder of the split. The pool is
 * read from the OWNER seat's picks at the moment the column lands (`raColumnPoolFor`), which every peer
 * and every successor computes from synced state.
 */

import { RA_COLUMN_RADIUS, RA_PERK_COLUMN_ATK, RA_PERK_COLUMN_PEN, RA_WRATH_COLUMN_ATK, RA_WRATH_COLUMN_PEN } from '../../constants.ts';
import type { BondId, PlayerId } from '../../types.ts';
import { componentOf } from '../../game/structure.ts';
import { isChannellingRa } from '../creatures/creature.ts';
import { damageConnector, damageEntity, severWithCarry, type DamageTarget } from '../damage.ts';
import { seatHoldsPerk } from '../racialPerks.ts';
import { attackFifths } from '../stats.ts';
import { applySeverBond } from '../severBond.ts';
import type { World } from '../world.ts';

/**
 * ⭐⭐ S191 (owner) — **WHAT ONE COLUMN DEALS, IN TOTAL, WITHOUT WRATH OF RA: 35 FIFTHS, SPLIT** across
 * everything it catches (`raSplitShares`). ONE LADDER — `attackFifths(RA_PERK_COLUMN_ATK,
 * RA_PERK_COLUMN_PEN)`; his *"we can do it 35 per hit"* is quoted at the constants. ⭐ S192 — the Pharaoh
 * BOSS's column is this number too (*"He goes down to 35 per column, just like a regular column attack"*).
 */
export const RA_PERK_STRIKE_FIFTHS = attackFifths(RA_PERK_COLUMN_ATK, RA_PERK_COLUMN_PEN);

/**
 * ⭐⭐ S192 (owner) — **WITH WRATH OF RA: 75 FIFTHS A COLUMN, IN TOTAL, SPLIT** — for every column a seat
 * holding `mummies.l10` produces: its POWER OF RA cast, all three WRATH charges, a bot's cast, AND its
 * Pharaoh boss's ritual. *"each column goes … up to 75. And also Pharaoh's become 75 … If the player chose
 * that ability."* `attackFifths(RA_WRATH_COLUMN_ATK, RA_WRATH_COLUMN_PEN)` — the pair is ⚠ MINE (constants).
 */
export const RA_WRATH_STRIKE_FIFTHS = attackFifths(RA_WRATH_COLUMN_ATK, RA_WRATH_COLUMN_PEN);

/**
 * ⭐⭐ S192 — **THE ONLY SOURCE OF A RA COLUMN'S NUMBER.** `seat` is the column's OWNER: the caster for
 * the perk, `ownerPlayerId` for a Pharaoh boss. 75 when that seat holds WRATH OF RA (`mummies.l10`,
 * `seatHoldsPerk` — race AND the racial pick at its draft slot AND the required POWER OF RA), otherwise
 * 35. A seat that does not exist (or `null`) gets 35. Read at LANDING, so a seat that takes WRATH mid-fight
 * gets 75 from its next column on — picks are append-only, so it never goes back down.
 */
export function raColumnPoolFor(world: World, seat: PlayerId | null): number {
  if (seat === null) return RA_PERK_STRIKE_FIFTHS;
  const p = world.players.get(seat);
  if (p !== undefined && seatHoldsPerk(p, 'mummies.l10')) return RA_WRATH_STRIKE_FIFTHS;
  return RA_PERK_STRIKE_FIFTHS;
}

/**
 * ⭐⭐ S191 (owner) — **HOW ONE COLUMN'S POOL IS SHARED.** *"it's 30 split so if there's like two enemies
 * it's split amongst them"*. PURE and integer: `total` over `n` targets already in their total order.
 *
 * Each target gets `floor(total / n)`; the remainder goes one fifth apiece to the FIRST `total mod n`
 * targets — so the shares sum to exactly `total`, differ by at most one, and nothing is fractional
 * (`damageEntity` throws on a fraction). ⚠ MINE: with more than `total` targets the first `total` get
 * 1 and the rest 0.
 * ⚠ Self-contained on purpose: `s191/carry` builds the same rule for the hub blast; the merge owner
 * may fold the two into one helper.
 */
export function raSplitShares(total: number, n: number): number[] {
  if (!Number.isInteger(n) || n <= 0) return [];
  const base = Math.floor(total / n);
  const rem = total - base * n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(base + (i < rem ? 1 : 0));
  return out;
}

/**
 * One thing a column can hit. A STRUCTURE is one of them however many of its connectors the circle
 * covers, and its share lands on `bondId` — its connector nearest the column centre.
 */
export type RaColumnTarget =
  | { readonly kind: 'structure'; readonly id: number; readonly d2: number; readonly bondId: BondId }
  | {
    readonly kind: 'creature' | 'defender' | 'primitive' | 'stinkCloud';
    readonly id: number;
    readonly d2: number;
    readonly target: DamageTarget;
  };

/** The kind tie-break of the total order, for two targets at exactly the same distance. ⚠ MINE. */
const RA_TARGET_KIND_RANK: Readonly<Record<RaColumnTarget['kind'], number>> = {
  structure: 0, creature: 1, defender: 2, primitive: 3, stinkCloud: 4,
};

/**
 * ⭐⭐ S191 — **EVERYTHING ONE COLUMN AT `at` CATCHES, IN THE ORDER THE SPLIT HANDS OUT ITS REMAINDER.**
 * Pure — reads the world, writes nothing — so a test can see the list the sim uses.
 *
 * `spare` is the seat whose things are untouched AND uncounted: the caster, for the perk. ⭐ S192 — the
 * Pharaoh boss passes `null`: his columns spare NOBODY, unchanged from S171 (*"kills everything in that
 * circle"*), so his own seat's things are targets too. He himself is channelling, so never a target.
 *
 * One target each:
 *   · a STRUCTURE — a connected component with at least one non-spared connector whose MIDPOINT is
 *     inside the circle. Its share lands on the ONE such connector nearest the centre (squared distance,
 *     then the lowest bond id). A bond touching any of the spared seat's shapes is never a candidate
 *     (a bond has no owner field; ownership is read off the shapes it joins, the rule the raid uses).
 *     ⚠ MINE: a structure whose SHAPES are inside the circle but none of whose connector midpoints are
 *     is not a target — a shape inside a structure is not targetable (canon §4).
 *   · a CREATURE with pool left. ⚠ MINE: a corpse awaiting this tick's death sweep (`ehp <= 0`) and a
 *     Pharaoh channelling Ra take no share — a share on them would simply be lost. Untargetable-by-type
 *     units (the locust cloud) DO count: an area strike reaches them, the standing ruling.
 *   · a unit-class DEFENDER (Helga — `ehp !== null`). A tower has no pool; its STRUCTURE is the target.
 *   · a LONE BUILT SHAPE (no connectors — canon §2's 5-fifth shape).
 *   · a landed STINK BAG.
 *
 * The total order is squared distance to `at` (the connector's midpoint for a structure), then
 * `RA_TARGET_KIND_RANK`, then id. No `Math.hypot`, no `Map` order.
 */
export function raColumnTargets(world: World, spare: PlayerId | null, at: { x: number; y: number }): RaColumnTarget[] {
  const r2 = RA_COLUMN_RADIUS * RA_COLUMN_RADIUS;
  const d2At = (x: number, y: number): number => {
    const dx = x - at.x;
    const dy = y - at.y;
    return dx * dx + dy * dy;
  };
  const spared = (owner: PlayerId | undefined): boolean => spare !== null && owner === spare;
  const out: RaColumnTarget[] = [];

  // ── structures: every candidate connector in the circle, grouped by the component it belongs to ──
  const candidate = new Map<BondId, number>(); // a LOOKUP of d2; the decisions below never iterate it
  const candidateIds: BondId[] = [];
  for (const [bondId, bond] of world.bonds) {
    if (spared(world.primitives.get(bond.aId)?.placedBy) || spared(world.primitives.get(bond.bId)?.placedBy)) continue;
    const d2 = d2At((bond.a.pos.x + bond.b.pos.x) / 2, (bond.a.pos.y + bond.b.pos.y) / 2);
    if (d2 > r2) continue;
    candidate.set(bondId, d2);
    candidateIds.push(bondId);
  }
  candidateIds.sort((a, b) => (a as unknown as number) - (b as unknown as number));
  const grouped = new Set<BondId>();
  for (const first of candidateIds) {
    if (grouped.has(first)) continue; // its structure is already a target
    const bond = world.bonds.get(first)!;
    const anchor = world.primitives.get(bond.aId) ?? world.primitives.get(bond.bId);
    // An orphaned bond (no live endpoint) is its own structure — `damageConnector` fells it outright.
    const members = anchor === undefined ? [first] : componentOf(anchor, world.primitives, world.bonds).bondIds;
    let best = first;
    let bestD2 = candidate.get(first)!;
    for (const id of members) {
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
    if (spared(c.ownerPlayerId) || c.ehp <= 0 || isChannellingRa(c, world.tick)) continue;
    const d2 = d2At(c.pos.x, c.pos.y);
    if (d2 <= r2) out.push({ kind: 'creature', id: c.id as unknown as number, d2, target: { kind: 'creature', id: c.id } });
  }
  for (const d of world.defenders.values()) {
    if (spared(d.ownerPlayerId) || d.ehp === null || d.ehp <= 0) continue;
    const d2 = d2At(d.pos.x, d.pos.y);
    if (d2 <= r2) out.push({ kind: 'defender', id: d.id as unknown as number, d2, target: { kind: 'defender', id: d.id } });
  }
  for (const p of world.primitives.values()) {
    if (spared(p.placedBy) || p.bonds.size !== 0) continue;
    const d2 = d2At(p.pos.x, p.pos.y);
    if (d2 <= r2) out.push({ kind: 'primitive', id: p.id as unknown as number, d2, target: { kind: 'primitive', id: p.id } });
  }
  for (const s of world.stinkClouds.values()) {
    if (spared(s.ownerPlayerId) || s.ehp <= 0) continue;
    const d2 = d2At(s.pos.x, s.pos.y);
    if (d2 <= r2) out.push({ kind: 'stinkCloud', id: s.id as unknown as number, d2, target: { kind: 'stinkCloud', id: s.id } });
  }

  out.sort((a, b) => a.d2 - b.d2 || RA_TARGET_KIND_RANK[a.kind] - RA_TARGET_KIND_RANK[b.kind] || a.id - b.id);
  return out;
}

/** Who a column is, for the four decisions that differ between the perk and the boss. */
export interface RaColumnSource {
  /** The seat whose things are spared and uncounted — the caster; `null` (the boss) spares nobody. */
  readonly spare: PlayerId | null;
  /** The seat whose picks decide the pool (`raColumnPoolFor`) and who is credited with a sever. */
  readonly owner: PlayerId;
  /**
   * The sever cause. `'raid'` for the perk (a PLAYER's attack reached the connector's capacity);
   * `'unit'` for the boss — ⚠ MINE (S192): the one existing cause meaning "a creature that is not the
   * Voltkin or a chewer cut a connector", which is what a Pharaoh is. A new cause would be a new
   * discriminant on a serialized action.
   */
  readonly severCause: 'raid' | 'unit';
}

/**
 * ⭐⭐ ONE COLUMN AT `at`. `raColumnPoolFor(world, src.owner)` IN TOTAL, split over `raColumnTargets` by
 * `raSplitShares`. Returns the pool it used (for tests), or 0 when the circle held nothing.
 *
 * ⛔ STRUCTURES FIRST, THEN THE REST — and the order is not cosmetic. A stink bag this column pops
 * BURSTS (`applyRadialDamage`), and the burst hits shapes; a structure whose chosen connector it razed
 * first would lose its share. Both passes walk the one total order.
 */
export function landRaColumn(world: World, src: RaColumnSource, at: { x: number; y: number }): number {
  const targets = raColumnTargets(world, src.spare, at);
  if (targets.length === 0) return 0;
  const pool = raColumnPoolFor(world, src.owner);
  const shares = raSplitShares(pool, targets.length);
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    const share = shares[i]!;
    if (t.kind !== 'structure' || share === 0) continue;
    if (!world.bonds.has(t.bondId)) continue;
    // S188 merge — no creature attacker: a sky strike has no creature to heal (BLOOD DEBT).
    // ⭐ S193 BLAST-2 — `'seat'`: the column's OWNER (the caster, or the Pharaoh's seat) is credited on the
    // stat board; a seat heals nobody. A Pharaoh column on his own seat's things credits nobody (own side).
    if (damageConnector(world, t.bondId, share, { kind: 'seat', seat: src.owner })) {
      /*
       * ⛔ S188 audit F1 — RESOLVED INLINE, not dispatched, so a caster benched or eliminated
       * mid-strike (or a Pharaoh's seat) still breaks what the column drained.
       */
      // ⭐ S191 (owner) — `severWithCarry`: the struck connector falls and the overkill carries on (canon §2).
      severWithCarry(world, t.bondId, (id) => applySeverBond(world, { type: 'SEVER_BOND', bondId: id, playerId: src.owner, cause: src.severCause }), { kind: 'seat', seat: src.owner });
    }
  }
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    const share = shares[i]!;
    if (t.kind === 'structure' || share === 0) continue;
    // `'aura'` and a SEAT: a column of light is nobody a unit can turn on (⭐ S193 BLAST-2 — the seat is the
    // stat board's credit only).
    damageEntity(world, t.target, share, 'aura', { kind: 'seat', seat: src.owner });
  }
  return pool;
}
