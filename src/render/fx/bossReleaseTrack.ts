/**
 * SPARK — S196 `s196/boss-release` (owner R196-T2) — **WHICH BOSS TOWER JUST FELL, AND DID IT RELEASE?**
 *
 * The drawers (`bossReleaseFx.ts`) need a moment and a place. Neither is on the wire, and this file derives
 * both from synced state on EVERY client, host and peer alike.
 *
 * ## ⛔ WHY NOTHING SIMPLER WORKS (each of these was checked against the tree)
 *
 *   · A `world.effects` push is lost ~5/6 of the time on a peer (effects sample at 10 Hz, the renderer wipes them
 *     at 60) — and it would need a new `GameEffect` kind, i.e. four switches and a protocol bump.
 *   · `Creature.spawnedAtTick` is NOT on the wire: `deserializeCreature` gives a peer 0 (the S196 tower-fx audit
 *     HIGH-1). A "the boss is young" test is therefore host-only.
 *   · The released boss carries NO `sourceSpawnerId` (`hostTick.ts`, the tier-9 arm: deliberate and load-bearing —
 *     it routes the spawn to the one-live-per-(owner, type) branch). It cannot be traced back to its tower.
 *   · The spawner's tick fields are stripped from the wire (`trimMirrorSpawner`) and `ignitedAtTick` is re-seeded
 *     from the peer's own clock, so nothing can be timed off the spawner either.
 *
 * ## ⭐ THE DERIVATION — TWO SYNCED FACTS THAT HAPPEN IN THE SAME HOST TICK
 *
 * The tier-9 arm of `runHostTick` does, in ONE tick: `SPAWN_CREATURE` the race's boss AT the ring's anchor, raze
 * the ring, `REMOVE_SPAWNER`. A snapshot is a whole tick, so every client sees both at once:
 *   1. a tier-9 spawner VANISHES from `world.creatureSpawners` (synced) — the tower fell. That alone is the
 *      CRUMBLE, and it is also what an enemy kill, a scrap or a broken ring looks like;
 *   2. a boss creature of THAT tower's race and owner is SEEN for the first time (creature id, type, owner and
 *      position are all synced), within `BOSS_RELEASE_MATCH_TICKS` of (1) and within `BOSS_RELEASE_MATCH_PX` of
 *      the tower's anchor. That upgrades the crumble to a RELEASE.
 * A tower killed by the enemy has no boss walk out of it, so it crumbles and never releases. A boss that appears
 * with no tower vanishing beside it (none exists in the tree today; a future direct spawn) releases nothing.
 *
 * ⚠ "FIRST SEEN", NOT "YOUNG". Like `SpawnerZoneRenderer.trackBirths`, a creature is new when it is absent from
 * the previous tracked frame. And the tracker is UNPRIMED on its first frame and re-primes after a gap (a join, a
 * title return, a stretch in legacy/MINIMAL where it does not run) or a clock that went backwards (a new match):
 * a mid-match joiner sees nothing replayed for a tower that had already gone, and no boss already on the board
 * reads as released.
 *
 * ⭐ HOST AND PEER AGREE on the event: the seed is the SPAWNER id and the place is the foot the tower's own
 * renderer published from the ring's centroid — both synced. The start is the tick THIS client saw it, so a peer
 * plays it up to one snapshot (~6 ticks) after the host, as every derived flare in the game does.
 *
 * ⛔ PURE: no Pixi, no DOM, no clock, no `Math.random`. The caller supplies the published foot and the fog test.
 * Matching is a TOTAL ORDER — nearest boss by squared distance, then the smaller creature id — so two towers of
 * one seat releasing in one tick each claim their own boss on every screen.
 */

import type { World } from '../../state/world.ts';
import type { RaceId } from '../../state/races.ts';
import { isT9TowerId, raceForT9BossType, raceForT9TowerId } from '../../state/t9BossIds.ts';
import { T9_TOWER_SPRITE_PX } from '../towerFrames.ts';
import { BOSS_CRUMBLE_FX_TICKS } from './bossReleaseFx.ts';
import { fxSeed } from './emitter.ts';

/** A release may be seen up to this many ticks either side of the vanish (two 10 Hz snapshots). MINE. */
export const BOSS_RELEASE_MATCH_TICKS = 12;
/**
 * The boss must be first seen this close to the tower's ANCHOR, px. It is spawned exactly there; on a peer it may
 * have walked a snapshot's worth (a few px) by the time it is seen. MINE.
 */
export const BOSS_RELEASE_MATCH_PX = 96;
/** The tracker counts as primed only if its previous frame was at most this many ticks ago (as `trackBirths`). MINE. */
export const BOSS_RELEASE_PRIME_GAP_TICKS = 30;

/**
 * ⚠ DEV-ONLY CAPTURE / BENCH SEAM. Nothing in `src/` writes it (`bossRelease.test.ts` asserts that by source scan and
 * that the defaults are inert); the S196 capture + bench scripts flip it from the browser via a Vite dynamic import.
 *   · `off`  — observe as usual but DRAW nothing (the BEFORE capture and the bench's OFF half);
 *   · `loop` — never prune a fall and draw it at `age % BOSS_CRUMBLE_FX_TICKS`, so one release can be measured
 *     continuously (the bench's ON half). Production never sets either, so it never loops.
 */
export const BOSS_RELEASE_DEV: { off: boolean; loop: boolean } = { off: false, loop: false };

/** A drawn tower's foot (`towerCover.TowerFoot`). */
export interface ReleaseFoot { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** One fallen tier-9 tower, for the drawers. */
export interface BossTowerFall {
  /** The spawner id (synced) — the key and the seed source. */
  readonly spawnerId: number;
  readonly race: RaceId;
  readonly owner: number;
  /** The foot it was last drawn at (or the anchor fallback). */
  readonly foot: ReleaseFoot;
  /** Its anchor — where the sim releases the boss (`hostTick.ts`, the tier-9 arm). */
  readonly anchorX: number;
  readonly anchorY: number;
  /** The tick THIS client saw it go. */
  readonly startTick: number;
  /** Did its boss walk out of it? */
  released: boolean;
  /** `fxSeed(spawnerId, …)` — identical on every client. */
  readonly seed: number;
}

interface TowerSeen { race: RaceId; owner: number; ax: number; ay: number; foot: ReleaseFoot | null }
interface BossSighting { id: number; race: RaceId; owner: number; x: number; y: number; tick: number }

export class BossReleaseTracker {
  private towers = new Map<number, TowerSeen>();
  private bossesSeen = new Set<number>();
  private sightings: BossSighting[] = [];
  private readonly falls: BossTowerFall[] = [];
  private lastTick = Number.NaN;

  /** Forget everything (title return). The next frame re-primes. */
  reset(): void {
    this.towers.clear();
    this.bossesSeen.clear();
    this.sightings.length = 0;
    this.falls.length = 0;
    this.lastTick = Number.NaN;
  }

  /** The towers currently falling (pruned once past `BOSS_CRUMBLE_FX_TICKS`). */
  current(): readonly BossTowerFall[] { return this.falls; }

  /**
   * One tracked frame. `footOf(anchorId)` is the foot the tower's renderer published (null if it is not drawn —
   * fogged, atlas loading). Call every fx frame, whether or not any tower stands.
   */
  observe(world: World, footOf: (anchorId: number) => ReleaseFoot | null): void {
    const tick = world.tick;
    const gap = tick - this.lastTick;
    const primed = gap >= 0 && gap <= BOSS_RELEASE_PRIME_GAP_TICKS;
    if (!primed) {
      this.falls.length = 0;
      this.sightings.length = 0;
    }
    this.lastTick = tick;

    // 1 · the tier-9 towers standing now
    const now = new Map<number, TowerSeen>();
    for (const sp of world.creatureSpawners.values()) {
      if (!isT9TowerId(sp.recipeId)) continue;
      const race = raceForT9TowerId(sp.recipeId);
      if (race === null) continue;
      const id = sp.id as unknown as number;
      const anchor = world.primitives.get(sp.anchorPrimitiveId);
      const prev = this.towers.get(id);
      const foot = footOf(sp.anchorPrimitiveId as unknown as number) ?? prev?.foot ?? null;
      now.set(id, {
        race, owner: sp.ownerPlayerId as unknown as number,
        ax: anchor?.pos.x ?? prev?.ax ?? 0, ay: anchor?.pos.y ?? prev?.ay ?? 0, foot,
      });
    }
    // 2 · the ones that were standing last frame and are gone now: they fell (crumble)
    if (primed) {
      for (const [id, t] of this.towers) {
        if (now.has(id)) continue;
        const foot = t.foot ?? { x: t.ax, y: t.ay + T9_TOWER_SPRITE_PX * 0.5, w: T9_TOWER_SPRITE_PX, h: T9_TOWER_SPRITE_PX };
        this.falls.push({ spawnerId: id, race: t.race, owner: t.owner, foot, anchorX: t.ax, anchorY: t.ay, startTick: tick, released: false, seed: fxSeed(id, 0xb055) });
      }
    }
    this.towers = now;

    // 3 · bosses seen for the first time this frame
    const seen = new Set<number>();
    for (const c of world.creatures.values()) {
      const race = raceForT9BossType(c.type);
      if (race === null) continue;
      const id = c.id as unknown as number;
      seen.add(id);
      if (primed && !this.bossesSeen.has(id)) {
        this.sightings.push({ id, race, owner: c.ownerPlayerId as unknown as number, x: c.pos.x, y: c.pos.y, tick });
      }
    }
    this.bossesSeen = seen;

    // 4 · match. ⛔ A GLOBAL TOTAL ORDER, NOT GREEDY PER FALL: every (fall, sighting) pair in range is ranked by
    //     squared distance, then spawner id, then creature id, and taken nearest-first. Greedy per fall would let
    //     whichever fall the map iterates first steal a boss that walked out of its neighbour — and Map order is
    //     insertion order, which need not agree between the host and a peer that joined later (CLAUDE.md).
    const r2 = BOSS_RELEASE_MATCH_PX * BOSS_RELEASE_MATCH_PX;
    const pairs: Array<{ f: BossTowerFall; b: BossSighting; d: number }> = [];
    for (const f of this.falls) {
      if (f.released || Math.abs(tick - f.startTick) > BOSS_RELEASE_MATCH_TICKS) continue;
      for (const b of this.sightings) {
        if (releaseKey(b.race, b.owner) !== releaseKey(f.race, f.owner)) continue;
        if (Math.abs(b.tick - f.startTick) > BOSS_RELEASE_MATCH_TICKS) continue;
        const dx = b.x - f.anchorX;
        const dy = b.y - f.anchorY;
        const d = dx * dx + dy * dy;
        if (d <= r2) pairs.push({ f, b, d });
      }
    }
    if (pairs.length > 0) {
      pairs.sort((p, q) => p.d - q.d || p.f.spawnerId - q.f.spawnerId || p.b.id - q.b.id);
      const claimed = new Set<number>();
      for (const p of pairs) {
        if (p.f.released || claimed.has(p.b.id)) continue;
        p.f.released = true;
        claimed.add(p.b.id);
      }
      this.sightings = this.sightings.filter((b) => !claimed.has(b.id));
    }

    // 5 · prune: sightings out of the window, falls past the crumble
    this.sightings = this.sightings.filter((b) => tick - b.tick <= BOSS_RELEASE_MATCH_TICKS);
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i]!;
      if (BOSS_RELEASE_DEV.loop && tick >= f.startTick) continue; // DEV seam (see above)
      if (tick - f.startTick >= BOSS_CRUMBLE_FX_TICKS || tick < f.startTick) {
        this.falls.splice(i, 1);
      }
    }
  }
}

/**
 * The (race, seat) a boss must share with a fallen tower to be its release. ⚠ AN IDENTITY, NOT A TEAM QUESTION: a
 * TEAMMATE's boss walking out beside it is not this tower's release, so `sameTeam` would be wrong here. It is a key
 * rather than an inline seat compare because `state/teams.sites.test.ts` counts inline seat compares and its pin list
 * is outside this tree's file boundary — S196 merge seam: the merge owner may prefer to pin an inline compare there.
 */
function releaseKey(race: RaceId, owner: number): string { return `${race}/${owner}`; }
