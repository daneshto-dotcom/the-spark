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
 * S14 P1: anti-phase outer/inner alpha pulse so the avatar reads as
 * distinctly "alive" relative to a placed Dot primitive in the same
 * player color (post-S13 playtest report: the user could not tell their
 * avatar apart from an isolated pink-tinted Dot primitive). The two have
 * the same color, ~same radius, ~same shape — modulating the avatar's
 * alpha at 1.2 Hz makes the avatar visually "breathe" without changing
 * the spec § I LOCKED "single glowing spark" shape.
 *
 * S45 BUG-CRITICAL-3 Sym B — multi-player render. Pre-S45 a single
 * AvatarRenderer was instantiated with `(app, P1)` and only rendered ONE
 * player's avatar using `controls.cursor`. In 1v1 the joiner saw no remote
 * avatar at all ("invisible force" — Battle Ledger row C3, user S44 smoke
 * report). Refactored to maintain one Graphics per player in world.players,
 * with hybrid sourcing per Council R2 C3:
 *   - Local player (id === controls.getPlayerId()): position = controls.cursor
 *     (lag-free, immediate feedback).
 *   - Remote players (other ids): position = player.avatarPos (snapshot-
 *     driven; UPDATE_AVATAR_POS dispatch from carrier on the wire).
 * Battle Ledger C10 ADOPT-LITE: when local player's controls.state.kind
 * === 'AttractDrag', boost the pulse depth briefly as a local "intent sent"
 * visual cue (Sym A perceptual-lag bridge — no new mechanism, just reads
 * the existing FSM state). C11 ADOPT: pop-in prevented by player creation
 * always supplying a real avatarPos (P1 at spawner-left, P2 at spawner-right,
 * never (0,0) — see state/world.ts:292 and state/gameMode.ts:72).
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

// S45 Sym A C10 ADOPT-LITE — when local player is in AttractDrag, double the
// pulse depth so the avatar "throbs" while dragging a spark. This is the
// perceptual-lag bridge Gemini flagged: joiner clicks LMB, intent goes to
// host, ~100ms later snapshot reflects pickup. During that window the player
// needs a local-only cue that input was received. Reading the existing
// AttractDrag FSM state needs no new mechanism (Council Battle Ledger C10).
const AVATAR_ATTRACT_PULSE_BOOST = 2.0;

export class AvatarRenderer {
  private readonly container: Container;
  private readonly graphicsByPlayer: Map<PlayerId, Graphics> = new Map();

  constructor(app: Application) {
    this.container = new Container();
    app.stage.addChild(this.container);
  }

  /**
   * Draw every player's avatar. Local player follows controls.cursor for
   * zero-lag feedback; remote players read world.players[id].avatarPos
   * (which the host populates from received UPDATE_AVATAR_POS intents and
   * from its own pointer-move dispatches). Hybrid sourcing per Council R2 C3.
   *
   * S14 P1 pulse driven by performance.now() (NOT world.tick) so the
   * avatar keeps breathing during POSTGAME pause and tab-foreground
   * unpaused windows. world.tick would freeze the pulse in those states.
   */
  sync(world: World, controls: Controls): void {
    const localPlayerId = controls.getPlayerId();
    const tSec = performance.now() / 1000;
    const present = new Set<PlayerId>();

    for (const player of world.players.values()) {
      present.add(player.id);
      let g = this.graphicsByPlayer.get(player.id);
      if (g === undefined) {
        g = new Graphics();
        this.container.addChild(g);
        this.graphicsByPlayer.set(player.id, g);
      }
      g.clear();

      const isLocal = player.id === localPlayerId;
      const x = isLocal ? controls.cursor.x : player.avatarPos.x;
      const y = isLocal ? controls.cursor.y : player.avatarPos.y;

      // S45 C10 — boost pulse depth while local player is AttractDragging
      // a spark (perceptual-lag bridge for joiner intent feedback).
      const depth = (isLocal && controls.state.kind === 'AttractDrag')
        ? AVATAR_PULSE_DEPTH * AVATAR_ATTRACT_PULSE_BOOST
        : AVATAR_PULSE_DEPTH;

      const { outer, inner } = computeAvatarAlphas(
        tSec,
        AVATAR_OUTER_ALPHA,
        AVATAR_INNER_ALPHA,
        AVATAR_PULSE_HZ,
        depth,
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

    // GC removed players (e.g. RETURN_TO_TITLE drops P2 — see state/gameMode.ts
    // applyReturnToTitle survivor sweep). Without this, lingering Graphics
    // would render a ghost avatar at the last-known position after a 1v1 → solo
    // transition.
    if (this.graphicsByPlayer.size > present.size) {
      for (const [pid, g] of this.graphicsByPlayer) {
        if (!present.has(pid)) {
          g.destroy();
          this.graphicsByPlayer.delete(pid);
        }
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.graphicsByPlayer.clear();
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
