/**
 * SPARK — S88 G3a: in-match combo-DISCOVERY detection (host-authoritative).
 *
 * After a placement creates its bonds, scan the ones minted THIS placement
 * (bond.id >= firstNewBondId). One hook covers every bond-creation path —
 * primary + redundancy + merge-sweep in placePrimitive, plus the PLACE_FROM_FREE
 * delegate that routes through placePrimitive (PRIME-AUDIT R3). For each NAMED
 * MAGIC combo (the magic set) formed for the FIRST time this match, record it:
 *   - add its ComboKey to world.discoveredCombos (drives the "Combos N/14" HUD),
 *   - stamp world.comboToastTick = world.tick,
 *   - set world.lastDiscoveredComboNames to the resultName(s) discovered at this tick.
 *
 * A single placement weaving >1 NEW magic combo on one tick stamps ALL their
 * names (an array, ascending bond-id order) so no toast is silently dropped
 * (PRIME-AUDIT R1). The client renders these synced fields verbatim and never
 * recomputes ⇒ replay-deterministic + 1v1-mirror-consistent (rainbowSwitchTick
 * pattern). Functional (placeholder) combos never toast — only isMagical entries.
 */
import { comboKey, lookupCombo, type ComboKey } from '../combos.ts';
import type { World } from './worldTypes.ts';

export function detectComboDiscoveries(world: World, firstNewBondId: number): void {
  // Bonds minted by THIS placement, in ascending id order (deterministic).
  const newBonds = [...world.bonds.values()]
    .filter((b) => (b.id as number) >= firstNewBondId)
    .sort((a, b) => (a.id as number) - (b.id as number));

  const newNames: string[] = [];
  const newKeys: ComboKey[] = [];
  for (const bond of newBonds) {
    // Carried→target order (aId = new prim, bId = target) — the SAME order
    // placePrimitive.makeBond + scoring.ts use to classify magic-ness.
    const a = world.primitives.get(bond.aId);
    const b = world.primitives.get(bond.bId);
    if (a === undefined || b === undefined) continue;
    const combo = lookupCombo(a.type, b.type);
    if (!combo.isMagical) continue;
    const key = comboKey(a.type, b.type);
    if (world.discoveredCombos.has(key)) continue; // already found this match
    if (newKeys.includes(key)) continue; // dedupe within this placement
    newKeys.push(key);
    newNames.push(combo.resultName);
  }

  if (newKeys.length === 0) return;
  for (const key of newKeys) world.discoveredCombos.add(key);
  world.comboToastTick = world.tick;
  world.lastDiscoveredComboNames = newNames;
}
