/**
 * SPARK — S174 (owner) — **ONE LABELLING PASS OVER EVERY CONNECTED COMPONENT, PER FRAME.**
 *
 * > *"when creatures are attacking a structure that doesn't have a building or doesn't have a
 * > function, it doesn't show that they're attacking. They just destroy the connectors and that's
 * > it. But IT IS A STRUCTURE, and it should have a calculated health bar above it no matter what.
 * > If it's just a free form of connectors, it should already have an HP bar and the same rules of
 * > engagement and same health as if it were a building producing spawn."*
 *
 * ## ⛔ WHY THIS MODULE EXISTS AT ALL, AND IT IS A PERFORMANCE ANSWER
 *
 * `drawStructureBars` used to reach a structure through its TOWER — walk `world.defenders` and
 * `world.creatureSpawners`, and call `componentOf(anchor)` once per tower. A freeform lattice is in
 * neither map, so it drew nothing, which is the bug above.
 *
 * The obvious repair — walk `world.primitives` and call `componentOf` on each — is **O(V · (V+E))**.
 * `componentOf` is a BFS over the whole component, and a 3 000-shape board would re-walk the same
 * lattice three thousand times, every frame, at 60 Hz. That is a frame-rate bug traded for a
 * readout bug.
 *
 * So the components are LABELLED ONCE: a single sweep of `world.primitives` where each unvisited
 * shape seeds one traversal and a module-local `seen` set means no shape and no bond is ever entered
 * twice. **O(V + E)** — the same asymptotic cost as ONE `componentOf` call, for ALL of them.
 * `structureComponents.test.ts` measures it against the naive form and pins the ratio.
 *
 * ## ⚠ IT MIRRORS `componentOf`'s EDGE CASES ON PURPOSE, INCLUDING THE ODD ONE
 *
 * A bond whose far endpoint has already been reaped still COUNTS toward the component (it is added
 * to `bondIds` before the endpoint lookup), and a bond id on a primitive that is absent from
 * `world.bonds` does not. Both are `componentOf`'s behaviour verbatim, and the first one is
 * load-bearing rather than sloppy: the structure's durability pool is `n × (n + 4)` over exactly
 * this count, and `healthBar.test.ts` derives its expected MAX from it. Diverging here would move
 * the owner's health numbers for a reason nobody would find.
 *
 * ## ⛔ SORTED BY KEY, BECAUSE `Map` ITERATION ORDER MUST NEVER DECIDE ANYTHING
 *
 * The sweep visits primitives in insertion order, so the component ORDER it discovers them in is an
 * insertion-order artefact. This is renderer-only and cannot desync a sim — but the project rule is
 * that a `Map`'s order decides nothing, and obeying it here costs one sort of a handful of entries
 * and buys a stable draw order that a test can assert against.
 */

import type { Bond } from '../physics/bonds.ts';
import type { Primitive } from '../game/primitive.ts';
import type { BondId, PrimitiveId } from '../types.ts';

/** One connected component of placed shapes, in the terms the renderers actually read. */
export interface RenderComponent {
  /**
   * The component's LOWEST member primitive id — its identity.
   *
   * ⚠ Deterministic by construction: it is the same value whichever member the sweep happened to
   * enter through, which is exactly the property the old per-tower dedupe needed and got this way.
   */
  readonly key: PrimitiveId;
  readonly primitiveIds: readonly PrimitiveId[];
  readonly bondIds: readonly BondId[];
  /** Centroid of the member shapes — where the bar is centred horizontally. */
  readonly cx: number;
  readonly cy: number;
  /**
   * The component's HIGHEST POINT ON SCREEN: `min(pos.y − radius)` over its members.
   *
   * ⭐ Owner: *"You take the HIGHEST POINT and you put a bar over it."* A freeform lattice has no
   * sprite, so this is the only thing its bar can sit above. The radius is subtracted because a
   * shape is drawn as a disc around `pos`, not as a point at it.
   */
  readonly topY: number;
  /** Summed `Bond.damageFifths` over the member connectors — the structure's accumulated damage. */
  readonly damageFifths: number;
  /** `placedBy` of the key shape — who the structure reads as belonging to, for the fog. */
  readonly placedBy: Primitive['placedBy'];
}

/**
 * Every connected component with at least one member, in ascending `key` order.
 *
 * ⚠ CALL THIS ONCE PER FRAME AND REUSE THE RESULT. It is cheap but it is not free, and calling it
 * per entity is the exact mistake it exists to prevent.
 */
export function labelStructureComponents(
  primitives: ReadonlyMap<PrimitiveId, Primitive>,
  bonds: ReadonlyMap<BondId, Bond>,
): RenderComponent[] {
  const seenPrim = new Set<PrimitiveId>();
  const seenBond = new Set<BondId>();
  const out: RenderComponent[] = [];

  for (const seed of primitives.values()) {
    if (seenPrim.has(seed.id)) continue;

    const memberIds: PrimitiveId[] = [];
    const memberBonds: BondId[] = [];
    let key = seed.id;
    let sx = 0;
    let sy = 0;
    let topY = Number.POSITIVE_INFINITY;
    let damage = 0;

    // An explicit stack, not `queue.shift()`. `componentOf` shifts an array, which is O(n) per pop
    // and therefore O(n²) over a big lattice — invisible on the ten-shape structures it was written
    // for and not invisible on a late-match board. Order does not matter here: the aggregates are
    // commutative and `key` is a minimum.
    const stack: Primitive[] = [seed];
    seenPrim.add(seed.id);

    while (stack.length > 0) {
      const cur = stack.pop()!;
      memberIds.push(cur.id);
      if ((cur.id as number) < (key as number)) key = cur.id;
      sx += cur.pos.x;
      sy += cur.pos.y;
      const top = cur.pos.y - cur.radius;
      if (top < topY) topY = top;

      for (const bondId of cur.bonds) {
        if (seenBond.has(bondId)) continue;
        const bond = bonds.get(bondId);
        if (bond === undefined) continue; // a stale id on the shape — not a connector that exists
        seenBond.add(bondId);
        memberBonds.push(bondId);
        damage += bond.damageFifths;
        // ⚠ ADDED ABOVE, BEFORE THIS LOOKUP — a bond whose far end has been reaped still counts.
        // That is `componentOf`'s behaviour and the durability pool is derived from this count.
        const otherId = bond.aId === cur.id ? bond.bId : bond.aId;
        if (seenPrim.has(otherId)) continue;
        const other = primitives.get(otherId);
        if (other === undefined) continue;
        seenPrim.add(otherId);
        stack.push(other);
      }
    }

    const n = memberIds.length;
    out.push({
      key,
      primitiveIds: memberIds,
      bondIds: memberBonds,
      cx: sx / n,
      cy: sy / n,
      topY,
      damageFifths: damage,
      placedBy: (primitives.get(key) ?? seed).placedBy,
    });
  }

  // See the docblock: insertion order decides nothing here.
  out.sort((a, b) => (a.key as number) - (b.key as number));
  return out;
}
