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
 * ~O(world) snapshot JSON every tick. Each side hashes its world and compares a
 * single u32; a mismatch flags a silent desync immediately (e.g. behind
 * `?DEBUG_HASH=1`). It is ALSO a cheaper, sharper determinism oracle for the
 * replay tests than a full-JSON diff (a hash mismatch localizes nothing, but
 * proves divergence in one comparison; the tests keep the full-JSON compare too
 * for the diagnostic).
 *
 * NOT serialized on the wire yet — there is no worker/cross-context consumer in
 * this session, and shipping a per-snapshot field with no reader would be
 * premature (see WORKER_SIM_FOUNDATION.md for the sequenced cutover plan). When
 * the cutover lands, add it to the NetSnapshot as an additive-optional field.
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

type HashableWorld = Pick<
  World,
  'tick' | 'primitives' | 'bonds' | 'freeSparks' | 'scoreProgress' | 'scoreByPlayer'
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
