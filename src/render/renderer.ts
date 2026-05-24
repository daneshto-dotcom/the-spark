/**
 * SPARK — Pixi v8 renderer for free sparks.
 * Spec § IV LOCKED: each of the 6 types has its own shape geometry.
 * Spec § IV (v0.5.1 amendment): free sparks are COLORLESS — type identity
 * is communicated by SHAPE alone. Color encodes ownership (player), not
 * type. So free sparks tint to a neutral white-grey; placed primitives
 * (in structureRenderer.ts) tint to the placer's player color.
 *
 * Phase 1 entity counts are small (≤50 free + ≤30 placed = ~80 sprites),
 * so plain Sprite + auto-batching is preferred over ParticleContainer
 * which assumes a single shared texture.
 */

import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { SPARK_COLORS, SparkType } from '../constants.ts';
import type { Spark } from '../game/spark.ts';
import type { SparkId } from '../types.ts';
import type { World } from '../state/world.ts';
import { destroyShapeTextures, makeShapeTextures, type ShapeTextures } from './shapes.ts';

/**
 * Free shapes render in neutral off-white. Slightly cool/silver to read
 * against the black background as "raw matter, no owner yet."
 */
const FREE_SPARK_TINT = 0xe6e6f0;
const FREE_SPARK_ALPHA = 0.92;

/**
 * S45 BUG-CRITICAL-3 Sym C(a) — when a spark is in Carried state, its sprite
 * tints to the carrier's player.color so the per-player color identity ("host
 * always red, joiner always blue, and so are their constructions" — user S44
 * verbatim) is visually expressed for in-flight building blocks. The placed-
 * primitive creator-tint (Sym C(b/c)) is a schema-change deferred to a
 * follow-up PDR per Battle Ledger lock. Carry-state colors fully alpha-
 * opaque (1.0) vs the Free-state 0.92 so the carry visually "lights up"
 * relative to other free sparks in the spawner zone.
 */
const CARRIED_SPARK_ALPHA = 1.0;

export class SparkRenderer {
  private readonly container: Container;
  private readonly spriteBySpark: Map<SparkId, Sprite> = new Map();
  private readonly textures: ShapeTextures;

  constructor(app: Application) {
    this.textures = makeShapeTextures(app);
    this.container = new Container();
    app.stage.addChild(this.container);
  }

  /** Sync sprites to current spark list. Idempotent — call once per frame.
   *
   * S45 Sym C(a) — when `world` is supplied, sparks in Carried state tint
   * to their carrier's player.color (via world.players[carrierId].color
   * lookup). Falls back to FREE_SPARK_TINT defensively if carrier is missing
   * (Battle Ledger C4 unanimous: defensive fallback, no throw — handles
   * transient snapshot-ordering edges on joiner). world omitted = legacy
   * call path (preserved for tests + back-compat).
   */
  sync(freeSparks: readonly Spark[], world?: World): void {
    const present = new Set<SparkId>();
    for (let i = 0; i < freeSparks.length; i++) {
      const s = freeSparks[i];
      present.add(s.id);
      let sprite = this.spriteBySpark.get(s.id);
      if (sprite === undefined) {
        sprite = new Sprite(this.textures[s.type]);
        sprite.anchor.set(0.5);
        this.container.addChild(sprite);
        this.spriteBySpark.set(s.id, sprite);
      }
      sprite.x = s.pos.x;
      sprite.y = s.pos.y;
      // S45 Sym C(a) — per-frame tint resolution. Branch on state.kind:
      // Carried → carrier's color (with defensive fallback); Free → neutral.
      if (s.state.kind === 'Carried' && world !== undefined) {
        const carrier = world.players.get(s.state.carrierId);
        if (carrier !== undefined) {
          sprite.tint = carrier.color;
          sprite.alpha = CARRIED_SPARK_ALPHA;
        } else {
          // Battle Ledger C4 defensive fallback — carrier id present in
          // snapshot but player record missing (transient race on joiner
          // during RETURN_TO_TITLE-while-carrying). Render as Free until
          // next snapshot resolves the inconsistency.
          sprite.tint = FREE_SPARK_TINT;
          sprite.alpha = FREE_SPARK_ALPHA;
        }
      } else {
        sprite.tint = FREE_SPARK_TINT;
        sprite.alpha = FREE_SPARK_ALPHA;
      }
    }

    if (this.spriteBySpark.size > present.size) {
      for (const [id, sprite] of this.spriteBySpark) {
        if (!present.has(id)) {
          sprite.destroy();
          this.spriteBySpark.delete(id);
        }
      }
    }
  }

  /** Visible sprite count (for stats overlay). */
  get count(): number {
    return this.spriteBySpark.size;
  }

  destroy(): void {
    this.container.destroy({ children: true });
    destroyShapeTextures(this.textures);
    this.spriteBySpark.clear();
  }
}

/** Render the spawner ring (background reference). */
export function makeSpawnerRing(centerX: number, centerY: number, radius: number): Graphics {
  return new Graphics()
    .circle(centerX, centerY, radius)
    .stroke({ width: 1, color: 0x222222, alpha: 0.6 });
}

/**
 * Type-presence chip — tiny preview of the 6 shape geometries in the
 * top-left, in their (now-decorative) spec-§ IV colors. This is now a
 * legend/key for "what shape is what type" — useful while learning combos.
 */
export function makeLegend(app: Application): Container {
  const c = new Container();
  const textures = makeShapeTextures(app);
  const types = [
    SparkType.Dot,
    SparkType.Line,
    SparkType.Triangle,
    SparkType.Square,
    SparkType.Circle,
    SparkType.Spiral,
  ];
  let x = 16;
  const y = 16;
  for (const t of types) {
    const s = new Sprite(textures[t]);
    s.anchor.set(0.5);
    s.x = x;
    s.y = y;
    s.tint = SPARK_COLORS[t]; // legend keeps type-color for the key only
    s.scale.set(0.6);
    c.addChild(s);
    x += 22;
  }
  return c;
}
