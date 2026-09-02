/**
 * SPARK — W1-A (S160) — the RACE ROSTER, in a module with NO SIDE EFFECTS.
 *
 * ## ⛔ WHY THIS IS ITS OWN FILE, AND IT IS NOT ORGANISATIONAL TIDINESS
 *
 * `state/goblinKinds.ts` was carved out of `godlyRecipes/goblinTower.ts` after that module's
 * tail-call to `registerRecipe` fired for essentially the whole codebase — because `world.ts`
 * reaches the reducer that wanted the map. Its header records the measured consequence: the
 * `?worker=1` bots match never left TITLE, with 198 polls throwing during boot, and *nothing about
 * the file that caused it looked wrong*.
 *
 * The race table has strictly WIDER reach than that map did — reducers, the serializer, the lobby
 * and every renderer that paints an owner colour all need it. Same trap, bigger blast radius.
 *
 * ⭐ RACE IS PRIMARY. COLOUR IS DERIVED — at construction, not by a getter. `Player.color` SURVIVES,
 * because `rainbowLifecycle.applyTriggerRainbow` rewrites it in place for eight seconds and must not
 * rewrite the race. `color` is "what this seat looks like right now"; `raceId` is "who this seat is".
 *
 * ⚠ `Record<RaceId, …>` EVERYWHERE, NEVER AN ARRAY LITERAL OF IDS — a Record is
 * exhaustiveness-checked by tsc; an array is not (the `ALL_BLUEPRINT_IDS` trap).
 *
 * Pixi-free, DOM-free, World-free, and it registers nothing.
 *
 * ## ⛔ B5 — THE HASHING DECISION, MADE AND RECORDED (the spec required this, §14 B5)
 *
 * `raceId` selects the emitted `CreatureType`, so it is a **sim input** and the reflex is "hash it".
 * It is NOT hashed, and the reason is not the `raidPoints` precedent — the spec explicitly forbids
 * defaulting to that, because `raidPoints` is a currency nothing simulates from.
 *
 * The reason is that **`raceId` is immutable after Begin.** `applyStartGame` stamps it once from the
 * authoritative roster and nothing in the sim ever writes it again — `applyTriggerRainbow` permutes
 * `color` and deliberately leaves `raceId` alone (the B4 ruling, enforced by a test). A value that
 * never changes during simulation cannot *diverge* during simulation: the two peers either agreed at
 * Begin or they never agreed at all, and the thing that catches the second case is the PROTOCOL BUMP
 * (a v38 peer cannot join at all), not the wide hash.
 *
 * Weighed and rejected: hashing the whole `players` family. `FIELD_COVERAGE` marks
 * `players: 'acknowledged'` (`stateHashFull.ts:167`) and its docblock explains that main-thread
 * divergence from authority there is BY DESIGN (client prediction) — hashing the family would make
 * the oracle report prediction as desync, which is a worse failure than the one it would catch.
 * Also rejected: a new hashed `World` field, which contradicts the one-token model above and costs
 * the full ten-site bill for a value that is constant for the whole match.
 *
 * ⚠ **THIS ARGUMENT DOES NOT EXTEND TO THE TECH PERKS.** Perks change MID-MATCH (they are drafted at
 * a wave edge and they move damage and spawn rates), so they can genuinely diverge and the immutability
 * argument is unavailable to them. That decision stays open for the draft's own PDR — do not cite
 * this docblock as having settled it.
 */

import { SparkType } from '../constants.ts';

/** The six races (SPARK_RACES_SPEC.md §2, LOCKED). */
export type RaceId = 'vampires' | 'nagas' | 'mummies' | 'zombies' | 'orcs' | 'demons';

/**
 * ⚠ ORDER IS LOAD-BEARING. Index i is the race whose colour is `PLAYER_COLORS[i]`, i.e. the race a
 * seat gets when nobody chooses. Reordering silently reassigns every default.
 */
export const ALL_RACES: readonly RaceId[] = [
  'vampires', // crimson
  'nagas',    // cyan
  'mummies',  // yellow
  'zombies',  // green
  'orcs',     // orange
  'demons',   // magenta
];

/**
 * ⭐ RACE → IDENTITY COLOUR. These six values ARE `PLAYER_COLORS`, in order — duplicated as literals
 * rather than imported and indexed, deliberately. `races.test.ts` asserts the equality as a
 * TRIPWIRE: a palette retune reddens that test and forces a decision about the races, instead of
 * silently redefining six of them.
 */
export const RACE_COLORS: Readonly<Record<RaceId, number>> = {
  vampires: 0xff3b6b,
  nagas: 0x3bd7ff,
  mummies: 0xffe23b,
  zombies: 0x44ff5e,
  orcs: 0xff8c1a,
  demons: 0xd73bff,
};

/**
 * ⭐ RACE → FEED SHAPE (R109). The shape this race's tier-3 tower is fed, and — per R119 — the shape
 * the tower is BUILT from.
 *
 * ⛔ NOT `GOBLIN_FEED_MAP` AND MUST NOT BE CONFLATED WITH IT. That map is
 * `Record<SparkType, CreatureType>` and runs the other direction: the goblin tower is global and
 * decides its output at feed time. This is one race, one shape, one unit.
 */
export const RACE_FEED_SHAPE: Readonly<Record<RaceId, SparkType>> = {
  vampires: SparkType.Triangle,
  nagas: SparkType.Square,
  mummies: SparkType.Line,
  zombies: SparkType.Circle,
  orcs: SparkType.Dot,
  demons: SparkType.Spiral,
};

/**
 * ⭐ THE DEFAULT, AND THE ONLY ONE. A seat that never chose gets the race for its seat colour —
 * R45's *"PLAYER_COLORS[seat] is only ever a DEFAULT assignment"*, restated in race terms. This is
 * what keeps solo, vs-bots, a stale peer's roster and every pre-existing save working with ZERO UI.
 *
 * ⛔ DERIVED FROM THE SEAT, NEVER FROM THE HEX. A colour→race reverse lookup breaks the moment the
 * rainbow shuffle remaps `player.color` (§14 B4).
 *
 * Modulo, not a bounds check: total today and total if either constant moves.
 */
export function defaultRaceForSeat(seat: number): RaceId {
  const n = ALL_RACES.length;
  return ALL_RACES[((Math.trunc(seat) % n) + n) % n]!;
}

/** Narrowing guard for a value off the wire or off disk. Fail-closed. */
export function isRaceId(v: unknown): v is RaceId {
  return typeof v === 'string' && (ALL_RACES as readonly string[]).includes(v);
}
