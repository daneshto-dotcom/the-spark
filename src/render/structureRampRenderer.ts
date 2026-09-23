/**
 * SPARK — S182 — **THE DAMAGE-RAMP RENDERER. Generic over `RAMP_SPECS`; wired once.**
 *
 * The Pixi half of `structureRamp.ts`. Every decision it makes is in that module and runs in vitest;
 * this file is the part that cannot be, and it is deliberately thin.
 *
 * ⭐ **IT IS GENERIC ON PURPOSE, AND THE OWNER IS THE REASON.** He held art back until he had seen
 * one work, so the second tower had to cost a table row rather than a file. ✅ **S183 CASHED THAT
 * IN**: the goblin tower, the laser turret, the pentagram and HELGA's hall each cost one
 * `RAMP_SPECS` row, and this renderer still never names a tower. What they DID cost, once,
 * between them, is the two seams below — the pentagram's ring walk and the defender source loop.
 *
 * ## THE TWO GATES A NEW RENDERER IN THIS PROJECT OWES, both copied from `voltkinTowerRenderer`
 *
 *   · **the fog gate** — an enemy building is not drawn unless it is in live vision;
 *   · **the `manifest === null` bail** — while the atlas is loading, or after it failed, the
 *     structure's own shapes stay fully visible and the board degrades to exactly what it looked
 *     like before this feature. ⛔ Which is also why `markTowerCover` is called at the point the
 *     sprite is COMMITTED and never earlier: a tower hidden under a sprite that is not being drawn
 *     is a blank patch of board.
 *
 * ## ⭐ THE CURSOR, AND WHY IT IS SAFE
 *
 * `rampCursors` is CLIENT-LOCAL. It is the play-through position R182-D asks for, nothing in the sim
 * reads it, and two peers a beat apart on an animation is invisible — where putting it on the wire
 * would cost a PROTOCOL bump for a puff of smoke. Same reasoning, same shape, as the Voltkin TV's
 * `destroyedAt` / `dying` maps; and like those it is empty on a reload or for a joiner, so a hub that
 * was already hurt when you arrived is drawn at its correct frame immediately rather than animating
 * its whole history at you. That is `seedCursor` below.
 *
 * ⚠ **THE HEALTH ITSELF IS NOT CLIENT-LOCAL AND MUST NOT BE.** It comes from `rampHealthFrac` over
 * `Bond.damageFifths` — already serialized, already hashed — which for a star is `starHealthFrac`'s
 * arithmetic exactly (asserted, not claimed: `structureRamp.test.ts`). The cursor animates toward a
 * synced target; it never invents one.
 */
import { Application, Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { DEMON_PENTAGRAM_TINT, isDemonicSeat } from './hellspawnLook.ts'; // ⭐ S188 demons.l5
import type { World } from '../state/world.ts';
import type { PrimitiveId } from '../types.ts';
import { isConcealed } from './concealment.ts';
import { markTowerCover } from './towerCover.ts';
import { TOWER_SPRITE_ANCHOR } from './towerFrames.ts';
import {
  advanceRampCursor, rampCell, rampHealthFrac, rampMembersAt, rampSpecFor, rampTargetFrame,
  shouldStartGhost, type RampCursor, type RampSpec,
} from './structureRamp.ts';

interface RowMeta { readonly row: number; readonly frames: number; readonly ticksPerFrame: number }
interface Manifest {
  readonly cellW: number;
  readonly cellH: number;
  readonly footAnchor: { readonly x: number; readonly y: number };
  readonly states: Readonly<Record<string, RowMeta | undefined>>;
}

/**
 * ⭐ HOW LONG THE WRECKAGE LINGERS after the last frame, in ticks.
 *
 * Finite, and for a sharper reason than the Voltkin TV's: when a hub self-destructs the sim RAZES
 * its component, so there is nothing left underneath for the sprite to misrepresent — but a ruins
 * sprite held forever would sit on ground a player can immediately rebuild on. 0.7 s is long enough
 * to read the wreck and short enough to be gone before the rebuild.
 *
 * ⚠ MINE, not the owner's.
 */
export const RAMP_RUINS_HOLD_TICKS = 42;

/** A structure that has left the world but whose collapse is still playing out on THIS peer. */
interface Ghost {
  readonly x: number;
  readonly y: number;
  readonly spec: RampSpec;
  /** The tick after which the sprite is released. */
  readonly untilTick: number;
  cursor: RampCursor;
}

export class StructureRampRenderer {
  readonly layer = new Container();
  private readonly sprites = new Map<string, Sprite>();
  private readonly cursors = new Map<string, RampCursor>();
  private readonly ghosts = new Map<string, Ghost>();
  private readonly lastSeen = new Map<string, { x: number; y: number; spec: RampSpec }>();
  /** One loader per atlas base, so a table with six towers fetches six sheets and no sheet twice. */
  private readonly loadStarted = new Set<string>();
  private readonly sheets = new Map<string, Texture>();
  private readonly manifests = new Map<string, Manifest>();
  /** Cut textures, keyed `base:state:col`. Cutting is cheap but not free, and `sync` runs per frame. */
  private readonly cells = new Map<string, Texture>();

  constructor(_app: Application, parent: Container) {
    parent.addChild(this.layer);
  }

  private ensureAtlas(base: string): void {
    if (this.loadStarted.has(base)) return;
    this.loadStarted.add(base);
    void (async () => {
      try {
        const manifest = (await (await fetch(`${base}-anim.json`)).json()) as Manifest;
        const sheet = (await Assets.load(`${base}-atlas.png`)) as Texture;
        this.sheets.set(base, sheet);
        this.manifests.set(base, manifest);
      } catch {
        // Left absent and never retried — see the load-failure contract in the file docblock.
        this.sheets.delete(base);
        this.manifests.delete(base);
      }
    })();
  }

  private frameTexture(spec: RampSpec, frame: number): Texture | null {
    const sheet = this.sheets.get(spec.atlasBase);
    const manifest = this.manifests.get(spec.atlasBase);
    if (sheet === undefined || manifest === undefined) return null;
    const { state, col } = rampCell(frame, spec);
    const key = `${spec.atlasBase}:${state}:${col}`;
    const hit = this.cells.get(key);
    if (hit !== undefined) return hit;
    const meta = manifest.states[state];
    if (meta === undefined) return null;
    const c = Math.min(Math.max(0, col), Math.max(0, meta.frames - 1));
    const tex = new Texture({
      source: sheet.source,
      frame: new Rectangle(c * manifest.cellW, meta.row * manifest.cellH, manifest.cellW, manifest.cellH),
    });
    this.cells.set(key, tex);
    return tex;
  }

  /**
   * Place and draw one sprite.
   *
   * ⭐ **OFFSET BY THE ART AND BY THE MANIFEST'S FOOT, NOT BY THE BOX.** The bottom anchor puts the
   * sprite BOX's base at `y`, and the drawn building's ground line is at `footAnchor.y` of that box
   * — this sheet deliberately leaves rows of cell below the ground line so the soft fade under the
   * rubble survives. Ignoring that hovers the tower above its own shapes, which is the S178 Voltkin
   * defect exactly. Half the ART then straddles the centroid, the way every other tower here sits.
   *
   * ⛔ **AND THE ART SIZE COMES FROM THE SPEC, NEVER FROM A NAMED TOWER'S CONSTANT.** This read
   * `HUB_ART_PX` in its first draft — correct for the one entry in the table today and silently
   * wrong for every tower the owner presents next, which would have made this renderer generic in
   * shape and hub-specific in behaviour. `structureRamp.test.ts` pins that every spec carries both.
   */
  private place(sprite: Sprite, spec: RampSpec, tex: Texture, cx: number, cy: number): void {
    const footY = this.manifests.get(spec.atlasBase)?.footAnchor.y ?? 1;
    sprite.texture = tex;
    sprite.width = spec.spritePx;
    sprite.height = spec.spritePx;
    sprite.x = cx;
    sprite.y = cy + spec.artPx * 0.5 + (1 - footY) * spec.spritePx;
  }

  /**
   * First sight of a structure: start the cursor AT its current damage rather than at frame 1.
   *
   * ⛔ Without this a joiner — or anyone who tabs back after a reload — watches every standing hub on
   * the board play its whole damage history from pristine. The ramp is for damage arriving NOW.
   */
  private seedCursor(key: string, target: number, tick: number): RampCursor {
    const had = this.cursors.get(key);
    if (had !== undefined) return had;
    const seeded = { frame: target, sinceTick: tick };
    this.cursors.set(key, seeded);
    return seeded;
  }

  /**
   * ⭐⭐ S183 — **ONE STRUCTURE, DRAWN. LIFTED OUT OF `sync` SO A DEFENDER CAN REACH IT.**
   *
   * `DAMAGE_RAMP_ADDING_A_TOWER.md` §3 counted this at ~15 lines and deferred it for a stated
   * reason — *"there is no defender ramp art yet, and code written ahead of the art it serves
   * ships unreachable and untested"*. The art arrived in S183 (the laser turret and HELGA's hall),
   * so the loop widens: `world.creatureSpawners` and `world.defenders` both feed this.
   *
   * ⛔ **AND THE TWO COLLECTIONS ARE WHY NOTHING WAS HIDING THE SHAPES UNDER A DEFENDER.** Cover is
   * published by whoever COMMITS A SPRITE, and every one of the three publish sites that existed
   * before this session iterated `world.creatureSpawners` — `towerRenderer` (the race towers),
   * this renderer (the ramp table) and `voltkinTowerRenderer` (its own chain). R175-B parked the
   * gap explicitly: *"connector hiding includes defenders — but they have no art yet, so focus on
   * the race ones we have."* This method is the fourth publish site and the first one a defender
   * can reach.
   *
   * @returns true iff a sprite was actually committed (and therefore cover was published).
   */
  private drawStructure(
    world: World, key: string, anchorId: PrimitiveId, spec: RampSpec,
    /** ⭐ S188 — a sprite tint; `0xffffff` (none) for everything but a HELLSPAWN seat's pentagram. */
    tint = 0xffffff,
  ): boolean {
    const anchor = world.primitives.get(anchorId);
    if (anchor === undefined) return false;

    this.ensureAtlas(spec.atlasBase);
    // Fog: the same test, on the same field, that every other structure renderer applies.
    if (isConcealed(anchor.pos.x, anchor.pos.y, anchor.placedBy)) return false;
    if (!this.manifests.has(spec.atlasBase)) return false; // loading, or failed — shapes stay bare

    /*
     * ⛔ THE MEMBER WALK IS SHARED WITH THE HIT TEST, not re-derived here. `rampAnchorAtPoint` uses
     * the same `rampMembersAt` to decide where this building can be CLICKED, and with the shapes
     * underneath now invisible a hit box that disagrees with the art is a tower nobody can repair.
     */
    const at = rampMembersAt(world, anchorId, spec);
    if (at === null) return false;
    const { members, bonds, cx, cy, newestTick } = at;
    const frac = rampHealthFrac(bonds.length, at.bankedFifths, spec);
    // ⭐ S182 — a DOOMED structure aims at the last frame, so its collapse plays from synced
    // health on every peer instead of only on the one that had a ghost record. See `rampTargetFrame`.
    const target = rampTargetFrame(frac, spec);
    const cursor = advanceRampCursor(this.seedCursor(key, target, world.tick), target, world.tick, spec);
    this.cursors.set(key, cursor);

    const tex = this.frameTexture(spec, cursor.frame);
    if (tex === null) return false;
    let sprite = this.sprites.get(key);
    if (sprite === undefined) {
      sprite = new Sprite();
      sprite.anchor.set(TOWER_SPRITE_ANCHOR.x, TOWER_SPRITE_ANCHOR.y);
      this.layer.addChild(sprite);
      this.sprites.set(key, sprite);
    }
    this.place(sprite, spec, tex, cx, cy);
    sprite.tint = tint;

    // Declared HERE, after the sprite is committed — never above the fog skip or the atlas bail.
    markTowerCover(members, bonds, newestTick);
    this.lastSeen.set(key, { x: cx, y: cy, spec });
    return true;
  }

  sync(world: World): void {
    if (world.creatureSpawners.size === 0 && world.defenders.size === 0 && this.sprites.size === 0) {
      return;
    }

    const live = new Set<string>();
    /*
     * ⛔⛔ S182 — **"STILL IN THE WORLD" AND "DREW THIS FRAME" ARE TWO DIFFERENT QUESTIONS, AND
     * CONFLATING THEM MADE LIVING BUILDINGS EXPLODE.**
     *
     * The ghost sweep below turns any key that is missing from the drawn set into a destruction
     * beat. Three of the skips in this loop are NOT destruction — the fog gate, the atlas-still-
     * loading bail, and a texture that could not be cut — so an enemy hub simply walking out of
     * your vision fell out of the drawn set and played its whole collapse, over and over, every
     * time your vision dropped. A player would read that as the tower dying repeatedly.
     *
     * `present` answers the only question the ghost sweep actually wants to ask: does this
     * structure still EXIST? It is filled before any presentation-level skip, so a building can be
     * undrawable for a hundred frames without ever being mistaken for a dead one.
     */
    const present = new Set<string>();
    for (const sp of world.creatureSpawners.values()) {
      const spec = rampSpecFor(sp.recipeId);
      if (spec === null) continue; // the towers with no ramp art — drawn by towerRenderer
      if (!world.primitives.has(sp.anchorPrimitiveId)) continue; // the anchor is gone — really dead
      const key = `s${Number(sp.id)}`;
      present.add(key);
      // ⭐ S188 demons.l5 — *"the pencil chewers and the pentagram become demonic"*: derived per frame.
      const tint = sp.recipeId === 'pentagram' && isDemonicSeat(world.players, sp.ownerPlayerId)
        ? DEMON_PENTAGRAM_TINT
        : 0xffffff;
      if (this.drawStructure(world, key, sp.anchorPrimitiveId, spec, tint)) live.add(key);
    }
    /*
     * ⭐⭐ S183 — **DEFENDERS ARE A DIFFERENT COLLECTION AND THEY ALWAYS WERE.** The laser turret
     * and HELGA live in `world.defenders`, never in `world.creatureSpawners`, so a `RAMP_SPECS`
     * row alone would never have drawn them — and no publish site in the tree could reach them,
     * which is why their shapes stayed fully visible under a building that was never drawn.
     *
     * ⚠ THE KEY PREFIX IS LOAD-BEARING. `DefenderId` and `SpawnerId` are independent counters, so
     * `d`/`s` is what stops turret 3 and hub 3 sharing a sprite, a cursor and a ghost.
     */
    for (const def of world.defenders.values()) {
      const spec = rampSpecFor(def.recipeId);
      if (spec === null) continue; // the stink tower, which has no ramp art
      if (!world.primitives.has(def.anchorPrimitiveId)) continue;
      const key = `d${Number(def.id)}`;
      present.add(key);
      if (this.drawStructure(world, key, def.anchorPrimitiveId, spec)) live.add(key);
    }

    /*
     * ⭐ A STRUCTURE THAT LEFT THE WORLD PLAYS ITS COLLAPSE OUT WHERE IT STOOD.
     *
     * ⛔ AND FOR THIS RAMP THAT IS NOT A NICETY, IT IS THE ONLY WAY THE LAST THIRD OF THE SHEET IS
     * EVER SEEN. Frames 17-24 are reachable only BELOW the self-destruct threshold, and crossing
     * that threshold is precisely what makes the host dispatch the blast, remove the spawner and
     * raze the star — all in the same tick. Without a ghost the hub would vanish at frame 16 and the
     * eight frames of collapse the owner commissioned would never draw. Same defect, same fix, as
     * S177 P4 on the Voltkin TV.
     *
     * ⚠ FIGHT-GATED, so scrapping your own tower in BUILD does not detonate it on screen. A
     * structure taken apart deliberately is not a destruction.
     */
    for (const key of this.sprites.keys()) {
      const at = this.lastSeen.get(key);
      // ⛔ The decision lives in `shouldStartGhost`, PURE and unit-tested — "undrawn" is not "dead".
      if (!shouldStartGhost({
        drawnThisFrame: live.has(key),
        stillInWorld: present.has(key),
        alreadyGhosting: this.ghosts.has(key),
        hasLastPosition: at !== undefined,
        inFight: world.matchPhase === 'FIGHT',
      })) continue;
      if (at === undefined) continue; // narrowing for tsc; `hasLastPosition` already decided it
      const cursor = this.cursors.get(key) ?? { frame: 1, sinceTick: world.tick };
      const toPlay = Math.max(0, at.spec.frames - cursor.frame);
      this.ghosts.set(key, {
        x: at.x,
        y: at.y,
        spec: at.spec,
        untilTick: world.tick + toPlay * at.spec.ticksPerFrame + RAMP_RUINS_HOLD_TICKS,
        cursor: { frame: cursor.frame, sinceTick: world.tick },
      });
    }

    for (const [key, ghost] of [...this.ghosts]) {
      const sprite = this.sprites.get(key);
      if (sprite === undefined || world.tick >= ghost.untilTick) {
        this.ghosts.delete(key);
        continue;
      }
      ghost.cursor = advanceRampCursor(ghost.cursor, ghost.spec.frames, world.tick, ghost.spec);
      const tex = this.frameTexture(ghost.spec, ghost.cursor.frame);
      if (tex === null) { this.ghosts.delete(key); continue; }
      this.place(sprite, ghost.spec, tex, ghost.x, ghost.y);
      live.add(key); // keep it off the reaper for one more frame
    }

    for (const [key, sprite] of this.sprites) {
      if (live.has(key)) continue;
      sprite.destroy();
      this.sprites.delete(key);
      this.cursors.delete(key);
      this.lastSeen.delete(key);
      this.ghosts.delete(key);
    }
  }

  /** Drop every sprite — title-return, the same contract as the other renderers. */
  clear(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.cursors.clear();
    this.ghosts.clear();
    this.lastSeen.clear();
  }
}
