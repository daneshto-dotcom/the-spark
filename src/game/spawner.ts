/**
 * SPARK — spawner: confined 250-px zone, Poisson 1.5/sec, elastic bounce.
 * § 2 LOCKED + § 11 invariant "Spawner confinement" enforcement point.
 *
 * Poisson process: interarrival time ~ Exponential(λ=1.5/sec) — log of a
 * uniform sample. Each spawn picks a uniform point inside the disk and a
 * uniform random initial velocity (20-80 px/s, see constants).
 *
 * Confinement: at the end of each substep, any spark outside the disk is
 * teleported back to the boundary and its velocity reflected about the
 * inward normal, scaled by SPAWNER_BOUNCE_DAMPING. Velocity in Verlet is
 * implicit, so we manipulate prevPos.
 */

import {
  ALL_SPARK_TYPES,
  BOMB_SPAWN_MAX_SPARKS,
  BOMB_SPAWN_MIN_SPARKS,
  PHYSICS_HZ,
  POTATO_SPAWN_MAX_SPARKS,
  POTATO_SPAWN_MIN_SPARKS,
  RAINBOW_SPAWN_MAX_SPARKS,
  RAINBOW_SPAWN_MIN_SPARKS,
  SPAWN_RATE_PER_SECOND,
  SPAWNER_BOUNCE_DAMPING,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  SPARK_INITIAL_VELOCITY_MAX,
  SPARK_INITIAL_VELOCITY_MIN,
  SparkType,
} from '../constants.ts';
import { rngPick, rngRange } from '../state/rng.ts';
import type { Rng } from '../state/rng.ts';
import { asSparkId } from '../types.ts';
import type { SparkId, Vec2 } from '../types.ts';
import type { Spark } from './spark.ts';
import { makeFreeSpark } from './spark.ts';

const PHYSICS_DT = 1 / PHYSICS_HZ;

export interface SpawnerConfig {
  readonly center: { x: number; y: number };
  readonly radius: number;
  readonly ratePerSecond: number;
  readonly types: readonly SparkType[];
}

export const DEFAULT_SPAWNER_CONFIG: SpawnerConfig = {
  center: { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y },
  radius: SPAWNER_RADIUS,
  ratePerSecond: SPAWN_RATE_PER_SECOND,
  types: ALL_SPARK_TYPES,
};

/**
 * S71 P1 — a host-only request to mint a bomb at `pos`. The spawner pushes these
 * into the `bombsOut` array passed to tick(); physicsLoop dispatches SPAWN_BOMB for
 * each (gated on BOMB_MAX_ACTIVE). Mirrors the freeSparks out-array pattern so the
 * spawner stays world-agnostic (the cap lives at the dispatch site).
 */
export interface BombSpawnRequest {
  readonly pos: Vec2;
}

/**
 * S72 P3 — a host-only request to mint a potato at `pos`. Pushed into the `potatoesOut`
 * array passed to tick(); physicsLoop dispatches SPAWN_POTATO for each (gated on
 * POTATO_MAX_ACTIVE). Mirrors BombSpawnRequest — the cap lives at the dispatch site.
 */
export interface PotatoSpawnRequest {
  readonly pos: Vec2;
}

/**
 * S75 P3 — a host-only request to mint a rainbow at `pos`. Pushed into the `rainbowsOut`
 * array passed to tick(); physicsLoop dispatches SPAWN_RAINBOW for each (gated on
 * RAINBOW_MAX_ACTIVE). Mirrors Bomb/PotatoSpawnRequest — the cap lives at the dispatch site.
 */
export interface RainbowSpawnRequest {
  readonly pos: Vec2;
}

export class Spawner {
  private nextId = 0;
  private secondsUntilNextSpawn: number;
  /**
   * S71 P1 — sparks remaining until the next bomb (counts SPARKS SPAWNED, per the
   * user's "every random amount of shapes"). Drawn from `bombRng` — a SEPARATE
   * seeded stream from the spark `rng` — so adding bombs leaves the spark sequence
   * byte-identical (zero existing-test perturbation). Infinity when bombs disabled.
   */
  private sparksUntilBomb: number;
  /**
   * S72 P3 — sparks remaining until the next potato (counts SPARKS SPAWNED). Drawn from
   * `potatoRng` — a THIRD seeded stream separate from spark `rng` AND `bombRng` — so
   * adding potatoes leaves BOTH the spark + bomb sequences byte-identical. Infinity when
   * potatoes are disabled.
   */
  private sparksUntilPotato: number;
  /**
   * S75 P3 — sparks remaining until the next rainbow (counts SPARKS SPAWNED). Drawn from
   * `rainbowRng` — a FOURTH seeded stream separate from spark `rng`, `bombRng` AND `potatoRng`
   * — so adding rainbows leaves ALL THREE prior sequences byte-identical. Infinity when disabled.
   */
  private sparksUntilRainbow: number;

  constructor(
    private readonly cfg: SpawnerConfig,
    private readonly rng: Rng,
    /** Separate seeded stream for bomb cadence + position. null → bombs disabled. */
    private readonly bombRng: Rng | null = null,
    /** Separate seeded stream for potato cadence + position. null → potatoes disabled. */
    private readonly potatoRng: Rng | null = null,
    /** Separate seeded stream for rainbow cadence + position. null → rainbows disabled. */
    private readonly rainbowRng: Rng | null = null,
  ) {
    this.secondsUntilNextSpawn = this.sampleInterarrival();
    this.sparksUntilBomb = this.sampleBombCountdown();
    this.sparksUntilPotato = this.samplePotatoCountdown();
    this.sparksUntilRainbow = this.sampleRainbowCountdown();
  }

  /**
   * Advance the spawner by `dtSec` of wall time and append any new sparks.
   * Returns the count spawned this frame (handy for stats overlay).
   */
  tick(
    dtSec: number,
    tick: number,
    freeSparks: Spark[],
    bombsOut?: BombSpawnRequest[],
    potatoesOut?: PotatoSpawnRequest[],
    rainbowsOut?: RainbowSpawnRequest[],
  ): number {
    let n = 0;
    this.secondsUntilNextSpawn -= dtSec;
    while (this.secondsUntilNextSpawn <= 0) {
      freeSparks.push(this.spawnOne(tick));
      this.secondsUntilNextSpawn += this.sampleInterarrival();
      n++;
      // S71 P1 — bomb cadence: one bomb every BOMB_SPAWN_MIN..MAX sparks. The
      // counter decrement is RNG-free; only the next-countdown draw + bomb position
      // consume the SEPARATE bombRng stream (host-only; spawner never runs on the
      // client). BOMB_MAX_ACTIVE is enforced at the dispatch site, so the countdown
      // still redraws here even when that spawn is skipped ("skip + redraw").
      if (this.bombRng !== null && --this.sparksUntilBomb <= 0) {
        if (bombsOut !== undefined) bombsOut.push({ pos: this.sampleBombPos() });
        this.sparksUntilBomb = this.sampleBombCountdown();
      }
      // S72 P3 — potato cadence: one potato every POTATO_SPAWN_MIN..MAX sparks. Same
      // shape as the bomb cadence but on the SEPARATE potatoRng stream (spark + bomb
      // sequences byte-unchanged). POTATO_MAX_ACTIVE is enforced at the dispatch site,
      // so a capped fire is a clean skip-and-redraw here too.
      if (this.potatoRng !== null && --this.sparksUntilPotato <= 0) {
        if (potatoesOut !== undefined) potatoesOut.push({ pos: this.samplePotatoPos() });
        this.sparksUntilPotato = this.samplePotatoCountdown();
      }
      // S75 P3 — rainbow cadence: one rainbow every RAINBOW_SPAWN_MIN..MAX sparks (rarer). Same
      // skip-and-redraw shape as bomb/potato, on the SEPARATE rainbowRng stream (the spark + bomb
      // + potato sequences all stay byte-identical). RAINBOW_MAX_ACTIVE is enforced at dispatch.
      if (this.rainbowRng !== null && --this.sparksUntilRainbow <= 0) {
        if (rainbowsOut !== undefined) rainbowsOut.push({ pos: this.sampleRainbowPos() });
        this.sparksUntilRainbow = this.sampleRainbowCountdown();
      }
    }
    return n;
  }

  private spawnOne(tick: number): Spark {
    const id = asSparkId(this.nextId++);
    const type = rngPick(this.rng, this.cfg.types);

    // Uniform point inside disk: r = R · √u, θ = 2π · v.
    const r = this.cfg.radius * Math.sqrt(this.rng()) * 0.85; // 0.85 keeps spawns off the rim
    const theta = 2 * Math.PI * this.rng();
    const pos = {
      x: this.cfg.center.x + r * Math.cos(theta),
      y: this.cfg.center.y + r * Math.sin(theta),
    };

    const speed = rngRange(this.rng, SPARK_INITIAL_VELOCITY_MIN, SPARK_INITIAL_VELOCITY_MAX);
    const dir = 2 * Math.PI * this.rng();
    const velocity = { x: Math.cos(dir) * speed, y: Math.sin(dir) * speed };

    return makeFreeSpark({ id, type, pos, velocity, dt: PHYSICS_DT, createdTick: tick });
  }

  private sampleInterarrival(): number {
    // Exponential(λ): -ln(1-u)/λ.
    const u = Math.max(this.rng(), 1e-9);
    return -Math.log(u) / this.cfg.ratePerSecond;
  }

  /** S71 P1 — next bomb cadence in [MIN, MAX] sparks (bombRng; Infinity if disabled). */
  private sampleBombCountdown(): number {
    if (this.bombRng === null) return Number.POSITIVE_INFINITY;
    const span = BOMB_SPAWN_MAX_SPARKS - BOMB_SPAWN_MIN_SPARKS + 1;
    return BOMB_SPAWN_MIN_SPARKS + Math.floor(this.bombRng() * span);
  }

  /** S71 P1 — uniform point inside the spawn disk for a bomb (same law as sparks). */
  private sampleBombPos(): Vec2 {
    const rng = this.bombRng as Rng;
    const r = this.cfg.radius * Math.sqrt(rng()) * 0.85;
    const theta = 2 * Math.PI * rng();
    return {
      x: this.cfg.center.x + r * Math.cos(theta),
      y: this.cfg.center.y + r * Math.sin(theta),
    };
  }

  /** S72 P3 — next potato cadence in [MIN, MAX] sparks (potatoRng; Infinity if disabled). */
  private samplePotatoCountdown(): number {
    if (this.potatoRng === null) return Number.POSITIVE_INFINITY;
    const span = POTATO_SPAWN_MAX_SPARKS - POTATO_SPAWN_MIN_SPARKS + 1;
    return POTATO_SPAWN_MIN_SPARKS + Math.floor(this.potatoRng() * span);
  }

  /** S72 P3 — uniform point inside the spawn disk for a potato (same law as sparks/bombs). */
  private samplePotatoPos(): Vec2 {
    const rng = this.potatoRng as Rng;
    const r = this.cfg.radius * Math.sqrt(rng()) * 0.85;
    const theta = 2 * Math.PI * rng();
    return {
      x: this.cfg.center.x + r * Math.cos(theta),
      y: this.cfg.center.y + r * Math.sin(theta),
    };
  }

  /** S75 P3 — next rainbow cadence in [MIN, MAX] sparks (rainbowRng; Infinity if disabled). */
  private sampleRainbowCountdown(): number {
    if (this.rainbowRng === null) return Number.POSITIVE_INFINITY;
    const span = RAINBOW_SPAWN_MAX_SPARKS - RAINBOW_SPAWN_MIN_SPARKS + 1;
    return RAINBOW_SPAWN_MIN_SPARKS + Math.floor(this.rainbowRng() * span);
  }

  /** S75 P3 — uniform point inside the spawn disk for a rainbow (same law as sparks/bombs). */
  private sampleRainbowPos(): Vec2 {
    const rng = this.rainbowRng as Rng;
    const r = this.cfg.radius * Math.sqrt(rng()) * 0.85;
    const theta = 2 * Math.PI * rng();
    return {
      x: this.cfg.center.x + r * Math.cos(theta),
      y: this.cfg.center.y + r * Math.sin(theta),
    };
  }
}

/**
 * Per-substep confinement: any spark outside the disk is reflected back.
 * Mutates spark.pos and spark.prevPos in place.
 *
 * `exemptSparkId` (S5 hot-fix): the player's AttractDrag target skips
 * reflection so it can be pulled out of the spawner zone. Without this the
 * boundary bounces the spark back inward each substep and PICKUP never fires.
 */
export function enforceSpawnerBounds(
  sparks: readonly Spark[],
  cfg: SpawnerConfig = DEFAULT_SPAWNER_CONFIG,
  exemptSparkId: SparkId | null = null,
): void {
  const cx = cfg.center.x;
  const cy = cfg.center.y;
  const R = cfg.radius;
  const damp = SPAWNER_BOUNCE_DAMPING;
  for (let i = 0; i < sparks.length; i++) {
    const s = sparks[i];
    if (s.state.kind !== 'Free') continue;
    if (exemptSparkId !== null && s.id === exemptSparkId) continue;
    const dx = s.pos.x - cx;
    const dy = s.pos.y - cy;
    const distSq = dx * dx + dy * dy;
    const limit = R - s.radius;
    if (distSq <= limit * limit) continue;
    const dist = Math.sqrt(distSq) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    // Snap to the boundary.
    s.pos.x = cx + nx * limit;
    s.pos.y = cy + ny * limit;

    // Reflect implicit velocity (v = pos - prevPos) about the inward normal.
    const vx = s.pos.x - s.prevPos.x;
    const vy = s.pos.y - s.prevPos.y;
    const vDotN = vx * nx + vy * ny;
    // Only reflect if heading outward; avoids re-reflecting on subsequent substeps.
    if (vDotN <= 0) continue;
    const rvx = (vx - 2 * vDotN * nx) * damp;
    const rvy = (vy - 2 * vDotN * ny) * damp;
    s.prevPos.x = s.pos.x - rvx;
    s.prevPos.y = s.pos.y - rvy;
  }
}
