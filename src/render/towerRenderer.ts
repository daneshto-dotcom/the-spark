/**
 * SPARK — S167 — **THE RACE TOWER SPRITE.** The Pixi half; every decision lives in `towerFrames.ts`.
 *
 * ## ⛔ WHAT THIS FIXES: ART THAT SHIPPED AND WAS NEVER DRAWN
 *
 * Twelve tier-3 tower atlases (S165 P4) and six tier-9 boss-tower atlases (S167) are on disk,
 * matted, scanned by `check:atlas` and asserted-present by tests — and until this file existed
 * **nothing in `src/` drew any of them**. `t3TowerAtlasBase` had zero production callers. Every
 * gate in the repo was green over art the player has never seen.
 *
 * ## Where the sprite goes, and why it is the RING and not the component
 *
 * `SpawnerZoneRenderer` — the aura under these towers — takes `componentOf(anchor)`, which is right
 * for an aura: it should cover everything attached. It is WRONG for the building. R136 lets foreign
 * shapes auto-bond onto a ring node without breaking the tower, and those shapes join the component,
 * so a component centroid DRIFTS OFF the ring the moment a stray shape touches it — the tower would
 * visibly slide sideways when a player placed something next to it.
 *
 * `ringMembersAt` returns exactly the nodes the recipe validated, so the centroid is the ring's own
 * centre and cannot be moved by anything outside it. The same call supplies the members whose HP
 * decides the damage frame, so the sprite that is drawn and the health it reflects are guaranteed to
 * be about the same nine shapes.
 *
 * ## ⛔ THE FAILURE MODE THIS RENDERER MUST NOT REPEAT
 *
 * `loadAtlas` in `goblinRenderer` swallows a fetch failure with a bare `catch {}` and falls back to
 * a green procedural puppet — which is why a wrong path there ships looking merely ugly. There is no
 * procedural tower to fall back to, so a failed load here draws NOTHING, which is exactly the state
 * the tier-3 art has been in since S165. The `loadStarted` guard therefore records the attempt and a
 * failure is stored as `null` so it is not retried at 60 Hz; the shapes themselves stay visible
 * underneath, so the structure is still legible even when its building is missing.
 */

import { Application, Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { World } from '../state/world.ts';
import type { CreatureSpawner } from '../state/spawners/spawner.ts';
import type { SpawnerId } from '../types.ts';
import { RACE_FEED_SHAPE } from '../state/races.ts';
import { RACE_TOWER_SIZE } from '../state/raceTowerIds.ts';
import { T9_TOWER_SIZE } from '../state/t9BossIds.ts';
import { ringMembersAt } from '../state/godlyRecipes/ringShape.ts';
import {
  TOWER_SPRITE_ANCHOR,
  type TowerArt,
  type TowerState,
  towerArtForRecipe,
  towerHpFrac,
  towerStateForHp,
} from './towerFrames.ts';

/** The shipped `-anim.json` sidecar. The manifest is the authority on cell size and row index. */
interface TowerAtlasManifest {
  readonly cellW: number;
  readonly cellH: number;
  readonly states: Readonly<Record<string, { readonly row: number } | undefined>>;
}

type StateTextures = Readonly<Record<TowerState, Texture>>;

export class TowerRenderer {
  private readonly layer: Container;
  private readonly sprites = new Map<SpawnerId, Sprite>();
  private readonly atlases = new Map<string, StateTextures | null>();
  private readonly loadStarted = new Set<string>();

  constructor(app: Application, parent: Container = app.stage) {
    this.layer = new Container();
    parent.addChild(this.layer);
  }

  /**
   * One-time lazy load per ATLAS BASE, started only when a tower of that race and tier is actually
   * on the board.
   *
   * ⛔ LAZY, AND THE GUARD IS LOAD-BEARING RATHER THAN AN OPTIMISATION. `sync` runs at 60 Hz and the
   * load is async, so without `loadStarted` a single live tower would queue hundreds of fetches
   * before the first resolved — the same guard, for the same reason, as `ensureCastleAtlas`.
   *
   * ⚠ Eighteen atlases exist across the two tiers; a 1v1 match can reach at most four of them
   * (two races × two tiers), so loading eagerly would pull several MB of PNG for a fraction of it.
   */
  private ensureAtlas(art: TowerArt): void {
    if (this.loadStarted.has(art.atlasBase)) return;
    this.loadStarted.add(art.atlasBase);
    void (async () => {
      try {
        const manifest = (await (await fetch(`${art.atlasBase}-anim.json`)).json()) as TowerAtlasManifest;
        const sheet = (await Assets.load(`${art.atlasBase}-atlas.png`)) as Texture;
        const cut = (state: TowerState): Texture =>
          new Texture({
            source: sheet.source,
            frame: new Rectangle(
              0,
              // The manifest is the authority; the table is the fallback AND the contract. The two
              // tiers have DIFFERENT row orders (tier-3 carries a `spawning` row that tier-9 does
              // not), so a guessed index draws the wrong frame rather than none.
              (manifest.states[state]?.row ?? art.rows[state]) * manifest.cellH,
              manifest.cellW,
              manifest.cellH,
            ),
          });
        this.atlases.set(art.atlasBase, {
          intact: cut('intact'),
          damaged: cut('damaged'),
          destroyed: cut('destroyed'),
        });
      } catch {
        // No procedural tower exists to fall back to. Stored as null so it is not retried every
        // frame; the ring's own shapes keep the structure legible without its building.
        this.atlases.set(art.atlasBase, null);
      }
    })();
  }

  /**
   * The ring this spawner stands on, or `null` if it is not a race tower (or is mid-teardown).
   *
   * ⚠ RE-WALKED EVERY FRAME rather than cached at ignition, because a ring's nodes can be damaged,
   * and because caching would need an invalidation path keyed on primitive death — which is exactly
   * the kind of side table `primitive.ts` warns must be swept inside `razePrimitives`.
   */
  private ringOf(world: World, sp: CreatureSpawner, art: TowerArt): readonly import('../types.ts').PrimitiveId[] | null {
    const n = art.tier === 9 ? T9_TOWER_SIZE : RACE_TOWER_SIZE;
    return ringMembersAt(world, sp.anchorPrimitiveId, RACE_FEED_SHAPE[art.race], n);
  }

  /** Clear + place a sprite for every live race tower. No-op when there are none. */
  sync(world: World): void {
    const live = new Set<SpawnerId>();

    for (const sp of world.creatureSpawners.values()) {
      const art = towerArtForRecipe(sp.recipeId);
      if (art === null) continue; // pentagram / goblin tower / lightning hub have no structure art
      this.ensureAtlas(art);
      const atlas = this.atlases.get(art.atlasBase);
      if (atlas === undefined || atlas === null) continue; // still loading, or failed

      const ring = this.ringOf(world, sp, art);
      if (ring === null) continue; // broken between the re-validation poll and this frame

      // Centroid of the RING, not of the component — see the file docblock.
      let cx = 0;
      let cy = 0;
      let n = 0;
      for (const id of ring) {
        const p = world.primitives.get(id);
        if (p === undefined) continue;
        cx += p.pos.x;
        cy += p.pos.y;
        n++;
      }
      if (n === 0) continue;
      cx /= n;
      cy /= n;

      const frac = towerHpFrac(ring, (id) => world.primitives.get(id)?.hp);

      let sprite = this.sprites.get(sp.id);
      if (sprite === undefined) {
        sprite = new Sprite();
        sprite.anchor.set(TOWER_SPRITE_ANCHOR.x, TOWER_SPRITE_ANCHOR.y);
        this.layer.addChild(sprite);
        this.sprites.set(sp.id, sprite);
      }
      sprite.texture = atlas[towerStateForHp(frac)];
      sprite.width = art.sizePx;
      sprite.height = art.sizePx;
      sprite.x = cx;
      /*
       * ⚠ The sprite's FOOT sits at the ring centroid, so the building stands ON the shapes rather
       * than being buried to its waist in them — the `CASTLE_SPRITE_ANCHOR` lesson, which cost a
       * capture the first time. Half a sprite-height below the centroid puts the base there.
       */
      sprite.y = cy + art.sizePx * 0.5;
      /*
       * ⛔ NOT TINTED. `Sprite.tint` is a MULTIPLY, and the owner rejected exactly this twice — on
       * the S151 goblins and again on the S161 castles (*"this looks like we took each castle and
       * just completely filled them with their one color - pretty lazy work"*). The art is already
       * drawn in its race's own colour, and `Player.color` is DERIVED from `raceId`, so ownership
       * reads without a tint by construction.
       */
      live.add(sp.id);
    }

    // Retire sprites whose spawner is gone — a tier-9 tower REMOVES ITSELF after one release, so
    // this path runs in normal play rather than only at teardown.
    for (const [id, sprite] of this.sprites) {
      if (live.has(id)) continue;
      sprite.destroy();
      this.sprites.delete(id);
    }
  }

  /** Drop every sprite — match teardown / title return. Mirrors the other renderers' `clear`. */
  clear(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
  }
}
