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

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { POOP_FOUL_TINT, POOP_FOUL_TINT_STRENGTH } from '../constants.ts';
import type { Controls } from '../input/controls.ts';
import { isCruiserDebuffed } from '../state/gameMode.ts';
import type { World } from '../state/world.ts';
import { isBenched } from '../state/hunters/hunter.ts';
import { lerpColor } from './effects/silhouettes/shared.ts';
import type { PlayerId, Vec2 } from '../types.ts';

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

// S81 P4 — REMOTE-avatar display smoothing. player.avatarPos only updates at the net cadence
// (~10Hz UPDATE_AVATAR_POS / NetSnapshot), so rendering it raw makes enemy cruisers step in
// ~100ms jumps while the local cursor-driven avatar glides ("enemy sparks look pixelated" —
// user round-3). The renderer keeps a per-player DISPLAY position that exponentially chases
// the authoritative target each frame: k = 1 − e^(−dt/τ). τ=60ms converges ~81% per 100ms
// network step — smooth without feeling laggy. RENDER-ONLY (sim/snapshot state untouched).
// SNAP_DIST guards teleports (respawn, bench-return, host reseat): beyond it, jump instantly
// rather than streaking across the board. Module-local (pure UI feel, not gameplay-tunable).
const AVATAR_SMOOTH_TAU_MS = 60;
const AVATAR_SMOOTH_SNAP_DIST = 300;

// S82 P3 — CVD seat nameplate (EYES backlog #3, S62 Council carry-forward: "color alone
// is not a unique id beyond 3 players"). A tiny "P{n}" tag under each avatar gives
// colour-independent identity at the action point. White WITH a dark stroke (Council
// S82 Grok R1#8 — contrast on any background), small + translucent so it reads as a
// tag, not a label. Networked matches only (players.size > 1) — solo needs no identity.
const NAMEPLATE_OFFSET_Y = 22;
const NAMEPLATE_ALPHA = 0.85;
/** S82 P3 — pure: seat → nameplate text. Exported for unit tests. */
export function avatarNameplateText(playerId: number): string {
  return `P${playerId + 1}`;
}

export class AvatarRenderer {
  private readonly container: Container;
  private readonly graphicsByPlayer: Map<PlayerId, Graphics> = new Map();
  // S81 P4 — per-player smoothed display pos for REMOTE avatars (local renders at cursor).
  private readonly displayPosByPlayer: Map<PlayerId, Vec2> = new Map();
  // S82 P3 — per-player CVD seat nameplate ("P{n}" under the avatar; networked only).
  private readonly nameplateByPlayer: Map<PlayerId, Text> = new Map();
  private lastSyncMs: number | null = null;

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
    const nowMs = performance.now();
    const tSec = nowMs / 1000;
    // S81 P4 — frame delta for the dt-aware smoothing (clamped: a tab-background stall must
    // not become one giant convergence step that defeats the snap guard's intent).
    const dtMs = this.lastSyncMs === null ? 0 : Math.min(nowMs - this.lastSyncMs, 100);
    this.lastSyncMs = nowMs;
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

      // S82 P3 — CVD seat nameplate (created lazily; reused across frames).
      let plate = this.nameplateByPlayer.get(player.id);
      if (plate === undefined) {
        plate = new Text({
          text: avatarNameplateText(player.id as number),
          style: new TextStyle({
            fontFamily: 'monospace',
            fontSize: 11,
            fill: 0xffffff,
            stroke: { color: 0x000000, width: 3 },
          }),
        });
        plate.anchor.set(0.5, 0);
        plate.alpha = NAMEPLATE_ALPHA;
        this.container.addChild(plate);
        this.nameplateByPlayer.set(player.id, plate);
      }

      // S72 P2 — a benched player (eaten by the hunter) has NO avatar for the bench
      // duration. g.clear() above already wiped last frame's draw; skip re-drawing.
      // Tick-gated (self-heals on un-bench). Runs on host + client (benchedUntilTick
      // is in the snapshot) so both peers see the victim vanish.
      if (isBenched(player.benchedUntilTick, world.tick)) {
        plate.visible = false; // S82 P3 — no nameplate on a hidden avatar
        continue;
      }

      const isLocal = player.id === localPlayerId;
      // S82 P1 — cruiser-poopy-slow: while the debuff (or its residual chase) is live, the
      // LOCAL player's cruiser is no longer cursor-bound — the SIM's avatarPos (capped chase)
      // is the truth, so the local render joins the remote smoothTowards path. The tint
      // tracks the debuff TIMER; the path switch tracks debuff-or-target (residual gap).
      const debuffed = isCruiserDebuffed(player, world.tick);
      const cruiserSlowed = debuffed || player.poopedCursorTarget !== undefined;
      // S81 P4 — local: lag-free cursor. Remote: smoothed display pos chasing the ~10Hz
      // authoritative avatarPos (raw rendering stepped visibly — "pixelated" enemy cruisers).
      let x: number;
      let y: number;
      if (isLocal && !cruiserSlowed) {
        x = controls.cursor.x;
        y = controls.cursor.y;
        this.displayPosByPlayer.delete(player.id); // hygiene if the local seat ever changes
      } else {
        let disp = this.displayPosByPlayer.get(player.id);
        if (disp === undefined) {
          // First sight: materialize AT the target (no fly-in streak from (0,0)).
          disp = { x: player.avatarPos.x, y: player.avatarPos.y };
          this.displayPosByPlayer.set(player.id, disp);
        } else {
          const next = smoothTowards(
            disp,
            player.avatarPos,
            dtMs,
            AVATAR_SMOOTH_TAU_MS,
            AVATAR_SMOOTH_SNAP_DIST,
          );
          disp.x = next.x;
          disp.y = next.y;
        }
        x = disp.x;
        y = disp.y;
      }

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

      // S82 P1 — debuffed cruisers tint toward the foul colour (same visual language as
      // fouled structures + poopy sparks; clients see it too — poopedUntilTick rides the
      // snapshot). Tick-gated: the tint self-heals at expiry with no clear pass.
      const fill = debuffed
        ? lerpColor(player.color, POOP_FOUL_TINT, POOP_FOUL_TINT_STRENGTH)
        : player.color;

      // Outer glow halo.
      g.circle(x, y, AVATAR_OUTER_RADIUS)
        .fill({ color: fill, alpha: outer });
      // Mid ring — gives the spark some visual weight without bloom.
      // Pulses with outer + 0.15 offset so brightness wave is coherent.
      g.circle(x, y, (AVATAR_INNER_RADIUS + AVATAR_OUTER_RADIUS) / 2)
        .fill({ color: fill, alpha: Math.min(1, outer + 0.15) });
      // Inner core.
      g.circle(x, y, AVATAR_INNER_RADIUS)
        .fill({ color: fill, alpha: inner });

      // S82 P3 — position the CVD seat nameplate under the avatar (networked only;
      // solo has a single player and needs no identity tag).
      if (world.players.size > 1) {
        plate.visible = true;
        plate.position.set(x, y + NAMEPLATE_OFFSET_Y);
      } else {
        plate.visible = false;
      }
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
          this.displayPosByPlayer.delete(pid); // S81 P4 — drop the smoothing state with it
          const plate = this.nameplateByPlayer.get(pid); // S82 P3 — and the nameplate
          if (plate !== undefined) {
            plate.destroy();
            this.nameplateByPlayer.delete(pid);
          }
        }
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.graphicsByPlayer.clear();
    this.displayPosByPlayer.clear();
    this.nameplateByPlayer.clear();
  }
}

/**
 * S81 P4 — pure exponential chase toward a target, extracted for unit testability.
 * k = 1 − e^(−dtMs/tauMs): frame-rate independent (two 8ms steps ≈ one 16ms step), k∈[0,1).
 * Distances beyond snapDist jump instantly (teleport guard: respawn/bench-return must not
 * streak a ghost trail across the board). dtMs ≤ 0 returns current unchanged.
 */
export function smoothTowards(
  current: Vec2,
  target: Vec2,
  dtMs: number,
  tauMs: number,
  snapDist: number,
): Vec2 {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  if (dx * dx + dy * dy > snapDist * snapDist) {
    return { x: target.x, y: target.y };
  }
  if (dtMs <= 0) return { x: current.x, y: current.y };
  const k = 1 - Math.exp(-dtMs / tauMs);
  return { x: current.x + dx * k, y: current.y + dy * k };
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
