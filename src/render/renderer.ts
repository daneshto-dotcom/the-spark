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
/** S77 P3 — a seagull-pooped ("poopy") spark tints brownish-green so its 2x-slow reads visually. */
const POOPY_SPARK_TINT = 0x9aa15c;

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

  /**
   * S153 P4 (owner R81) — *"spark should be one layer above those options as it is the cruiser"*.
   *
   * ⚠ THIS NARROWS S149 P6 RATHER THAN REVERSING IT. That ruling lifted the footer above the board
   * because a zone wall was drawing over UI chrome, and it is written as "nothing on the board
   * should ever draw over it". The spark is the exception the owner is carving out, and the reason
   * is stated in their own words: it is the CRUISER — the thing they are steering. A cursor that
   * disappears under the furniture is not a layering nicety, it is a lost pointer.
   *
   * Safe by construction: input is raw `canvas.addEventListener`, NOT Pixi hit-testing (only the
   * arcade modal uses `eventMode`), so raising this container cannot steal a click from the footer.
   * Verified before the change rather than assumed.
   */
  bringToFront(): void {
    this.container.parent?.addChild(this.container);
  }

  /*
   * ⭐⭐ S170 P1 (owner) — `parent` DEFAULTS TO `app.stage`, AND THE DEFAULT IS THE OLD BUG.
   *
   * Owner, on what the fog is for: *"Fog is just what hides. You have the buildings, the enemy
   * sparks, the connectors that are being built, the unbuilt buildings, the freeform buildings, the
   * spawn."* And on how it broke: *"once we started putting towers, like, real buildings that we've
   * generated, that's when they started being visible. Like, everything else was hidden."*
   *
   * That is the whole history of this defect. A renderer that attaches itself to `app.stage` lands
   * ABOVE or BELOW the fog purely by WHEN it was constructed, so every new art renderer arrived
   * visible-through-the-fog by accident. Taking the parent as an argument is what makes concealment
   * a DECISION at the call site instead of a side effect of construction order.
   */
  constructor(app: Application, parent: Container = app.stage) {
    this.textures = makeShapeTextures(app);
    this.container = new Container();
    // S153 P4 — NAME THE LAYER. Pixi's display list is otherwise a wall of anonymous _Container
    // entries, which made proving the R81 z-order fix guesswork; fog.spec's roll call has the same
    // problem and solves it with hand-maintained comments. A label costs nothing and is readable
    // from any probe.
    this.container.label = 'sparkRenderer';
    parent.addChild(this.container);
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
      // S77 P3 — a seagull-pooped spark tints brownish-green until poopyUntilTick (overrides the
      // free/carry tint above) so the half-speed "cruiser" debuff is visible to everyone.
      if (world !== undefined && s.poopyUntilTick !== undefined && world.tick < s.poopyUntilTick) {
        sprite.tint = POOPY_SPARK_TINT;
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

