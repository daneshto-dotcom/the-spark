/**
 * SPARK — S175 P4a: THE VOLTKIN TV IS A BUILDING NOW, NOT A BARE CHAIN OF SHAPES.
 *
 * Owner, S175: *"for now it's just fucking connectors of, what is it, four squares and then four
 * triangle. It looks stupid. It should be like that, but then the tower happens, you know, the whole
 * video game and him emerging, blah blah blah — make it look sick."* And on the direction:
 * *"we're redoing the whole way that Voltkin is coming out of the TV. It's gonna be in game. It's
 * gonna be like the tower is being built … kind of like when bosses come out. But even cooler."*
 *
 * ⛔ **WHY THIS IS ITS OWN RENDERER AND NOT A BRANCH IN `towerRenderer`.** Phase A.0's decisive
 * finding: `voltkin` is the ONLY `kind: 'cinematic'` recipe in the registry. It registers no spawner
 * and no defender, and `world.currentCinematicEvent.targetComponentPrimitiveIds` — the only record
 * that a chain ever existed — is cleared on `GODLY_COMPLETE`. `towerRenderer.sync` iterates
 * `world.creatureSpawners` and would never see a Voltkin, and `towerArtForRecipe` requires a
 * `RaceId` and a `tier: 3 | 9` that a race-agnostic TV does not have. Widening either to fit would
 * ripple into `destroyAtlasBase` and both row tables for one structure.
 *
 * ⭐ **SO THE CHAIN IS RE-DERIVED EVERY FRAME FROM SYNCED STATE, WHICH COSTS NOTHING AND SYNCS FREE.**
 * `findAllVoltkinChains` walks `world.primitives` and `world.bonds` — both REQUIRED, fully-serialized
 * wire fields — so every peer computes the identical set. No sim change, no snapshot bytes, no new
 * `GameEffect`, and **PROTOCOL_VERSION stays 46**. It is the same reasoning `towerCover` rests on:
 * a structure's identity in this game is topology, and topology is already on the wire.
 *
 * ⭐ **AND IT PHASES THE SHAPES OUT, WHICH IS THE HALF HE ACTUALLY COMPLAINED ABOUT.** Drawing a TV
 * over the chain while leaving eight bright primitives and seven connectors on top of it would not
 * fix *"it looks stupid"*. This renderer calls `markTowerCover`, so the shapes underneath phase out
 * exactly as they do under a race tower, and phase back in when the chain breaks.
 *
 * ⚠ **THREE STATES, NOT SIX.** His art is a six-panel sequence; the engine's `TowerState` is
 * intact/damaged/destroyed and widening it breaks `tsc` across both row tables. intact ← tv-1,
 * damaged ← tv-3-burning (his own "the state it wears most of the match"), destroyed ← tv-6-ruins.
 * The spawn, critical and explosion panels are the EMERGENCE and the destruction beat — frame-driven
 * and client-local, the `TOWER_CRUMBLE_FRAMES` shape — and are deliberately not damage states.
 */
import { Application, Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { World } from '../state/world.ts';
import type { BondId, PrimitiveId } from '../types.ts';
import { findAllVoltkinChains } from '../state/godlyRecipes/voltkin.ts';
import { isConcealed } from './concealment.ts';
import { markTowerCover } from './towerCover.ts';
import { TOWER_SPRITE_ANCHOR, towerHpFrac, towerStateForHp, type TowerState } from './towerFrames.ts';

const ATLAS_BASE = '/art/voltkin-tv/voltkin-tv';

/**
 * On-screen size, px.
 *
 * ⚠ THE NUMBER IS MINE, and it is derived rather than picked: the owner's own turnaround sheet
 * labels the TV **~4.5 m**, against a tier-9 boss tower's 150 px sprite on a nine-node ring. The
 * Voltkin chain is eight primitives in a line rather than a ring, so it is physically wider and a
 * taller sprite would swamp it. 132 px sits between the tier-3 84 and the tier-9 150, which matches
 * a structure that costs seven connectors. Overrule it against the live board.
 */
const TV_SPRITE_PX = 132;

interface StateTextures { readonly intact: Texture; readonly damaged: Texture; readonly destroyed: Texture }
interface Manifest { cellW: number; cellH: number; states: Partial<Record<TowerState, { row: number }>> }

/** Fallback row order, and the CONTRACT — the shipped manifest is the authority. */
const TV_ROWS: Readonly<Record<TowerState, number>> = { intact: 0, damaged: 1, destroyed: 2 };

export class VoltkinTowerRenderer {
  readonly layer = new Container();
  private atlas: StateTextures | null = null;
  private loadStarted = false;
  /** Keyed by the chain's stable identity (its sorted member ids). */
  private readonly sprites = new Map<string, Sprite>();

  constructor(_app: Application, parent: Container) {
    parent.addChild(this.layer);
  }

  private ensureAtlas(): void {
    if (this.loadStarted) return;
    this.loadStarted = true;
    void (async () => {
      try {
        const manifest = (await (await fetch(`${ATLAS_BASE}-anim.json`)).json()) as Manifest;
        const sheet = (await Assets.load(`${ATLAS_BASE}-atlas.png`)) as Texture;
        const cut = (state: TowerState): Texture => new Texture({
          source: sheet.source,
          frame: new Rectangle(
            0, (manifest.states[state]?.row ?? TV_ROWS[state]) * manifest.cellH,
            manifest.cellW, manifest.cellH,
          ),
        });
        this.atlas = { intact: cut('intact'), damaged: cut('damaged'), destroyed: cut('destroyed') };
      } catch {
        /*
         * Left null and never retried. The chain's own shapes stay fully visible, because a failed
         * atlas means this renderer never calls `markTowerCover` — the board degrades to exactly what
         * it looked like before this feature, which is the same fallback contract `towerRenderer`
         * states for its own load failures.
         */
        this.atlas = null;
      }
    })();
  }

  /** Stable identity for a chain, independent of which end the search started from. */
  private static keyOf(chain: readonly PrimitiveId[]): string {
    return [...chain].map(Number).sort((a, b) => a - b).join(',');
  }

  sync(world: World): void {
    const chains = findAllVoltkinChains(world);
    if (chains.length === 0 && this.sprites.size === 0) return;
    this.ensureAtlas();

    const live = new Set<string>();
    for (const chain of chains) {
      const first = world.primitives.get(chain[0]!);
      // Fog: an enemy's building is not drawn unless it is in live vision — the same test, on the
      // same field, that `towerRenderer` applies to its anchor primitive.
      if (first !== undefined && isConcealed(first.pos.x, first.pos.y, first.placedBy)) continue;
      if (this.atlas === null) continue; // still loading, or failed — shapes stay bare

      let cx = 0; let cy = 0; let n = 0;
      for (const id of chain) {
        const p = world.primitives.get(id);
        if (p === undefined) continue;
        cx += p.pos.x; cy += p.pos.y; n++;
      }
      if (n === 0) continue;
      cx /= n; cy /= n;

      const key = VoltkinTowerRenderer.keyOf(chain);
      let sprite = this.sprites.get(key);
      if (sprite === undefined) {
        sprite = new Sprite();
        sprite.anchor.set(TOWER_SPRITE_ANCHOR.x, TOWER_SPRITE_ANCHOR.y);
        this.layer.addChild(sprite);
        this.sprites.set(key, sprite);
      }
      sprite.texture = this.atlas[towerStateForHp(towerHpFrac(chain, (id) => world.primitives.get(id)?.hp))];
      sprite.width = TV_SPRITE_PX;
      sprite.height = TV_SPRITE_PX;
      sprite.x = cx;
      // The sprite's FOOT sits at the centroid, so the TV stands ON the shapes rather than being
      // buried to its waist in them — the CASTLE_SPRITE_ANCHOR lesson, which cost a capture once.
      sprite.y = cy + TV_SPRITE_PX * 0.5;

      /*
       * ⭐ Declared HERE, at the point the sprite is committed, and never re-derived inside
       * `towerCover` — the fog skip and the atlas-load bail above must NOT hide the shapes, or a
       * Voltkin chain in the dark becomes a blank patch of board.
       */
      const bonds: BondId[] = [];
      const members = new Set<PrimitiveId>(chain);
      let newestTick = 0;
      for (const bond of world.bonds.values()) {
        if (!members.has(bond.aId) || !members.has(bond.bId)) continue;
        bonds.push(bond.id);
        if (bond.createdTick > newestTick) newestTick = bond.createdTick;
      }
      markTowerCover(chain, bonds, newestTick);
      live.add(key);
    }

    for (const [key, sprite] of this.sprites) {
      if (live.has(key)) continue;
      sprite.destroy();
      this.sprites.delete(key);
    }
  }

  /** Drop every sprite — title-return, same contract as the other renderers. */
  clear(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
  }
}
