/**
 * SPARK — S118 P2 (B3): KEYSTONE ANCHOR — the first SYMBIOTIC-CHAINING combo behavior.
 *
 * "Make the geometry matter" taken one step further than the Anchor itself (state/anchorStabilize.ts):
 * an Anchor (Dot↔Square) doesn't just plant ITSELF against the S49 territorial engulf-sag — it acts as a
 * KEYSTONE that confers PART of that rigidity to the MAGIC bonds directly bonded to its endpoint
 * primitives. So WHERE you attach your magic structures becomes tactical: branch a Filament / Vortex /
 * Spindle / Bracket off an Anchor and it resists enemy territory too; leave it dangling and it sags.
 * This is the geometric-builder North Star — "connecting shape A to shape B IS the game" — expressed as
 * a build-ORDER decision (the S116-audit F8 symbiotic-chaining proof-of-vision; Council S118 Q2 ADOPT).
 *
 * MECHANISM: runs ONCE per physics tick, host-only, AFTER computeTerritorialInfluence (which sags enemy
 * bonds) AND after applyAnchorStabilize (which floors the Anchor bonds themselves to ANCHOR_STIFFNESS_
 * FLOOR), and BEFORE the substep solveBonds loop. For each live, un-fouled Anchor bond, it scans the
 * bonds incident to its two endpoint primitives and FLOORS each un-fouled MAGIC neighbor bond's
 * stiffnessMultiplier up to KEYSTONE_STIFFNESS_FLOOR (which is below the anchor's own floor, so the
 * anchor stays the strongest joint and the neighbor gets a partial lift). No-op outside enemy territory
 * (an un-sagged magic bond is already at 1.0 ≥ the floor) or when no live Anchor exists.
 *
 * DETERMINISM / REPLAY-SAFE BY CONSTRUCTION (Council S118 Q2 — PRIME-AUDIT of GROK's "sort IDs" fix):
 * the write is a per-bond idempotent max() against a CONSTANT floor — a magic neighbor is either floored
 * or not, to one fixed value — so the result is INDEPENDENT of bond/primitive iteration order (no
 * cross-bond accumulation; identical to the applyAnchorStabilize precedent, which is why GROK's ordering
 * concern does not apply). stiffnessMultiplier is an ephemeral per-tick derived quantity (save.ts skips
 * it), so this adds ZERO wire/save bytes and save.replay stays byte-identical; PROTOCOL_VERSION untouched.
 * A FOULED anchor stops conferring, and a FOULED magic neighbor stops receiving — consistent with foul
 * zeroing a structure's income + halting Vortex/Anchor behaviors.
 */

import { KEYSTONE_STIFFNESS_FLOOR } from '../constants.ts';
import { isAnchorCombo, isMagical } from '../combos.ts';
import type { World } from './worldTypes.ts';

/**
 * Host-only, once per physics tick — AFTER applyAnchorStabilize, BEFORE the substep solveBonds loop.
 * No-op when no live un-fouled Anchor exists or when no anchored magic neighbor is territorially sagged.
 */
export function applyKeystoneAnchor(world: World): void {
  for (const anchor of world.bonds.values()) {
    const a = world.primitives.get(anchor.aId);
    if (a === undefined) continue;
    const b = world.primitives.get(anchor.bId);
    if (b === undefined) continue;
    if (!isAnchorCombo(a.type, b.type)) continue;
    // A poop-fouled Anchor stops planting (applyAnchorStabilize) → it also stops conferring as a keystone.
    if (world.fouledPrimitives.has(anchor.aId) || world.fouledPrimitives.has(anchor.bId)) continue;

    // Confer to magic bonds sharing EITHER endpoint primitive of this anchor (its structural neighbors).
    for (const prim of [a, b]) {
      for (const neighborBondId of prim.bonds) {
        if (neighborBondId === anchor.id) continue; // the anchor is not its own neighbor
        const nb = world.bonds.get(neighborBondId);
        if (nb === undefined) continue;
        const na = world.primitives.get(nb.aId);
        if (na === undefined) continue;
        const nbEnd = world.primitives.get(nb.bId);
        if (nbEnd === undefined) continue;
        // Only MAGIC neighbors benefit — the symbiosis rewards anchoring your VALUABLE structures.
        if (!isMagical(na.type, nbEnd.type)) continue;
        // A fouled magic neighbor is "sick" — it does not receive the keystone lift (foul-skip parity).
        if (world.fouledPrimitives.has(nb.aId) || world.fouledPrimitives.has(nb.bId)) continue;
        // Floor, never lower (idempotent max, order-irrelevant): an already-rigid neighbor (1.0 outside
        // territory, or 0.7 if it is itself an Anchor) keeps its higher value; only a SAGGED magic
        // neighbor (degraded to 0.3 by enemy territory) is lifted toward the keystone floor.
        if ((nb.stiffnessMultiplier ?? 1.0) < KEYSTONE_STIFFNESS_FLOOR) {
          nb.stiffnessMultiplier = KEYSTONE_STIFFNESS_FLOOR;
        }
      }
    }
  }
}
