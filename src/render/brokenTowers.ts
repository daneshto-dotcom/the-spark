/**
 * SPARK — S194 `s194/visuals-6` — **WHICH FALLEN TOWERS CAN STILL BE FIXED, AND WHERE (owner R194-22).**
 *
 * > *"How do players know what part of the whole structure they built is their tower? So maybe those
 * > little sparks … when the tower is destroyed, those little sparks, little graphic comes back to life
 * > where the connectors are of the tower. That way users will know, oh, that's where I need to fix."*
 *
 * Combat (and the entropy tax) can break one tower's recipe inside a big welded structure. The tower
 * falls, but FIX can re-weld it (`structureRepair.ts` restorePlannedRepair). This module names every such
 * tower from SYNCED STATE ONLY, with the same predicates the FIX card uses:
 *   · `towerUnitAt` → `kind: 'stamp'` — the remains of a STAMPED tower that fell (more than half its
 *     nodes still standing; a live tower is `'live'`, rubble is `null`);
 *   · `blueprintGroupOf` non-null — the shapes still read as ONE blueprint stamp (what FIX bills);
 *   · `fallenTowerFixCanRegister` — a FIX would stand it up again (planStructureRepair's own gate).
 * ⚠ NOT gated on the phase or on the bank: FIX itself is BUILD-only (R19) and can be short of shapes,
 * but "this is where you need to fix" is true in FIGHT too, and that is when the tower breaks. ⚠ MINE.
 *
 * ⭐ R194-23 (owner, S194) — EVERY VIEWER SEES IT, not the owner only: *"It doesn't matter because enemies
 * can't … control their own units … so it's fine."* Fog still hides it exactly like the tower itself
 * (the caller culls with `isConcealed`).
 *
 * It stops by construction: FIX completes → the tower re-registers (`'live'`); SCRAP → the shapes are
 * gone; the structure no longer holds it → `towerUnitAt` / `blueprintGroupOf` return null.
 *
 * ⚠ RENDER-ONLY, READ-ONLY. Recomputed at most every `BROKEN_TOWER_RESCAN_TICKS` ticks, or at once when
 * the board's shape/connector/tower counts change (a FIX, a SCRAP, a sever), so its cost is bounded.
 */

import type { World } from '../state/world.ts';
import type { BondId, PlayerId, PrimitiveId } from '../types.ts';
import { towerUnitAt } from '../state/towerUnit.ts';
import { blueprintGroupOf, fallenTowerFixCanRegister } from '../state/structureRepair.ts';
import { blueprintFor } from '../state/blueprints.ts';

/** Rescan cadence (ticks). ⚠ MINE. */
/*
 * ⚠ S194 audit perf — 120, not 15: a fall, a FIX, a SCRAP or a cut all change the board's counts, which
 * re-keys the cache at once; the cadence is only a backstop. At 15 the full rescan (a `towerUnitAt` per
 * stamped shape) showed up in the 12-tower re-bench.
 */
export const BROKEN_TOWER_RESCAN_TICKS = 120;

/** One blueprint edge of a fallen tower: an existing connector, or a MISSING one between two survivors. */
export interface BrokenEdge {
  readonly a: PrimitiveId;
  readonly b: PrimitiveId;
  /** The connector standing there, or null — the edge FIX would re-weld ("that's where I need to fix"). */
  readonly bond: BondId | null;
}

export interface BrokenTower {
  /** Smallest surviving shape id — a stable seed. */
  readonly key: PrimitiveId;
  readonly owner: PlayerId;
  readonly prims: readonly PrimitiveId[];
  readonly edges: readonly BrokenEdge[];
}

function bondBetween(world: World, aId: PrimitiveId, bId: PrimitiveId): BondId | null {
  const a = world.primitives.get(aId);
  if (a === undefined) return null;
  let best: BondId | null = null;
  for (const bid of a.bonds) {
    const bond = world.bonds.get(bid);
    if (bond === undefined) continue;
    if ((bond.aId === bId || bond.bId === bId) && (best === null || bid < best)) best = bid;
  }
  return best;
}

/** PURE — every fallen tower FIX could stand up again, in ascending key order. */
export function brokenTowersOf(world: World): BrokenTower[] {
  const ids = [...world.primitives.values()].filter((p) => p.origin !== null).map((p) => p.id).sort((a, b) => a - b);
  const seen = new Set<PrimitiveId>();
  const out: BrokenTower[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const unit = towerUnitAt(world, id);
    if (unit === null) { seen.add(id); continue; }
    for (const m of unit.members) seen.add(m);
    seen.add(id);
    if (unit.kind !== 'stamp') continue;
    const group = blueprintGroupOf(world, unit.members);
    if (group === null) continue;
    const owner = world.primitives.get(unit.members[0]!)!.placedBy;
    if (!fallenTowerFixCanRegister(world, owner, group)) continue;
    const bp = blueprintFor(group.blueprintId);
    const edges: BrokenEdge[] = [];
    for (const [ai, bi] of bp.bonds) {
      const a = group.byNode.get(ai);
      const b = group.byNode.get(bi);
      if (a === undefined || b === undefined) continue;
      edges.push({ a, b, bond: bondBetween(world, a, b) });
    }
    out.push({ key: unit.members[0]!, owner, prims: [...unit.members], edges });
  }
  return out;
}

/** A per-renderer cache of `brokenTowersOf`, refreshed on the cadence or when the board changes shape. */
export class BrokenTowerCache {
  private key = '';
  private value: BrokenTower[] = [];

  get(world: World): readonly BrokenTower[] {
    const k = `${Math.floor(world.tick / BROKEN_TOWER_RESCAN_TICKS)}:${world.primitives.size}:${world.bonds.size}:${world.creatureSpawners.size}:${world.defenders.size}`;
    if (k !== this.key) {
      this.key = k;
      this.value = brokenTowersOf(world);
    }
    return this.value;
  }
}
