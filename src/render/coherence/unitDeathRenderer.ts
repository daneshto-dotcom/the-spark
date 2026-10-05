/**
 * SPARK — S194 T9 COHERENCE · the watcher that gives EVERY unit kill the shared death beat (`fx/unitDeathFx.ts`).
 *
 * ⭐ ONE WATCHER FOR ALL TWENTY-EIGHT CREATURE TYPES, NOT A FOURTH COPY IN EACH RENDERER. The three creature
 * renderers split `world.creatures` between them (`creatureRenderer` the Voltkin, `chewerRenderer` the
 * chewers, `goblinRenderer` everything else), and each grew its own vanish watcher with its own idea of what
 * a death is. This one walks the whole map and asks the SHARED question (`classifyCreatureDeparture`), so a
 * goblin, a boss and a Voltkin dying on the same tick are judged by the same rule and get the same beat.
 *
 * Derived per frame from synced state — a creature leaving `world.creatures` is what every peer sees — so it
 * draws on the host, the joiner and a replay alike. Nothing is written to the world. No protocol bump.
 *
 * ⚠ Ages run on `world.tick`, the same clock `effectsRenderer` ages every one-shot effect by, so two players
 * watch the same beat. Under `?fx=legacy` (or before the fx runtime installs) nothing is drawn: the old look
 * of a goblin's death WAS nothing, and legacy means the old look.
 */

import type { CreatureId, PlayerId } from '../../types.ts';
import type { CreatureType } from '../../state/creatures/creature.ts';
import { playSlotSFX } from '../audioManager.ts';
import type { World } from '../../state/world.ts';
import { creatureSpriteScaleMul } from '../towerFrames.ts';
import { fxActive, fxTop, fxTopShade } from '../fx/fxState.ts';
import { fxSeed } from '../fx/emitter.ts';
import { UNIT_DEATH_LIFE_TICKS, UNIT_FAMILY, unitDeathFx, type UnitFamily } from '../fx/unitDeathFx.ts';
import { CreatureWatchEpoch, classifyCreatureDeparture, departedInIdOrder, type CreatureLastSeen } from './unitDeparture.ts';

/**
 * Hard cap on beats alive at once — a wave-5 wipe of 120 units must not become 120 × 16 sprites. ⚠ MINE, and
 * MEASURED: at 24 (with 40 hit pops) a forced 20-kills-a-second fight cost +0.43 ms a frame; 12 keeps the
 * worst case inside the +0.3 ms budget (S194 T9 bench, `S194_PROGRESS_coherence.md`).
 */
export const UNIT_DEATH_MAX_LIVE = 12;

/**
 * ⭐ S195 T19 (#4, merge-owner call) — the `unitFalls` SOUND SLOT plays under every kill of a unit that has
 * NO death sound of its own. These three families keep theirs (the chewer's goo splat, the Voltkin's zap burst,
 * the pants — per the T19 brief's roster) and are the ONLY exclusions; everyone else gets the slot, silent
 * until the owner drops the file in (`audioManager.SFX_SLOTS`).
 */
export const UNIT_FALLS_OWN_SOUND: ReadonlySet<CreatureType> = new Set<CreatureType>(['chewer', 'voltkin', 'endgameMonster', 'megaPants']);
/** ⚠ MINE — death sounds started per frame, at most: a wave wipe is one thud, not a drum roll (`MAX_GNAW_VOICES` idiom). */
export const UNIT_FALLS_MAX_PER_FRAME = 3;

/** The seat colour when the owner is unknown (a left player). Same neutral `spawnerZoneRenderer` falls back to. */
const NEUTRAL = 0xc8c8d0;

interface Watched extends CreatureLastSeen {
  readonly family: UnitFamily;
  readonly scale: number;
}

interface Beat {
  readonly x: number;
  readonly y: number;
  readonly bornTick: number;
  readonly seed: number;
  readonly family: UnitFamily;
  readonly scale: number;
  readonly color: number;
}

export class UnitDeathRenderer {
  private readonly watched = new Map<CreatureId, Watched>();
  private readonly beats: Beat[] = [];
  private readonly epoch = new CreatureWatchEpoch();

  sync(world: World): void {
    if (this.epoch.moved(world)) {
      this.watched.clear();
      this.beats.length = 0;
    }

    for (const c of world.creatures.values()) {
      this.watched.set(c.id, {
        state: c.state, type: c.type, despawnAtTick: c.despawnAtTick, x: c.pos.x, y: c.pos.y, owner: c.ownerPlayerId,
        family: UNIT_FAMILY[c.type], scale: creatureSpriteScaleMul(c.type),
      });
    }
    // ⭐ S194 T9 audit — ascending id BEFORE the cap, so which beats survive a wipe is a total order.
    let fallsThisFrame = 0;
    for (const id of departedInIdOrder(this.watched, (k) => world.creatures.has(k))) {
      const last = this.watched.get(id)!;
      this.watched.delete(id);
      if (classifyCreatureDeparture(world, last) !== 'killed') continue;
      if (!UNIT_FALLS_OWN_SOUND.has(last.type) && fallsThisFrame < UNIT_FALLS_MAX_PER_FRAME) {
        fallsThisFrame++;
        void playSlotSFX('unitFalls', { x: last.x, y: last.y });
      }
      this.beats.push({
        x: last.x, y: last.y, bornTick: world.tick, seed: fxSeed(id as unknown as number, 0xdea7),
        family: last.family, scale: last.scale, color: seatColor(world, last.owner),
      });
      if (this.beats.length > UNIT_DEATH_MAX_LIVE) this.beats.shift(); // oldest first
    }

    const draw = fxActive();
    const top = fxTop();
    const shade = fxTopShade();
    for (let i = this.beats.length - 1; i >= 0; i--) {
      const b = this.beats[i]!;
      const age = world.tick - b.bornTick;
      if (age < 0 || age >= UNIT_DEATH_LIFE_TICKS) {
        this.beats.splice(i, 1);
        continue;
      }
      if (draw) unitDeathFx(top, shade, b.seed, b.family, b.x, b.y, b.scale, b.color, age / UNIT_DEATH_LIFE_TICKS);
    }
  }

  /** Beats alive now (test + bench seam). */
  liveCount(): number {
    return this.beats.length;
  }

  /** Title return: forget every unit and every beat, so an army's deaths never replay over the title. */
  clear(): void {
    this.watched.clear();
    this.beats.length = 0;
  }
}

function seatColor(world: World, owner: PlayerId): number {
  return world.players.get(owner)?.color ?? NEUTRAL;
}
