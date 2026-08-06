/**
 * SPARK — deterministic sim STATE HASH (S107 P2, worker-sim foundation).
 *
 * A cheap, order-independent-by-construction 32-bit fingerprint of the
 * authoritative sim state. Pure function of the synced fields — NO wall-clock,
 * NO Math.random, NO Map/Set iteration-order dependence (every collection is
 * sorted by its stable id before hashing).
 *
 * WHY (the worker-sim milestone): when the authoritative sim eventually moves
 * behind a Web Worker boundary (host render-only == client; worker boundary ==
 * future dedicated-server boundary), host / worker / client must be able to
 * cross-CHECK that they computed byte-identical state WITHOUT shipping the full
 * ~O(world) snapshot JSON every tick. It is ALSO a cheaper, sharper determinism
 * oracle for the replay tests than a full-JSON diff (a hash mismatch localizes
 * nothing, but proves divergence in one comparison; the tests keep the full-JSON
 * compare too for the diagnostic).
 *
 * ⚠ CORRECTED S133 — WHAT THIS ACTUALLY IS TODAY. This docblock previously read
 * "Each side hashes its world and compares a single u32; a mismatch flags a
 * silent desync immediately", which overstated it in a way BACKLOG R1 then
 * inherited. The truth, verified:
 *   • There is NO host-vs-remote-client desync check. This module has ZERO
 *     importers under `src/net/`, and no checksum field rides the wire.
 *   • The ONE production consumer is `main.ts:1706`, on the worker↔main-mirror
 *     boundary. It applies the WORKER'S OWN snapshot and then compares the
 *     mirror's hash to the worker's — so both sides derive from a SINGLE
 *     authority. That is an APPLY-FIDELITY check, not a two-simulation desync
 *     check, exactly as the comment at that call site says.
 *   • The real two-simulation oracles are the TEST harnesses
 *     (`hostTick.differential`, `workerSim.differential`, the two replay suites).
 * A runtime host↔client oracle would need an additive-optional NetSnapshot field
 * (see WORKER_SIM_FOUNDATION.md) and is gated on the wire budget — R11 measures a
 * 6-seat endgame at 2.35× the 16 KiB guard ceiling BEFORE anything is added.
 *
 * ⚠ THIS HASH IS DELIBERATELY NARROW. It covers only the families in
 * `NARROW_HASHED_FAMILIES` below; every other entity family (creatures,
 * spawners, defenders, bombs, hunters, potatoes, rainbows, seagulls, poops,
 * fouledPrimitives) is INVISIBLE to it, so it CANNOT see an entity desync. That
 * is intentional now rather than accidental: widening it would put a per-entity
 * projection on the `main.ts:1706` hot path for no runtime gain (see above).
 * The WIDE, test-only counterpart is `hashWorldStateFull` in `stateHashFull.ts`,
 * whose `FAMILY_COVERAGE` map is a compile-time forcing function over every
 * World collection. **Add a family there, not here.**
 *
 * DETERMINISM NOTE (cross-context): within a single browser the main thread and
 * a Web Worker share the SAME V8 isolate semantics, so float results +
 * iteration order are identical → the hash matches across that boundary. A
 * FUTURE dedicated server on a different V8 version is the only place transcendental
 * (sin/cos) results could differ (sqrt is IEEE-754-mandated; sin/cos are not) —
 * tracked as a milestone risk in WORKER_SIM_FOUNDATION.md, not a today problem.
 */

import type { World } from './worldTypes.ts';

/** FNV-1a 32-bit over a string. `Math.imul` keeps the multiply in 32-bit space. */
export function fnv1a32(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The COLLECTION families this narrow hash reads — a runtime list so it is a
 * single source of truth with the `HashableWorld` type below (S133).
 *
 * `stateHashFull.test.ts` asserts every entry here is marked `'hashed'` in
 * `FAMILY_COVERAGE`, which is what makes the narrow/wide split unable to drift:
 * narrowing or widening this list re-runs that check automatically.
 */
/**
 * V6-RISK(R1): this narrow set is the reason the silent-desync oracle is BLIND to every entity
 * family. The V6-1.1 gatherer slot — which also flips the sim-worker default ON — must add its new
 * family to `FIELD_COVERAGE` in `stateHashFull.ts` (a compile-time forcing function since S133), NOT
 * here: widening this list puts a per-entity projection on the `main.ts:1706` hot path.
 * ⚠ BACKLOG R1's instruction to "add gatherers to HashableWorld AND structuralSignature" treats two
 * NON-symmetric levers as symmetric — `structuralSignature` is a SIZE-ONLY fingerprint and cannot
 * express a per-entity field. See BACKLOG CARRY-FORWARD LEDGER.
 */
export const NARROW_HASHED_FAMILIES = ['primitives', 'bonds', 'freeSparks', 'scoreByPlayer'] as const;

type HashableWorld = Pick<
  World,
  'tick' | 'scoreProgress' | (typeof NARROW_HASHED_FAMILIES)[number]
>;

/**
 * Deterministic 32-bit fingerprint of the sim-authoritative state. Collections
 * are sorted by their stable numeric id so the result is invariant to Map
 * insertion order (defensive — insertion order is already deterministic, but the
 * sort makes the hash robust to any future reordering of allocation paths).
 */
export function hashWorldState(world: HashableWorld): number {
  const num = (id: { valueOf?: () => number } | number): number => id as unknown as number;
  const parts: string[] = [`t${world.tick}`, `sp${world.scoreProgress}`];

  const scores = [...world.scoreByPlayer.entries()].sort((a, b) => num(a[0]) - num(b[0]));
  for (const [id, s] of scores) parts.push(`P${num(id)}=${s}`);

  const prims = [...world.primitives.values()].sort((a, b) => num(a.id) - num(b.id));
  for (const p of prims) parts.push(`p${num(p.id)}:${p.pos.x},${p.pos.y}`);

  const bonds = [...world.bonds.values()].sort((a, b) => num(a.id) - num(b.id));
  for (const b of bonds) parts.push(`b${num(b.id)}:${num(b.aId)}-${num(b.bId)}`);

  const sparks = [...world.freeSparks.values()].sort((a, b) => num(a.id) - num(b.id));
  for (const s of sparks) parts.push(`s${num(s.id)}:${s.pos.x},${s.pos.y}`);

  return fnv1a32(parts.join('|'));
}
