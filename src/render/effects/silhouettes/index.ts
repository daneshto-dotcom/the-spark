/**
 * SPARK — silhouettes barrel (S20 P3 Council R1 ADOPT Grok #11 + Gemini #8).
 *
 * Aggregates the 12 magic silhouette `draw<Shape>` functions from the
 * three archetype files so bondVisualRenderer.ts can have a single
 * import + a flat switch dispatch.
 */

export { drawBracket, drawCable, drawCapsule, drawDiamond, drawFilament, drawLattice, drawWheel } from './axisAligned.ts';
export { drawOrbital, drawStar, drawWarped } from './midpointOrnaments.ts';
export { drawVortex, drawWhip } from './parametricPaths.ts';
