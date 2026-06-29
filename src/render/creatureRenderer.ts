/**
 * SPARK — Voltkin creature renderer.
 *
 * S106 P5 — REWRITTEN from a bitmap Pixi.Sprite (whose texture was swapped each tick from a 6-PNG set
 * / atlas — the owner's "looping gif with a visible square around it") to a fully PROCEDURAL Pixi.
 * Graphics electric-being rig, the chewer/HELGA precedent ("a puppet rig IS the real character"). No
 * texture, no rectangle, no matte — Voltkin is drawn as vector strokes/fills (`drawVoltkin`), posed
 * every frame by the pure `voltkinPose(state, ticksInState, worldTick, idOffset)` (voltkinPose.ts).
 *
 * Render contract preserved exactly: ONE shared Graphics, cleared + redrawn each frame from
 * `world.creatures` filtered to `type === 'voltkin'`; parented to aboveFogLayer (a Voltkin attacks any
 * player's bonds — cross-player reach — so it renders THROUGH the fog to all); reads world, NEVER
 * mutates. Pose is a pure fn of WIRED state+ticksInState (host + 1v1 client animate identically; only
 * the cosmetic per-frame crackle jitter uses wall-clock — invisible as desync, same license the chewer
 * wobble holds). The arcFlash lightning still emits from the sim on CREATURE_ATTACK at FIRE_TICK
 * (unchanged), so replay byte-equivalence is untouched.
 *
 * The S103 #8 lightning-cloud death-watcher (a Voltkin KILLED by laser/slap/raid bursts a procedural
 * electric cloud + zap-burst SFX) is carried over VERBATIM. The pure transform helpers
 * (computeCreatureScale/Tint/Alpha/Rotation, computeFacing, computeSpriteDelta, lerpHex) are retained
 * + exported unchanged (their unit tests still pin the curves; the rig reuses the alpha + facing).
 */

import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { World } from '../state/world.ts';
import type { Vec2 } from '../types.ts';
import { playZapBurstSFX } from './audioManager.ts';
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
import { voltkinPose, type VoltkinPose } from './voltkinPose.ts';
// S113 Batch C — the lightning-DRONE is "the procedural Voltkin design, ~50% smaller" (owner spec),
// so it reuses this same rig at LIGHTNING_DRONE_SPRITE_SCALE. Playtest DIAL.
import { LIGHTNING_DRONE_SPRITE_SCALE } from '../constants.ts';

const TAU = Math.PI * 2;

// ===== procedural transform constants (used by the retained pure helpers) =====

/** SPAWNING scale-pulse amplitude. 0.15 = peak at 1.15× base scale at t=30. */
const SPAWNING_SCALE_AMPLITUDE = 0.15;
/** SEEKING idle-bob amplitude. 0.025 = ±2.5% scale wobble while alive but idle. */
const SEEKING_BOB_AMPLITUDE = 0.025;
/** SEEKING idle-bob period in ticks. 30 @ 60Hz = 2 Hz (gentle "alive" cadence). */
const SEEKING_BOB_PERIOD_TICKS = 30;
/** ATTACKING fire-tick scale punch. Spike at the moment of zap, sells the impact. */
const ATTACKING_FIRE_SCALE = 1.20;
/** DESPAWNING final scale. Shrinks to 0.8× while alpha-fading. */
const DESPAWNING_SHRINK_TARGET = 0.8;
/** ATTACKING wind-up tint at t=0 (neutral white). */
const WINDUP_TINT_NEUTRAL = 0xFFFFFF;
/** ATTACKING wind-up tint at fire (warm charged yellow). */
const WINDUP_TINT_CHARGED = 0xFFEE66;
/** SEEKING max lean magnitude in radians. 0.262 rad ≈ 15°. */
const SEEKING_LEAN_MAX_RAD = 0.262;
/** ATTACKING peak lean magnitude in radians. 0.436 rad ≈ 25°. */
const ATTACKING_LEAN_PEAK_RAD = 0.436;
/** Min |velocity.x| (px/tick) to flip facing; below it, hold prior facing (anti-jitter). */
const FACING_VELOCITY_THRESHOLD = 1.5;

// ===== S106 P5 — procedural electric-being palette + geometry =====
const V_CORE = 0xbfeaff; // bright electric cyan-white core fill
const V_GLOW = 0x6fa8ff; // soft blue glow halo
const V_OUTLINE = 0x16233f; // deep graphite-navy outline (CtCD dark outline)
const V_EYE = 0x0a1428; // near-black eye glint
const V_HOT = 0xffffff; // white-hot highlight at full charge
const BODY_H = 30; // body half-height at scale 1
const BODY_W = 14; // body half-width at the waist

// ===== S110 P5 (Batch D) — matted high-quality art swap (owner: "the voltkin art") =====
// The procedural cyan-spindle rig (drawVoltkin, S106) is REPLACED in-world by the on-model imagen
// gremlin, cleanly matted to TRANSPARENT (no square box — the owner's burned complaint; see
// scripts/matte-art-keepers.py). Lazy-loaded from public/ (a separate static file → NEVER bundled
// into the entry chunk) with a GRACEFUL FALLBACK to the procedural rig until the texture resolves.
// Determinism-free: the texture choice + transforms read ONLY synced state (state/ticksInState/
// killCount via the pure helpers), exactly as the procedural path did.
const VOLTKIN_IDLE_URL = '/godly/voltkin/anim/voltkin-idle.png';
const VOLTKIN_ZAP_URL = '/godly/voltkin/anim/voltkin-zap.png';
// Base on-screen scale so the ~512px matted art renders at roughly the procedural rig's size.
const VOLTKIN_SPRITE_BASE_SCALE = 0.17;

// ── S103 #8 — lightning-cloud (a Voltkin discombobulated by a kill) ──
const LIGHTNING_CLOUD_SEC = 0.6; // burst lifetime (expand + fade), render-only wall-clock
const LIGHTNING_CLOUD_R = 22; // base glow radius (Voltkin reads bigger than a chewer goo-splat)
const LIGHTNING_BOLTS = 7; // jagged bolts radiating from the burst
const LIGHTNING_CORE = 0xbfeaff; // bright electric cyan-white (the bolts + inner core)
const LIGHTNING_GLOW = 0x6fa8ff; // soft blue glow halo + tip sparks

/** Quadratic ease-in for the wind-up tint (game-feel: tension builds slow-then-fast into the zap). */
export const WINDUP_TINT_EASE = (t: number): number => t * t;

// ===== Pure helpers (extracted for testability) =====

/**
 * Compute the add/remove diff between current entity IDs and current world creature IDs.
 * @internal Exported for unit testability; production consumers orchestrate via the renderer.
 */
export function computeSpriteDelta(
  currentSpriteIds: Iterable<CreatureId>,
  worldCreatureIds: Iterable<CreatureId>,
): { toCreate: CreatureId[]; toRemove: CreatureId[] } {
  const current = new Set<CreatureId>(currentSpriteIds);
  const world = new Set<CreatureId>(worldCreatureIds);
  const toCreate: CreatureId[] = [];
  const toRemove: CreatureId[] = [];
  for (const id of world) {
    if (!current.has(id)) toCreate.push(id);
  }
  for (const id of current) {
    if (!world.has(id)) toRemove.push(id);
  }
  return { toCreate, toRemove };
}

// ===== Renderer class =====

export class CreatureRenderer {
  readonly container: Container;
  /** S106 P5 — ONE shared Graphics for all Voltkins (the chewer/turret pattern; no per-creature sprite). */
  private readonly bodyGfx: Graphics;
  /** Renderer-side last-seen position per creature (velocity estimator — drives the facing flip; wire
   *  prevPos is dead on the 1v1 client mirror). Doubles as the death-watcher's "who was alive" set. */
  private readonly lastSeenPos: Map<CreatureId, Vec2> = new Map();
  /** Per-creature horizontal facing (+1 right / -1 left). Anti-jitter hold below the velocity floor. */
  private readonly facings: Map<CreatureId, 1 | -1> = new Map();
  /**
   * S103 #8 — last-seen FSM state per voltkin id. The death-watcher reads it to tell a KILL (vanished
   * from a LIVE state — laser/slap/raid hard-deleted it via `damageCreature`) from a natural lifetime
   * despawn (which passes through DESPAWNING for ~60 ticks = many snapshots). KILL → lightning-cloud.
   */
  private readonly lastSeenState: Map<CreatureId, CreatureState> = new Map();
  /** S103 #8 — active lightning-cloud bursts (a Voltkin that was KILLED). Render-only, wall-clock
   *  culled; outlives the rig that spawned it, mirroring the chewer goo-splat pattern. */
  private readonly lightningClouds: Array<{ x: number; y: number; bornSec: number; seed: number }> = [];
  /** S103 #8 — dedicated Graphics for the procedural lightning-clouds (drawn after the bodies). */
  private readonly cloudGfx: Graphics;
  // S110 P5 — matted-art sprite layer + per-creature sprites. Null textures = not yet loaded (or
  // load failed) → the renderer falls back to the procedural drawVoltkin rig (graceful degradation).
  private readonly spriteLayer: Container;
  private readonly sprites: Map<CreatureId, Sprite> = new Map();
  private idleTex: Texture | null = null;
  private zapTex: Texture | null = null;
  private texLoadStarted = false;

  // S77 P2 — `parent` defaults to app.stage but main.ts passes aboveFogLayer so creatures
  // (a Voltkin attacks any player's bonds — cross-player reach) render THROUGH the fog to all.
  constructor(app: Application, parent: Container = app.stage) {
    this.container = new Container();
    parent.addChild(this.container);
    this.bodyGfx = new Graphics();
    this.container.addChild(this.bodyGfx);
    // S110 P5 — sprite layer renders above the (procedural-fallback) bodyGfx, below the death clouds.
    this.spriteLayer = new Container();
    this.container.addChild(this.spriteLayer);
    // S103 #8 — cloud overlay sits in the SAME parent so a Voltkin popping in enemy territory is
    // visible to everyone, like the chewer goo.
    this.cloudGfx = new Graphics();
    parent.addChild(this.cloudGfx);
  }

  /**
   * S110 P5 — kick off the one-time lazy load of the matted Voltkin textures (idle + zap). Until both
   * resolve, sync() falls back to the procedural rig; on failure they stay null (procedural forever).
   * Public/ assets load by URL → off the JS entry chunk (no bundle-cap impact). SSR/Node-safe: Assets
   * is only touched in a browser (the renderer is constructed only in the browser app).
   */
  private ensureTextures(): void {
    if (this.texLoadStarted) return;
    this.texLoadStarted = true;
    void Promise.all([Assets.load(VOLTKIN_IDLE_URL), Assets.load(VOLTKIN_ZAP_URL)])
      .then(([idle, zap]) => {
        this.idleTex = idle as Texture;
        this.zapTex = zap as Texture;
      })
      .catch(() => {
        // Leave textures null → the procedural drawVoltkin fallback keeps the creature visible.
        this.idleTex = null;
        this.zapTex = null;
      });
  }

  /**
   * S110 P5 — position/scale/face/tint a Voltkin's matted sprite from SYNCED state (pure transform
   * helpers — determinism-free, same inputs the procedural rig read). Idle texture except during the
   * ATTACKING zap. Returns the (possibly newly created) sprite.
   */
  private syncVoltkinSprite(creature: Creature, facing: 1 | -1): void {
    let sp = this.sprites.get(creature.id);
    if (sp === undefined) {
      sp = new Sprite();
      sp.anchor.set(0.5, 0.56); // feet a touch below centre so the scale-pulse grows upward
      this.spriteLayer.addChild(sp);
      this.sprites.set(creature.id, sp);
    }
    const zapping = creature.state === 'ATTACKING' && creature.ticksInState >= VOLTKIN_ATTACK_FIRE_TICK;
    const tex = zapping ? this.zapTex : this.idleTex;
    if (tex !== null && sp.texture !== tex) sp.texture = tex;
    const scale = VOLTKIN_SPRITE_BASE_SCALE * computeCreatureScale(creature.state, creature.ticksInState);
    sp.scale.set(facing * scale, scale);
    sp.position.set(creature.pos.x, creature.pos.y);
    sp.alpha = computeCreatureAlpha(creature);
    sp.tint = computeCreatureTint(creature.state, creature.ticksInState);
  }

  /**
   * Clear + redraw every Voltkin from world.creatures (filtered to type==='voltkin'), then run the
   * S103 #8 death-watcher + draw the lightning-clouds. Reads world, never mutates. Idempotent/frame.
   */
  sync(world: World): void {
    if (
      typeof window !== 'undefined'
      && window.location.search.includes('debug=1')
      && world.creatures.size > 0
      && world.tick % 60 === 0
    ) {
      for (const c of world.creatures.values()) {
        if (c.type !== 'voltkin') continue;
        console.log('[creature] state', {
          id: c.id, state: c.state, ticksInState: c.ticksInState, killCount: c.killCount,
          targetBondId: c.targetBondId,
          pos: { x: Math.round(c.pos.x), y: Math.round(c.pos.y) },
          worldTick: world.tick, despawnAtTick: c.despawnAtTick,
        });
      }
    }

    const g = this.bodyGfx;
    g.clear();
    this.ensureTextures(); // S110 P5 — start the one-time matted-texture load (no-op once started)
    const nowSec = performance.now() / 1000;
    const liveIds = new Set<CreatureId>();

    for (const creature of world.creatures.values()) {
      // This renderer owns the VOLTKIN rig + the S113 lightning-DRONE (the same procedural rig, ~50%
      // smaller — owner spec). The persistent 'chewer' is drawn by ChewerRenderer. All drain the SAME
      // world.creatures map, partitioned by type, so none forks a parallel list. A drone that vanishes
      // (it always DETONATES from a live SEEKING state) trips the death-watcher below → a lightning-
      // cloud burst at the blast point, reinforcing the explosion (alongside the sim ARC_FLASH/burst).
      const isVoltkin = creature.type === 'voltkin';
      const isDrone = creature.type === 'lightningDrone';
      if (!isVoltkin && !isDrone) continue;
      liveIds.add(creature.id);
      this.lastSeenState.set(creature.id, creature.state);

      // Renderer-side velocity estimate (wire prevPos is dead on the client mirror — see the chewer
      // renderer doc). A single >200px/frame jump is a snapshot teleport, not motion — ignore it.
      const last = this.lastSeenPos.get(creature.id);
      let estVelX = last === undefined ? 0 : creature.pos.x - last.x;
      const estVelY = last === undefined ? 0 : creature.pos.y - last.y;
      if (estVelX * estVelX + estVelY * estVelY > 200 * 200) estVelX = 0;
      this.lastSeenPos.set(creature.id, { x: creature.pos.x, y: creature.pos.y });

      // Facing (mirrors the body horizontally); held below the velocity floor to avoid jitter.
      const facing = computeFacing(this.facings.get(creature.id) ?? 1, estVelX, FACING_VELOCITY_THRESHOLD);
      this.facings.set(creature.id, facing);

      // S110 P5 — draw the matted high-quality sprite once its texture is ready; until then (or if
      // the load failed) fall back to the procedural electric-being rig so the creature is never blank.
      // A drone ALWAYS uses the procedural rig (the matted imagen art is the godly Voltkin's; the
      // drone is the smaller procedural electric being). A Voltkin uses the matted sprite once loaded.
      if (isVoltkin && this.idleTex !== null && this.zapTex !== null) {
        this.syncVoltkinSprite(creature, facing);
      } else {
        const pose = voltkinPose(creature.state, creature.ticksInState, world.tick, creature.id as number);
        const alpha = computeCreatureAlpha(creature);
        const scaleMul = isDrone ? LIGHTNING_DRONE_SPRITE_SCALE : 1;
        this.drawVoltkin(g, creature.pos.x, creature.pos.y, facing, alpha, pose, nowSec, (creature.id as number) * 1.37, scaleMul);
      }
    }

    // S110 P5 — drop sprites for Voltkins gone this frame (death/despawn) so the layer never leaks.
    if (this.sprites.size > 0) {
      for (const [id, sp] of [...this.sprites]) {
        if (!liveIds.has(id)) {
          sp.destroy();
          this.sprites.delete(id);
        }
      }
    }

    // S103 #8 — DEATH-WATCHER. A Voltkin alive last frame but GONE this frame, last seen in a LIVE
    // state (not DESPAWNING), was KILLED (laser/slap/raid → damageCreature hard-delete) → pop a
    // lightning-cloud + zap-burst at its last position (reliable on host AND the 1v1 client; both render
    // the same synced snapshot). A natural lifetime despawn passes through DESPAWNING (~60 ticks ≈ 10
    // snapshots) so it never mis-fires. Guarded on PLAYING so a match-end creature wipe doesn't discharge.
    if (this.lastSeenPos.size > liveIds.size) {
      const playing = world.gameState === 'PLAYING';
      for (const [id, pos] of [...this.lastSeenPos]) {
        if (liveIds.has(id)) continue;
        const wasState = this.lastSeenState.get(id);
        if (playing && wasState !== undefined && wasState !== 'DESPAWNING') {
          this.lightningClouds.push({ x: pos.x, y: pos.y, bornSec: nowSec, seed: (id as unknown as number) * 1.732 + 0.61 });
          void playZapBurstSFX({ x: pos.x, y: pos.y });
        }
        this.lastSeenPos.delete(id);
        this.facings.delete(id);
        this.lastSeenState.delete(id);
      }
    }

    // S103 #8 — render + cull the active lightning-clouds LAST + unconditionally (they keep crackling
    // for LIGHTNING_CLOUD_SEC after the Voltkin is gone).
    this.drawLightningClouds(nowSec);
  }

  /**
   * S106 P5 — draw ONE Voltkin as an ORIGINAL procedural electric being: a soft cyan glow halo, a
   * radial crackle "mane", a jagged vertical lightning-spindle body (cyan fill + graphite outline),
   * two bolt-arms (raised by pose.armSpread as it charges), two bolt-legs, and a glowing head with eye
   * glints. Intensity (mane length, glow, hot seam, head crown) scales with pose.boltCharge — so it
   * visibly winds up and DISCHARGES at FIRE. `face` mirrors X; `alpha` fades on natural despawn. The
   * crackle jitter uses wall-clock `nowSec` (render-only cosmetic — the pose/timing is tick-deterministic).
   */
  private drawVoltkin(
    g: Graphics, x: number, y: number, face: 1 | -1, alpha: number, pose: VoltkinPose, nowSec: number, idSeed: number,
    scaleMul: number = 1, // S113 Batch C — 0.5 for a lightning-drone ("the Voltkin design, smaller")
  ): void {
    if (alpha <= 0.02) return;
    const fa = (a: number): number => a * alpha;
    const sc = pose.coreScale;
    const charge = pose.boltCharge;
    const cy = y + pose.bodyBobY * scaleMul;
    const bw = BODY_W * sc * scaleMul;
    const bh = BODY_H * sc * scaleMul;
    // crackle jitter: faster + bigger with charge (cosmetic, render-only)
    const jit = (k: number): number => Math.sin(nowSec * (16 + charge * 34) + idSeed + k * 1.7) * (0.5 + charge * 2.4);

    // 1) glow halo — intensity ∝ charge
    g.circle(x, cy, bh * (0.85 + charge * 0.55)).fill({ color: V_GLOW, alpha: fa(0.10 + charge * 0.22) });
    g.circle(x, cy, bh * 0.5).fill({ color: V_CORE, alpha: fa(0.10 + charge * 0.18) });

    // 2) crackle mane — radial jagged bolts, length ∝ charge
    const MANE = 9;
    for (let i = 0; i < MANE; i++) {
      const baseA = (i / MANE) * TAU + idSeed;
      const len = bh * (0.45 + charge * 1.05) * (0.7 + (Math.sin(idSeed + i * 2.3) + 1) * 0.3);
      g.moveTo(x, cy);
      const ax = x + Math.cos(baseA + jit(i) * 0.03) * len * 0.55;
      const ay = cy + Math.sin(baseA + jit(i) * 0.03) * len * 0.55;
      const tx = x + Math.cos(baseA - jit(i + 1) * 0.03) * len;
      const ty = cy + Math.sin(baseA - jit(i + 1) * 0.03) * len;
      g.lineTo(ax, ay).lineTo(tx, ty)
        .stroke({ color: V_CORE, width: fa(1 + charge * 1.4), alpha: fa(0.25 + charge * 0.5) });
    }

    // 3) body core — a jagged vertical lightning-spindle (narrow ends, wide waist), cyan fill + outline.
    const topY = cy - bh;
    const botY = cy + bh;
    const ZIG = 4;
    const pts: number[] = [];
    for (let i = 0; i <= ZIG; i++) { // right edge, top→bottom
      const f = i / ZIG;
      const yy = topY + (botY - topY) * f;
      const w = Math.sin(f * Math.PI) * bw * (i % 2 === 0 ? 1 : 0.62);
      pts.push(x + face * (w + jit(i) * 0.3), yy);
    }
    for (let i = ZIG; i >= 0; i--) { // left edge, bottom→top
      const f = i / ZIG;
      const yy = topY + (botY - topY) * f;
      const w = Math.sin(f * Math.PI) * bw * (i % 2 === 0 ? 1 : 0.62);
      pts.push(x - face * (w + jit(i + 10) * 0.3), yy);
    }
    g.poly(pts).fill({ color: V_CORE, alpha: fa(0.9) }).stroke({ color: V_OUTLINE, width: 2.4 * sc, alpha: fa(0.95) });
    // hot inner seam down the spindle (brightens with charge)
    g.moveTo(x + jit(2) * 0.4, topY + bh * 0.25).lineTo(x + jit(5) * 0.4, botY - bh * 0.25)
      .stroke({ color: V_HOT, width: fa(1 + charge * 2.2), alpha: fa(0.35 + charge * 0.6) });

    // 4) bolt-arms — from the upper torso, hanging at rest, flung out/up as armSpread → 1.
    const shoY = cy - bh * 0.3;
    for (const s of [-1, 1] as const) {
      const ax0 = x + face * s * bw * 0.5;
      const handX = ax0 + face * s * (bw * 0.6 + bh * 0.55 * pose.armSpread);
      const handY = shoY + bh * (0.55 - pose.armSpread * 0.95);
      const midX = (ax0 + handX) / 2 + jit(s) * 0.5;
      const midY = (shoY + handY) / 2 + jit(s + 3) * 0.5;
      g.moveTo(ax0, shoY).lineTo(midX, midY).lineTo(handX, handY)
        .stroke({ color: V_CORE, width: fa(2.6 * sc), alpha: fa(0.9) })
        .stroke({ color: V_OUTLINE, width: fa(1 * sc), alpha: fa(0.45) });
      // crackle spark at the hand (grows with charge)
      g.circle(handX, handY, fa((1.6 + charge * 3.2) * sc)).fill({ color: V_HOT, alpha: fa(0.55 + charge * 0.4) });
    }

    // 5) bolt-legs — two short jagged legs at the base.
    for (const s of [-1, 1] as const) {
      const lx = x + face * s * bw * 0.32;
      const footX = lx + face * s * bw * 0.35 + jit(s + 5) * 0.4;
      const footY = botY + bh * 0.42;
      g.moveTo(lx, botY - 1).lineTo((lx + footX) / 2 + jit(s) * 0.5, (botY + footY) / 2).lineTo(footX, footY)
        .stroke({ color: V_CORE, width: fa(2.2 * sc), alpha: fa(0.85) })
        .stroke({ color: V_OUTLINE, width: fa(0.9 * sc), alpha: fa(0.4) });
    }

    // 6) head — a glowing orb with two eye glints + a crackle crown at high charge.
    const hy = topY - bh * 0.12;
    const hr = bh * 0.26;
    g.circle(x, hy, hr).fill({ color: V_CORE, alpha: fa(0.95) }).stroke({ color: V_OUTLINE, width: 2 * sc, alpha: fa(0.9) });
    g.circle(x - face * hr * 0.4, hy, hr * 0.22).fill({ color: V_EYE, alpha: fa(0.9) });
    g.circle(x + face * hr * 0.4, hy, hr * 0.22).fill({ color: V_EYE, alpha: fa(0.9) });
    if (charge > 0.4) {
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * 0.5;
        g.moveTo(x, hy - hr * 0.7)
          .lineTo(x + Math.cos(a) * hr * 1.5 * charge + jit(i) * 0.4, hy - hr * 0.7 + Math.sin(a) * hr * 1.6 * charge)
          .stroke({ color: V_HOT, width: fa(1 + charge), alpha: fa(charge * 0.9) });
      }
    }
  }

  /**
   * S103 #8 — render + cull the active lightning-clouds (a KILLED Voltkin bursts into a shrinking
   * electric scribble: cyan halo + jagged jittering bolts + tip sparks, fading over LIGHTNING_CLOUD_SEC).
   * Wall-clock fade is render-only cosmetic (the sim already removed the creature); the per-cloud seed
   * keeps two clients' bolt shapes stable-per-cloud (cosmetic divergence only). VERBATIM from S103.
   */
  private drawLightningClouds(nowSec: number): void {
    const g = this.cloudGfx;
    g.clear();
    for (let i = this.lightningClouds.length - 1; i >= 0; i--) {
      const s = this.lightningClouds[i];
      const t = (nowSec - s.bornSec) / LIGHTNING_CLOUD_SEC;
      if (t >= 1 || t < 0) { this.lightningClouds.splice(i, 1); continue; }
      const alpha = 1 - t;
      const reach = LIGHTNING_CLOUD_R * (0.5 + t * 1.4);
      g.circle(s.x, s.y, LIGHTNING_CLOUD_R * (0.9 - t * 0.4)).fill({ color: LIGHTNING_GLOW, alpha: 0.5 * alpha });
      g.circle(s.x, s.y, LIGHTNING_CLOUD_R * (0.45 - t * 0.2)).fill({ color: LIGHTNING_CORE, alpha: 0.7 * alpha });
      for (let b = 0; b < LIGHTNING_BOLTS; b++) {
        const baseA = (b / LIGHTNING_BOLTS) * TAU + s.seed;
        let px = s.x;
        let py = s.y;
        g.moveTo(px, py);
        const segs = 3;
        for (let k = 1; k <= segs; k++) {
          const frac = k / segs;
          const wobble = Math.sin(s.seed * (b + 1.7) + k * 2.3) * 0.5;
          const a = baseA + wobble * (1 - frac);
          const dist = reach * frac;
          px = s.x + Math.cos(a) * dist;
          py = s.y + Math.sin(a) * dist;
          g.lineTo(px, py);
        }
        g.stroke({ color: LIGHTNING_CORE, width: Math.max(0.75, 2.2 * alpha), alpha: 0.9 * alpha });
        g.circle(px, py, Math.max(0.5, 1.8 * alpha)).fill({ color: LIGHTNING_GLOW, alpha: 0.85 * alpha });
      }
    }
  }

  /** Drop all Voltkin geometry + death-watcher/cloud state (title-return), preserving the container. */
  clear(): void {
    this.bodyGfx.clear();
    for (const sp of this.sprites.values()) sp.destroy(); // S110 P5 — drop matted sprites on title-return
    this.sprites.clear();
    this.lastSeenPos.clear();
    this.facings.clear();
    this.lastSeenState.clear();
    this.lightningClouds.length = 0;
    this.cloudGfx.clear();
  }

  destroy(): void {
    this.bodyGfx.destroy();
    this.sprites.clear(); // S110 P5 — container.destroy({children}) frees the spriteLayer + its sprites
    this.lastSeenPos.clear();
    this.facings.clear();
    this.lastSeenState.clear();
    this.lightningClouds.length = 0;
    this.cloudGfx.destroy();
    this.container.destroy({ children: true });
  }
}

// ===== directional facing helper (exported for unit tests) =====

/**
 * Next facing given previous facing, current horizontal velocity, and a noise-floor threshold.
 *   |vx| > threshold AND vx > 0 → +1; AND vx < 0 → -1; else hold prevFacing (no flicker). Pure.
 */
export function computeFacing(prevFacing: 1 | -1, velocityX: number, threshold: number): 1 | -1 {
  if (velocityX > threshold) return 1;
  if (velocityX < -threshold) return -1;
  return prevFacing;
}

// ===== pure transform helpers (exported; retained from the sprite era — tests pin these curves,
// and the rig reuses computeCreatureAlpha for the despawn fade) =====

/** Per-frame alpha for a creature given its FSM state + ticksInState (fades over DESPAWNING). */
export function computeCreatureAlpha(creature: Creature): number {
  if (creature.state !== 'DESPAWNING') return 1.0;
  const fadeStartTick = CREATURE_DESPAWNING_TICKS - CREATURE_FADE_TICKS;
  if (creature.ticksInState < fadeStartTick) return 1.0;
  const fadeProgress = (creature.ticksInState - fadeStartTick) / CREATURE_FADE_TICKS;
  return Math.max(0, Math.min(1, 1.0 - fadeProgress));
}

/** Per-state procedural scale multiplier (pure; takes only state + ticksInState). */
export function computeCreatureScale(state: CreatureState, ticksInState: number): number {
  if (state === 'SPAWNING') {
    return 1.0 + SPAWNING_SCALE_AMPLITUDE * Math.sin(Math.PI * ticksInState / CREATURE_SPAWN_TICKS);
  }
  if (state === 'SEEKING') {
    return 1.0 + SEEKING_BOB_AMPLITUDE * Math.sin((2 * Math.PI * ticksInState) / SEEKING_BOB_PERIOD_TICKS);
  }
  if (state === 'ATTACKING') {
    if (ticksInState < VOLTKIN_ATTACK_FIRE_TICK) return 1.0;
    if (ticksInState <= VOLTKIN_ATTACK_FIRE_TICK + 1) return ATTACKING_FIRE_SCALE;
    const recoveryStart = VOLTKIN_ATTACK_FIRE_TICK + 2;
    const recoverySpan = VOLTKIN_ATTACK_CADENCE_TICKS - 1 - recoveryStart;
    if (recoverySpan <= 0) return 1.0;
    const progress = Math.max(0, Math.min(1, (ticksInState - recoveryStart) / recoverySpan));
    return ATTACKING_FIRE_SCALE - (ATTACKING_FIRE_SCALE - 1.0) * progress;
  }
  if (state === 'DESPAWNING') {
    const fadeStartTick = CREATURE_DESPAWNING_TICKS - CREATURE_FADE_TICKS;
    if (ticksInState < fadeStartTick) return 1.0;
    const progress = Math.max(0, Math.min(1, (ticksInState - fadeStartTick) / CREATURE_FADE_TICKS));
    return 1.0 - (1.0 - DESPAWNING_SHRINK_TARGET) * progress;
  }
  return 1.0;
}

/** Per-state procedural tint (only the ATTACKING wind-up is non-neutral). Pure. */
export function computeCreatureTint(state: CreatureState, ticksInState: number): number {
  if (state === 'ATTACKING' && ticksInState < VOLTKIN_ATTACK_FIRE_TICK) {
    const progress = ticksInState / VOLTKIN_ATTACK_FIRE_TICK;
    const eased = WINDUP_TINT_EASE(progress);
    return lerpHex(WINDUP_TINT_NEUTRAL, WINDUP_TINT_CHARGED, eased);
  }
  return WINDUP_TINT_NEUTRAL;
}

/** Per-state procedural lean toward the target, radians. Pure (state, ticksInState, pos, targetPos). */
export function computeCreatureRotation(
  state: CreatureState, ticksInState: number, creaturePos: Vec2, targetPos: Vec2,
): number {
  if (state === 'SPAWNING' || state === 'DESPAWNING') return 0;
  const dx = targetPos.x - creaturePos.x;
  const dy = targetPos.y - creaturePos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1e-6) return 0;
  const leanFactor = dx / dist;
  if (state === 'SEEKING') return leanFactor * SEEKING_LEAN_MAX_RAD;
  if (state === 'ATTACKING') {
    const seekingLean = leanFactor * SEEKING_LEAN_MAX_RAD;
    const peakLean = leanFactor * ATTACKING_LEAN_PEAK_RAD;
    if (ticksInState < VOLTKIN_ATTACK_FIRE_TICK) {
      const t = ticksInState / VOLTKIN_ATTACK_FIRE_TICK;
      return seekingLean + (peakLean - seekingLean) * t;
    }
    if (ticksInState === VOLTKIN_ATTACK_FIRE_TICK) return peakLean;
    const recoveryStart = VOLTKIN_ATTACK_FIRE_TICK + 1;
    const recoverySpan = VOLTKIN_ATTACK_CADENCE_TICKS - 1 - recoveryStart;
    if (recoverySpan <= 0) return seekingLean;
    const progress = Math.max(0, Math.min(1, (ticksInState - recoveryStart) / recoverySpan));
    return peakLean + (seekingLean - peakLean) * progress;
  }
  return 0;
}

/** 24-bit RGB hex lerp (per-channel linear). Pure; clamps t to [0,1]. */
export function lerpHex(a: number, b: number, t: number): number {
  const tc = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * tc);
  const g = Math.round(ag + (bg - ag) * tc);
  const bl = Math.round(ab + (bb - ab) * tc);
  return (r << 16) | (g << 8) | bl;
}
