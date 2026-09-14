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
 * ⚠ **SIX ROWS, THREE DAMAGE STATES — AND THE DISTINCTION IS THE WHOLE DESIGN.** His art is a
 * six-panel sequence and S176 P2 packs all six, but the engine's `TowerState` is STILL three-valued
 * (intact/damaged/destroyed) and widening it would still break `tsc` across both row tables. Only
 * those three are reachable from `towerStateForHp`: intact ← tv-1, damaged ← tv-3-burning (his own
 * "the state it wears most of the match"), destroyed ← tv-6-ruins. The spawn, critical and explosion
 * rows are BEATS this renderer sequences itself — frame-driven, the `TOWER_CRUMBLE_FRAMES` shape —
 * and are deliberately not damage states. ⛔ A future session must not "complete" the mapping by
 * adding them to `TowerState`; there is nothing to complete.
 */
import { Application, Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { World } from '../state/world.ts';
import type { BondId, PrimitiveId } from '../types.ts';
import { findAllVoltkinChains } from '../state/godlyRecipes/voltkin.ts';
import { isConcealed } from './concealment.ts';
import { markTowerCover } from './towerCover.ts';
import { TOWER_SPRITE_ANCHOR, towerHpFrac, towerStateForHp } from './towerFrames.ts';

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

/** How close a SPAWNING Voltkin must be to a TV for that TV to be the one he is coming out of. */
const VOLTKIN_EMERGE_MATCH_PX = 160;

/** Six rows, and only three of them are `TowerState`s — see TV_ROWS. */
interface StateTextures {
  readonly intact: Texture;
  readonly spawning: Texture;
  readonly damaged: Texture;
  readonly critical: Texture;
  readonly explosion: Texture;
  readonly destroyed: Texture;
}
type TvRow = keyof StateTextures;
interface Manifest { cellW: number; cellH: number; states: Partial<Record<TvRow, { row: number }>> }

/**
 * Fallback row order, and the CONTRACT — the shipped manifest is the authority.
 *
 * ⭐ `spawning` LIVES HERE AND NOT IN `TowerState`, DELIBERATELY. The engine's damage union is three
 * valued and widening it breaks `tsc` across both shared row tables and forces a decision about rows
 * the tier-9 sheets do not have. The emergence is not a damage state anyway — it is a beat the TV
 * holds while the Voltkin climbs out of it — so this renderer owns its own row map and maps the
 * three DAMAGE rows through `towerStateForHp` exactly as before.
 */
const TV_ROWS: Readonly<Record<TvRow, number>> = {
  intact: 0, spawning: 1, damaged: 2, critical: 3, explosion: 4, destroyed: 5,
};

/*
 * ⭐⭐ S176 P2 — THE DESTRUCTION BEAT, AND THE EMERGENCE THAT WAS ONE FROZEN PICTURE.
 *
 * Owner, S176, with a screenshot: *"you can see the TV broken in him kind of coming out. but it's
 * stuck in that image. Like, it's not like it's moving anywhere or generating the whole video loop
 * of him coming out … you should, like, do the whole thing, and then he comes out."*
 *
 * ⛔ HE IS RIGHT, AND IT WAS NOT A STUCK FRAME — IT WAS THE ONLY FRAME. S175 packed `spawning` as a
 * single still at `framesPerState: 1` and held it for the whole 60-tick spawn window. Nothing was
 * broken; there was simply no sequence to play. Both beats below are therefore SEQUENCES, driven by
 * frames rather than by damage states, which is the shape S175 named (`TOWER_CRUMBLE_FRAMES`) and
 * deferred.
 *
 * ⭐⭐ AND THE OWNER'S OTHER RULING IS ALREADY SATISFIED BY THE ART, WHICH IS WHY NOTHING CHANGES TO
 * HONOUR IT. He said: *"then he waits by his TV that's broken, but it's not, like, you know, damaged
 * or anything. You need to be very consistent about this."* `tv-1-intact` IS a TV with a blown-out,
 * star-cracked screen on an undamaged chassis — broken, not damaged. So the resting texture after he
 * emerges is correct as it stands, and the damage rows stay driven by hp alone. ⚠ DO NOT "fix" this
 * by pointing the resting state at `spawning`: that row has the Voltkin's body IN it, so a TV he has
 * already left would still be drawing him climbing out of itself.
 */

/** Wind-up before the burst. The TV sits there, THEN he comes through it. */
const TV_EMERGE_WINDUP_TICKS = 12;
/** Destruction beat: ticks on `critical`, then on `explosion`, then ruins forever. */
const TV_CRITICAL_TICKS = 18;
const TV_EXPLOSION_TICKS = 18;

/**
 * PURE — the emergence beat. Exported for test.
 *
 * ⚠ Keyed off the Voltkin's OWN `ticksInState`, which is a REQUIRED serialized wire field, so every
 * peer plays the same beat on the same tick with nothing added to the snapshot.
 */
export function tvEmergenceRow(ticksEmerging: number): 'intact' | 'spawning' {
  return ticksEmerging < TV_EMERGE_WINDUP_TICKS ? 'intact' : 'spawning';
}

/**
 * PURE — the destruction beat. Exported for test.
 *
 * ⚠ `ticksSinceDestroyed` is CLIENT-LOCAL (the tick this peer first saw the chain read destroyed),
 * not a synced field — deliberately, and it is the one place this renderer does not derive from the
 * wire. A tower's death is a one-shot cosmetic; two peers being a frame apart on an explosion is
 * invisible, whereas putting it on the wire would cost a PROTOCOL bump for a puff of smoke.
 */
export function tvDestructionRow(ticksSinceDestroyed: number): 'critical' | 'explosion' | 'destroyed' {
  if (ticksSinceDestroyed < TV_CRITICAL_TICKS) return 'critical';
  if (ticksSinceDestroyed < TV_CRITICAL_TICKS + TV_EXPLOSION_TICKS) return 'explosion';
  return 'destroyed';
}

/**
 * Is a Voltkin currently climbing out of the TV standing at (cx, cy)?
 *
 * ⚠ MATCHED BY POSITION, not by an id, because the chain and the creature are never linked in state:
 * `currentCinematicEvent` is cleared on GODLY_COMPLETE and the creature carries no chain reference.
 * The spawn happens AT the chain centroid (`pendingCreatureSpawn` uses `event.targetPos`), so a
 * generous radius around the sprite is exact in practice and degrades to 'no emergence frame' rather
 * than to a wrong one.
 */
function voltkinEmergingTicksAt(world: World, cx: number, cy: number): number {
  const rSq = VOLTKIN_EMERGE_MATCH_PX * VOLTKIN_EMERGE_MATCH_PX;
  // ⚠ TOTAL ORDER, not Map order: with two Voltkins inside one radius, `Map` iteration would decide
  // which one's clock drives the TV, and insertion order is not the same on both peers.
  let best = -1;
  let bestId = -1;
  for (const c of world.creatures.values()) {
    if (c.type !== 'voltkin' || c.state !== 'SPAWNING') continue;
    const dx = c.pos.x - cx;
    const dy = c.pos.y - cy;
    if (dx * dx + dy * dy > rSq) continue;
    const id = Number(c.id);
    if (best < 0 || id < bestId) { best = c.ticksInState; bestId = id; }
  }
  return best;
}

export class VoltkinTowerRenderer {
  readonly layer = new Container();
  private atlas: StateTextures | null = null;
  private loadStarted = false;
  /** Keyed by the chain's stable identity (its sorted member ids). */
  private readonly sprites = new Map<string, Sprite>();
  /** S176 P2 — world.tick at which THIS peer first saw a chain read destroyed. Client-local; see
   *  `tvDestructionRow` for why that is deliberate and costs no protocol bump. */
  private readonly destroyedAt = new Map<string, number>();

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
        const cut = (state: TvRow): Texture => new Texture({
          source: sheet.source,
          frame: new Rectangle(
            0, (manifest.states[state]?.row ?? TV_ROWS[state]) * manifest.cellH,
            manifest.cellW, manifest.cellH,
          ),
        });
        this.atlas = {
          intact: cut('intact'), spawning: cut('spawning'),
          damaged: cut('damaged'), critical: cut('critical'),
          explosion: cut('explosion'), destroyed: cut('destroyed'),
        };
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
      /*
       * ⭐⭐ S175 P4b — **THE EMERGENCE, DRIVEN OFF THE VOLTKIN'S OWN SPAWNING STATE.**
       *
       * Owner: *"it's gonna be like the tower is being built … kind of like when bosses come out.
       * But even cooler."* So while he is climbing out, the TV wears his burst-through-the-screen
       * panel, and the moment he is on the board it returns to intact.
       *
       * ⛔ `creature.state` IS THE RIGHT CLOCK AND `activeCinematicPlayerId` IS NOT. The latter is
       * host-local — it appears nowhere in `save.ts` — so a joiner would never see the emergence at
       * all. `Creature.state` and `pos` are REQUIRED, fully-serialized wire fields, so every peer
       * switches to the spawn frame on the same tick, for free. No new state, no bump.
       */
      const emergingTicks = voltkinEmergingTicksAt(world, cx, cy);
      const hpState = towerStateForHp(towerHpFrac(chain, (id) => world.primitives.get(id)?.hp));
      /*
       * Remember the tick this peer FIRST saw the chain dead, so the beat runs from there. Recorded
       * before it is read so a chain that is already destroyed on the frame it appears still plays
       * the sequence rather than snapping to ruins.
       */
      if (hpState === 'destroyed') {
        if (!this.destroyedAt.has(key)) this.destroyedAt.set(key, world.tick);
      } else {
        this.destroyedAt.delete(key);
      }
      let row: TvRow;
      if (emergingTicks >= 0) {
        row = tvEmergenceRow(emergingTicks);
      } else if (hpState === 'destroyed') {
        row = tvDestructionRow(world.tick - (this.destroyedAt.get(key) ?? world.tick));
      } else {
        row = hpState;
      }
      sprite.texture = this.atlas[row];
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
      this.destroyedAt.delete(key);
    }
  }

  /** Drop every sprite — title-return, same contract as the other renderers. */
  clear(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.destroyedAt.clear();
  }
}
