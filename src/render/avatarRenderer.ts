/**
 * SPARK — player avatar renderer.
 * Spec § I LOCKED: "You are a single glowing spark on a black field."
 *
 * The player IS a spark — a small glowing point at the cursor location,
 * tinted in the player's color. This is the visual proof of the
 * "spark = player avatar" half of the overloaded term. (The other half —
 * spark = building block — is now visually distinct: free building blocks
 * are colorless shapes, the player avatar is a colored glow.)
 *
 * Phase 1 = solo, only P1 visible. Phase 2 will iterate over all 6 players
 * but render only those visible through the local player's fog mask.
 *
 * S14 P1: anti-phase outer/inner alpha pulse so the avatar reads as
 * distinctly "alive" relative to a placed Dot primitive in the same
 * player color (post-S13 playtest report: the user could not tell their
 * avatar apart from an isolated pink-tinted Dot primitive). The two have
 * the same color, ~same radius, ~same shape — modulating the avatar's
 * alpha at 1.2 Hz makes the avatar visually "breathe" without changing
 * the spec § I LOCKED "single glowing spark" shape.
 */

import { Application, Container, Graphics } from 'pixi.js';
import type { Controls } from '../input/controls.ts';
import type { World } from '../state/world.ts';
import type { PlayerId } from '../types.ts';

const AVATAR_INNER_RADIUS = 4;
const AVATAR_OUTER_RADIUS = 11;
const AVATAR_INNER_ALPHA = 0.95;
const AVATAR_OUTER_ALPHA = 0.35;

// S14 P1 — pulse parameters.
//
// AVATAR_PULSE_HZ = 1.2 cycles/sec. Sub-heartbeat-rate (heart at 60-100 BPM
// ≈ 1.0-1.7 Hz; 1.2 Hz lands mid-range, perceptually "alive without panicked").
// Well below PEAT's photosensitive-epilepsy 3 Hz threshold, especially at this
// small region size + low alpha contrast.
//
// AVATAR_PULSE_DEPTH = 0.20. Outer halo modulates ±0.20 around AVATAR_OUTER_ALPHA;
// inner core anti-phase at ±0.10 (half depth). Anti-phase = when outer brightens,
// inner dims; net "breath" without geometric size change. Mid ring uses
// `outer + 0.15` so it pulses coherently with outer (the brightness wave moves
// outward-to-inward across the avatar's profile in one cycle).
//
// Tunables for accessibility audits: AVATAR_PULSE_HZ down to 0.6 = breathing
// pace; AVATAR_PULSE_DEPTH down to 0.10 = subtle wobble. Both module-local
// (NOT in constants.ts) because they are pure UI feel, not gameplay-tunable.
const AVATAR_PULSE_HZ = 1.2;
const AVATAR_PULSE_DEPTH = 0.20;

export class AvatarRenderer {
  private readonly container: Container;
  private readonly graphics: Graphics;

  constructor(app: Application, private readonly playerId: PlayerId) {
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
    app.stage.addChild(this.container);
  }

  /**
   * Draw the local player's avatar at cursor position. Always visible —
   * the avatar IS the player. Sits on top of the structure layer but below
   * the HUD, so it never disappears behind a structure the player walks
   * over.
   *
   * S14 P1: pulse driven by performance.now() (NOT world.tick) so the
   * avatar keeps breathing during POSTGAME pause and tab-foreground
   * unpaused windows. world.tick would freeze the pulse in those states.
   */
  sync(world: World, controls: Controls): void {
    const g = this.graphics;
    g.clear();
    const player = world.players.get(this.playerId);
    if (player === undefined) return;
    const { x, y } = controls.cursor;

    const tSec = performance.now() / 1000;
    const { outer, inner } = computeAvatarAlphas(
      tSec,
      AVATAR_OUTER_ALPHA,
      AVATAR_INNER_ALPHA,
      AVATAR_PULSE_HZ,
      AVATAR_PULSE_DEPTH,
    );

    // Outer glow halo.
    g.circle(x, y, AVATAR_OUTER_RADIUS)
      .fill({ color: player.color, alpha: outer });
    // Mid ring — gives the spark some visual weight without bloom.
    // Pulses with outer + 0.15 offset so brightness wave is coherent.
    g.circle(x, y, (AVATAR_INNER_RADIUS + AVATAR_OUTER_RADIUS) / 2)
      .fill({ color: player.color, alpha: Math.min(1, outer + 0.15) });
    // Inner core.
    g.circle(x, y, AVATAR_INNER_RADIUS)
      .fill({ color: player.color, alpha: inner });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/**
 * S14 P1 — pure function for unit testability. Pulse outer alpha ±depth at
 * `hz` cycles/sec; inner anti-phase at half depth. Both alphas clamped to
 * [0, 1] for safety against extreme tuning.
 *
 * Phase = sin(t × 2π × hz). At t=0, phase=0 → returns base alphas exactly.
 * Quarter-period (t = 1/(4hz)) → phase=+1; three-quarter → phase=-1.
 *
 * Anti-phase rationale: when outer is bright (extending halo prominence),
 * inner dims (eye reads the halo); when outer fades, inner brightens (eye
 * reads the core). Net: "breathing brightness" without geometric scale
 * change. A pure radius-modulation pulse would look like a jittering size
 * change at small (4-11 px) scales; alpha-modulation is smoother per-pixel.
 */
export function computeAvatarAlphas(
  tSeconds: number,
  baseOuter: number,
  baseInner: number,
  hz: number,
  depth: number,
): { outer: number; inner: number } {
  const phase = Math.sin(tSeconds * 2 * Math.PI * hz);
  return {
    outer: clamp01(baseOuter + depth * phase),
    inner: clamp01(baseInner - 0.5 * depth * phase),
  };
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
