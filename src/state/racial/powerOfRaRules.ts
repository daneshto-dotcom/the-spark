/**
 * SPARK — S188 P6 — **POWER OF RA (`mummies.l0`): THE RULES, AND NOTHING THAT MUTATES.**
 *
 * > *"once per fight, you can use the power of Ra. So it adds you a skill button … maybe to the left
 * > of the tier three tower because there's nothing there. So maybe that will be designed for
 * > skills. It gives you a skill to call Ra that hits like the lightning beams from the sky, kind of
 * > like Pharaoh has. But you get to choose where it lands. So that needs a new mechanic. So like you
 * > click on it and then you have to click on the area of the map where you want it to land and it
 * > will, you know, hit and damage buildings or creatures in that area."* — owner, S187
 *
 * ## ⛔ ONE PREDICATE, THREE READERS — AND THAT IS WHY THIS FILE IS A LEAF
 *
 * The same two functions answer the question for the host REDUCER (`powerOfRa.ts`), for the footer
 * BUTTON (enabled, or disabled and saying why) and for the aiming TELEGRAPH that follows the cursor
 * (`bossAuras.ts`). A button that lights while the reducer refuses, or a telegraph drawn a few
 * pixels from where the columns will fall, is a lie the player learns not to trust — and two
 * hand-written copies of one rule is exactly how they drift apart. So the rule lives here once. This
 * module MUTATES NOTHING and imports no renderer and no Pixi, so `controls.ts` and the renderer can
 * both read it; the reducer and the column resolution live in `powerOfRa.ts`.
 *
 * ## ⛔ A TRUE LEAF — `save.ts` IMPORTS IT
 *
 * Constants, types, the perk registry and the bench predicate, nothing else. `save.ts` rehydrates
 * `Player.raStrike` through `raStrikeFromWire` below, and a save module that reached the damage code
 * through an import chain is a module-evaluation cycle waiting to happen. The landing-spot function
 * (`raStrikeColumnPos`) therefore lives in `powerOfRa.ts`, beside the reducer.
 *
 * ## ⛔ THE LANDING SPOTS ARE THE PHARAOH'S, RE-CENTRED — NOT A SECOND FORMULA
 *
 * `raStrikeColumnPos` is `raColumnPos` (the Pharaoh's own pure function, `bossSkillsPharaohRitual.ts`)
 * with the AIMED POINT where the boss's position goes and the caster's SEAT as the hash seed.
 *
 * ⚠ THE SEED IS THE SEAT, NOT THE CAST TICK, AND THAT IS WHAT MAKES "YOU GET TO CHOOSE" TRUE. The
 * telegraph that follows the cursor is drawn BEFORE the click, when the tick the host will stamp is
 * not yet known. A pattern seeded by the seat and the point alone is known to the aiming client
 * exactly, so the five circles it shows under the cursor are the five that will fall. ⚠ MINE, not
 * the owner's — it means one seat's five columns always fall in the same shape around the point.
 */

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../constants.ts';
import type { PlayerId } from '../../types.ts';
import type { Player } from '../../game/player.ts';
import { seatHoldsPerk } from '../racialPerks.ts';
import { isBenched } from '../hunters/hunter.ts';
import { isEliminated } from '../elimination.ts';
import type { World } from '../worldTypes.ts';

/** The perk this whole mechanic belongs to. */
export const POWER_OF_RA_PERK = 'mummies.l0' as const;

/**
 * ⭐ ONE SEAT'S CALL TO RA — the ONLY state the mechanic keeps, carried on `Player.raStrike`.
 *
 * Everything else is DERIVED, exactly as the Pharaoh's ritual derives from one `raRitualUntilTick`:
 *   · which fight it was cast in     `wave`                                   (once per FIGHT)
 *   · where it was aimed             `x`, `y`  — integers, clamped (Council A1)
 *   · when each column lands         `raColumnImpactTick(untilTick, k)`
 *   · where each column lands        `raStrikeColumnPos(seat, k, strike)`
 *
 * ⛔ SO NOTHING IS COUNTED BETWEEN COLUMNS and a snapshot applied mid-strike resumes on the right
 * one — the property the Pharaoh's docblock names as the reason for its shape.
 *
 * ⚠ IT IS KEPT AFTER THE STRIKE ENDS, deliberately: `wave` is what refuses a second cast in the
 * same fight. It is replaced by the next cast and cleared by `applyStartGame`.
 */
export interface RaStrike {
  /** `world.waveNumber` when it was cast. One cast per wave = one per FIGHT (waves turn on BUILD). */
  readonly wave: number;
  /** The aimed point, `Math.round`ed and clamped to the canvas by `raAimPoint`. */
  readonly x: number;
  readonly y: number;
  /** Cast tick + `RA_RITUAL_TICKS` — the Pharaoh's deadline shape, so his impact-tick fn applies. */
  readonly untilTick: number;
}

/**
 * ⭐ THE CLIENT INTENT. `x`/`y` are canvas coordinates as the client sent them; the host trusts
 * nothing about them (`raAimPoint`). `playerId` is overwritten by the host with the sender's seat
 * (`stampOrReject`), so a client can only ever call Ra for itself.
 */
export interface CastPowerOfRaAction {
  readonly type: 'CAST_POWER_OF_RA';
  readonly playerId: PlayerId;
  readonly x: number;
  readonly y: number;
}

/**
 * Why a seat cannot call Ra right now, or `null` when it can. The footer button prints the reason.
 *
 * ⚠ `NOT_HELD` means the button is not drawn at all — a seat that never took the perk has no skill.
 */
export type RaCastRefusal =
  | 'NO_SEAT'
  | 'NOT_HELD'
  | 'NOT_PLAYING'
  | 'ELIMINATED'
  | 'BENCHED'
  | 'NOT_FIGHT'
  | 'USED';

/**
 * ⭐⭐ THE ONE PREDICATE. Pure function of synced state, so a joiner's button and the host's reducer
 * answer identically from the same snapshot.
 *
 * ⚠ BENCHED and ELIMINATED are ALSO refused upstream by `dispatch`'s two policy gates
 * (`BENCH_INTENT_POLICY` / `ELIMINATION_INTENT_POLICY`, both `'deny'` for this intent). They are
 * repeated here so the BUTTON can say why — a control that is refused must say so, the standing
 * contract of every panel in this codebase — not because the reducer needs a second gate.
 */
export function raCastRefusal(world: World, playerId: PlayerId): RaCastRefusal | null {
  const p = world.players.get(playerId);
  if (p === undefined) return 'NO_SEAT';
  if (!seatHoldsPerk(p, POWER_OF_RA_PERK)) return 'NOT_HELD';
  if (world.gameState !== 'PLAYING') return 'NOT_PLAYING';
  // The ONE elimination predicate (its docblock: every site asks it, so the threshold has one home).
  // `elimination.ts` imports only types at runtime, so this stays a leaf.
  if (isEliminated(p)) return 'ELIMINATED';
  if (isBenched(p.benchedUntilTick, world.tick)) return 'BENCHED';
  // *"once per fight"* — and only IN a fight. BUILD is the phase whose premise is that nothing can
  // be attacked (the S168 FIGHT gate every boss skill sits behind).
  if (world.matchPhase !== 'FIGHT') return 'NOT_FIGHT';
  if (p.raStrike !== null && p.raStrike.wave === world.waveNumber) return 'USED';
  return null;
}

/**
 * ⭐ COUNCIL A1 — **THE AIM, NORMALISED, OR `null`.** The host stores exactly what this returns.
 *
 * The intent crosses the wire as an untyped object (`parseNetMessage` checks only `type`), so `x` and
 * `y` may be anything a modified client wants: a string, `null` (what `JSON.stringify` makes of NaN
 * and Infinity), a float, a point off the board. Every one of those is a NO-OP, never a throw and
 * never a clamp-to-the-corner — a strike landing at (0, 0) because a client sent garbage would be a
 * real attack nobody aimed.
 *
 * On the canvas it is `Math.round`ed and clamped, so the stored point is an integer: it hashes as
 * one, rides the wire untouched by the 2-dp coordinate rounding (`wireNumberReplacer` passes
 * integers through) and feeds `raColumnPos` identically on every peer.
 */
export function raAimPoint(x: unknown, y: unknown): { x: number; y: number } | null {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > CANVAS_WIDTH || y < 0 || y > CANVAS_HEIGHT) return null;
  return {
    x: Math.min(CANVAS_WIDTH, Math.max(0, Math.round(x))),
    y: Math.min(CANVAS_HEIGHT, Math.max(0, Math.round(y))),
  };
}

/**
 * ⭐ THE WIRE/SAVE REHYDRATE for `Player.raStrike`. Absent → `null` (never cast, every pre-S188
 * save). Present but malformed — a non-object, a missing key, a non-integer, an off-canvas point —
 * → `null` as well: a peer cannot invent a strike, and a strike it did not send is not stored.
 *
 * ⚠ Validated against the SAME `raAimPoint` the reducer uses, and required to already be integers
 * (the reducer never stores anything else), so a value this accepts is one the host could have made.
 */
export function raStrikeFromWire(v: unknown): RaStrike | null {
  if (v === null || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const { wave, x, y, untilTick } = o;
  if (!Number.isInteger(wave) || !Number.isInteger(untilTick)) return null;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  const aim = raAimPoint(x, y);
  if (aim === null || aim.x !== x || aim.y !== y) return null;
  return { wave: wave as number, x: aim.x, y: aim.y, untilTick: untilTick as number };
}

/** Convenience for the UI: does this seat hold the perk at all (i.e. should the button exist)? */
export function seatHasPowerOfRa(p: Pick<Player, 'raceId' | 'draftPicks'> | undefined): boolean {
  return p !== undefined && seatHoldsPerk(p, POWER_OF_RA_PERK);
}
