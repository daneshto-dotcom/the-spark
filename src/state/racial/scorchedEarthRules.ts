/**
 * SPARK — S191 (owner item 1b) — **SCORCHED EARTH: THE AIMED HALF OF SCORCHED GROUND — THE RULES, AND
 * NOTHING THAT MUTATES.**
 *
 * > *"on the bottom left same where the wrath of ra ability lies there's going to be … a scorched earth
 * > ability button that you click on and then you can click on any quadrant of the enemy there's going
 * > to be like a cool preview when you mouse over it like shows you it turning red … you will be
 * > resistant. Everybody else will … receive damage over time. And your enemy too, and his structures
 * > and everything … with the same … amount of … health lost per … second … you can place it on your
 * > own as well. And then you would have double scorched earth … a lot more damaging to outsiders."*
 * > — owner, S191
 *
 * A demons seat that holds SCORCHED GROUND (`demons.l0`) also holds this skill. The passive (its own
 * zone burns every enemy CREATURE in FIGHT) is unchanged — *"You have Scorch Earth anyways on Fight
 * Scene."* The skill scorches ONE zone of the caster's choosing for the rest of that FIGHT.
 *
 * ## ⛔ ONE PREDICATE, THREE READERS — the POWER OF RA shape (`powerOfRaRules.ts`), for its reasons
 *
 * The host REDUCER (`scorchedGround.ts`), the footer SQUARE (enabled, or saying why not) and the hover
 * PREVIEW (the zone turning red under the cursor) all answer from the functions below, so a square
 * that lights while the reducer refuses — or a preview on a zone the cast would not take — cannot
 * happen. This module MUTATES NOTHING and imports no renderer, no Pixi and no damage code: `save.ts`
 * rehydrates `Player.scorchedEarth` through `scorchedEarthFromWire`, and `controls.ts` reads it too.
 *
 * ## THE OWNER'S ANSWERS (S191, by message — each is HIS, not mine)
 *
 *   1. **Once per FIGHT, and the scorch lasts until that FIGHT ends** — `SCORCHED_EARTH_CHARGES` = 1,
 *      keyed on `world.waveNumber` exactly as POWER OF RA is (the wave turns on entry into BUILD), and
 *      the record is cleared at the BUILD edge (Council).
 *   2. **The castle is NOT burned.** Nothing burns a keep (canon §3: the ladder's one pool exception).
 *   3. The always-on own-zone burn is untouched: *"enemies cant build buildings in your zone so stupid
 *      and redundant question."*
 *   4. **Structures take HALF what units take** — *"also enemy structures will take half the damage
 *      that units take."* (`SCORCHED_STRUCTURE_RATE_DIV`, `scorchedGround.ts`.)
 */

import { MAX_PLAYERS } from '../../constants.ts';
import { asPlayerId, type PlayerId } from '../../types.ts';
import type { Player } from '../../game/player.ts';
import { seatHoldsPerk } from '../racialPerks.ts';
import { isBenched } from '../hunters/hunter.ts';
import { isEliminated } from '../elimination.ts';
import { zoneOwner } from '../zones.ts';
import type { World } from '../worldTypes.ts';

/** The perk the skill rides on — SCORCHED GROUND itself. Holding the perk IS holding the skill. */
export const SCORCHED_EARTH_PERK = 'demons.l0' as const;

/**
 * ⭐ OWNER, S191 (answer 1) — *once per FIGHT*, and the scorch lasts until that FIGHT ends. HIS number.
 * Lever: raise it and the square grows pips; the burn already sums every live cast.
 */
export const SCORCHED_EARTH_CHARGES = 1;

/**
 * ⭐ ONE CAST — the whole state of the skill, carried in `Player.scorchedEarth`.
 *
 *   · `wave`     — `world.waveNumber` when it was cast: one cast per wave = one per FIGHT. A record
 *                  from an earlier wave is spent (and is cleared at the BUILD edge anyway).
 *   · `zoneSeat` — the seat whose ZONE burns. A SEAT, not a zone index, so the same record means the
 *                  same ground on either board (`zoneOwner(seat, layout)`), exactly as the burn and
 *                  the backdrop derive it.
 */
export interface ScorchedEarthCast {
  readonly wave: number;
  readonly zoneSeat: PlayerId;
}

/**
 * ⭐ THE CLIENT INTENT. `zoneSeat` is whatever the client sent — the host trusts nothing about it
 * (`scorchedEarthTargetZone`). `playerId` is overwritten by the host with the sender's seat
 * (`stampOrReject`), so a client can only ever scorch on its own behalf.
 */
export interface CastScorchedEarthAction {
  readonly type: 'CAST_SCORCHED_EARTH';
  readonly playerId: PlayerId;
  readonly zoneSeat: PlayerId;
}

/** Why a seat cannot cast right now, or `null` when it can. `NOT_HELD` = the square is not drawn. */
export type ScorchedEarthRefusal =
  | 'NO_SEAT'
  | 'NOT_HELD'
  | 'NOT_PLAYING'
  | 'ELIMINATED'
  | 'BENCHED'
  | 'NOT_FIGHT'
  | 'USED';

/** Does this seat hold the skill at all (i.e. should the square exist)? */
export function seatHasScorchedEarth(p: Pick<Player, 'raceId' | 'draftPicks'> | undefined): boolean {
  return p !== undefined && seatHoldsPerk(p, SCORCHED_EARTH_PERK);
}

/** Casts this seat has already made in `wave` (0 or 1 — the record holds at most one). */
export function scorchedEarthCastsInWave(p: Pick<Player, 'scorchedEarth'>, wave: number): number {
  return p.scorchedEarth !== null && p.scorchedEarth.wave === wave ? 1 : 0;
}

/**
 * ⭐⭐ THE ONE CASTER PREDICATE — the POWER OF RA predicate's shape, gate for gate. Pure function of
 * synced state, so a joiner's square and the host's reducer answer identically from one snapshot.
 *
 * ⚠ BENCHED and ELIMINATED are ALSO refused upstream by `dispatch`'s two policy gates (both `'deny'`
 * for this intent); repeated here so the SQUARE can say why.
 */
export function scorchedEarthCastRefusal(world: World, playerId: PlayerId): ScorchedEarthRefusal | null {
  const p = world.players.get(playerId);
  if (p === undefined) return 'NO_SEAT';
  if (!seatHasScorchedEarth(p)) return 'NOT_HELD';
  if (world.gameState !== 'PLAYING') return 'NOT_PLAYING';
  if (isEliminated(p)) return 'ELIMINATED';
  if (isBenched(p.benchedUntilTick, world.tick)) return 'BENCHED';
  // Only IN a fight: BUILD is the phase whose premise is that nothing can be attacked.
  if (world.matchPhase !== 'FIGHT') return 'NOT_FIGHT';
  if (scorchedEarthCastsInWave(p, world.waveNumber) >= SCORCHED_EARTH_CHARGES) return 'USED';
  return null;
}

/**
 * ⭐ THE TARGET, VALIDATED — the zone index the cast would scorch, or `null` for a no-op.
 *
 * The intent crosses the wire as an untyped object (`parseNetMessage` checks only `type`), so
 * `zoneSeat` may be anything: a string, a float, `null`, a seat that is not at the table. Every one of
 * those is a NO-OP — never a throw, never a guess. A legal target is a seat IN the match whose zone
 * exists on this board and whose castle still stands (the brief: *"the zone exists and its owner is
 * not eliminated"*). The caster's OWN seat is legal — *"you can place it on your own as well."*
 */
export function scorchedEarthTargetZone(world: World, zoneSeat: unknown): number | null {
  if (typeof zoneSeat !== 'number' || !Number.isInteger(zoneSeat)) return null;
  if (zoneSeat < 0 || zoneSeat >= MAX_PLAYERS) return null;
  const owner = world.players.get(asPlayerId(zoneSeat));
  if (owner === undefined || isEliminated(owner)) return null;
  return zoneOwner(zoneSeat, world.layout);
}

/**
 * ⭐ THE ZONE THIS SEAT'S CAST IS BURNING RIGHT NOW, or `null`. The burn and the backdrop both ask it.
 *
 *   · the cast must be THIS wave's (one FIGHT; the record from an earlier wave is spent);
 *   · the phase must be FIGHT in a PLAYING match — it burns only while the passive does;
 *   · ⭐ OWNER, S191 (later answer): **a fallen caster's cast on an ENEMY zone STOPS; his OWN zone keeps
 *     burning.** *"scorch: a fallen caster's ENEMY-zone cast stops, his own zone keeps burning"* — so a
 *     cast he made on his own seat burns on for the rest of that FIGHT after his castle falls, and a cast
 *     on anybody else's seat ends the tick he falls. (HIS ruling; it replaced the Council's ⚠ MINE
 *     "the caster falling stops it". The always-on PASSIVE keeps S188 F4 — whether "his own zone keeps
 *     burning" reverses F4 too is an open question, reported, not built.)
 *   · ⚠ MINE (Council default): **the ZONE OWNER falling after the cast does NOT stop it.** The ground
 *     was scorched while it was a legal target; the land stays burning for the rest of that FIGHT.
 */
export function scorchedEarthActiveZone(world: World, caster: Player): number | null {
  const cast = caster.scorchedEarth;
  if (cast === null || cast.wave !== world.waveNumber) return null;
  if (world.gameState !== 'PLAYING' || world.matchPhase !== 'FIGHT') return null;
  if (isEliminated(caster) && cast.zoneSeat !== caster.id) return null; // ⭐ OWNER S191 — own zone burns on
  return zoneOwner(cast.zoneSeat as unknown as number, world.layout);
}

/**
 * ⭐ THE WIRE/SAVE REHYDRATE. Malformed — a non-object, a non-integer wave, a seat outside the table's
 * range — → `null`: a peer cannot invent a cast. Absent (never cast, every earlier save) → `null`.
 */
export function scorchedEarthFromWire(v: unknown): ScorchedEarthCast | null {
  if (v === null || typeof v !== 'object') return null;
  const { wave, zoneSeat } = v as Record<string, unknown>;
  if (!Number.isInteger(wave) || !Number.isInteger(zoneSeat)) return null;
  if ((zoneSeat as number) < 0 || (zoneSeat as number) >= MAX_PLAYERS) return null;
  return { wave: wave as number, zoneSeat: asPlayerId(zoneSeat as number) };
}
