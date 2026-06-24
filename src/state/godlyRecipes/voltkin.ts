/**
 * SPARK — Voltkin recipe (S23 P1 rewrite).
 *
 * Detects: a linear bonded path of exactly 8 primitives visiting
 * Square -> Square -> Square -> Square -> Triangle -> Triangle -> Triangle -> Triangle
 * in that order. Each consecutive pair must be directly bonded. Filler primitives
 * (Dot/Line/Circle/Spiral) between sequence positions are NOT allowed — they break
 * the chain.
 *
 * Replaces the S22 P4 geometric heuristic (aspect-ratio + 200 px adjacency), which
 * playtested as undiscoverable: a player has no way to see what the predicate is
 * reading while building. The typed-chain rule is deterministic and reproducible:
 * place 4 squares in a row, continue with 4 triangles, win-bond fires Voltkin.
 *
 * Triggerer = player whose color dominates the chain's placerColor distribution.
 * Tie-break: first player encountered in iteration order (deterministic via Map).
 *
 * Side-effect: registers VOLTKIN_RECIPE in the godlyRecipes registry on module
 * import. main.ts imports this module to wire it up.
 */

import { SparkType } from '../../constants.ts';
import type { World } from '../world.ts';
import type { Bond } from '../../physics/bonds.ts';
import type { CinematicGodlyRecipe, RecipePredicate } from './types.ts';
import type { PrimitiveId } from '../../types.ts';
import { registerRecipe } from './index.ts';

const EXPECTED_CHAIN: ReadonlyArray<SparkType> = [
  SparkType.Square,
  SparkType.Square,
  SparkType.Square,
  SparkType.Square,
  SparkType.Triangle,
  SparkType.Triangle,
  SparkType.Triangle,
  SparkType.Triangle,
];

function otherEndpoint(bond: Bond, id: PrimitiveId): PrimitiveId {
  return bond.aId === id ? bond.bId : bond.aId;
}

/**
 * DFS from `startId` looking for a non-revisiting path through the bond graph
 * whose primitive types match EXPECTED_CHAIN in order. Returns the 8-prim path
 * or null. Exported for vitest path-shape regression coverage.
 */
export function findVoltkinChain(world: World): ReadonlyArray<PrimitiveId> | null {
  const walk = (
    currentId: PrimitiveId,
    nextDepth: number,
    visited: Set<PrimitiveId>,
    path: PrimitiveId[],
  ): PrimitiveId[] | null => {
    if (nextDepth === EXPECTED_CHAIN.length) return [...path];
    const current = world.primitives.get(currentId);
    if (current === undefined) return null;
    const expected = EXPECTED_CHAIN[nextDepth];
    for (const bondId of current.bonds) {
      const bond = world.bonds.get(bondId);
      if (bond === undefined) continue;
      const otherId = otherEndpoint(bond, currentId);
      if (visited.has(otherId)) continue;
      const other = world.primitives.get(otherId);
      if (other === undefined) continue;
      if (other.type !== expected) continue;
      visited.add(otherId);
      path.push(otherId);
      const result = walk(otherId, nextDepth + 1, visited, path);
      if (result !== null) return result;
      visited.delete(otherId);
      path.pop();
    }
    return null;
  };

  for (const prim of world.primitives.values()) {
    if (prim.type !== EXPECTED_CHAIN[0]) continue;
    const visited = new Set<PrimitiveId>([prim.id]);
    const path: PrimitiveId[] = [prim.id];
    const result = walk(prim.id, 1, visited, path);
    if (result !== null) return result;
  }
  return null;
}

/**
 * S23 P2 — diagnostic helper for the debug overlay. Returns the longest
 * matching prefix of EXPECTED_CHAIN reachable in the bond graph (0–8).
 * Pure read-only; same DFS shape as findVoltkinChain but tracks max depth
 * instead of short-circuiting on first full match.
 */
export function findLongestVoltkinPartial(world: World): number {
  const walk = (
    currentId: PrimitiveId,
    nextDepth: number,
    visited: Set<PrimitiveId>,
  ): number => {
    let deepest = nextDepth;
    if (nextDepth === EXPECTED_CHAIN.length) return nextDepth;
    const current = world.primitives.get(currentId);
    if (current === undefined) return deepest;
    const expected = EXPECTED_CHAIN[nextDepth];
    for (const bondId of current.bonds) {
      const bond = world.bonds.get(bondId);
      if (bond === undefined) continue;
      const otherId = otherEndpoint(bond, currentId);
      if (visited.has(otherId)) continue;
      const other = world.primitives.get(otherId);
      if (other === undefined) continue;
      if (other.type !== expected) continue;
      visited.add(otherId);
      const sub = walk(otherId, nextDepth + 1, visited);
      if (sub > deepest) deepest = sub;
      visited.delete(otherId);
    }
    return deepest;
  };

  let maxDepth = 0;
  for (const prim of world.primitives.values()) {
    if (prim.type !== EXPECTED_CHAIN[0]) continue;
    const visited = new Set<PrimitiveId>([prim.id]);
    const depth = walk(prim.id, 1, visited);
    if (depth > maxDepth) maxDepth = depth;
    if (maxDepth === EXPECTED_CHAIN.length) break;
  }
  return maxDepth;
}

function isVoltkinDebug(): boolean {
  try {
    return typeof window !== 'undefined'
      && window.location !== undefined
      && window.location.search.includes('debug=1');
  } catch { return false; }
}

export const voltkinPredicate: RecipePredicate = (world) => {
  const chain = findVoltkinChain(world);
  if (chain === null) {
    if (isVoltkinDebug()) console.log('[voltkin] predicate: findVoltkinChain returned null');
    return null;
  }

  // S48 P4 (Sym G fix) — strict chain isolation enforcement.
  //
  // User-reported bug: 5 squares all bonded together as one structure +
  // 4 triangles bonded to one of the squares → Voltkin fired. The DFS
  // in findVoltkinChain finds a 4-Sq + 4-Tr path within that graph but
  // doesn't verify the chain primitives are ISOLATED from off-chain
  // primitives. The spec ("strict 4 squares followed by 4 triangles —
  // if you accidentally connect anything else to the structure it
  // shouldn't go off") demands that no chain primitive bond to any
  // off-chain primitive.
  //
  // Check: walk every bond on every chain prim; reject if any bond's
  // other endpoint is not in the chain set. Also enforces linear-path
  // geometry: each chain prim's bonds.size must equal its in-chain-
  // expected degree (endpoint=1 for chain[0] and chain[7]; middle=2
  // for chain[1..6]) — rejects triangulated / loop-closed chains where
  // chain prims have extra bonds AMONG themselves.
  const chainSet = new Set(chain);
  for (let i = 0; i < chain.length; i++) {
    const id = chain[i];
    const p = world.primitives.get(id);
    if (p === undefined) {
      if (isVoltkinDebug()) console.log(`[voltkin] predicate: chain prim ${id} missing`);
      return null;
    }
    const expectedDegree = (i === 0 || i === chain.length - 1) ? 1 : 2;
    if (p.bonds.size !== expectedDegree) {
      if (isVoltkinDebug()) {
        console.log(
          `[voltkin] predicate: chain[${i}]=${id} degree ${p.bonds.size} != expected ${expectedDegree} `
          + `(isolation/linearity check failed)`,
        );
      }
      return null;
    }
    // Defense-in-depth: even when degree matches, verify each bond connects
    // to an in-chain neighbor. Guards against the bizarre case where degree
    // happens to equal expected but bonds point to off-chain prims via
    // some race (e.g., chain prim has 1 in-chain bond + 1 off-chain bond
    // while another in-chain neighbor is missing a back-bond).
    for (const bondId of p.bonds) {
      const bond = world.bonds.get(bondId);
      if (bond === undefined) continue;
      const otherEnd = bond.aId === id ? bond.bId : bond.aId;
      if (!chainSet.has(otherEnd)) {
        if (isVoltkinDebug()) {
          console.log(
            `[voltkin] predicate: chain[${i}]=${id} has off-chain bond to ${otherEnd}`,
          );
        }
        return null;
      }
    }
  }

  const colorCounts = new Map<number, number>();
  const chainColors: string[] = [];
  let sumX = 0;
  let sumY = 0;
  for (const id of chain) {
    const p = world.primitives.get(id);
    if (p === undefined) continue;
    colorCounts.set(p.placerColor, (colorCounts.get(p.placerColor) ?? 0) + 1);
    chainColors.push(`0x${p.placerColor.toString(16).padStart(6, '0')}`);
    sumX += p.pos.x;
    sumY += p.pos.y;
  }
  let topColor = 0;
  let topCount = 0;
  for (const [c, n] of colorCounts) {
    if (n > topCount) {
      topColor = c;
      topCount = n;
    }
  }
  // S23 P3 — fall back to ANY player (solo + 1v1 host both have triggerer
  // available). Previous logic required strict `p.color === topColor` match
  // which silently dropped matches when player.color and prim.placerColor
  // diverged (e.g., color rotation, lobby color reassignment, or any other
  // path where the player object's color mutates after placement). The chain
  // existed in the bond graph; that's the user-visible signal. Triggerer
  // derivation should not gate the cinematic on a fragile color invariant.
  let triggerer = Array.from(world.players.values()).find(
    (p) => p.color === topColor,
  );
  if (triggerer === undefined) {
    // S23 P3 fallback — use the first player in the world. In solo this is
    // unambiguously the local player. In 1v1, host-side matcher picks the
    // first player iterated, which is deterministic per Map insertion order.
    triggerer = Array.from(world.players.values())[0];
  }
  if (isVoltkinDebug()) {
    const playerLog = Array.from(world.players.values()).map(
      (p) => `P${p.id}=0x${p.color.toString(16).padStart(6, '0')}`,
    ).join(',');
    console.log(
      `[voltkin] predicate: chain=${chain.length} prims, placerColors=[${chainColors.join(',')}], `
      + `topColor=0x${topColor.toString(16).padStart(6, '0')}, players=[${playerLog}], `
      + `triggerer=${triggerer === undefined ? 'NULL' : `P${triggerer.id}`}`,
    );
  }
  if (triggerer === undefined) return null;

  return {
    triggererPlayerId: triggerer.id,
    targetComponentPrimitiveIds: chain,
    targetPos: { x: sumX / chain.length, y: sumY / chain.length },
  };
};

export const VOLTKIN_RECIPE: CinematicGodlyRecipe = {
  // S100 P1 (TD Phase 1b, Layer 5) — GodlyRecipe is now a discriminated union;
  // Voltkin is the cinematic-bearing variant. Every other field below is
  // textually UNCHANGED from pre-S100 — only this discriminant is added.
  kind: 'cinematic',
  id: 'voltkin',
  predicate: voltkinPredicate,
  cinematicAsset: '/godly/voltkin/cinematic/voltkin-intro.mp4',
  voiceAsset: '/godly/voltkin/audio/voltkin-voice.ogg',
  characterSprite: '/godly/voltkin/sprites/voltkin-zap.png',
  cinematicMs: 4000,
  // S30 P0b — REDUCED from 8000 to 500. Root cause: Voltkin creature spawns
  // at `world.tick + cinematicMsToTicks(cinematicMs) = world.tick + 240`
  // (4 sec into cinematic) and has a fixed 480-tick (8 sec) lifetime. Pre-S30
  // the overlay covered the screen for cinematicMs(4000)+sustainedEffectMs(8000)
  // = 12 SECONDS, which is EXACTLY the moment Voltkin despawns — the creature
  // lived its entire life UNDER the opaque-black overlay. User saw the static
  // character sprite (crossfadeCharacterSprite mount at t=cinematicMs) but
  // never saw the actual creature move, attack, or fire its ARC_FLASH
  // lightning. With sustainedEffectMs=500, overlay completes at t=4500ms,
  // revealing the play area + creature for ~7 sec of visible gameplay before
  // the creature despawns at t=12000ms. The cutsceneOverlay's character
  // sprite crossfade is ALSO removed in S30 P0b (cutsceneOverlay.ts) so the
  // ONLY visual handoff is the creature itself appearing at targetPos.
  sustainedEffectMs: 500,
  voiceOffsetMs: 3500,
  // S83 P4 — DISABLED. The mp4's baked-in "transparency checkerboard" is now
  // composited onto black OFFLINE (scripts/matte-voltkin-intro.py: temporal-
  // median plate + per-frame difference key), so the video blends into the
  // overlay's black bg with no runtime shader. The S22 luma key could never
  // fully fix it at runtime: gray checker cells sat BELOW the .88 threshold
  // (the user-visible squares) while the belly highlight #FFEB6B (luma .887)
  // sat ON it, punching holes in the character. enabled=false takes the
  // plain-DOM <video> path in cutsceneOverlay (the pre-S22 path). Threshold
  // retained only for the type shape; unused while disabled.
  lumaKey: { enabled: false, threshold: 0.88 },
};

registerRecipe(VOLTKIN_RECIPE);
