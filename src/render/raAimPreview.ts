/**
 * SPARK — S188 P6 — **POWER OF RA: THE AIM THAT IS FOLLOWING THE CURSOR, if any.**
 *
 * > *"you click on it and then you have to click on the area of the map where you want it to land"*
 *
 * Between the two clicks the local player is AIMING, and that is one player's view state, exactly
 * like the footer's `selected` chip or the armed tower: it must not reach the wire, it is not
 * hashed, and two peers disagreeing about it is not a divergence.
 *
 * ## ⛔ WHY A MODULE-LEVEL CONTEXT, and not a field threaded through the renderers
 *
 * It is WRITTEN by the input layer (`controls.ts`, on the button press, every pointer move, the
 * cast and the cancel) and READ by two renderers (`bossAuras.ts` draws the five circles under the
 * cursor; `footerBand.ts` lights the button). The alternative — plumbing it through `main.ts` into
 * `goblinRenderer.sync` and on into `drawBossAuras` — is the shape `concealment.ts`' docblock
 * rejects for the same reason: every signature in the chain would have to carry it, and the one
 * that silently did not would keep drawing nothing. Its default, `null`, is "not aiming", which is
 * the pre-existing behaviour, so a caller that never writes it changes nothing.
 *
 * Pixi-free on purpose: `controls.ts` must not import Pixi.
 */

import type { PlayerId } from '../types.ts';
import type { World } from '../state/worldTypes.ts';
import {
  raCastRefusal,
  raCastsInWave,
  raChargesFor,
  type RaCastRefusal,
} from '../state/racial/powerOfRaRules.ts';

export interface RaAimPreview {
  /** The seat aiming — it seeds the column pattern, exactly as it will seed the real strike. */
  readonly seat: PlayerId;
  /** The raw cursor, canvas space. The renderer normalises it with the reducer's own `raAimPoint`. */
  readonly x: number;
  readonly y: number;
}

let preview: RaAimPreview | null = null;

/** `null` = not aiming. Written only by the input layer. */
export function setRaAimPreview(p: RaAimPreview | null): void {
  preview = p;
}

export function raAimPreview(): RaAimPreview | null {
  return preview;
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────── *
 *   ⭐ S190 W-4 — THE CASTS THIS CLIENT HAS SENT THAT THE SYNCED STATE HAS NOT SHOWN YET
 * ─────────────────────────────────────────────────────────────────────────────────────────────── */

/*
 * WRATH OF RA's column pattern is seeded by the strike's CHARGE INDEX, which the host decides when
 * it applies the cast (`raCastsInWave` at that moment). `CAST_POWER_OF_RA` is not predicted locally,
 * so on a JOINER the synced `raStrikes` lags a cast by RTT plus up to one 10 Hz snapshot. A second
 * aim inside that window previewed charge 0's five circles while the host landed charge 1's — and
 * the pips showed a charge too many, and a fourth press played the accept click before the host
 * refused it.
 *
 * So this client counts the casts it has SENT and not yet seen, and every client-side reader — the
 * aim preview (`bossAuras.ts`), the footer slot (`footerBand.ts`) and the gesture (`controls.ts`) —
 * reads synced + pending. ⛔ NEVER THE REDUCER: `raCastRefusal` stays the one shared predicate; this
 * is view state exactly like the aim itself — not on the wire, not hashed.
 *
 * The record clears itself when the synced count catches up, when the wave changes, or after
 * `RA_PENDING_TIMEOUT_TICKS` of synced time — the timeout is what keeps a cast the host REFUSED in
 * flight (the seat benched, the fight ending) from stranding the seat's last charge.
 */
interface PendingRaCasts {
  /** The world it was sent from: a record never outlives its match's World (a new one starts clean). */
  readonly world: World;
  readonly seat: PlayerId;
  readonly wave: number;
  /** The synced cast count this wave when the first unacknowledged cast was sent. */
  readonly base: number;
  readonly sent: number;
  /** `world.tick` at the latest send. */
  readonly atTick: number;
}

/**
 * How long an unacknowledged cast is trusted, in synced ticks. ⚠ MINE, not the owner's: 1.5 s, well
 * past a TURN round trip plus a snapshot interval, and short enough that a refused cast frees its
 * charge before the player can reasonably press again.
 */
export const RA_PENDING_TIMEOUT_TICKS = 90;

let pending: PendingRaCasts | null = null;

/** The live record for `seat`, or null when there is none or it has caught up / expired. */
function livePending(world: World, seat: PlayerId): PendingRaCasts | null {
  const q = pending;
  if (q === null || q.world !== world || q.seat !== seat || q.wave !== world.waveNumber) return null;
  const age = world.tick - q.atTick;
  if (age < 0 || age > RA_PENDING_TIMEOUT_TICKS) return null;
  const p = world.players.get(seat);
  if (p === undefined || raCastsInWave(p, world.waveNumber) >= q.base + q.sent) return null;
  return q;
}

/**
 * Record one cast this client is about to send. Call it BEFORE dispatching, so a host that applies
 * the intent synchronously is caught up the moment it returns.
 */
export function noteRaCastSent(world: World, seat: PlayerId): void {
  const p = world.players.get(seat);
  if (p === undefined) return;
  const live = livePending(world, seat);
  pending = live === null
    ? { world, seat, wave: world.waveNumber, base: raCastsInWave(p, world.waveNumber), sent: 1, atTick: world.tick }
    : { ...live, sent: live.sent + 1, atTick: world.tick };
}

/** Test seam, and a new match's clean slate. */
export function clearRaPendingCasts(): void {
  pending = null;
}

/**
 * ⭐ This seat's casts this wave AS THIS CLIENT KNOWS THEM: synced, or synced + unacknowledged, never
 * more than its charges. The next cast's charge index — the one the host will give it.
 */
export function raCastsInWaveLocal(world: World, seat: PlayerId): number {
  const p = world.players.get(seat);
  if (p === undefined) return 0;
  const synced = raCastsInWave(p, world.waveNumber);
  const q = livePending(world, seat);
  if (q === null) return synced;
  return Math.min(raChargesFor(p), Math.max(synced, q.base + q.sent));
}

/** The shared predicate, plus `USED` once this client has sent every charge. For client readers only. */
export function raLocalCastRefusal(world: World, seat: PlayerId): RaCastRefusal | null {
  const r = raCastRefusal(world, seat);
  if (r !== null) return r;
  const p = world.players.get(seat);
  if (p === undefined) return 'NO_SEAT';
  return raCastsInWaveLocal(world, seat) >= raChargesFor(p) ? 'USED' : null;
}

/** Charges still to spend this fight, as this client knows them — the footer's pips. */
export function raChargesLeftLocal(world: World, seat: PlayerId): number {
  const p = world.players.get(seat);
  if (p === undefined) return 0;
  return Math.max(0, raChargesFor(p) - raCastsInWaveLocal(world, seat));
}
