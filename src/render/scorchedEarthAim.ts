/**
 * SPARK — S191 (owner item 1b) — **SCORCHED EARTH: THE AIM THAT IS FOLLOWING THE CURSOR, if any.**
 *
 * > *"a scorched earth ability button that you click on and then you can click on any quadrant of the
 * > enemy there's going to be like a cool preview when you mouse over it like shows you it turning
 * > red"* — owner, S191
 *
 * POWER OF RA's aim context (`raAimPreview.ts`), for the same reasons and in the same shape: between
 * the square press and the zone click the local player is AIMING, which is one player's view state —
 * never on the wire, never hashed. WRITTEN by the input layer (`controls.ts`: the press, every move,
 * the cast, the cancel) and READ by the square (`footerBand.ts`) and by the backdrop, which turns the
 * hovered zone red (`zoneBackgroundRenderer.ts`). Pixi-free: `controls.ts` must not import Pixi.
 *
 * ⭐ THE HOVERED ZONE IS A SEAT, AND IT IS ONLY EVER ONE THE HOST WOULD TAKE. `zoneSeatAt` maps the
 * cursor through the SAME `zoneOf` / `zoneOwner` geometry the burn uses, then asks the reducer's own
 * target predicate (`scorchedEarthTargetZone`). So the zone that lights under the cursor is exactly the
 * zone the click will send, and the quarry (nobody's) or a fallen seat's land never lights at all.
 */

import type { PlayerId } from '../types.ts';
import type { World } from '../state/worldTypes.ts';
import { zoneOf, zoneOwner } from '../state/zones.ts';
import {
  SCORCHED_EARTH_CHARGES,
  scorchedEarthCastRefusal,
  scorchedEarthCastsInWave,
  scorchedEarthTargetZone,
  type ScorchedEarthRefusal,
} from '../state/racial/scorchedEarthRules.ts';
import { RA_PENDING_TIMEOUT_TICKS } from './raAimPreview.ts';

export interface ScorchedEarthAim {
  /** The seat aiming (the caster). */
  readonly seat: PlayerId;
  /** The raw cursor, canvas space. */
  readonly x: number;
  readonly y: number;
}

let aim: ScorchedEarthAim | null = null;

/** `null` = not aiming. Written only by the input layer (and dropped by the square when refused). */
export function setScorchedEarthAim(a: ScorchedEarthAim | null): void {
  aim = a;
}

export function scorchedEarthAim(): ScorchedEarthAim | null {
  return aim;
}

/**
 * ⭐ The seat whose ZONE contains this point, if the reducer would accept it as a target — else `null`
 * (the quarry, a zone nobody owns on this board, a seat not at the table, a fallen seat). Seats are
 * visited in id order, so the answer is a total order even if two seats ever shared a zone.
 */
export function zoneSeatAt(world: World, x: number, y: number): PlayerId | null {
  const zone = zoneOf({ x, y }, world.layout);
  if (zone === null) return null;
  const seats = [...world.players.keys()].sort((a, b) => Number(a) - Number(b));
  for (const seat of seats) {
    if (zoneOwner(seat as unknown as number, world.layout) !== zone) continue;
    return scorchedEarthTargetZone(world, seat) !== null ? seat : null;
  }
  return null;
}

/**
 * ⭐ THE HOVER PREVIEW — the seat whose zone should turn red under the cursor right now, or `null`.
 * Only while aiming, only while this client may cast (`scorchedEarthLocalRefusal`), only over a legal
 * zone. The backdrop reads this once per frame.
 */
export function scorchedEarthHoverSeat(world: World): PlayerId | null {
  const a = aim;
  if (a === null) return null;
  if (scorchedEarthLocalRefusal(world, a.seat) !== null) return null;
  return zoneSeatAt(world, a.x, a.y);
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────── *
 *   THE CAST THIS CLIENT HAS SENT THAT THE SYNCED STATE HAS NOT SHOWN YET (POWER OF RA's S190 W-4)
 * ─────────────────────────────────────────────────────────────────────────────────────────────── */

/*
 * `CAST_SCORCHED_EARTH` is not predicted locally, so on a JOINER the synced `Player.scorchedEarth` lags
 * the cast by RTT plus up to one 10 Hz snapshot. Without this the square would light again inside that
 * window and a second press would play the accept click before the host refused it. The record clears
 * itself when the synced cast appears, when the wave changes, or after POWER OF RA's timeout (a cast the
 * host REFUSED must not strand the charge).
 *
 * ⛔ S192 (audit UIGATES-4 — the scorch twin of s191/carry C-2 / WRATH-F5): **the synced clock is NOT
 * monotonic on a joiner** — each snapshot sets `world.tick = snap.tick`, so a clock that ran ahead steps
 * BACK right after the send. A step back below the send tick RE-ANCHORS the record at the adopted tick
 * (its window restarts; every other check still re-validates it); older than the timeout it EXPIRES and
 * is DROPPED, so a later step back can never revive a refused cast. Same rule as carry's
 * `pendingRecordAnchor` (`render/pendingRecordClock.ts`), inlined until that branch lands — the merge
 * owner swaps this for the shared helper then.
 */
interface PendingScorch {
  readonly world: World;
  readonly seat: PlayerId;
  readonly wave: number;
  readonly atTick: number;
}

let pending: PendingScorch | null = null;

function livePending(world: World, seat: PlayerId): PendingScorch | null {
  const q0 = pending;
  if (q0 === null || q0.world !== world || q0.seat !== seat) return null;
  // ⛔ S192 UIGATES-4 — re-anchor on a step back; DROP once expired (never merely hide it).
  const atTick = world.tick < q0.atTick ? world.tick : world.tick - q0.atTick > RA_PENDING_TIMEOUT_TICKS ? null : q0.atTick;
  if (atTick === null) {
    pending = null;
    return null;
  }
  const q = atTick === q0.atTick ? q0 : (pending = { ...q0, atTick });
  if (q.wave !== world.waveNumber) return null;
  const p = world.players.get(seat);
  if (p === undefined || scorchedEarthCastsInWave(p, world.waveNumber) >= SCORCHED_EARTH_CHARGES) return null;
  return q;
}

/** Record one cast this client is about to send. Call it BEFORE dispatching. */
export function noteScorchedEarthCastSent(world: World, seat: PlayerId): void {
  pending = { world, seat, wave: world.waveNumber, atTick: world.tick };
}

/** Test seam, and a new match's clean slate. */
export function clearScorchedEarthPending(): void {
  pending = null;
}

/** The shared predicate, plus `USED` while this client's cast is in flight. For client readers only. */
export function scorchedEarthLocalRefusal(world: World, seat: PlayerId): ScorchedEarthRefusal | null {
  const r = scorchedEarthCastRefusal(world, seat);
  if (r !== null) return r;
  return livePending(world, seat) !== null ? 'USED' : null;
}

/** Casts still to spend this fight, as this client knows them — the square's pips. */
export function scorchedEarthChargesLeftLocal(world: World, seat: PlayerId): number {
  const p = world.players.get(seat);
  if (p === undefined) return 0;
  const inFlight = livePending(world, seat) !== null ? 1 : 0;
  return Math.max(0, SCORCHED_EARTH_CHARGES - scorchedEarthCastsInWave(p, world.waveNumber) - inFlight);
}
