/**
 * SPARK — S103 P2 generic tower-defense DEFENDER entity (pure type + config, leaf module).
 *
 * Mirrors the `spawners/spawner.ts` + `creatures/creature.ts` leaf pattern: `worldTypes.ts`
 * imports `Defender` from here (no worldTypes <-> defenderLifecycle cycle); this module never
 * imports world.ts.
 *
 * A Defender is the per-structure identity that makes a built RECIPE "come alive" as an
 * auto-attacker rooted on its anchor structure. ONE substrate, two `kind`s (Council MF7 —
 * generalize, don't clone):
 *
 * ⚠ S140 P1 — "STATIONARY" WAS WRONG AND THIS FILE CONTRADICTED ITSELF FOR THIRTY SESSIONS. This
 * line read "a STATIONARY auto-attacker" while :56 below adds a 'WALK' state for HELGA's
 * walk-to-target locomotion (S110 P4). Only the TURRET is stationary (moveAccel 0 + meleeRange ==
 * attackRange, so its FSM never enters WALK). The distinction became decision-relevant in S140 when
 * the owner had to rule on what counts as a "tower".
 *   • 'turret'   (#9, P3): a slow heavy laser (1 Line deg-6 + 6 Spiral 'Whip' leaves; S140 P1 retune).
 *   • 'princess' (#10, P4): HELGA, a fast slapper (Triangle hub + 3 'Warped Anchor' + 3 'Star').
 * Both target the nearest enemy CREATURE in range via the unified `damageCreature` path.
 *
 * Determinism: the whole FSM (acquire / windup / fire / recover) is a pure fn of `world.tick`
 * — NEVER wall-clock, NEVER Math.random; target acquisition uses `findNearestEnemyCreatureFrom`
 * (lowest-CreatureId tie-break). Host-authoritative; replicated to clients via the additive-
 * optional `defenders[]` NetSnapshot field (creature/spawner precedent). ALL render-relevant
 * fields (state/ticksInState/nextFireTick/targetCreatureId/pos) are SYNCED (Council MF1/MF6):
 * the client renders the beam/slap off the synced FIRE state + the windup rings off nextFireTick.
 *
 * Identity = the shape-defining anchor primitive (the Line for a turret, the Triangle hub for
 * HELGA) — unique within its recipe by construction, stable, and re-validated each poll
 * (`recipeStillSatisfied`). Removal is recipe-break-driven (a chewer eats the structure).
 * ⚠ AMENDED S138 P1: `hp` is no longer a sentinel. The direct-attack lever MF8 pre-provisioned has
 * been cashed in — each kind carries real hp and can be killed through `state/damage.ts
 * damageEntity`. Recipe-break removal is unchanged and still primary; hp is a second, additive
 * death path.
 */

import {
  PRINCESS_MELEE_RANGE,
  PRINCESS_MOVE_ACCEL,
  PRINCESS_SLAP_INTERVAL_TICKS,
  PRINCESS_SLAP_RANGE,
  PRINCESS_WINDUP_TICKS,
  STINK_THROW_INTERVAL_TICKS,
  STINK_TOWER_ATTACK_RANGE,
  STINK_TOWER_BAGS,
  STINK_BAG_ATK,
  STINK_BAG_PEN,
  STINK_TOWER_WINDUP_TICKS,
  TURRET_ATTACK_RANGE,
  TURRET_BEAM_ATK,
  TURRET_BEAM_PEN,
  TURRET_FIRE_INTERVAL_TICKS,
  TURRET_WINDUP_TICKS,
  PRINCESS_HP,
  PRINCESS_DEF,
  PRINCESS_ATK,
  PRINCESS_PEN,
} from '../../constants.ts';
// S158 P7 — the shared stat ladder; a unit-class defender's pool is hp × (1 + 0.2·DEF), in fifths.
import { unitPoolFifths } from '../stats.ts';
import type { CreatureId, DefenderId, PlayerId, PrimitiveId, Vec2 } from '../../types.ts';
import type { GodlyId } from '../godlyRecipes/types.ts';

/**
 * Which kind of defender — selects the FSM tuning (config) + the renderer.
 *
 * ⛔ THIS UNION IS DUPLICATED. A second, inlined copy lives at `godlyRecipes/types.ts`
 * (`DefenderGodlyRecipe.defenderKind`), deliberately, to break a types <-> defender import cycle.
 * ADD A KIND TO BOTH, IN THE SAME COMMIT. Adding it only here means no recipe can declare it; adding
 * it only there compiles clean at the recipe site and then mints a REGISTER_DEFENDER whose kind is
 * absent from `DEFENDER_CONFIGS` — and `getDefenderConfig` is a bare Record index with no default, so
 * it returns `undefined` and throws on the first field read inside `makeDefender`.
 */
export type DefenderKind = 'turret' | 'princess' | 'stinkTower';

/**
 * Generic defender FSM. Both kinds share it; the per-kind config tunes the durations.
 *   IDLE   — waiting for the next fire attempt (`world.tick >= nextFireTick`) AND a target in range.
 *   WINDUP — telegraphing the strike (turret: a brief post-charge tell; HELGA: arm pulls back).
 *   FIRE   — the strike lands (damage dealt at FIRE entry); held DEFENDER_FIRE_HOLD_TICKS so the
 *            1v1 client reliably observes it + renders the beam/slap (Council MF1).
 *   RECOVER— cooldown before returning to IDLE + scheduling the next fire.
 */
// S110 P4 (Batch B) — 'WALK' added for HELGA's walk-to-target locomotion (princess-only; the turret
// has moveAccel 0 + meleeRange == attackRange so it never enters WALK → its FSM stays byte-identical).
// A SERIALIZED state literal a stale peer can't parse ⇒ PROTOCOL_VERSION 12→13.
export type DefenderState = 'IDLE' | 'WALK' | 'WINDUP' | 'FIRE' | 'RECOVER';

export interface Defender {
  readonly id: DefenderId;
  readonly kind: DefenderKind;
  readonly ownerPlayerId: PlayerId;
  /** Stable identity = the shape-defining anchor primitive (Line / Triangle hub). */
  readonly anchorPrimitiveId: PrimitiveId;
  /** Which recipe minted this defender (e.g. 'laserTurret' / 'helga'). */
  readonly recipeId: GodlyId;
  /** Render + range origin — synced; the host refreshes it from the anchor primitive each poll. */
  pos: Vec2;
  /**
   * S110 P4 — previous-tick position for the WALK Verlet integrator (implicit velocity = pos −
   * prevPos). Held == pos while stationary (turret always; princess when home/striking) so velocity
   * is zero. SERIALIZED (additive-optional, emitted only when ≠ pos) so a mid-walk host save/load
   * resumes with the right velocity — replay byte-equivalence. Turret keeps prevPos == pos → no wire
   * surface, byte-identical.
   */
  prevPos: Vec2;
  /**
   * S110 P4 — the point HELGA is currently walking toward (the victim's pos, refreshed each WALK
   * tick), or null when not pursuing. SERIALIZED (additive-optional) so the 1v1 client faces her the
   * same way mid-walk. Cleared to null when she stops pursuing.
   */
  walkTargetPos: Vec2 | null;
  state: DefenderState;
  /** Ticks since entering `state`. */
  ticksInState: number;
  /*
   * ⛔ S151 P2 (owner R75) — `hp` IS REMOVED FROM THE DEFENDER RECORD, AND FROM THE WIRE.
   *
   * A tower has no hit points of its own; its durability is its connectors'. See the `DefenderConfig`
   * note above for the full account. Removing it takes `SerializedDefender.hp` and `DefenderHashed`'s
   * `'hp'` with it — a REQUIRED wire field leaving, which is part of what PROTOCOL_VERSION 28→29
   * pays for.
   *
   * ⚠ THE FIELD'S OWN HISTORY IS THE ARGUMENT FOR DELETING IT. It began as `DEFENDER_HP = 1e9`, a
   * sentinel meaning "defenders die by recipe-break, not damage". S138 made it real hp, and S141
   * had to correct this very docblock because it still described the sentinel behaviour while
   * `damage.ts` was already killing defenders through it. Two sessions of drift on one field, and
   * the numbers behind it were never validated by play because nothing ever attacked a tower.
   */
  /**
   * ⭐ S158 P7 (CF-S157-c) — **REMAINING EFFECTIVE HIT POINTS, IN FIFTHS. `null` FOR A TOWER.**
   *
   * Owner's ask, verbatim: Helga should stay out *"until she is destroyed herself"*. She could not
   * be — S157 B6 bounded her life by the FIGHT instead, which is why she was not immortal and also
   * not killable. Nothing in the game could subtract from a defender, because the whole substrate
   * was removed at S151 P2.
   *
   * ⛔ AND THAT REMOVAL WAS NOT WRONG — IT WAS OVER-BROAD, AND R77 SAID SO. R75 is about TOWERS:
   * *"towers have attack and piercing but not def and hp because they are based on the connectors
   * that build them"*. S151 read it as "defenders have no hp" and deleted the field for every kind.
   * R77 then listed Helga at *"4atk, 4pierce, 6hp, 4 def … those are all spawned units"* — she is a
   * UNIT that happens to live in `world.defenders`, not an emplacement.
   *
   * So this is scoped by `config.unitStats`, the field R77 already forced into existence: a defender
   * with unit stats carries a pool; a tower carries `null` and stays exactly as immune as it is
   * today. **The tower question is not reopened**, and that is the point of the null rather than a 0.
   *
   * FIFTHS, and named `ehp` rather than `hp`, for the reason `Creature.ehp` records: the ladder is
   * `hp × (1 + 0.2·DEF)`, so this holds `unitPoolFifths(...)` and a reader who assumed hit points
   * would be wrong by a factor of five. That confusion cost a protocol bump once already.
   */
  ehp: number | null;
  /**
   * S141 P1 — STINK TOWER AMMO. How many stink bags remain unthrown. Meaningless for the other kinds
   * (seeded 0 and never read), which is why it is a plain non-optional number rather than a
   * per-kind sub-object: `Record<DefenderKind, …>` variance would force every consumer to narrow.
   *
   * ⚠ SERIALIZED ON PURPOSE, AND DERIVATION WAS CONSIDERED AND REJECTED. A count derived from tick
   * arithmetic cannot work: throwing is TARGET-GATED, so bags spent is not a pure function of
   * elapsed time. And the nearest existing analogue — the spawner's `spawnedCount` — RESETS TO 0 ON
   * EVERY LOAD, so a magazine modelled that way silently refills on save/load, on host migration and
   * on `?worker=1` restore.
   *
   * ⚠ FOUR SITES OR IT DESYNCS: this type, `SerializedDefender` + `serializeDefender` +
   * `deserializeDefender` (save.ts), and BOTH the `DefenderHashed` union AND the hand-written hash
   * projection in `stateHashFull.ts`. Only the hash UNION has a tsc tripwire; the projection and the
   * serializer are hand-maintained mirrors with no compile pressure at all.
   */
  bagsRemaining: number;
  /**
   * Tick the next fire ATTEMPT begins. SYNCED so the client derives the laser windup rings from
   * `nextFireTick - world.tick`. Re-phased on load to avoid an insta-fire (Council MF5).
   */
  nextFireTick: number;
  /** Current victim creature (the beam/slap endpoint). SYNCED so the client draws the strike. */
  targetCreatureId: CreatureId | null;
  /**
   * Position the last strike was aimed at, captured at FIRE entry. SYNCED so the client draws the
   * beam/slap to a fixed endpoint even though the victim creature vanishes the SAME tick it dies
   * (the wire-split lesson — a one-shot kill would otherwise leave the beam with no endpoint).
   * Cleared back to null on return to IDLE so it only rides the wire during FIRE/RECOVER.
   */
  lastStrikePos: Vec2 | null;
}

/** Per-kind FSM + combat tuning. One entry per DefenderKind (compile-time exhaustive). */
export interface DefenderConfig {
  readonly kind: DefenderKind;
  /** Ticks between fire attempts (turret 1800 / HELGA 90). */
  readonly fireIntervalTicks: number;
  /** Wind-up telegraph duration before the strike lands. */
  readonly windupTicks: number;
  /** Max distance (px) to the target creature for acquisition (+ for a turret, also the strike). */
  readonly attackRange: number;
  /**
   * S110 P4 — Verlet walk acceleration (px·s⁻²). 0 = stationary (turret: never walks). Princess > 0
   * → she walks to her target before striking.
   */
  readonly moveAccel: number;
  /**
   * S110 P4 — strike distance (px). The defender only enters WINDUP when within this of the target.
   * Turret meleeRange == attackRange (a ranged laser strikes at acquisition range → never WALKs);
   * princess meleeRange is small (must be adjacent).
   */
  readonly meleeRange: number;
  /**
   * ⭐ S151 P2 (owner R75 + R77) — WHERE THIS KIND'S DURABILITY COMES FROM, as an explicit choice.
   *
   * `null` ⇒ **its CONNECTORS carry it** (owner R75: *"towers have attack and piercing but not def
   * and hp because they are based on the connectors that build them"*). That is the laser turret and
   * the stink tree, and the stink tree in the owner's own words: *"it has hp based on its connectors
   * as based on current system we are creating."*
   *
   * An object ⇒ this kind is a **UNIT that happens to be implemented on the defender substrate**, and
   * carries its own HP/DEF on the shared ladder.
   *
   * ⭐ WHY THIS FIELD EXISTS AT ALL — R77 CORRECTED AN OVER-READING OF R75. S151 first removed `hp`
   * from EVERY defender kind, because R75 said "towers" have none. Then the owner's full stat table
   * listed HELGA at *"4atk, 4pierce, 6hp, 4 def"* and closed with *"those are all spawned units"* —
   * she was never in the "towers" R75 was talking about. She walks, chases and slaps; the turret and
   * the tree are emplacements. Only the emplacements draw durability from their structure.
   *
   * ⚠ NULL IS A DECLARED CASE, NOT AN ABSENT FIELD. Making it a required nullable rather than an
   * optional `hp?` is deliberate: an omitted field would mean "I forgot" and "connectors carry it"
   * with the same syntax, and this codebase has been bitten repeatedly by absent-means-default (see
   * the `serializeCreature` hp omission, which has now forced three protocol bumps).
   */
  readonly unitStats: { readonly hp: number; readonly def: number } | null;
  /*
   * ⛔ The old required `hp` is gone — see above.
   *
   * *"towers have attack and piercing but not def and hp because they are based on the connectors
   * that build them. its the connectors that have different hp and def (think about it)."*
   *
   * A tower's durability is the durability of the bonds holding its recipe together — see
   * `physics/bonds.ts` `damageFifths` and `state/stats.ts` `connectorCapacityFifths`. This is a
   * REVERSION, not an invention: defenders shipped with `DEFENDER_HP = 1e9`, a sentinel meaning
   * "defenders die by recipe-break, not damage", and the real hp that replaced it in S138 shipped
   * admitting it was "FIRST-PASS BALANCE … unvalidated by play". It never was validated, because
   * nothing in the game ever attacked a tower directly.
   */
  /**
   * S141 P1 — how many bags this kind starts with. 0 for every kind that has no magazine, which is
   * also what makes `bagsRemaining` inert for them.
   */
  readonly bags: number;
  /**
   * ⭐ S151 P2 (owner R72) — ATTACK POINTS on the shared 1..12 ladder, replacing `damageVsCreature`.
   *
   * ⛔ WHY THE RENAME MATTERS AND IS NOT COSMETIC. The old field's two shipped values were
   * `round(GOBLIN_MELEE_HP / 2)` and `GOBLIN_MELEE_HP` — one grunt's toughness WAS the tower roster's
   * damage scale, so the goblin could not be retuned without silently retuning every tower.
   * Owner R72: *"a goblins power should not be the backbone for the whole stat system."*
   * The values are unchanged (6 / 3 / 1); only their provenance is.
   *
   * ⚠ AND IT IS NO LONGER "VS CREATURE". Under R75 a tower with `structures` in its targeting row
   * deals this same `atk` to a CONNECTOR, compared on the same scale. One number, both target
   * families — which is the entire point of one shared ladder.
   */
  readonly atk: number;
  /**
   * PENETRATION points — the attacker's mirror of DEF. Zero across the shipped roster; stated rather
   * than omitted so the table reads as a deliberate row instead of an unfinished one.
   */
  readonly pen: number;
}

export const TURRET_DEFENDER_CONFIG: DefenderConfig = {
  kind: 'turret',
  fireIntervalTicks: TURRET_FIRE_INTERVAL_TICKS,
  windupTicks: TURRET_WINDUP_TICKS,
  attackRange: TURRET_ATTACK_RANGE,
  moveAccel: 0, // stationary — a turret never walks (its FSM stays byte-identical to pre-S110)
  meleeRange: TURRET_ATTACK_RANGE, // strikes at acquisition range → always "in melee" → never WALKs
  unitStats: null, // an emplacement — its connectors carry its durability (R75)
  bags: 0, // no magazine — the laser is not ammo-limited
  // ⭐ THE HEAVY WEAPON, top of the roster. The same 6 it has dealt since S148 — now STATED on the
  // shared ladder rather than DERIVED from a goblin's hit points (owner R72).
  atk: TURRET_BEAM_ATK,
  pen: TURRET_BEAM_PEN,
};

/**
 * S141 P1 — the STINK TOWER. Stationary like the turret (moveAccel 0 + meleeRange == attackRange, so
 * its FSM can never enter WALK), but short-ranged and ammo-limited: it lobs `bags` stink bags on a
 * slow cadence, then becomes a passive area denier when the magazine runs dry.
 */
export const STINK_TOWER_DEFENDER_CONFIG: DefenderConfig = {
  kind: 'stinkTower',
  // ⚠ NON-ZERO IS LOAD-BEARING: `loadRephaseDefenders` computes `% fireIntervalTicks` with no zero
  // guard, so a 0 here writes NaN into nextFireTick on every save/load and host migration.
  fireIntervalTicks: STINK_THROW_INTERVAL_TICKS,
  windupTicks: STINK_TOWER_WINDUP_TICKS,
  attackRange: STINK_TOWER_ATTACK_RANGE,
  moveAccel: 0, // stationary — a tower does not walk
  meleeRange: STINK_TOWER_ATTACK_RANGE, // lobs at acquisition range → always "in melee" → never WALKs
  // Owner R77, verbatim: "it has hp based on its connectors as based on current system we are
  // creating." A true emplacement, like the turret.
  unitStats: null,
  bags: STINK_TOWER_BAGS,
  // ⭐ S148 P2 — deliberately left at the shared single-hit value. The stink tower is the AREA
  // weapon: its damage comes from splashing several targets at once AND from chewing primitives,
  // which neither other kind does. Giving it single-target punch too would make it strictly better
  // than both. (It does not actually read this field — `stinkThrowBag` owns its own splash — but the
  // config is compile-time exhaustive, and a kind that silently omitted its damage would be the
  // next bug.)
  atk: STINK_BAG_ATK,
  pen: STINK_BAG_PEN,
};

export const PRINCESS_DEFENDER_CONFIG: DefenderConfig = {
  kind: 'princess',
  fireIntervalTicks: PRINCESS_SLAP_INTERVAL_TICKS,
  windupTicks: PRINCESS_WINDUP_TICKS,
  attackRange: PRINCESS_SLAP_RANGE, // S110 P4 — acquisition + chase-leash radius (from her hub)
  moveAccel: PRINCESS_MOVE_ACCEL, // S110 P4 — she walks to her target
  meleeRange: PRINCESS_MELEE_RANGE, // S110 P4 — must be adjacent to slap
  // ⭐ Owner R77 — HELGA IS A SPAWNED UNIT, not an emplacement, so she carries her own durability:
  // "Helga - 4atk, 4pierce, 6hp, 4 def … those are all spawned units."
  unitStats: { hp: PRINCESS_HP, def: PRINCESS_DEF },
  bags: 0, // no magazine — she slaps
  // ⭐ Fast, close, mid-damage — the middle rung. The same 3 as always, but no longer expressed as
  // half a goblin's hit points, so the goblin can finally be retuned without moving her (owner R70).
  atk: PRINCESS_ATK, // ⭐ R77 — 4 (was 3)
  pen: PRINCESS_PEN, // ⭐ R77 — 4 (was 0)
};

export const DEFENDER_CONFIGS: Readonly<Record<DefenderKind, DefenderConfig>> = {
  turret: TURRET_DEFENDER_CONFIG,
  princess: PRINCESS_DEFENDER_CONFIG,
  stinkTower: STINK_TOWER_DEFENDER_CONFIG,
};

export function getDefenderConfig(kind: DefenderKind): DefenderConfig {
  return DEFENDER_CONFIGS[kind];
}

/**
 * Factory for a freshly-registered defender (IDLE). `nextFireTick` is seeded one full interval
 * out so it doesn't fire on the ignition tick (mirrors the spawner's `+ SPAWN_INTERVAL_TICKS`
 * seed — the turret's first beam is its first charge cycle, not instant). `pos` is the anchor
 * primitive's position at ignition (the host refreshes it each poll).
 */
export function makeDefender(args: {
  id: DefenderId;
  kind: DefenderKind;
  ownerPlayerId: PlayerId;
  anchorPrimitiveId: PrimitiveId;
  recipeId: GodlyId;
  pos: Vec2;
  registeredAtTick: number;
}): Defender {
  const config = getDefenderConfig(args.kind);
  return {
    id: args.id,
    kind: args.kind,
    ownerPlayerId: args.ownerPlayerId,
    anchorPrimitiveId: args.anchorPrimitiveId,
    recipeId: args.recipeId,
    pos: { x: args.pos.x, y: args.pos.y },
    prevPos: { x: args.pos.x, y: args.pos.y }, // S110 P4 — starts at rest (prevPos == pos → v=0)
    walkTargetPos: null, // S110 P4 — not pursuing on ignition
    state: 'IDLE',
    ticksInState: 0,
    // ⭐ S158 P7 — a UNIT-class defender (Helga) gets a real pool off the shared ladder; a TOWER gets
    // null and stays immune to subtraction, exactly as R75 requires.
    ehp: config.unitStats === null ? null : unitPoolFifths(config.unitStats.hp, config.unitStats.def),
    bagsRemaining: config.bags, // S141 P1 — 0 for every kind without a magazine
    nextFireTick: args.registeredAtTick + config.fireIntervalTicks,
    targetCreatureId: null,
    lastStrikePos: null,
  };
}
