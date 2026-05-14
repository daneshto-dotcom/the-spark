/**
 * SPARK — creature sprite renderer (S25 P0, Voltkin Phase 2A scaffold).
 *
 * Per S24 Voltkin Phase 2 blueprint § Q3:
 *   - S25–S27 fallback: plain Pixi `Sprite` from existing `voltkin-zap.png` (single frame).
 *   - S28: Imagen-generated spritesheet + `AnimatedSprite` swap (deferred).
 *
 * Per blueprint § Q1:
 *   - Z-order: creature container attached AFTER `structureRenderer` so creatures
 *     render ABOVE prims (phase-through reads as overlap).
 *
 * Per blueprint § Q8 + Q5:
 *   - SPAWNING + DESPAWNING (first half): alpha = 1.0
 *   - DESPAWNING (last CREATURE_FADE_TICKS ticks): alpha tweens 1.0 → 0.0
 *
 * 1v1 note: clients receive cinematic via GODLY_TRIGGER but NEVER mutate `world.creatures`
 * (host-only dispatch via `world.isHost` gate in main.ts). Client's renderer sync sees an
 * empty map → no creatures rendered. S28 NetSnapshot v2 (blueprint Q6) will add host-→client
 * creature mirroring; for S25 this is documented host-only behavior (Council R1 Gap A).
 *
 * Lazy asset load: `Assets.load(VOLTKIN_SPRITE_URL)` fires on first creature spawn and is
 * cached by Pixi's asset cache. Failed loads log a warning and skip the sprite for that
 * creature (matches `cutsceneOverlay.crossfadeCharacterSprite` failure path).
 */

import { Application, Assets, Container, Sprite, type Texture } from 'pixi.js';
import type { World } from '../state/world.ts';
import type { Creature, CreatureId } from '../state/creatures/creature.ts';
import {
  CREATURE_DESPAWNING_TICKS,
  CREATURE_FADE_TICKS,
} from '../state/creatures/creature.ts';

const VOLTKIN_SPRITE_URL = '/godly/voltkin/sprites/voltkin-zap.png';
/** Match cutsceneOverlay's character-sprite scale so the handoff visual is continuous. */
const CREATURE_SPRITE_SCALE = 0.25;

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
   * remove despawned. Idempotent per frame. Cheap when empty (no allocations).
   */
  sync(world: World): void {
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
        sprite.scale.set(CREATURE_SPRITE_SCALE);
        this.sprites.set(creature.id, sprite);
        this.container.addChild(sprite);
      }
      sprite.position.set(creature.pos.x, creature.pos.y);
      sprite.alpha = computeCreatureAlpha(creature);
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

/**
 * Compute per-frame alpha for a creature given its FSM state + ticksInState.
 * Exported for vitest unit coverage of the fade-curve math.
 */
export function computeCreatureAlpha(creature: Creature): number {
  if (creature.state !== 'DESPAWNING') return 1.0;
  const fadeStartTick = CREATURE_DESPAWNING_TICKS - CREATURE_FADE_TICKS;
  if (creature.ticksInState < fadeStartTick) return 1.0;
  const fadeProgress = (creature.ticksInState - fadeStartTick) / CREATURE_FADE_TICKS;
  return Math.max(0, Math.min(1, 1.0 - fadeProgress));
}
