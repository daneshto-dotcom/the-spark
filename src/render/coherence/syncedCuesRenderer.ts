/**
 * SPARK — S195 T19 COHERENCE · **TWO CUES DERIVED PER FRAME FROM SYNCED STATE, ONE SMALL WATCHER.**
 *
 * Both of these are the kind of one-shot a session reaches for `world.effects` to carry — and a one-shot
 * effect push is lost ~5/6 of the time on a joiner (`CLAUDE.md` "Protocol version": effects are sampled at
 * 10 Hz, the renderer wipes them at 60). So, as `gathererRenderer.drawCastleShot` and `unitDeathRenderer`
 * do, each cue is RE-DERIVED here from state every peer already holds. Nothing is written. No bump.
 *
 *   1. **The castle gun's fire sound** (owner §B-6 "missing sounds" → the `castleGunFire` SLOT, silent until
 *      the owner drops the file in — `audioManager.SFX_SLOTS`). `castleGunsTick` is a pure schedule of
 *      `(seat, tick)`; `ticksSinceCastleShot` re-derives it, and EVERY GATE HERE MIRRORS ONE IN
 *      `castleGunsTick` (FIGHT only, a fallen castle does not shoot, a target inside `CASTLE_ATTACK_RANGE`
 *      through the same total-ordered `findNearestEnemyCreatureFrom`). A shot the gun did not fire makes no
 *      sound. Once per shot: the shot's tick is remembered per seat, so a frame that repeats a tick (a slow
 *      frame, a joiner's snapshot step-back) cannot double-fire.
 *
 *   2. **The "repaired" sparkle** (owner B-3, RULED). A FIX is a gatherer job in the synced `world.repairJobs`
 *      (canon §8, R191-B); it finishes when `restoreFromDelivered` re-welds the tower and the job leaves the
 *      array — the SAME TICK, in the same snapshot. The watcher keeps, per job, how many connectors stand among
 *      its members; a job that vanishes while that count ROSE finished (a cancelled job — shapes lost, seat
 *      eliminated — leaves the count where it was). The beat (`repairedSparkleFx`) plays at the members'
 *      centroid in the seat colour, fogged like the tower (owner S170), aged by `world.tick`.
 *
 * ⚠ A new `World` object (a new match) or any non-PLAYING state drops every watch — the `towerHealthHold`
 * rule for the same reason (a joiner's tick steps back routinely, so the clock is never the boundary).
 */
import type { World } from '../../state/world.ts';
import type { PlayerId, PrimitiveId } from '../../types.ts';
import { CASTLE_ATTACK_RANGE } from '../../constants.ts';
import { ticksSinceCastleShot } from '../../state/castleGuns.ts';
import { findNearestEnemyCreatureFrom } from '../../state/creatures/creatureAI.ts';
import { castleAnchor } from '../../state/gatherers/gatherer.ts';
import { playSlotSFX } from '../audioManager.ts';
import { isConcealed } from '../concealment.ts';
import { fxSeed } from '../fx/emitter.ts';
import { fxActive, fxTop } from '../fx/fxState.ts';
import { CASTLE_SHOT_VFX_TICKS } from '../raceMotifs.ts';
import { REPAIRED_SPARKLE_TICKS, repairedSparkleFx } from './repairedSparkleFx.ts';

/** The seat colour when the owner is unknown (a left player). Same neutral `unitDeathRenderer` falls back to. */
const NEUTRAL = 0xc8c8d0;

interface WatchedJob {
  readonly seat: PlayerId;
  readonly memberIds: readonly PrimitiveId[];
  /** Connectors standing among the members at the last frame. */
  readonly bonds: number;
}

interface Sparkle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly bornTick: number;
  readonly seed: number;
  readonly tint: number;
}

/** Connectors whose BOTH ends are members — the count a finished FIX raises. */
export function bondsAmong(world: World, memberIds: readonly PrimitiveId[]): number {
  const members = new Set<PrimitiveId>(memberIds);
  let n = 0;
  for (const id of memberIds) {
    const p = world.primitives.get(id);
    if (p === undefined) continue;
    for (const bid of p.bonds) {
      const b = world.bonds.get(bid);
      if (b === undefined) continue;
      const other = b.aId === id ? b.bId : b.aId;
      if (members.has(other) && (other as unknown as number) > (id as unknown as number)) n++; // each bond once
    }
  }
  return n;
}

export class SyncedCuesRenderer {
  private readonly jobs = new Map<number, WatchedJob>();
  private readonly sparkles: Sparkle[] = [];
  /** Per seat: the tick of the last castle shot this watcher sounded. */
  private readonly lastShotTick = new Map<number, number>();
  private lastWorld: World | null = null;

  sync(world: World): void {
    if (world !== this.lastWorld) { this.clear(); this.lastWorld = world; }
    if (world.gameState !== 'PLAYING') { this.clear(); this.lastWorld = world; return; }
    this.syncCastleGuns(world);
    this.syncRepaired(world);
    this.drawSparkles(world);
  }

  private syncCastleGuns(world: World): void {
    if (world.matchPhase !== 'FIGHT') return;
    const seats = [...world.players.keys()].sort((a, b) => (a as unknown as number) - (b as unknown as number));
    for (const pid of seats) {
      const player = world.players.get(pid)!;
      if (player.castleHp <= 0) continue; // a fallen castle does not shoot (`castleGunsTick`)
      const seat = pid as unknown as number;
      const age = ticksSinceCastleShot(seat, world.tick);
      if (age >= CASTLE_SHOT_VFX_TICKS) continue; // too old to be "this frame's" shot
      const shotTick = world.tick - age;
      if (this.lastShotTick.get(seat) === shotTick) continue; // already sounded
      this.lastShotTick.set(seat, shotTick);
      const from = castleAnchor(seat, world.layout);
      const target = findNearestEnemyCreatureFrom(world, from, pid, CASTLE_ATTACK_RANGE * CASTLE_ATTACK_RANGE);
      if (target === null) continue; // the gun found nothing — it did not fire
      void playSlotSFX('castleGunFire', { x: from.x, y: from.y });
    }
  }

  private syncRepaired(world: World): void {
    const seen = new Set<number>();
    for (const job of world.repairJobs) {
      seen.add(job.id);
      this.jobs.set(job.id, { seat: job.seat, memberIds: job.memberIds, bonds: bondsAmong(world, job.memberIds) });
    }
    if (this.jobs.size === seen.size) return;
    // Departed jobs in ascending id — one total order on every screen.
    const gone = [...this.jobs.keys()].filter((id) => !seen.has(id)).sort((a, b) => a - b);
    for (const id of gone) {
      const j = this.jobs.get(id)!;
      this.jobs.delete(id);
      if (bondsAmong(world, j.memberIds) <= j.bonds) continue; // cancelled (or nothing re-welded) — no beat
      let sx = 0, sy = 0, n = 0;
      const pts: Array<{ x: number; y: number; r: number }> = [];
      for (const pid of j.memberIds) {
        const p = world.primitives.get(pid);
        if (p === undefined) continue;
        pts.push({ x: p.pos.x, y: p.pos.y, r: p.radius });
        sx += p.pos.x; sy += p.pos.y; n++;
      }
      if (n === 0) continue;
      const cx = sx / n, cy = sy / n;
      if (isConcealed(cx, cy, j.seat)) continue; // owner S170 — nothing shows inside the fog
      let radius = 10;
      for (const p of pts) radius = Math.max(radius, Math.hypot(p.x - cx, p.y - cy) + p.r);
      this.sparkles.push({
        x: cx, y: cy, radius, bornTick: world.tick, seed: fxSeed(id, 0x5e9a),
        tint: world.players.get(j.seat)?.color ?? NEUTRAL,
      });
    }
  }

  private drawSparkles(world: World): void {
    const draw = fxActive();
    const top = fxTop();
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i]!;
      const age = world.tick - s.bornTick;
      if (age < 0 || age >= REPAIRED_SPARKLE_TICKS) { this.sparkles.splice(i, 1); continue; }
      if (draw) repairedSparkleFx(top, s.seed, s.x, s.y, s.radius, s.tint, age / REPAIRED_SPARKLE_TICKS);
    }
  }

  /** Test + bench seams. */
  sparkleCount(): number { return this.sparkles.length; }
  watchedJobCount(): number { return this.jobs.size; }

  /** Title return / new match: forget every watch and every beat in flight. */
  clear(): void {
    this.jobs.clear();
    this.sparkles.length = 0;
    this.lastShotTick.clear();
  }
}
