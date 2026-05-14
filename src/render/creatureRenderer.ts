/**
 * SPARK — creature sprite renderer (S25 P0 scaffold; S28 P0 polish + transforms).
 *
 * Per S24 Voltkin Phase 2 blueprint § Q3:
 *   - S25-S27 fallback: plain Pixi `Sprite` from existing `voltkin-zap.png`.
 *   - S28 P0 USER-LOCKED scope-Q1 option-1: procedural transforms on the
 *     canonical zap sprite (NOT a new v2 Imagen spritesheet; that ships in
 *     S29+ only if walk-cycle motion proves needed post-playtest).
 *
 * Per blueprint § Q1:
 *   - Z-order: creature container attached AFTER `structureRenderer` so creatures
 *     render ABOVE prims (phase-through reads as overlap).
 *
 * S28 P0 — Council R1 + Battle Ledger:
 *   - Q3 COMPROMISE B (Gemini over Claude default): ATTACKING wind-up tint
 *     uses ease-in `t²` curve from neutral white to warm yellow. Game-feel
 *     argument (charge build-up) wins over linear-simplicity at equal LOC cost.
 *   - Q5 UNANIMOUS A: pure exported helpers `computeCreatureScale/Tint/Alpha`
 *     so the curves are unit-testable without Pixi mocks. Renderer composes
 *     them in `sync()`.
 *
 * PRIME-AUDIT deltas applied:
 *   - Δ1: `WINDUP_TINT_EASE` named arrow constant for single-LOC retune
 *   - Δ2: `VOLTKIN_ATTACK_FIRE_TICK` reused (not hardcoded 30)
 *   - Δ8: explicit `0xFFFFFF` return for non-wind-up branches (no `undefined`
 *     leak; sprite.tint stays neutral on SPAWNING/SEEKING/ATTACKING-fire/
 *     ATTACKING-recovery/DESPAWNING)
 *   - Δ9: per-state scale formulas (SPAWNING `sin(π·t/60)` pulse to 1.15,
 *     SEEKING 2Hz 2.5% bob, ATTACKING fire 1.20 scale punch, DESPAWNING
 *     shrink to 0.8 in last 30 ticks)
 *
 * 1v1 note: S28 P0 NetSnapshot v2 ships host→client creature mirror (save.ts
 * additive-optional `creatures?` field). Client renderer drains the mirrored
 * map identically; FSM-driven transform helpers work without simulation since
 * inputs (state + ticksInState) are present in the serialized shape (Q4 2/3 B
 * trimmed render-only).
 */

import { Application, Assets, Container, Sprite, type Texture } from 'pixi.js';
import type { World } from '../state/world.ts';
import {
  CREATURE_DESPAWNING_TICKS,
  CREATURE_FADE_TICKS,
  CREATURE_SPAWN_TICKS,
  VOLTKIN_ATTACK_CADENCE_TICKS,
  VOLTKIN_ATTACK_FIRE_TICK,
  type Creature,
  type CreatureId,
  type CreatureState,
} from '../state/creatures/creature.ts';

const VOLTKIN_SPRITE_URL = '/godly/voltkin/sprites/voltkin-zap.png';
/** Match cutsceneOverlay's character-sprite scale so the handoff visual is continuous. */
const CREATURE_SPRITE_SCALE = 0.25;

// ===== S28 P0 transform constants (PRIME-AUDIT Δ1/Δ9 named) =====

/** SPAWNING scale-pulse amplitude. 0.15 = peak at 1.15× base scale at t=30. */
const SPAWNING_SCALE_AMPLITUDE = 0.15;

/** SEEKING idle-bob amplitude. 0.025 = ±2.5% scale wobble while alive but idle. */
const SEEKING_BOB_AMPLITUDE = 0.025;

/** SEEKING idle-bob period in ticks. 30 @ 60Hz = 2 Hz (gentle "alive" cadence). */
const SEEKING_BOB_PERIOD_TICKS = 30;

/** ATTACKING fire-tick scale punch (Δ9). Spike at the moment of zap, sells the impact. */
const ATTACKING_FIRE_SCALE = 1.20;

/** DESPAWNING final scale (Δ9). Sprite shrinks to 0.8× while alpha-fading. */
const DESPAWNING_SHRINK_TARGET = 0.8;

/** ATTACKING wind-up tint at t=0 (neutral white = no tint applied by Pixi). */
const WINDUP_TINT_NEUTRAL = 0xFFFFFF;

/** ATTACKING wind-up tint at t=VOLTKIN_ATTACK_FIRE_TICK-1 (warm charged yellow). */
const WINDUP_TINT_CHARGED = 0xFFEE66;

/**
 * S28 P0 — Council Q3 COMPROMISE B ease-in curve (Gemini minority over Claude
 * default A linear; game-feel argument). Quadratic `t²` builds tension slow-
 * then-fast into the zap moment. Single-LOC retune if user playtest hates the
 * curve (PRIME-AUDIT Δ1): replace with `(t) => t` for linear OR
 * `(t) => 1 - (1-t)*(1-t)` for ease-out OR `(t) => t*t*t` for cubic ease-in.
 */
export const WINDUP_TINT_EASE = (t: number): number => t * t;

// ===== Renderer class =====

export class CreatureRenderer {
  readonly container: Container;
  private readonly sprites: Map<CreatureId, Sprite> = new Map();
  private texture: Texture | null = null;
  private textureLoading = false;
  private textureFailed = false;

  constructor(app: Application) {
    this.container = new Container();
    app.stage.addChild(this.container);
  }

  /**
   * Drain `world.creatures` against the internal sprite map: add new, update existing,
   * remove despawned. Idempotent per frame. Applies S28 P0 procedural transforms
   * via pure helpers (computeCreatureAlpha/Scale/Tint) so curves are unit-testable.
   * S30 P0b — ?debug=1 console.log every 60 ticks (~1 sec) for each live creature
   * surfaces FSM state + targetBondId + pos so regression reports have actionable
   * signal not just "creature doesn't move/attack". Gated by URL param so prod
   * users see no logspam.
   */
  sync(world: World): void {
    // S30 P0b — diagnostic logging (?debug=1 gated, once per second per creature)
    if (
      typeof window !== 'undefined'
      && window.location.search.includes('debug=1')
      && world.creatures.size > 0
      && world.tick % 60 === 0
    ) {
      for (const c of world.creatures.values()) {
        console.log('[creature] state', {
          id: c.id,
          state: c.state,
          ticksInState: c.ticksInState,
          targetBondId: c.targetBondId,
          pos: { x: Math.round(c.pos.x), y: Math.round(c.pos.y) },
          targetPos: { x: Math.round(c.targetPos.x), y: Math.round(c.targetPos.y) },
          worldTick: world.tick,
          despawnAtTick: c.despawnAtTick,
        });
      }
    }
    if (this.texture === null && !this.textureLoading && !this.textureFailed) {
      this.textureLoading = true;
      void Assets.load(VOLTKIN_SPRITE_URL).then(
        (tex: Texture) => {
          this.texture = tex;
          this.textureLoading = false;
        },
        (err: unknown) => {
          this.textureLoading = false;
          this.textureFailed = true;
          console.warn('[creatureRenderer] voltkin-zap.png load failed:', err);
        },
      );
    }

    // Add or update sprites for live creatures.
    for (const creature of world.creatures.values()) {
      let sprite = this.sprites.get(creature.id);
      if (sprite === undefined) {
        if (this.texture === null) continue; // texture not loaded yet — render next frame
        sprite = new Sprite(this.texture);
        sprite.anchor.set(0.5);
        this.sprites.set(creature.id, sprite);
        this.container.addChild(sprite);
      }
      sprite.position.set(creature.pos.x, creature.pos.y);
      sprite.alpha = computeCreatureAlpha(creature);
      const dynScale = computeCreatureScale(creature.state, creature.ticksInState);
      sprite.scale.set(CREATURE_SPRITE_SCALE * dynScale);
      sprite.tint = computeCreatureTint(creature.state, creature.ticksInState);
    }

    // Remove sprites whose creatures despawned.
    for (const [id, sprite] of this.sprites) {
      if (!world.creatures.has(id)) {
        this.container.removeChild(sprite);
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
  }

  destroy(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.container.destroy({ children: true });
  }
}

// ===== S28 P0 pure transform helpers (Council Q5 UNANIMOUS A exported) =====

/**
 * Compute per-frame alpha for a creature given its FSM state + ticksInState.
 * Pre-S28 signature preserved (takes full Creature) for back-compat with
 * creatureLifecycle.test.ts (S25 baseline tests). S28 P0 unchanged from S25.
 */
export function computeCreatureAlpha(creature: Creature): number {
  if (creature.state !== 'DESPAWNING') return 1.0;
  const fadeStartTick = CREATURE_DESPAWNING_TICKS - CREATURE_FADE_TICKS;
  if (creature.ticksInState < fadeStartTick) return 1.0;
  const fadeProgress = (creature.ticksInState - fadeStartTick) / CREATURE_FADE_TICKS;
  return Math.max(0, Math.min(1, 1.0 - fadeProgress));
}

/**
 * S28 P0 — per-state procedural scale multiplier (applied on top of base
 * CREATURE_SPRITE_SCALE in the renderer). Returns 1.0 as a no-op default;
 * non-1.0 only during transform windows. Council Q5 UNANIMOUS A pure: takes
 * only (state, ticksInState) — no Pixi/Creature dependency in tests.
 *
 *   - SPAWNING: scale-pulse `1.0 + 0.15 * sin(π·t/CREATURE_SPAWN_TICKS)` →
 *     peaks at 1.15 at t=30, returns to 1.0 at t=60 (clean handoff to SEEKING)
 *   - SEEKING: subtle 2 Hz bob `1.0 + 0.025 * sin(2π·t/30)` — "alive but idle"
 *   - ATTACKING wind-up (t < FIRE_TICK): 1.0 (tint carries the build, see
 *     `computeCreatureTint`)
 *   - ATTACKING fire (t in [FIRE_TICK, FIRE_TICK+1]): 1.20 punch (PRIME-AUDIT
 *     Δ9 — 2 ticks ~33 ms is visible at 60 FPS without being a long zoom)
 *   - ATTACKING recovery (t > FIRE_TICK+1, t < CADENCE_TICKS): linear lerp
 *     1.20 → 1.0 over remaining ticks
 *   - DESPAWNING last CREATURE_FADE_TICKS ticks: shrink 1.0 → 0.8 in lockstep
 *     with the alpha fade (Δ9)
 *   - All other states + boundary cases: 1.0
 */
export function computeCreatureScale(state: CreatureState, ticksInState: number): number {
  if (state === 'SPAWNING') {
    return 1.0 + SPAWNING_SCALE_AMPLITUDE * Math.sin(Math.PI * ticksInState / CREATURE_SPAWN_TICKS);
  }
  if (state === 'SEEKING') {
    return (
      1.0
      + SEEKING_BOB_AMPLITUDE
        * Math.sin((2 * Math.PI * ticksInState) / SEEKING_BOB_PERIOD_TICKS)
    );
  }
  if (state === 'ATTACKING') {
    if (ticksInState < VOLTKIN_ATTACK_FIRE_TICK) return 1.0;
    if (ticksInState <= VOLTKIN_ATTACK_FIRE_TICK + 1) return ATTACKING_FIRE_SCALE;
    // CHECK Triumvirate cross-Council UNANIMOUS Grok-C2 + Gemini-G4 ACCEPTED:
    // denominator is `(CADENCE - 1) - recoveryStart`, not `CADENCE - recoveryStart`.
    // ATTACKING state visible at ticksInState ∈ [0, CADENCE-1] (transition to
    // SEEKING fires at tick === CADENCE); the recovery span covers integer
    // ticks [recoveryStart, CADENCE-1], so the last visible tick should map to
    // progress=1.0 exactly, giving scale=1.0 with no SEEKING-handoff pop.
    const recoveryStart = VOLTKIN_ATTACK_FIRE_TICK + 2;
    const recoverySpan = VOLTKIN_ATTACK_CADENCE_TICKS - 1 - recoveryStart;
    if (recoverySpan <= 0) return 1.0;
    const progress = Math.max(0, Math.min(1, (ticksInState - recoveryStart) / recoverySpan));
    return ATTACKING_FIRE_SCALE - (ATTACKING_FIRE_SCALE - 1.0) * progress;
  }
  if (state === 'DESPAWNING') {
    const fadeStartTick = CREATURE_DESPAWNING_TICKS - CREATURE_FADE_TICKS;
    if (ticksInState < fadeStartTick) return 1.0;
    const progress = Math.max(
      0,
      Math.min(1, (ticksInState - fadeStartTick) / CREATURE_FADE_TICKS),
    );
    return 1.0 - (1.0 - DESPAWNING_SHRINK_TARGET) * progress;
  }
  return 1.0;
}

/**
 * S28 P0 — per-state procedural tint (Pixi `sprite.tint` 24-bit hex). Only
 * the ATTACKING wind-up window (ticks 0..FIRE_TICK-1) is non-neutral —
 * everything else returns 0xFFFFFF (no tint applied). PRIME-AUDIT Δ8:
 * explicit white return prevents undefined leak. Council Q3 COMPROMISE B
 * ease-in `WINDUP_TINT_EASE(t)` curve. Boundary: ticksInState=FIRE_TICK-1
 * = max charge; FIRE_TICK reverts to neutral white (the flash punch combines
 * with the scale spike in `computeCreatureScale`).
 */
export function computeCreatureTint(state: CreatureState, ticksInState: number): number {
  if (state === 'ATTACKING' && ticksInState < VOLTKIN_ATTACK_FIRE_TICK) {
    const progress = ticksInState / VOLTKIN_ATTACK_FIRE_TICK;
    const eased = WINDUP_TINT_EASE(progress);
    return lerpHex(WINDUP_TINT_NEUTRAL, WINDUP_TINT_CHARGED, eased);
  }
  return WINDUP_TINT_NEUTRAL;
}

/**
 * S28 P0 — 24-bit RGB hex lerp helper (per-channel linear interpolation).
 * Exported for unit-test coverage of the tint formula's color math (the
 * boundary cases of t=0 → a, t=1 → b, and t=0.5 → channel-averaged are all
 * verified directly). Clamps `t` to [0, 1] to prevent extrapolation.
 */
export function lerpHex(a: number, b: number, t: number): number {
  const tc = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * tc);
  const g = Math.round(ag + (bg - ag) * tc);
  const bl = Math.round(ab + (bb - ab) * tc);
  return (r << 16) | (g << 8) | bl;
}
