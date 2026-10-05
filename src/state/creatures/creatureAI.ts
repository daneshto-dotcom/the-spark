/**
 * SPARK — creature AI module (S27 P0). Pure functional helpers for target
 * selection. No WORLD mutation; no dispatch. ⚠ S190 P0 (C5): "pure" is no longer the whole story —
 * the bond scan memoises into a MODULE-LEVEL, per-tick cache (the bond-target index, see
 * `openBondTargetEpoch`). It never writes world or creature state and never changes a result — the
 * cache is reusable only inside the host tick's creature loop and is re-validated before every
 * scan — but it IS module state, which a reader of "pure" should know. Consumed by `applyCreatureTick`
 * (creatureLifecycle.ts) and the main.ts post-CREATURE_TICK fan-out which
 * re-selects targets every CREATURE_TICK during SEEKING (Council R1 Q3
 * UNANIMOUS A — every-tick re-selection, ~80 prims × 60Hz = 4800 distance
 * checks/s, negligible per blueprint § Performance Budget).
 *
 * Target priority (blueprint Q9 + Q12 LOCKED solo):
 *   1. Nearest ENEMY bond (either endpoint's `placerColor` ≠ creature owner's
 *      player color) — wins if at least one enemy bond exists.
 *   2. Nearest OWN bond (both endpoints' `placerColor` === creature owner's
 *      player color) — fallback when no enemy bonds exist. Q12 LOCKED for
 *      solo mode: "consequence of summoning a godly tax" — encourages
 *      cooldown awareness.
 *   3. `null` when world.bonds is empty — creature stays SEEKING the stub
 *      targetPos until DESPAWNING (no infinite loop, lifecycle still gates).
 *
 * Distance metric: squared distance from creature.pos to bond MIDPOINT (mean
 * of bond.a.pos + bond.b.pos). Pre-squared compare against VOLTKIN_ATTACK_RANGE_SQ
 * avoids sqrt. Tie-break: lowest BondId (deterministic — matters for replay +
 * 1v1 host-determinism per S26 PRIME-AUDIT Δ5 lessons).
 *
 * PRIME-AUDIT Δ2: enemy/own fallback exercised by creatureAI.test.ts covering
 * both 1v1 mode (mixed enemy + own bonds) and solo (own-bonds only).
 *
 * PRIME-AUDIT Δ3: multi-creature target conflict (blueprint Q10 known
 * limitation) — `findNearestBondTarget` is stateless, so two creatures
 * simultaneously in SEEKING with the same nearest enemy bond will BOTH
 * select that bondId. First CREATURE_ATTACK severs; second no-ops on
 * recheck (per applyCreatureAttack defense-in-depth). Acceptable v1 limit.
 */

import type { Bond } from '../../physics/bonds.ts';
import {
  ARMY_RETREAT_LEAD_TICKS,
  CANVAS_HEIGHT,
  CHASE_GIVEUP_SLACK_PX,
  CHASE_GIVEUP_SPEED_RATIO,
  CANVAS_WIDTH,
  PLAYER_COLORS,
  WORLD_EDGE_MARGIN,
} from '../../constants.ts';
import type { StinkCloudId, DefenderId, BondId, CreatureId, PlayerId, PrimitiveId, Vec2 } from '../../types.ts';
import { mix32 } from '../rng.ts';
import type { World } from '../world.ts';
import { isEnemySeat, sameTeam, sameTeamColor } from '../teams.ts';
import type { Creature } from './creature.ts';
import { isLiveCreatureTarget } from './creature.ts';
import { castleAnchor } from '../gatherers/gatherer.ts';
import { getCreatureConfig, isNonCombatantType, isUntargetableType } from './voltkin-config.ts';
import { zoneOf, zoneOwner } from '../zones.ts';
import { monsterVictimSeat } from '../endgame.ts';
import { creatureCanTarget } from '../stats.ts';

/**
 * S100 P1 (TD Phase 1a) — avalanche-mix two uint32s into one (murmur3-finalizer shape). Used by the
 * chewer FFA target-spread to deterministically bias a chewer toward a particular enemy player keyed
 * on (creatureId, sourceSpawnerId).
 *
 * ⚠ S141 P1 — THE BODY MOVED TO `state/rng.ts` AND THIS IS NOW A RE-EXPORT. It used to be a private
 * copy, byte-identical to a second private copy in `seagulls/seagullLifecycle.ts`, and this
 * docblock cited that sibling as "seagullLifecycle.ts:67" — a line number that had already drifted
 * to :68. Two hand-maintained copies of a hash whose only guarantee of agreement was a stale comment
 * is a silent-desync waiting to happen, so both now delegate to the one exported definition. The
 * math is unchanged, so every existing byte sequence is preserved (§3.2 rule 3).
 */
// (imported at the top of the file — see the `mix32` entry in the import block)

/**
 * Squared distance between two Vec2 points. Avoids sqrt for hot-path compare.
 */
export function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Midpoint of a bond — mean of its two endpoint primitive positions. The
 * primitives are accessed via the bond's `a` / `b` PhysicsBody refs (live
 * Verlet bodies — same object identity as `world.primitives.get(aId/bId)`).
 * Returns a NEW Vec2 (caller owns the value).
 */
export function bondMidpoint(bond: Bond): Vec2 {
  return {
    x: (bond.a.pos.x + bond.b.pos.x) * 0.5,
    y: (bond.a.pos.y + bond.b.pos.y) * 0.5,
  };
}

/**
 * Pure check: is this bond "enemy" for the given creature? A bond is enemy if
 * EITHER endpoint primitive's `placerColor` differs from the creature owner's
 * player color (mirrors disruptionManager.ts `canSeverBond` hostile definition
 * at line 69: `isHostile = primA.placerColor !== player.color || primB.placerColor !== player.color`).
 *
 * Returns `false` (own/friendly) when both endpoints share the owner color,
 * OR when either endpoint primitive is missing from the world (treat
 * degenerate bonds as non-enemy so the AI doesn't target zombie state).
 */
export function isEnemyBond(world: World, creature: Creature, bond: Bond): boolean {
  // S75 P3 — read the owner's LIVE colour (single source of truth), NOT the static palette, so
  // creature targeting stays coherent after a rainbow colour-shuffle remaps player.color +
  // prim.placerColor. In normal play player.color === PLAYER_COLORS[seat], so this is behaviour-
  // identical; the palette is only the fallback when the owner is somehow absent. Aligns with how
  // disruptionManager + territory already read player.color live.
  //
  // S100 P1 (TD Phase 1a, Layer 4, §3.4 R7) — the owner/ownerColor resolve is HOISTED into
  // `creatureOwnerColor` so the per-bond callers (findNearestBondTarget / spreadEnemyTarget)
  // can compute it ONCE per creature instead of once per bond. This public single-bond form is
  // behaviour-identical (it just resolves the colour then delegates), so existing call sites +
  // tests stay byte-for-byte.
  return isEnemyBondWithColor(world, creatureOwnerColor(world, creature), bond);
}

/**
 * S100 P1 (TD Phase 1a, Layer 4) — the owner's live colour, hoisted from `isEnemyBond` so the
 * per-bond loops resolve it ONCE per creature (§3.4 R7 perf mitigation). Live `player.color`
 * (post-rainbow-shuffle coherent), palette fallback when the owner is absent.
 */
function creatureOwnerColor(world: World, creature: Creature): number {
  const owner = world.players.get(creature.ownerPlayerId);
  return owner?.color ?? PLAYER_COLORS[creature.ownerPlayerId as unknown as number];
}

/**
 * S100 P1 (TD Phase 1a, Layer 4) — inner per-bond enemy test against a PRE-RESOLVED owner
 * colour. Identical predicate to `isEnemyBond` (either endpoint's placerColor ≠ ownerColor;
 * degenerate/missing-endpoint bonds are non-enemy), but without re-resolving the owner per
 * bond. Used by the hot target-scan loops below.
 */
function isEnemyBondWithColor(world: World, ownerColor: number, bond: Bond): boolean {
  const primA = world.primitives.get(bond.aId);
  const primB = world.primitives.get(bond.bId);
  if (primA === undefined || primB === undefined) return false;
  // ⭐ S192 — an endpoint is "mine" when it is on my TEAM (`sameTeamColor`; FFA: `=== ownerColor`).
  return !sameTeamColor(world, primA.placerColor, ownerColor) || !sameTeamColor(world, primB.placerColor, ownerColor);
}

/**
 * S139 P2 — find the nearest enemy PRIMITIVE for a structure-targeting creature (the goblin).
 *
 * ## Why this is a new sibling rather than a generalisation of the bond scan
 *
 * The owner ruled that goblins target "the nearest enemy primitive with hp". `findNearestBondTarget`
 * cannot be widened to serve that: it is `BondId`-returning and iterates `world.bonds`, and its
 * locomotion/selection output is a REPLAY-EQUIVALENCE GUARD for Voltkin (creatureAI.test.ts,
 * hostTick.differential.test.ts and save.replay.test.ts all pin byte-identical Voltkin behaviour).
 * Refactoring it into a generic scan would perturb that guarded path for zero benefit, so this is a
 * deliberate ~30-line sibling. Same shape, same disciplines:
 *
 * - Owner colour resolved ONCE (`creatureOwnerColor`), then a pure colour compare per primitive —
 *   the §3.4 R7 perf mitigation, not re-resolved in the hot loop.
 * - `placerColor` is the enemy discriminant, matching `isEnemyBondWithColor` exactly. NOT
 *   `ownerColor`: a territory-captured primitive keeps its original allegiance for targeting, which
 *   is the shipped semantics for bonds and must not silently differ for primitives.
 * - Tie-break on the lower `PrimitiveId`, so selection is deterministic across peers regardless of
 *   Map insertion order.
 * - **ENEMY-ONLY, with no own-target fallback.** This is the R8 lesson applied one family over: the
 *   Voltkin's `bestEnemyId ?? bestOwnId` fallback is a *Voltkin feature*, and inheriting it here
 *   would have goblins demolish their own player's shapes the moment no enemy shape existed. With
 *   no enemy primitive this returns null and the goblin idles harmlessly.
 * - `hp > 0` is required, per the owner's phrasing. Belt-and-braces: `damageEntity` already razes a
 *   primitive at hp ≤ 0 so a live zero-hp primitive should not exist, but asserting it here means a
 *   goblin can never commit to a corpse mid-raze.
 *
 * Pure. Does not mutate world or creature.
 */
/**
 * ⭐⭐⭐ S181 (owner) — **THE CLOSEST ATTACKABLE THING THAT IS NOT A CREATURE**: a lone shape, or a
 * standing building reached through its nearest connector — whichever is genuinely nearer.
 *
 * > *"All the creatures are targeting the castle rather than the towers and the connectors …
 * > there's stink towers and it's not even targeting it. That's wrong."*
 *
 * > *"Default, everything: prefer units inside its radius. With no unit in radius, attack the
 * > closest building, whatever it is. Because units are attacking you, so if someone is attacking,
 * > you're gonna want to attack them back. Same with buildings. If there's a defensive building like
 * > a stink tower, you know you want to attack it."*
 *
 * ## ⛔ WHY BOTH SCANS, AND WHY THE NEARER ONE WINS
 *
 * `findNearestEnemyPrimitiveFrom` deliberately skips any shape WITH a connector — S179's lone-shape
 * rule, and the owner's own reasoning: *"a building is killed through its connectors, not by eating
 * its bricks."* That left the 21 structure-attacking types with nothing to aim at once every loose
 * brick was gone, so they fell through to the castle march. `findNearestBondTarget` is the other
 * half, and it already existed — the lightning drone has used it since S113.
 *
 * ⛔ **PICKING THE NEARER IS THE WHOLE RULE, NOT A TIE-BREAK.** A shape-first ladder would re-create
 * his complaint in a new costume: a unit standing beside a stink tower would turn round and walk to a
 * loose brick on the far side of the map, because a lone shape existed *somewhere*. "The closest
 * building, whatever it is" only means anything if distance decides.
 *
 * ## THE PER-TYPE EXCEPTIONS HE RULED, ALL THREE HONOURED HERE
 *
 * · **Pencil chewer — connectors ONLY.** *"never people, ever."* It does not take this path at all
 *   (`targetsStructures` is false for it; it keeps its own committed-bond branch), so its behaviour
 *   is untouched by this function. Recorded here because a reader will ask.
 * · **Goblin suicide bomber — buildings first.** It is `selfExplode` + `targetsStructures`, so it
 *   arrives here and now gets the building it was ruled to prefer. Its health-based fallback is
 *   NOT built (see the carry-forward) and is not pretended to be.
 * · **Lightning drone — connectors only**, `targetsStructures: false`, its own every-tick branch.
 *
 * ⚠ TOTAL ORDER, SO TWO SIMS CANNOT DISAGREE. Both scans already break ties on id; the comparison
 * between them is on squared distance with the SHAPE winning an exact tie, deterministically. A
 * float compare of two squared integers is exact at these magnitudes, and `Map` iteration decides
 * nothing — which is the defect class this codebase spends most of its comments on.
 */
export function structureTargets(
  world: World,
  creature: Creature,
): { primitiveId: PrimitiveId | null; bondId: BondId | null } {
  const primitiveId = findNearestEnemyPrimitiveFrom(world, creature);
  /*
   * ⭐⭐ S193 P3-2 (owner) — **THE NEAREST ENEMY BUILDING, NOT A HASH-CHOSEN VICTIM.**
   *
   * > *"The orcs that are underneath me directly … they're not attacking me. They're going all the way
   * > diagonally to attack the Nagas … Is it because he has more points, he's stronger, or what? …
   * > simple creatures should target the nearest enemy spawn right around them first."* — owner, S193
   *
   * This line used to be `findNearestBondTarget(world, creature, true)`, which ends in the FFA spread:
   * with two or more enemy seats it picks the VICTIM by `mix32(id, sourceSpawnerId) % (n + 1)`, slot 0
   * = the SCORE LEADER (ties → lowest seat), and only then that victim's nearest bond. Measured S193 on
   * a 4P board through the real host tick (`nearestEnemyFirst.test.ts`): 9 of 25 orcs walked past the
   * enemy 380 px away to one 1370 px away, and 16 of 25 once the far seat led on points. So the answer
   * to his question was *points, a hash, and seat order on a tie — never geometry.*
   *
   * ⭐ NOW THE WHOLE LADDER IS GEOMETRY, IN A TOTAL ORDER: an enemy unit around it (`pickNavUnit`, 220 px)
   * → the nearer of the nearest lone enemy shape and the nearest STRICT enemy connector (squared
   * distance, then id) → the nearest live enemy keep (`enemyCastleMarchPos`). ⛔ The spread is untouched
   * for the CHEWER and the DRONE, which call `findNearestBondTarget(…, true)` from their own branches.
   */
  const bondId = nearestStrictEnemyBond(world, creature);
  if (primitiveId === null) return { primitiveId: null, bondId };
  if (bondId === null) return { primitiveId, bondId: null };

  const prim = world.primitives.get(primitiveId);
  const bond = world.bonds.get(bondId);
  if (prim === undefined) return { primitiveId: null, bondId };
  if (bond === undefined) return { primitiveId, bondId: null };

  const mid = bondMidpoint(bond);
  const dPrim = distSq(creature.pos, prim.pos);
  const dBond = distSq(creature.pos, mid);
  /*
   * ⛔ EXACTLY ONE OF THE TWO IS RETURNED. Setting both would put the creature into ATTACKING
   * against a bond while its navigation walked to a shape — the "pretending to attack and not
   * hitting anything" defect S177 P9 was written to kill.
   */
  return dBond < dPrim
    ? { primitiveId: null, bondId }
    : { primitiveId, bondId: null };
}

export function findNearestEnemyPrimitiveFrom(
  world: World,
  creature: Creature,
): PrimitiveId | null {
  let bestId: PrimitiveId | null = null;
  let bestDistSq = Infinity;
  const ownerColor = creatureOwnerColor(world, creature);

  for (const [primId, prim] of world.primitives) {
    if (sameTeamColor(world, prim.placerColor, ownerColor)) continue; // never your own — or a teammate's (S192) — shapes
    if (prim.hp <= 0) continue;
    /*
     * ⭐⭐⭐ S179 (owner) — **A BUILDING IS KILLED THROUGH ITS CONNECTORS, NOT BY EATING ITS BRICKS.**
     *
     * *"A creature stops targeting shapes that have connectors. That's it... He targets the
     * connectors. The whole building. A building that's built from many bricks... needs to be
     * destroyed by removing everything that sticks these bricks together."*
     *
     * ⛔ THIS IS THE HALF THAT TWO PREVIOUS ATTEMPTS MISSED, AND WHY THE RULE TOOK THREE SESSIONS.
     * This scan returned ANY enemy shape, connected or not. So the game had TWO parallel health
     * systems for one structure, and they disagreed:
     *   · attack its CONNECTOR → `structurePoolFifths(3)` = 24, then 14, then 6 — his ladder;
     *   · attack a MEMBER SHAPE → `PRIMITIVE_MAX_HP` = 70 — a separate number that ignored it.
     * Because killing a shape razes its incident bonds, the second path let a creature dismantle a
     * tower while never touching the pool that is supposed to defend it. Both earlier attempts tried
     * to fix the lone shape by retuning `PRIMITIVE_MAX_HP` — which, with this scan unchanged, made
     * every tower member a 5-fifth brick and one swing took a triangle from 3 connectors to 1.
     *
     * ⭐ WITH THIS LINE THERE IS ONE SYSTEM. A shape in a structure is simply not a target; the
     * structure is its connectors. A shape with NO connectors is the only shape that can be attacked
     * directly, and it is worth 5 — dies to anything. The ladder finally runs one way:
     * 5 (lone) → 6 (two shapes, one connector) → 14 → 24 → 36 → 50.
     *
     * ⚠ NOT TOUCHED, DELIBERATELY: `applyRadialDamage` still damages member shapes. An explosion is
     * area damage, not target ACQUISITION — it was never part of what he approved here, and
     * `damage.ts` documents that blasts take structures apart through their shapes on purpose.
     */
    if (prim.bonds.size > 0) continue;
    const dSq = distSq(creature.pos, prim.pos);
    if (
      dSq < bestDistSq ||
      (dSq === bestDistSq &&
        (bestId === null || (primId as unknown as number) < (bestId as unknown as number)))
    ) {
      bestDistSq = dSq;
      bestId = primId;
    }
  }
  return bestId;
}

/**
 * Find the nearest targetable bond for the creature. Returns the BondId of
 * the nearest enemy bond (priority 1), falling back to the nearest own bond
 * (priority 2) when no enemy bonds exist. Returns `null` when world.bonds is
 * empty.
 *
 * Distance metric: squared distance from `creature.pos` to bond MIDPOINT.
 * Tie-break: lowest BondId numerically (deterministic, replay-safe).
 *
 * Range gate is NOT applied here — caller decides if the resulting target is
 * close enough to enter ATTACKING (via `isWithinAttackRange` below) or should
 * be steered toward (SEEKING continues, targetPos = bondMidpoint).
 *
 * Does not mutate world or creature. Called every CREATURE_TICK
 * during SEEKING (host-only) per Council R1 Q3 UNANIMOUS A.
 * ⚠ S190 — no longer strictly "pure": inside the host tick's creature loop it reads, and may build,
 * the module-level per-tick bond-target index. Same inputs, same result; only the work is shared.
 *
 * ⭐ S190 P0 (C5) — the scan now runs over the BOND-TARGET INDEX below (one classification pass per
 * tick per owner colour, instead of one per creature), with byte-identical results. Every predicate,
 * the distance arithmetic and the `(distSq, bondId)` total order are unchanged; see the index's
 * docblock for how, and `bondTargetIndex.differential.test.ts` for the proof.
 */
/**
 * ⭐ S193 P3-2 — the nearest STRICT enemy connector (neither endpoint the creature's own colour), by
 * `(distSq, bondId)`, with NO FFA spread. The structure-attacker's bond (`structureTargets`). Same
 * per-tick bucket, same S162 strict set and same arithmetic as `findNearestBondTarget(…, true)` up to
 * its final spread line — `referenceNearestStrictEnemyBond` is the readable specification.
 */
export function nearestStrictEnemyBond(world: World, creature: Creature): BondId | null {
  return nearestBondIn(colourBucketFor(world, creatureOwnerColor(world, creature)).strict, creature.pos);
}

export function findNearestBondTarget(
  world: World,
  creature: Creature,
  enemyOnly: boolean = false,
): BondId | null {
  // S100 P1 (TD Phase 1a, Layer 4, §3.4 R7) — resolve the owner colour ONCE, then everything below
  // is keyed on it. Resolved LIVE on every call, so an owner whose colour changed simply reads a
  // different bucket.
  const ownerColor = creatureOwnerColor(world, creature);
  const bucket = colourBucketFor(world, ownerColor);

  // S100 P1 (TD Phase 1a) — chewers pass `enemyOnly: true` so they NEVER fall back
  // to the own-bond target (R8: that fallback is a Voltkin feature — without this a
  // chewer with no enemy in range would eat its own spawner). With no enemy bond the
  // chewer returns null and idles/SEEKs harmlessly. The Voltkin default
  // (`enemyOnly: false`) is byte-for-byte unchanged: `bestEnemyId ?? bestOwnId`.
  if (!enemyOnly) {
    return nearestBondIn(bucket.enemy, creature.pos) ?? nearestBondIn(bucket.own, creature.pos);
  }
  // ⛔ S162 — the enemy-only nearest set is the STRICT one (neither endpoint the owner's colour).
  // The reasoning lives where the set is built, in `buildColourBucket`.
  const bestEnemyId = nearestBondIn(bucket.strict, creature.pos);
  if (bestEnemyId === null) return null;

  // FFA target-spread (R-design §4.3): with multiple enemy PLAYERS present, bias
  // this chewer toward a particular victim (and toward the score leader) so a swarm
  // fans out across rivals instead of focus-firing the single geometrically-nearest
  // connector (which enables kingmaking). Deterministic — keyed on a stateless
  // mix32 hash of (creatureId, sourceSpawnerId); NO RNG stream, NO wall-clock.
  return spreadEnemyTarget(world, creature, bucket, bestEnemyId);
}

/**
 * S100 P1 — FFA target-spread for chewers. `fallbackEnemyId` is the overall-nearest
 * enemy bond (already computed); this picks a preferred victim player deterministically
 * and returns that player's nearest enemy bond, falling back to `fallbackEnemyId` when
 * there is only one enemy player (or the chosen victim somehow has no bond).
 *
 * Determinism: `mix32(creatureId, sourceSpawnerId)` picks among the distinct enemy
 * players (sorted ascending for stable indexing), with the score leader given one extra
 * weighted slot so the swarm leans toward the player in front (reinforces the hunter's
 * catch-up dynamic). Pure read; no mutation, no RNG, no wall-clock.
 *
 * ⭐ S190 P0 (C5) — its two full passes over `world.bonds` (the victim set, then the chosen victim's
 * nearest bond) were 41 % of the host tick on a 120-creature wave-5 board, measured. Both now read the
 * bucket: the victim list is built there once per tick, sorted exactly as before, and the second pass
 * visits only the chosen victim's bonds. ⛔ S191 C-6 — the universe is the STRICT enemy set now (the
 * S162 set the nearest scan uses), never the OR set: see `buildColourBucket`.
 */
function spreadEnemyTarget(
  world: World,
  creature: Creature,
  bucket: ColourBucket,
  fallbackEnemyId: BondId,
): BondId {
  // Distinct enemy players that own at least one enemy bond, sorted ascending (built once per tick).
  const victims = bucket.victims;
  if (victims.length <= 1) return fallbackEnemyId; // only one victim → no spread

  // Score leader among the candidate victims (highest scoreByPlayer; lowest-id
  // tie-break). Given one extra weighted slot below. Scores are read LIVE, never cached.
  let leader: PlayerId = victims[0];
  let leaderScore = -Infinity;
  for (const v of victims) {
    const s = world.scoreByPlayer.get(v) ?? 0;
    if (s > leaderScore) {
      leaderScore = s;
      leader = v;
    }
  }

  const h = mix32(creature.id as unknown as number, (creature.sourceSpawnerId ?? 0) as unknown as number);
  // N players + 1 leader-bonus slot. Slot 0 → leader; slots 1..N → uniform spread.
  const n = victims.length;
  const slot = h % (n + 1);
  const chosen: PlayerId = slot === 0 ? leader : victims[(slot - 1) % n];

  // Nearest enemy bond owned by the chosen victim (lowest-BondId tie-break).
  const pool = bucket.byVictim.get(chosen);
  const bestId = pool === undefined ? null : nearestBondIn(pool, creature.pos);
  return bestId ?? fallbackEnemyId;
}

/* ========================================================================== *
 *   S190 P0 (C5) — THE BOND-TARGET INDEX
 * ========================================================================== */

/**
 * ⭐⭐ S190 P0 (C5) — **ONE CLASSIFICATION PASS PER TICK PER COLOUR, NOT ONE PER CREATURE.**
 *
 * Owner, S189: *"it was lagging at about wave five. I thought we fixed the lags"*.
 *
 * MEASURED, not guessed (`c5HostTickMeasure.test.ts`: four seats, bots, a wave-5 board of ~236 shapes
 * and ~517 bonds, 120 creatures held): the host tick cost 6.6-7.1 ms mean and ~9.9 ms p95, so a
 * three-tick catch-up frame took 26-29 ms at p95 — the sim alone blew the 16.7 ms frame. Two thirds
 * of it was this scan. Every structure-attacker, every tick, walked EVERY bond THREE times (the
 * nearest scan, then `spreadEnemyTarget`'s victim pass and victim scan), with two to four `Map.get`s
 * and a fresh midpoint object per bond per pass. And what it recomputed — is this bond enemy for this
 * colour, strictly or not, and whose is it — does not depend on the creature at all, only on its
 * owner's colour.
 *
 * So that classification is done once per tick per owner colour and kept here; each creature's scan
 * is then one flat pass over pre-classified arrays, reading nothing but live positions.
 *
 * ## ⛔ BYTE-IDENTICAL, AND HOW
 *
 * - **Same predicates**, applied once instead of per creature: `isEnemyBondWithColor` for the Voltkin
 *   set and the spread's universe; the S162 AND-tightening for the enemy-only nearest set; every
 *   other bond — degenerate ones included — in the own-bond fallback, exactly where the old `else`
 *   put them.
 * - **Same arithmetic.** `nearestBondIn` performs the exact operations of
 *   `distSq(pos, bondMidpoint(bond))`, in the same order, on positions read LIVE at every scan. No
 *   position is ever cached, so anything that moves a shape mid-tick is seen.
 * - **Same total order.** `(distSq, bondId)`, lower id winning an exact tie. The arrays happen to be
 *   built in `world.bonds` order, and that order decides nothing — the tie-break is explicit, exactly
 *   as it was. The victim list is sorted numerically, exactly as it was.
 *
 * ## ⛔ THE HAZARD: BONDS DIE BETWEEN TWO CREATURES' SCANS
 *
 * The scans run INSIDE the host tick's creature loop, interleaved with CREATURE_ATTACK (a connector
 * gives way), DRONE_EXPLODE and SUICIDE_BLAST. The bond set a later creature sees is not the one an
 * earlier creature saw, so a cache built once and trusted would aim a creature at a bond that no
 * longer exists. Two rules make that impossible:
 *
 *  1. **A cache exists only inside an EPOCH** — `openBondTargetEpoch` / `closeBondTargetEpoch`, which
 *     `runHostTick` wraps around its creature loop and nothing else calls. Outside one (every test,
 *     every other caller) each call builds a throwaway index from the live world, so it cannot be
 *     stale by construction. An epoch is also keyed to its TICK, so one left open by an exception is
 *     inert from the next tick on.
 *  2. **Inside an epoch every scan re-validates in O(1)** against the fingerprint the index was built
 *     at — `world.bonds.size`, `world.nextBondId`, `world.primitives.size`, `world.nextPrimitiveId`,
 *     and the two Maps' identity — and rebuilds on any change. That is EXACT, not a heuristic,
 *     because of how ids are allocated: every bond is born through `makeBond`
 *     (`world.nextBondId++`), every shape through `world.nextPrimitiveId++`, and both leave only
 *     through `razePrimitives` — or wholesale, through the three `clear()` sites:
 *     `applyReturnToTitle` (gameMode.ts), `softReset` (gameState.ts) and `applySnapshotCore`, the
 *     save / snapshot restore (save.ts). All three run OUTSIDE the creature loop, and a clear drops
 *     both sizes to 0 in any case. A removal lowers a size and a birth bumps a counter, so no mix of
 *     the two can leave all four numbers where they were. (Save-load writes ids directly, but it
 *     rewrites the counters too, and never runs inside the loop.) A bond BORN mid-tick is therefore
 *     picked up by the very next scan, exactly as the live scan would. The site lists and their
 *     per-file counts are pinned in `bondTargetIndex.guards.test.ts`.
 *
 * ⚠ WHAT THE FINGERPRINT DOES NOT SEE, AND WHY THAT IS SAFE: a `placerColor` rewrite — only the
 * rainbow shuffle does one, from a player or bot intent, never from inside the creature loop — and a
 * `placedBy` rewrite, which nothing does. `bondTargetIndex.guards.test.ts` pins those writer sets and
 * the id-allocation sites mechanically, so a new writer turns a test red instead of silently staling
 * this cache. OWNER colours are safe to change at any time: a bucket is keyed by the colour VALUE and
 * every call re-resolves its creature's colour live.
 *
 * Proven, not argued: `bondTargetIndex.differential.test.ts` compares every scan the real host tick
 * makes against the verbatim pre-change scan (`bondTargetReference.fixtures.ts`), in place, with
 * severs, welds and razes injected between two creatures' scans, and forks the world so a reference
 * twin and an index twin are compared with `hashWorldStateFull` every tick.
 */
interface BondList {
  readonly bonds: Bond[];
  readonly ids: BondId[];
}

interface ColourBucket {
  /** `isEnemyBondWithColor` — the Voltkin enemy set, and the spread's whole universe. */
  readonly enemy: BondList;
  /** …AND neither endpoint is the owner's colour — the `enemyOnly` nearest set (S162). */
  readonly strict: BondList;
  /** Everything else, degenerate bonds included — the Voltkin own-bond fallback. */
  readonly own: BondList;
  /** Distinct `primA.placedBy` over `enemy`, ascending — the spread's victims. */
  readonly victims: readonly PlayerId[];
  /** `enemy`, bucketed by `primA.placedBy` — the spread's second pass. */
  readonly byVictim: ReadonlyMap<PlayerId, BondList>;
}

interface BondTargetIndex {
  readonly bondsMap: World['bonds'];
  readonly primsMap: World['primitives'];
  readonly bondCount: number;
  readonly nextBondId: number;
  readonly primCount: number;
  readonly nextPrimitiveId: number;
  readonly byColour: Map<number, ColourBucket>;
}

let epochWorld: World | null = null;
let epochTick = -1;
let epochIndex: BondTargetIndex | null = null;

/**
 * S190 P0 (C5) — open the one window in which the bond-target index may be REUSED between calls.
 * `runHostTick` calls it immediately before its creature loop, and nothing else may. See the index
 * docblock above for why the window is exactly that loop and no wider.
 */
export function openBondTargetEpoch(world: World): void {
  epochWorld = world;
  epochTick = world.tick;
  epochIndex = null;
  epochEnemyIndex = null; // S191 — the nav-unit index shares this window (see `EnemyCreatureIndex`)
}

/** S190 P0 (C5) — close it. `runHostTick` calls it immediately after its creature loop. */
export function closeBondTargetEpoch(): void {
  epochWorld = null;
  epochTick = -1;
  epochIndex = null;
  epochEnemyIndex = null;
}

function freshBondTargetIndex(world: World): BondTargetIndex {
  return {
    bondsMap: world.bonds,
    primsMap: world.primitives,
    bondCount: world.bonds.size,
    nextBondId: world.nextBondId,
    primCount: world.primitives.size,
    nextPrimitiveId: world.nextPrimitiveId,
    byColour: new Map(),
  };
}

function bondTargetIndexFor(world: World): BondTargetIndex {
  // Outside an epoch: a throwaway, built from the live world — it cannot be stale.
  if (epochWorld !== world || epochTick !== world.tick) return freshBondTargetIndex(world);
  const idx = epochIndex;
  if (
    idx !== null &&
    idx.bondsMap === world.bonds &&
    idx.primsMap === world.primitives &&
    idx.bondCount === world.bonds.size &&
    idx.nextBondId === world.nextBondId &&
    idx.primCount === world.primitives.size &&
    idx.nextPrimitiveId === world.nextPrimitiveId
  ) {
    return idx;
  }
  // Something was born or razed since the last scan (or this is the first scan of the loop).
  epochIndex = freshBondTargetIndex(world);
  return epochIndex;
}

function colourBucketFor(world: World, ownerColor: number): ColourBucket {
  const idx = bondTargetIndexFor(world);
  let bucket = idx.byColour.get(ownerColor);
  if (bucket === undefined) {
    bucket = buildColourBucket(world, ownerColor);
    idx.byColour.set(ownerColor, bucket);
  }
  return bucket;
}

/**
 * Classify every bond ONCE for one owner colour. The only filter is OWNERSHIP — no recipe, no
 * defender, no tower test (S181, pinned by `buildingTargeting.test.ts`).
 */
function buildColourBucket(world: World, ownerColor: number): ColourBucket {
  const enemy: BondList = { bonds: [], ids: [] };
  const strict: BondList = { bonds: [], ids: [] };
  const own: BondList = { bonds: [], ids: [] };
  const byVictim = new Map<PlayerId, BondList>();

  for (const [bondId, bond] of world.bonds) {
    if (!isEnemyBondWithColor(world, ownerColor, bond)) {
      // ⭐ S192 — a TEAMMATE's bond is not an enemy's and not mine either: filed nowhere, so the
      // Voltkin's own-bond fallback can never walk onto a friend's tower. In a free-for-all a
      // not-enemy bond is always own-coloured (or degenerate), so this skip never fires there.
      const oa = world.primitives.get(bond.aId);
      const ob = world.primitives.get(bond.bId);
      if (oa !== undefined && ob !== undefined && (oa.placerColor !== ownerColor || ob.placerColor !== ownerColor)) continue;
      // Own, or degenerate (an endpoint missing) — the pre-change `else` branch, exactly.
      own.bonds.push(bond);
      own.ids.push(bondId);
      continue;
    }
    // `isEnemyBondWithColor` is true only when BOTH endpoints exist, so both reads are defined here —
    // as they always were for the pre-change `strictlyEnemy`, whose `?.` could never short-circuit.
    const primA = world.primitives.get(bond.aId)!;
    const primB = world.primitives.get(bond.bId)!;
    /*
     * ⚠ MINE (S194 audit LOW-2, R192-T1 *"teammates never damage each other"*) — **A WELD WITH A TEAMMATE'S
     * END IS NOBODY'S TARGET.** The OR above files a weld between a TEAMMATE's shape and an ENEMY's shape as
     * enemy, and the Voltkin (the one `enemyOnly: false` caller of this set) could cut it — felling a connector
     * of his teammate's. For a TEAMMATE's endpoint this uses the STRICT reading: any teammate end ⇒ not a
     * target. His OWN end is unchanged (the Voltkin may still cut his own mixed welds — the documented fallback
     * below). FFA: a teammate colour is never a colour other than your own, so this never fires there.
     */
    const teammateEnd = (c: number): boolean => c !== ownerColor && sameTeamColor(world, c, ownerColor);
    if (teammateEnd(primA.placerColor) || teammateEnd(primB.placerColor)) continue;
    enemy.bonds.push(bond);
    enemy.ids.push(bondId);
    /**
     * ⛔ S162 POST-AUDIT — **`isEnemyBondWithColor` IS AN OR, SO A *MIXED* BOND READS AS ENEMY.**
     *
     * S161 fixed exactly this for the drone's SEVER loop, after the owner watched *"my own creature
     * destroy my own tower"*: cutting a connector with one endpoint of your own colour drops your hub
     * star's degree, breaks the recipe, and fires `STRUCTURE_SELFDESTRUCT`. But the fix was applied at
     * the drone's sever and NOT here, so the identical chain stayed reachable through the CHEWER — it
     * could still SELECT a mixed bond, walk to it, and chew it through.
     *
     * Tightening the `enemyOnly` branch closes the chewer AND the drone's target selection at one
     * point, and is an exact AND-tightening of the same predicate rather than a second, disagreeing one.
     *
     * ⭐ VOLTKIN IS DELIBERATELY UNTOUCHED. It passes `enemyOnly: false`, and its ability to cut its
     * own bonds is a documented feature (see the fallback note above), not an oversight.
     */
    if (!sameTeamColor(world, primA.placerColor, ownerColor) && !sameTeamColor(world, primB.placerColor, ownerColor)) {
      strict.bonds.push(bond);
      strict.ids.push(bondId);
      /*
       * ⛔ S191 C-6 — **THE SPREAD'S UNIVERSE IS THE STRICT SET TOO**, so it lives INSIDE this branch.
       *
       * S190 reported and did not change it (a pure performance change may not move an output): the
       * victims were built over the OR set, so a MIXED bond's `primA` could key a victim — even the
       * owner's own seat — and an enemy-only creature could be handed the mixed bond by the spread
       * right after the S162 tightening above refused it one. Merge owner's go (S191): *"C-6 go
       * (spreadEnemyTarget on the STRICT predicate — enforces the owner's S162 rule)"*. The reference
       * (`bondTargetReference.fixtures.ts`) moved first; `spreadStrict.test.ts` drives it through the
       * real host tick against a welded mixed-colour structure.
       */
      let v = byVictim.get(primA.placedBy);
      if (v === undefined) {
        v = { bonds: [], ids: [] };
        byVictim.set(primA.placedBy, v);
      }
      v.bonds.push(bond);
      v.ids.push(bondId);
    }
  }

  const victims = Array.from(byVictim.keys()).sort(
    (a, b) => (a as unknown as number) - (b as unknown as number),
  );
  return { enemy, strict, own, victims, byVictim };
}

/**
 * The nearest bond of `list` to `from`, lower BondId on an exact tie; `null` when the list is empty.
 *
 * ⛔ THE ARITHMETIC IS `distSq(from, bondMidpoint(bond))` WRITTEN OUT — the same operations in the
 * same order, `(a + b) * 0.5` then `from − mid`, then `dx² + dy²` — so every squared distance is
 * bit-identical to the pre-change scan's, and so is every comparison made on it. Inlined only to
 * drop the midpoint object the old loop allocated per bond per creature per tick.
 */
function nearestBondIn(list: BondList, from: Vec2): BondId | null {
  const bonds = list.bonds;
  const ids = list.ids;
  const fx = from.x;
  const fy = from.y;
  let best = -1;
  let bestDistSq = Infinity;
  for (let i = 0; i < bonds.length; i++) {
    const bond = bonds[i];
    const dx = fx - (bond.a.pos.x + bond.b.pos.x) * 0.5;
    const dy = fy - (bond.a.pos.y + bond.b.pos.y) * 0.5;
    const dSq = dx * dx + dy * dy;
    if (
      dSq < bestDistSq ||
      // Tie-break: lower BondId wins (deterministic), whatever order the list was built in.
      (dSq === bestDistSq && (best === -1 || (ids[i] as unknown as number) < (ids[best] as unknown as number)))
    ) {
      bestDistSq = dSq;
      best = i;
    }
  }
  return best === -1 ? null : ids[best];
}

/**
 * Pure check: is the given bond's midpoint within this creature's PER-TYPE attack
 * range of its current position? Squared compare; no sqrt. Caller fetches the bond
 * from world.bonds (returns false if bond is missing — defense-in-depth for race
 * conditions where the bond severs between target-selection and range-check within
 * the same physics tick).
 *
 * S102 #3 — reads `getCreatureConfig(creature.type).attackRange` instead of the
 * hardcoded `VOLTKIN_ATTACK_RANGE_SQ`. Before this, a chewer engaged at Voltkin's
 * 180 px (it "stood near the structure and chewed from afar"); now it uses the
 * chewer's 35 px so it walks right up to the connector before chewing. Voltkin's
 * config.attackRange is still 180, so its engage distance is byte-identical.
 */
export function isWithinAttackRange(world: World, creature: Creature, bondId: BondId): boolean {
  const bond = world.bonds.get(bondId);
  if (bond === undefined) return false;
  const range = getCreatureConfig(creature.type).attackRange;
  return distSq(creature.pos, bondMidpoint(bond)) <= range * range;
}

/**
 * ⭐⭐⭐ S177 P9 (owner) — **NOTHING SWINGS AT NOTHING. THE RULE, IN ONE PLACE.**
 *
 * Owner, after being shown that an army stood in a stink cloud swinging at a bag it could not reach:
 * *"They shouldn't swing at nothing. Enemies should swing at each other or at buildings or at
 * anything only when they reach it. And they have acquired the target. Like, you're targeting.
 * You're like, oh, okay. I'm attacking this thing, and that's it. I'm in range. I stop. I'm ready for
 * my attack. There shouldn't be pretending to attack and not hitting anything. That's just
 * ridiculous."*
 *
 * ⛔ THE BAG WAS ONE INSTANCE OF A GENERAL DEFECT, AND THE GENERAL CASE IS WORSE. Of the six
 * predicates that decide whether a committed attacker stays in ATTACKING, THREE tested only that the
 * target still EXISTS — `world.bonds.has(id)`, `world.creatures.has(id)`, `world.primitives.has(id)`
 * — with no notion of distance at all. That produced both halves of what he is ruling out:
 *
 *   · **swinging at nothing** — a creature committed to a SHAPE that drifted out of reach stayed
 *     ATTACKING (the shape still exists), while the strike arm re-checked range and silently
 *     `return`ed. Full animation, full cadence, zero damage, forever.
 *   · **hitting what it has not reached** — the CREATURE and BOND strike arms had no range gate at
 *     all, so a committed attacker landed blows from any distance whatsoever.
 *
 * These two helpers are the missing half. They are deliberately the SAME functions the strike arms
 * use, because the defect is not that either predicate was wrong — it is that there were TWO of them
 * and they disagreed. `creatureLifecycle`'s own note already states the principle this restores:
 * *"every one of these predicates is the SAME function the engage clause uses — not a
 * re-implementation."*
 *
 * ⚠ `attackRange`, NOT `engageRange`. A `holdsRange` unit engages at 0.9× and strikes at 1.0×, so
 * gating validity on the engage distance would invalidate an archer that is perfectly able to fire.
 * The predicate that matters is the one the STRIKE uses.
 */
export function isWithinAttackRangeOfCreature(
  world: World, creature: Creature, targetId: CreatureId,
): boolean {
  const victim = world.creatures.get(targetId);
  if (victim === undefined) return false;
  const range = getCreatureConfig(creature.type).attackRange;
  return distSq(creature.pos, victim.pos) <= range * range;
}

/** The shape half of the rule above. See `isWithinAttackRangeOfCreature`. */
export function isWithinAttackRangeOfPrimitive(
  world: World, creature: Creature, primId: PrimitiveId,
): boolean {
  const prim = world.primitives.get(primId);
  if (prim === undefined) return false;
  const range = getCreatureConfig(creature.type).attackRange;
  return distSq(creature.pos, prim.pos) <= range * range;
}

/**
 * S103 #8 — the GENERIC nearest-enemy-creature scan, the inverse of `findNearestBondTarget`
 * for the creature population. Returns the `CreatureId` of the nearest LIVE creature owned by
 * a DIFFERENT player than `ownerPlayerId`, within `maxRangeSq` (squared px) of `fromPos`, or
 * `null` if none. This is the ONE shared helper (Council MF7) used by:
 *   - Voltkin (#8) — opportunistic zap of a chewer that wanders within its attackRange;
 *   - the laser turret (P3) + HELGA (P4) — both `Defender`s pick their slap/beam victim with it.
 * That is why it takes a bare `(pos, ownerPlayerId, range)` rather than a `Creature` — a defender
 * is not a creature but targets the same population from the same rule.
 *
 * Determinism (replay + 1v1 host-authority): pure read, no `Math.random` / wall-clock; squared
 * distances (no sqrt); **lowest-`CreatureId` tie-break** on equal distance (V8 Map iteration is
 * insertion order, so the explicit id compare guarantees a stable pick regardless of insert order).
 * `excludeId` lets a creature-caller skip itself (a defender passes `undefined`).
 */
export function findNearestEnemyCreatureFrom(
  world: World,
  fromPos: Vec2,
  ownerPlayerId: PlayerId,
  maxRangeSq: number = Infinity,
  excludeId?: CreatureId,
  chaser?: Creature,
): CreatureId | null {
  // S192 T6 — only `pickNavUnit` passes a chaser. Every other caller (castle guns, defenders, the
  // Voltkin's in-reach zap) shoots and never chases, so for them this stays exactly the T13 scan.
  const chase = chaser === undefined ? null : chaseLimitsOf(world, chaser);
  let bestId: CreatureId | null = null;
  let bestDistSq = Infinity;
  for (const [id, c] of world.creatures) {
    if (id === excludeId) continue;
    if (sameTeam(world, c.ownerPlayerId, ownerPlayerId)) continue; // enemy-only — never a teammate (S192)
    /*
     * ⭐⭐ S169 (owner R142, and R121) — **CANNOT BE TARGETED, ENFORCED AT THE CHOKEPOINT.**
     *
     * Owner on the Pharaoh's locusts: *"locusts attack with 10 atk and 10 pen and they cannot be
     * targeted."* R121 wants the same for the submerged naga.
     *
     * ⭐ THIS ONE LINE COVERS EVERY CREATURE-TARGETING PATH IN THE GAME, which is the happy finding
     * of the enumeration: creature-vs-creature acquisition (`findNearestEnemyCreature` and the
     * standoff wrapper), the CASTLE GUNS (`castleGuns.ts`), every generic DEFENDER — laser turret,
     * Helga, the stink tower (`defenderLifecycle.ts`) — and the gatherer renderer's preview of the
     * castle gun all funnel through this function. So untargetability is inherited BY CONSTRUCTION
     * rather than by each future acquisition path remembering, which is exactly what the R142 design
     * note asked for.
     *
     * ⚠ AND IT IS DELIBERATELY *NOT* IMMUNITY. This gate makes a unit impossible to SELECT as a
     * target; it does not make it impossible to HURT. Area effects that sweep a region rather than
     * pick a victim — the potato's radial clear, the hub's self-destruct, the zombie rot aura, the
     * Kraken's own sonar cone — still reach it, because "cannot be targeted" is a statement about
     * ACQUISITION and reading it as invulnerability would make a 15-second locust cloud unkillable
     * by anything at all. `untargetableGates.test.ts` pins both halves.
     *
     * ⭐⭐ S192 T13 (owner) — and now NOT DEAD either: *"my spawn were attacking him, even though it
     * was already dead"*. `isLiveCreatureTarget` = live pool, not a corpse-in-waiting, AND not
     * untargetable — so the castle guns, every defender and the Voltkin's opportunism
     * stop picking bodies by the same construction that made them stop picking locust clouds.
     */
    if (!isLiveCreatureTarget(world, c)) continue;
    const dSq = distSq(fromPos, c.pos);
    if (dSq > maxRangeSq) continue; // range gate
    if (chase !== null && cannotCatch(chase, c, dSq)) continue; // S192 T6
    if (
      dSq < bestDistSq ||
      (dSq === bestDistSq &&
        (bestId === null || (id as unknown as number) < (bestId as unknown as number)))
    ) {
      bestDistSq = dSq;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * S103 #8 — convenience wrapper for a CREATURE attacker (the Voltkin path). Scans for the
 * nearest enemy creature within this creature's PER-TYPE `attackRange` of its own position,
 * excluding itself. Voltkin uses this for the OPPORTUNISTIC in-range zap (Council MF3): it
 * pursues enemy BONDS for navigation and only zaps a creature that is already within its
 * attack range — it never paths toward a distant creature. When no enemy creatures exist this
 * returns `null` and the Voltkin path is byte-identical to pre-S103 (MF4 determinism guard).
 */
export function findNearestEnemyCreature(world: World, creature: Creature): CreatureId | null {
  const range = getCreatureConfig(creature.type).attackRange;
  return findNearestEnemyCreatureFrom(
    world,
    creature.pos,
    creature.ownerPlayerId,
    range * range,
    creature.id,
  );
}


/* ========================================================================== *
 *   S153 P1 — owner R82/R83: unit-first navigation, arrival spread, castle march
 * ========================================================================== */

/**
 * R83 — pick the enemy UNIT a structure-attacker should navigate toward, with hysteresis.
 *
 * ⭐ THE HYSTERESIS NEEDS NO NEW FIELD, AND THAT IS THE WHOLE REASON THIS SHAPE WAS CHOSEN.
 * `held` is the value `creature.targetCreatureId` still carries from LAST tick — the field is
 * already declared, already serialized, already hashed and already cleared on every FSM
 * transition. Enumerating the chain for a genuinely new creature field first (the
 * `targetPrimitiveId` precedent) measured FOURTEEN files and ~45 sites, plus a hashed-state
 * question. Reusing the field that already persists costs zero of that.
 *
 * Returns the unit to chase, or `null` to fall through to the structure target.
 */
export function pickNavUnit(
  world: World,
  creature: Creature,
  held: CreatureId | null,
  acquireRadiusSq: number,
  leashRadiusSq: number,
): CreatureId | null {
  // Hold an existing lock while the quarry stays inside the (wider) leash. This is the branch
  // that kills the 60 Hz pirouette — see GOBLIN_UNIT_LEASH_RADIUS for why the radii differ.
  if (held !== null) {
    const quarry = world.creatures.get(held);
    if (
      quarry !== undefined &&
      isEnemySeat(world, quarry.ownerPlayerId, creature.ownerPlayerId) &&
      // ⭐⭐ S179 (owner) — **RETENTION MUST RE-CHECK UNTARGETABILITY, NOT ONLY ACQUISITION.**
      // The defender half of this was fixed in S171 (`defenderLifecycle.ts`, "without this line
      // every turret already locked onto him keeps firing into a creature that is between
      // realities"); the CREATURE half never was, and `creature.ts` asserts the rule is universal.
      // Consequence the owner approved fixing: a Pharaoh entering his 10 s Ra ritual becomes
      // untargetable, every unit already locked on him renewed that lock here, and because
      // ATTACKING returns ZERO_ACCEL they stood FROZEN for the full ritual dealing nothing —
      // his own S177 P9 complaint, *"pretending to attack and not hitting anything"*.
      // ⭐⭐ S192 T13 (owner) — AND A CORPSE IS NOT HELD. A quarry killed earlier in this tick stays
      // in the Map until the sweep; renewing the lock here walked the unit onto a body. The same
      // predicate as every pick (`isLiveCreatureTarget`), so acquire and hold cannot disagree.
      isLiveCreatureTarget(world, quarry) &&
      distSq(creature.pos, quarry.pos) <= leashRadiusSq &&
      // ⭐⭐ S192 T6 (owner) — AND LET GO OF WHAT YOU CANNOT CATCH. *"they ignore it if it's like way
      // too quick for them to actually catch up"*. A non-combatant faster than you and out of your
      // reach is dropped here, so the unit turns back to its push instead of chasing a drone across
      // the board (measured S192: one passing drone cost a melee goblin 40 % of its advance).
      !cannotCatch(chaseLimitsOf(world, creature), quarry, distSq(creature.pos, quarry.pos))
    ) {
      return held;
    }
  }
  // No lock, or the quarry died / broke the leash → re-acquire inside the tighter radius.
  // ⭐ S191 — through the per-tick enemy index when the host tick's creature loop is running (the
  // S190 epoch), else the live scan. Same answer either way — see `EnemyCreatureIndex`.
  return findNearestEnemyCreatureIndexed(
    world,
    creature.pos,
    creature.ownerPlayerId,
    acquireRadiusSq,
    creature,
  );
}

/** S192 T6 — what `cannotCatch` needs to know about the chaser, read once per scan. */
interface ChaseLimits {
  readonly pos: Vec2;
  /** `maxAccel` — the speed proxy (terminal speed ∝ maxAccel; only RATIOS are compared). */
  readonly speed: number;
  readonly giveUpAboveAccel: number;
  readonly reach: number;
  readonly reachSq: number;
  /** The chaser's OWN seat zone (`zoneOwner`), or `null` if the seat owns no ground. */
  readonly homeZone: number | null;
  readonly layout: World['layout'];
}

function chaseLimitsOf(world: World, chaser: Creature): ChaseLimits {
  const cfg = getCreatureConfig(chaser.type);
  const reach = engageRange(cfg) + CHASE_GIVEUP_SLACK_PX;
  return {
    pos: chaser.pos,
    speed: cfg.maxAccel,
    giveUpAboveAccel: cfg.maxAccel * CHASE_GIVEUP_SPEED_RATIO,
    reach,
    reachSq: reach * reach,
    homeZone: zoneOwner(chaser.ownerPlayerId as unknown as number, world.layout),
    layout: world.layout,
  };
}

/**
 * ⭐ S192 T6 (owner, refinement) — **CAN THE CHASER CUT THE QUARRY OFF BEFORE IT ARRIVES?**
 *
 * > *"if you can acquire the drone or a pencil chewer before he reaches his target … then you
 * > shouldn't ignore them"*
 *
 * The quarry is flying a straight line from its `pos` to its `targetPos` (the drone arm re-aims that
 * point at its connector every tick; a chewer's is its bond). P = the point of that segment nearest
 * the chaser. Feasible when the chaser can close to within its reach of P no later than the quarry
 * gets there: `max(0, |C−P| − reach) / v_chaser ≤ |A−P| / v_quarry`, cross-multiplied so nothing is
 * divided. ⚠ An approximation, stated: a straight path at cruise speed, no braking — the sim's own
 * steering is not simulated forward. A quarry with no path (`targetPos` on itself) has nothing to
 * cut off, so this is false and only reach/zone can engage it. Pure arithmetic on synced state, so
 * the host, a worker and a successor all agree.
 */
/** ⭐ S195 N11 — is the quarry going anywhere? Its path is `pos → targetPos`; under a pixel is "no path" (also rejects NaN). */
function quarryHasPath(quarry: Creature): boolean {
  const vx = quarry.targetPos.x - quarry.pos.x;
  const vy = quarry.targetPos.y - quarry.pos.y;
  return vx * vx + vy * vy >= 1;
}

function interceptFeasible(limits: ChaseLimits, quarry: Creature, quarrySpeed: number): boolean {
  const ax = quarry.pos.x;
  const ay = quarry.pos.y;
  const vx = quarry.targetPos.x - ax;
  const vy = quarry.targetPos.y - ay;
  const len2 = vx * vx + vy * vy;
  if (!(len2 >= 1)) return false; // no path to cut (also rejects NaN) — `quarryHasPath`
  let t = ((limits.pos.x - ax) * vx + (limits.pos.y - ay) * vy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const px = ax + t * vx;
  const py = ay + t * vy;
  const quarryTravel = t * Math.sqrt(len2);
  const cdx = limits.pos.x - px;
  const cdy = limits.pos.y - py;
  const chaserTravel = Math.max(0, Math.sqrt(cdx * cdx + cdy * cdy) - limits.reach);
  return chaserTravel * quarrySpeed <= quarryTravel * limits.speed;
}

/**
 * ⭐⭐ S192 T6 (owner) — **SMART, NOT "ALWAYS IGNORE".**
 *
 * > *"I didn't say ignore drones or pencil chewers all the time. It just has to be smart … if you can
 * > acquire the drone or a pencil chewer before he reaches his target, or if … the target is not too
 * > far from you, so you're still in your zone, then you shouldn't ignore them … I already destroyed
 * > his army, so I'm approaching to attack his buildings. But then one of his buildings produces a
 * > drone … my creatures are changing a target to his drone, and they're basically chasing down till
 * > the middle of the map … a never-ending cycle."* — owner, S192 refinement
 *
 * True (= skip it, at acquire AND at hold) only for a FAST NON-COMBATANT — cannot strike a unit
 * (`isNonCombatantType`: drone, chewer) and faster than `CHASE_GIVEUP_SPEED_RATIO` × the chaser (⚠
 * MINE) — when NONE of his three engage conditions holds:
 *   1. it is within the chaser's reach + `CHASE_GIVEUP_SLACK_PX` (⚠ MINE) — *"if it's around them"*;
 *   2. the chaser AND the quarry both stand inside the chaser's OWN seat zone — defending home, *"you're
 *      still in your zone"* (S193 audit: the chaser's own position too, not only the quarry's);
 *   3. an intercept is feasible (`interceptFeasible`) — *"before he reaches his target"*.
 * Outside all three it is outside your zone, faster than you, and you cannot get ahead of it: the
 * chase cannot close, so it is dropped and the unit's march / structure target resumes.
 *
 * ⭐ NO PING-PONG, AND NO MEMORY. The same predicate gates acquire and hold, so a dropped quarry cannot
 * be re-acquired until it re-enters one of the three — which is the "never re-acquire that same fast
 * quarry" rule with no new field, no history, and the `(distSq, id)` total order untouched (this only
 * removes candidates). A quarry that CAN strike is never skipped, so R184-A is untouched.
 */
function cannotCatch(limits: ChaseLimits, quarry: Creature, dSq: number): boolean {
  if (dSq <= limits.reachSq) return false; // 1 — *"maybe they target it if it's around them"*
  if (!isNonCombatantType(quarry.type)) return false; // it can hit back — R184-A
  const quarrySpeed = getCreatureConfig(quarry.type).maxAccel;
  if (quarrySpeed <= limits.giveUpAboveAccel) return false; // catchable: chase as before (ratio 1 since S195 N11)
  // 2 — home. ⭐ S193 audit: BOTH the quarry AND the chaser must stand in the chaser's own zone (*"you're
  // still in your zone"* = the unit's own position). Testing the quarry alone let a unit abroad near the
  // border re-acquire a drone crossing into its home zone at 88–202 px and turn back (2–4 pickups a drone).
  /*
   * ⭐⭐ S195 N11 (owner) — **HOME NO LONGER ENGAGES BY ITSELF.** *"they should know … if they can't chase it
   * down before he gets to his target or before he's out of reach … more dynamic and smart"* — his slow
   * scarabs chased an incoming chewer across their own zone until a stink tower killed it. At home a MOVING
   * quarry is engaged only if the intercept (3) is feasible; a quarry GOING NOWHERE is not getting away and is
   * engaged as before. ⛔ S195 audit (HIGH) — "going nowhere" is a STATE, not a vector: a chewer committed to a
   * connector is in ATTACKING and coasts (its `targetPos` stays on the bond midpoint, ~16 px off, so a
   * "path under a pixel" test never fired for a real gnawer — only for hand-set fixtures). So: `ATTACKING`
   * (a drone never enters it — drone cases unchanged) OR no path at all (`quarryHasPath`).
   * Abroad, a stationary quarry is still dropped (S192: a drone idling at its hub is not chased across the map).
   */
  const home =
    limits.homeZone !== null &&
    zoneOf(limits.pos, limits.layout) === limits.homeZone &&
    zoneOf(quarry.pos, limits.layout) === limits.homeZone;
  if (home && (quarry.state === 'ATTACKING' || !quarryHasPath(quarry))) return false;
  if (interceptFeasible(limits, quarry, quarrySpeed)) return false; // 3 — cut it off (home or abroad)
  return true;
}

/**
 * ⭐ S191 (`s191/perf`, owner C5: *"it was lagging at about wave five"*) — THE NAV-UNIT ENEMY INDEX.
 *
 * `pickNavUnit`'s re-acquire was the next hotspot after S190's bond index (9.0-9.6 % of a wave-5 host
 * tick with 120 creatures, V8 profile — `S191_PROGRESS_perf.md`): every structure-attacker, every
 * tick, walked the WHOLE `world.creatures` Map — its own seat's units included — to find one enemy.
 * Inside the creature loop it now walks a flat list, built once per seat per tick, of exactly the
 * creatures that seat can target by OWNER.
 *
 * ## ⛔ WHAT IS CACHED, AND WHAT IS NOT (Council S191 item 2)
 *
 * Cached: WHICH creatures are enemies of a seat — the live creature OBJECTS the Map holds and their
 * Map keys — and the one half of untargetability that cannot change, `isUntargetableType(c.type)`
 * (`Creature.type` is `readonly`, `CREATURE_CONFIGS` is `Readonly` and never written; both pinned by
 * the guards). Nothing else. Every value that can change inside the loop is read LIVE at the call,
 * from the object, exactly as `findNearestEnemyCreatureFrom` reads it: its position (never copied),
 * the other half of untargetability (`isChannellingRa(c, tick)` — the Ra ritual is stamped mid-loop by
 * a lethal blow; `typeFlag || channelling` is `isUntargetable` exactly), the range gate, and the
 * `(distSq, id)` total order, lower id winning an exact tie. The result is the lexicographic minimum of
 * `(distSq, id)` over the eligible set, so the list's order decides nothing (a NaN distance is never
 * selected, in either version).
 *
 * ⭐ S192 T13 — A CREATURE KILLED EARLIER IN THE SAME LOOP IS NOW SKIPPED, LIVE. Under the S155 N1
 * deferral it stays in `world.creatures` (with `ehp <= 0`, in `pendingCreatureDeaths`) until the sweep
 * after the loop. S191 kept it — byte-identical to the live scan, and the question was reported. The
 * owner then ruled it a bug (*"my spawn were attacking him, even though it was already dead"*), so the
 * live scan and this index both apply `isLiveCreatureTarget` at the call. ⛔ It is read LIVE, never
 * cached into the per-seat list: `ehp` and `pendingCreatureDeaths` change between two calls of one
 * tick, and the list stays membership-only, so the fingerprint argument below is untouched. The
 * reference moved first (`navUnitReference.fixtures.ts`), and the differential still proves the two
 * agree on every call.
 *
 * ## WHY THE CACHE CANNOT GO STALE
 *
 *  1. **It lives only inside the S190 epoch** (`openBondTargetEpoch` … `closeBondTargetEpoch`, opened
 *     immediately around `runHostTick`'s creature loop and keyed to its tick). Outside it this is the
 *     live scan, verbatim — every other caller of the enemy search is untouched.
 *  2. **Membership is re-validated before EVERY call** against an exact O(1) fingerprint:
 *     `world.creatures` identity, its size, and `world.nextCreatureId`. Exact because every creature
 *     is born through `world.nextCreatureId++` (creatureLifecycle.ts, three sites) and leaves only
 *     through `world.creatures.delete` (four sites) or a `clear()` (title-return, godly abort,
 *     snapshot restore — all outside the loop, and a clear drops the size to 0): a removal lowers the
 *     size and a birth bumps the counter, so no mix of the two leaves both where they were. The only
 *     `set` of an EXISTING id is the snapshot restore, after its `clear()`. A creature born or
 *     removed mid-loop is therefore seen by the very next call, exactly as the live scan sees it.
 *  3. **Ownership cannot change**: `Creature.ownerPlayerId` is `readonly` and never written.
 * The writer sites and counts are pinned in `navUnitIndex.guards.test.ts`, so a new one turns a test
 * red instead of silently staling this. Proven, not argued: `s191Perf.differential.test.ts` compares
 * every `pickNavUnit` call the real host tick makes against the verbatim pre-change function
 * (`navUnitReference.fixtures.ts`), in place, with kills, removals and births injected between two
 * calls, and runs a reference twin beside an index twin with `hashWorldStateFull` every tick.
 */
interface EnemyList {
  /** Map keys, in `world.creatures` order (which decides nothing — the tie-break is explicit). */
  readonly ids: CreatureId[];
  /** The live objects under those keys. Read live at every call; nothing is copied out of them. */
  readonly creatures: Creature[];
  /** `isUntargetableType(creatures[i].type)` — static for a creature's whole life (see above). */
  readonly untargetableType: boolean[];
}

interface EnemyCreatureIndex {
  readonly creaturesMap: World['creatures'];
  readonly count: number;
  readonly nextCreatureId: number;
  readonly bySeat: Map<PlayerId, EnemyList>;
}

let epochEnemyIndex: EnemyCreatureIndex | null = null;

function enemyListFor(world: World, seat: PlayerId): EnemyList {
  let idx = epochEnemyIndex;
  if (
    idx === null ||
    idx.creaturesMap !== world.creatures ||
    idx.count !== world.creatures.size ||
    idx.nextCreatureId !== world.nextCreatureId
  ) {
    // First call of the loop, or a creature was born / removed since the last call: rebuild.
    idx = { creaturesMap: world.creatures, count: world.creatures.size, nextCreatureId: world.nextCreatureId, bySeat: new Map() };
    epochEnemyIndex = idx;
  }
  let list = idx.bySeat.get(seat);
  if (list === undefined) {
    const ids: CreatureId[] = [];
    const creatures: Creature[] = [];
    const untargetableType: boolean[] = [];
    for (const [id, c] of world.creatures) {
      if (sameTeam(world, c.ownerPlayerId, seat)) continue; // enemy-only — the live scan's owner filter, hoisted (S192: by team)
      ids.push(id);
      creatures.push(c);
      untargetableType.push(isUntargetableType(c.type));
    }
    list = { ids, creatures, untargetableType };
    idx.bySeat.set(seat, list);
  }
  return list;
}

/**
 * S191 — `findNearestEnemyCreatureFrom`, answered from the epoch's enemy list when the epoch is open
 * for this world and tick; otherwise it IS `findNearestEnemyCreatureFrom`. Same filters, same
 * arithmetic (`distSq`), same `(distSq, id)` rule — see `EnemyCreatureIndex`.
 */
function findNearestEnemyCreatureIndexed(
  world: World,
  fromPos: Vec2,
  ownerPlayerId: PlayerId,
  maxRangeSq: number,
  chaser: Creature,
): CreatureId | null {
  const excludeId = chaser.id;
  if (epochWorld !== world || epochTick !== world.tick) {
    return findNearestEnemyCreatureFrom(world, fromPos, ownerPlayerId, maxRangeSq, excludeId, chaser);
  }
  const chase = chaseLimitsOf(world, chaser); // S192 T6 — chaser-relative, so read here, never cached in the list
  const list = enemyListFor(world, ownerPlayerId);
  const ids = list.ids;
  const creatures = list.creatures;
  const untargetableType = list.untargetableType;
  let bestId: CreatureId | null = null;
  let bestDistSq = Infinity;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    if (id === excludeId) continue;
    const c = creatures[i]!;
    // The static TYPE half of untargetability, precomputed, short-circuits first; everything that can
    // change mid-loop — the Ra ritual, a lethal deferred blow (S192 T13) — is read LIVE.
    if (untargetableType[i] || !isLiveCreatureTarget(world, c)) continue;
    const dSq = distSq(fromPos, c.pos); // live position, never a copy
    if (dSq > maxRangeSq) continue; // range gate
    if (cannotCatch(chase, c, dSq)) continue; // S192 T6 — static config + this dSq, read live
    if (
      dSq < bestDistSq ||
      (dSq === bestDistSq &&
        (bestId === null || (id as unknown as number) < (bestId as unknown as number)))
    ) {
      bestDistSq = dSq;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * R82 — a per-creature point on a small ring around `target`, so N goblins converging on one
 * shape form a rough arc instead of a single pile.
 *
 * Deterministic by CONSTRUCTION: a pure function of the creature id and nothing else. No draw, no
 * tick, no wall-clock — so it cannot move the RNG stream and cannot diverge between the host and
 * the worker sim. The golden angle keeps successive ids well separated rather than clustering the
 * way `id % k` buckets would.
 */
export function spreadTargetPos(target: Vec2, creatureId: CreatureId, radius: number): Vec2 {
  const GOLDEN_ANGLE = 2.399963229728653; // π(3 − √5)
  const angle = ((creatureId as unknown as number) + 1) * GOLDEN_ANGLE;
  return { x: target.x + Math.cos(angle) * radius, y: target.y + Math.sin(angle) * radius };
}

/**
 * ⭐ S154 P2 — WHERE A STANDOFF FIGHTER ACTUALLY WANTS TO STAND: on a ring around its victim, not
 * on top of it.
 *
 * ## The bug this closes, and why the obvious fix was not enough
 *
 * A ranged creature was steered straight AT its victim and relied on the FSM to stop it: entering
 * ATTACKING makes `computeSteeringAccel` return `ZERO_ACCEL`. The first fix attempt kept it in
 * ATTACKING across cadences so it never got another acceleration impulse — correct, and still not
 * enough, because **ZERO_ACCEL means COAST, NOT STOP**. `VELOCITY_DAMPING` is 0.998 per substep
 * (≈0.984 per tick), so a unit that spent its whole approach accelerating arrives carrying ~2.8
 * px/tick and glides `v / (1 − 0.984) ≈ 175 px` further before that bleeds away — further than the
 * entire standoff it was supposed to hold. Measured with the real host tick: the bat rider still
 * ended up 18 px from a shape he is meant to harpoon from 150.
 *
 * So the destination itself has to be the ring. `arriveForce` already ramps its force down linearly
 * inside `CREATURE_ARRIVE_RADIUS`, which means a creature aimed at the ring DECELERATES into it and
 * arrives slow — no coast to absorb. That is existing, tested machinery doing the braking, rather
 * than a new velocity clamp bolted onto the physics.
 *
 * ## Why 0.85 of the range and not 1.0
 *
 * The ring has to sit INSIDE `attackRange`, or the creature parks exactly on the boundary where the
 * engage predicate is `<=` and jitters in and out of ATTACKING as the solver nudges it. 0.85 leaves
 * a comfortable band that is still unmistakably a standoff (128 px of the bat's 150, 187 of the
 * archer's 220).
 *
 * PURE: a function of two positions and one constant. No rng, no wall-clock, no world mutation.
 */
export function standoffTargetPos(
  from: Vec2,
  target: Vec2,
  attackRange: number,
  creatureId: CreatureId,
): Vec2 {
  const dx = from.x - target.x;
  const dy = from.y - target.y;
  const ring = attackRange * STANDOFF_RANGE_FRACTION;
  const d = Math.hypot(dx, dy);
  // Degenerate: sitting exactly on the target. Any direction is as good as another, and a FIXED one
  // keeps this deterministic — picking by rng here would desync a replay.
  const base = d < 1e-6 ? 0 : Math.atan2(dy, dx);
  /*
   * ⚠ THE SQUAD SPREAD IS AN ANGLE HERE, NOT AN OFFSET, and that is the whole reason this function
   * takes an id. The goblin branch normally scatters a squad with `spreadTargetPos`, which
   * TRANSLATES the destination by up to GOBLIN_SPREAD_RADIUS (26 px) in a golden-angle direction.
   * Applied to a standoff ring that is only `attackRange × 0.15` inside the engage distance, a
   * translation pointing straight at the victim eats the entire margin and puts the unit back inside
   * the melee band. Rotating ALONG the ring spreads the squad into a firing arc while keeping every
   * member exactly `ring` px from the victim — which is what a line of archers should look like
   * anyway.
   */
  const GOLDEN_ANGLE = 2.399963229728653; // π(3 − √5) — the same idiom as `spreadTargetPos`
  const arc = Math.cos(((creatureId as unknown as number) + 1) * GOLDEN_ANGLE) * STANDOFF_ARC_RAD;
  const angle = base + arc;
  /*
   * ⛔⛔⛔ S178 (owner) — **AND THE RING IS CLAMPED TO THE PLAYFIELD, BECAUSE IT IS THE ONE TARGET
   * PRODUCER THAT CAN POINT OFF THE BOARD.**
   *
   * Owner, S178: *"it just chased them out of bounds, like, above my castle to the east."*
   *
   * Every other producer in this file returns an entity position ±26–46 px. This one projects a
   * destination `ring` px AWAY from the victim — 176 px for a goblin archer — and anchors it to a
   * VICTIM THAT KEEPS CLOSING. So each cadence the ring is regenerated further out while the chaser
   * sits at 35 px: a demanded ~141 px/s of retreat against the archer's own ~102 px/s, sustained, in
   * whatever direction the chase presses. Seat 1's keep is 120 px from the east edge — 1.18 s of that
   * — and `pickNavUnit`'s leash cannot save it, because that leash is measured from the creature's
   * OWN position and is therefore a dead-band that never breaks during a chase.
   *
   * ⚠ THE INTEGRATOR CLAMP ALONE IS NOT ENOUGH, which is why this is here as well. `creatureVerletStep`
   * now refuses to move a unit past the edge, but a destination that still sits outside keeps the
   * whole clump pressed flat against an invisible wall for the rest of the FIGHT — broken in a
   * different way rather than fixed. Clamping the DESTINATION lets a cornered standoff unit slide
   * along the edge instead of grinding into it.
   *
   * ⚠ AND THIS DOES SHORTEN THE RING WHEN THE EDGE IS CLOSE — say so plainly. ⛔ S178 SECOND PASS:
   * an earlier version of this note claimed the ring was *"NOT SHORTENED, ONLY BOUNDED"*, which is
   * false: clamping the DESTINATION moves it off the ring, so a standoff unit backed against the
   * wall ends up closer to its victim than its `attackRange` wants — sometimes into melee. That is
   * the honest consequence of having an edge at all, and it is the LESSER of the two evils (the
   * alternative is the unit walking off the board, which is the bug being fixed). Whether a cornered
   * archer should instead SLIDE ALONG the edge to keep its range is a combat-feel decision the owner
   * has ruled on twice, so it is in the S178 open questions rather than decided here.
   */
  const rx = target.x + Math.cos(angle) * ring;
  const ry = target.y + Math.sin(angle) * ring;
  return {
    x: Math.max(WORLD_EDGE_MARGIN, Math.min(CANVAS_WIDTH - WORLD_EDGE_MARGIN, rx)),
    y: Math.max(WORLD_EDGE_MARGIN, Math.min(CANVAS_HEIGHT - WORLD_EDGE_MARGIN, ry)),
  };
}

/**
 * ⭐ S154 AMENDMENT C (owner A4 / R89) — the ENEMY CASTLE this creature is standing close enough to
 * hit, or null.
 *
 * ⛔ ONE DEFINITION, THREE CALLERS, and that is the whole point of extracting it. The castle strike
 * needs the same question answered in three places — the FSM (may I enter ATTACKING?), the host-tick
 * fire gate (is there anything to dispatch?) and the strike itself (what do I hit?) — and S139 P2
 * left a comment one screen away recording what happens when they disagree: a goblin *"would enter
 * ATTACKING, run its whole cadence and never actually hit anything"*. That is exactly what the first
 * cut of this feature did, because the fire gate required a target ID and a castle attacker has none.
 *
 * Derived from POSITION, so it costs no new creature field: `targetCastleSeat` would be new hashed,
 * serialized state needing two edits in `stateHashFull`, where position is already both.
 *
 * PURE. Lowest seat wins ties, so two peers cannot pick different castles.
 */
export function enemyCastleInReach(world: World, creature: Creature, reach: number): PlayerId | null {
  /*
   * ⭐ S157 B5 (owner) — EVERY OFFENSIVE UNIT CAN HIT A CASTLE, not just the shape-attackers.
   *
   * Owner: *"pencil chewers should also target castle (also voltkin and drones and every creature
   * that is offensive to towers (not helga)), instead after all enemy structures are destroyed
   * pencil chewers just stand there idle...."*
   *
   * This one line was half the bug. `targetsStructures` means "attacks SHAPES" — it is false for the
   * chewer, the Voltkin and the drone, all of which attack CONNECTORS instead. Gating the castle on
   * it meant a chewer standing ON the enemy keep could never enter ATTACKING against it, because
   * this function is the sole authority behind all three castle sites (the engage predicate, the
   * abort predicate and the strike). Proven before the fix: `castleInReach — chewer=null
   * voltkin=null drone=null goblin=1`.
   *
   * ⚠ "not helga" needs no clause here: Helga is a DEFENDER, not a creature, and never reaches this
   * function at all.
   */
  /*
   * ⭐ S193 (audit) — A PANTS STRIKES ONLY ITS VICTIM'S KEEP. It belongs to no seat, so "not my seat"
   * admitted EVERY keep it walked past, and the lowest seat in reach won — the engage, abort and
   * strike sites all read this one function. Its victim is `monsterVictimSeat` (derived, synced).
   */
  const isPants = creature.type === 'endgameMonster' || creature.type === 'megaPants';
  const onlySeat = isPants ? monsterVictimSeat(world, creature) : null;
  if (isPants && onlySeat === null) return null;
  let best: PlayerId | null = null;
  for (const seat of world.players.keys()) {
    if (sameTeam(world, seat, creature.ownerPlayerId)) continue; // S192 — never a teammate's keep
    if (isPants && seat !== onlySeat) continue;
    const victim = world.players.get(seat);
    if (victim === undefined || victim.castleHp <= 0) continue;
    const a = castleAnchor(seat as unknown as number, world.layout);
    if (distSq(creature.pos, { x: a.x, y: a.y }) > reach * reach) continue;
    if (best === null || (seat as unknown as number) < (best as unknown as number)) best = seat;
  }
  return best;
}

/**
 * ⭐ S158 P7 (CF-S157-c) — **A KILLABLE ENEMY DEFENDER IN REACH — i.e. HELGA.**
 *
 * Owner: she should hold the field *"until she is destroyed herself"*. Something has to be able to
 * destroy her, and the units already walking past her are the obvious candidates.
 *
 * ⚠ `ehp !== null` IS THE WHOLE FILTER, AND IT IS NOT A PROXY — it is the same discriminator the
 * damage arm uses. A tower has `null`, so a goblin can never enter ATTACKING against a turret it
 * cannot hurt, and R75's tower ruling stays untouched. Towers die by recipe-break, as always.
 *
 * Deterministic: LOWEST DEFENDER ID wins ties, mirroring `enemyCastleInReach`'s lowest-seat rule.
 * Nearest-first would be more natural to a player and is deliberately NOT used — a distance
 * comparison between two defenders at equal range would be settled by float noise, and float noise
 * is how a host and its mirror stop agreeing.
 *
 * PURE: reads world, mutates nothing.
 */
export function killableDefenderInReach(
  world: World,
  creature: Creature,
  reach: number,
): DefenderId | null {
  /*
   * ⭐⭐ S194 (T8, owner D) — HELGA IS A UNIT (R77), SO A STRUCTURES-ONLY CREATURE NEVER REACHES HER.
   * *"they only target … buildings, towers, and connectors. And … free shapes. That's their whole
   * point."* — owner, S194, on the pencil chewer and the lightning drone. Measured before this line
   * (`chewerDroneTargets.test.ts`): a chewer beside an enemy Helga spent its bites on HER (4 × 7 fifths
   * in 900 ticks) and a drone struck her 14 × 30 — this arm runs above the bond arm in
   * `applyCreatureAttack`, and its engage term put both into ATTACKING. Gated HERE, once, so all seven
   * readers (engage, re-validation, the fire clause, the strike arm, both retaliation scans) agree.
   */
  if (!creatureCanTarget(creature.type, 'units')) return null;
  let best: DefenderId | null = null;
  for (const d of world.defenders.values()) {
    if (sameTeam(world, d.ownerPlayerId, creature.ownerPlayerId)) continue; // enemy-only, like every other target
    if (d.ehp === null) continue; // a TOWER — nothing to subtract from, so nothing to attack
    if (distSq(creature.pos, d.pos) > reach * reach) continue;
    if (best === null || (d.id as unknown as number) < (best as unknown as number)) best = d.id;
  }
  return best;
}

/**
 * ⭐ S158 A2 (owner R77) — **AN ENEMY STINK BAG IN REACH.**
 *
 * *"destructible stink bags as entities with aggro and on-destroy damage"*. A bag on the ground is
 * now something a unit can deal with rather than only something it dies in, and this is how a unit
 * finds one it is already standing at.
 *
 * ⚠ REACH IS MEASURED TO THE BAG, NOT TO ITS CLOUD EDGE. A unit inside the smell but out of arm's
 * length has not reached the bag; making the whole radius targetable would let an archer pop bags
 * from outside the thing that makes them dangerous, which removes the trade the owner asked for.
 *
 * Deterministic: LOWEST id wins, mirroring `killableDefenderInReach`.
 *
 * ⚠ S159 P1 — LOWEST ID WINS OUTRIGHT HERE, NOT MERELY ON A TIE, and the previous wording of this
 * line said "wins ties" as though a distance compare ran first. None does: every bag that passes
 * the reach gate is equally hittable from where the unit already stands, so *which* one it swings at
 * is a free choice and the cheapest deterministic answer is the right one. That is exactly why
 * NAVIGATION cannot reuse this function — walking to the lowest-id bag when a nearer one is at your
 * feet would look broken — and why `nearestEnemyStinkCloudWithin` below exists beside it.
 */
export function enemyStinkCloudInReach(
  world: World,
  creature: Creature,
  reach: number,
): StinkCloudId | null {
  let best: StinkCloudId | null = null;
  for (const c of world.stinkClouds.values()) {
    if (sameTeam(world, c.ownerPlayerId, creature.ownerPlayerId)) continue; // enemy-only, like every other target
    /*
     * ⭐⭐ S177 P5 (owner) — **IF YOU ARE STANDING IN THE SMELL, YOU CAN HIT THE BAG.**
     *
     * Owner: *"How much health do the poop bags have? They should be ONE HIT to destroy. Instead I
     * had two bosses and a whole army trying to destroy them for like six seconds."* And, on the
     * arithmetic: *"one HP, and then we'll time it times five. It comes out as five ... a monster
     * that has three attack and one penetration ... comes out as eighteen damage output ... the
     * eighteen kills it threefold. I don't understand. Like, it's super simple, dude."*
     *
     * ⛔ HE IS RIGHT AND THE POOL WAS NEVER THE PROBLEM — IT IS ALREADY 5 FIFTHS AND EVERY ATTACKER
     * IN THE GAME ONE-SHOTS IT. What he watched was a REACH failure that never let a swing land.
     * This test measured to the bag's CENTRE at the attacker's `attackRange`, which is **35 px** for
     * every melee goblin and every boss, while the cloud they are standing in is
     * `STINK_BAG_RADIUS` = **90 px**. A unit inside the smell but 35–90 px from the bag was
     * therefore NOT in reach — and `creatureLifecycle.ts`'s sixth clause kept it in ATTACKING
     * anyway, because a bag WAS in engage range. It swung at nothing, eating aura damage, for the
     * bag's whole `STINK_CLOUD_LIFETIME_TICKS` (300 ticks = 5 s). ⭐ THAT IS HIS "SIX SECONDS": the
     * bags were never destroyed, they EXPIRED.
     *
     * ⚠ AND THE OLD DOCBLOCK'S TRADE IS KEPT, NOT TRADED AWAY. It argued reach must not be the cloud
     * radius or *"an archer could pop bags from outside the thing that makes them dangerous"*. A MAX
     * rather than a SUM is exactly that guarantee: a ranged unit keeps its own reach unchanged (420
     * > 90, so nothing widens for it), and only units whose arm is SHORTER than the cloud gain
     * anything — and they gain it precisely by standing in the smell and eating it. That is the
     * trade he asked for, now actually reachable.
     */
    const reachToBag = Math.max(reach, c.radius);
    if (distSq(creature.pos, c.pos) > reachToBag * reachToBag) continue;
    if (best === null || (c.id as unknown as number) < (best as unknown as number)) best = c.id;
  }
  return best;
}

/**
 * ⭐ S159 P1 (owner R77) — **THE BAG A UNIT SHOULD WALK TO**, i.e. the AGGRO half of
 * *"destructible stink bags as entities with aggro and on-destroy damage"*.
 *
 * NEAREST enemy bag within `radius`, lowest id on a true tie. The difference from
 * `enemyStinkCloudInReach` above is the whole reason both exist: that one answers *"what can I hit
 * from here"*, where any candidate is as good as another, so it takes the cheapest deterministic
 * pick. This one answers *"where do I go"*, where the nearest is the only answer that does not look
 * broken on screen.
 *
 * ⛔ WHY THIS IS A DERIVED SCAN AND NOT A COMMITTED `Creature` FIELD. The obvious build — the one
 * this was carried forward as — is a taunt that writes a new `targetStinkCloudId`, mirroring the
 * depleted tower's taunt (`stinkTower.ts` `stinkAggroTargets`). That tower taunt needs a field
 * because it writes `targetPrimitiveId` and a tower HAS an anchor primitive to point at; a bag is
 * not a primitive, so the shape of the carried-forward plan was a NEW serialized, hashed field on
 * every creature in the game, plus its four wiring sites and a protocol bump.
 *
 * It buys nothing. `Creature.targetPrimitiveId`'s own docblock records the test for when a committed
 * target must be STORED: when several sites must agree on it *within one tick*. For a bag they need
 * not — engagement and the strike both re-derive from position (`creatureLifecycle`'s sixth clause
 * and `creatureAttack`'s bag arm, both shipped in S158 A2 and both taking a reach, not an id), and
 * navigation asks a different question at a different radius. And `GOBLIN_UNIT_LEASH_RADIUS`'s
 * docblock records the test for when a committed target needs HYSTERESIS: when the target MOVES. A
 * bag does not move, and a unit walking toward the nearest bag only makes that bag nearer, so this
 * scan cannot CYCLE — the failure the leash exists to prevent, where a target is picked up and
 * dropped at 60 Hz and the unit pirouettes instead of walking.
 *
 * ⚠ S159 CHECK (GROK-ANALYST) was right that the stronger claim would be false: a moving unit CAN
 * hand off from one bag to another when its path crosses the line equidistant between them. That is
 * not oscillation, it is switching to a genuinely nearer target and then closing on it, and the
 * exact-tie case is settled by the id compare rather than by float noise. `stinkBagAggro.test.ts`
 * pins the tie and asserts the pick is STABLE across the following ticks. Same conclusion the castle march (`enemyCastleMarchPos`) and the castle /
 * princess engagement clauses reached, in their own words: *"derived from position like the strike
 * itself, so it costs no creature field."*
 *
 * Determinism: pure read, no RNG, no wall clock, squared distances (no sqrt), explicit id compare on
 * an exact tie so V8 Map insertion order can never decide it.
 */
export function nearestEnemyStinkCloudWithin(
  world: World,
  creature: Creature,
  radius: number,
): StinkCloudId | null {
  let bestId: StinkCloudId | null = null;
  let bestDistSq = Infinity;
  const r2 = radius * radius;
  for (const c of world.stinkClouds.values()) {
    if (sameTeam(world, c.ownerPlayerId, creature.ownerPlayerId)) continue; // enemy-only, like every other target
    const dSq = distSq(creature.pos, c.pos);
    if (dSq > r2) continue;
    if (
      dSq < bestDistSq ||
      (dSq === bestDistSq &&
        (bestId === null || (c.id as unknown as number) < (bestId as unknown as number)))
    ) {
      bestDistSq = dSq;
      bestId = c.id;
    }
  }
  return bestId;
}

/**
 * ⭐ S154 P4 (owner A3) — WHERE THIS CREATURE'S HOME IS, for the end-of-FIGHT retreat.
 *
 * Two answers, in preference order:
 *   1. **its own tower**, when the creature came out of one — a tower-fed goblin carries
 *      `sourceSpawnerId`, and the spawner names the primitive it is anchored to. This is the one the
 *      owner asked for by name (*"stay near their tower"*);
 *   2. **its own castle**, otherwise. The starter goblins each seat is granted have no spawner, so
 *      without this fallback they would have no home to run to and would keep marching.
 *
 * Returns null only when neither exists, in which case the caller leaves the creature alone rather
 * than steering it at (0,0).
 *
 * PURE: reads world, mutates nothing. No rng, no wall-clock.
 */
export function ownHomePos(world: World, creature: Creature): Vec2 | null {
  if (creature.sourceSpawnerId !== null) {
    /*
     * ⭐ S165 — AND THE CASTLE SENTINEL FALLS THROUGH HERE, WHICH IS BOTH SAFE AND RIGHT.
     *
     * A race unit carries `castleSpawnerId(seat)` = a NEGATIVE id that names no entry in
     * `creatureSpawners` — it is a provenance marker, not a spawner. So this `get` returns
     * undefined and the function drops to the castle-anchor branch below, which is exactly where a
     * castle-born unit should run home to. Worth stating because it reads like an oversight: the
     * code has no explicit sentinel test and does not need one, and adding an import for
     * `isCastleSpawnerId` here would make `creatures/` depend on `raceUnitEmit.ts`, which already
     * depends on THIS file.
     *
     * ⚠ The property that makes it safe is that the lookup is TOTAL — every miss has a defined
     * answer. Any future branch that instead assumes a non-null id names a real spawner will be
     * wrong for race units, and will be wrong silently.
     */
    const spawner = world.creatureSpawners.get(creature.sourceSpawnerId);
    if (spawner !== undefined) {
      const anchor = world.primitives.get(spawner.anchorPrimitiveId);
      if (anchor !== undefined) return { x: anchor.pos.x, y: anchor.pos.y };
    }
  }
  const seat = creature.ownerPlayerId as unknown as number;
  if (!world.players.has(creature.ownerPlayerId)) return null;
  const a = castleAnchor(seat, world.layout);
  return { x: a.x, y: a.y };
}

/**
 * ⭐ S154 P4 — is the army in its run-home window? True for the last `ARMY_RETREAT_LEAD_TICKS` of a
 * FIGHT. A WINDOW evaluated every tick, never an edge — the `tickGathererShelter` precedent, which
 * documents why: a NONET freeze can skip a whole phase, and an edge test misses it.
 */
export function isRetreatWindow(world: World): boolean {
  return (
    world.matchPhase === 'FIGHT' &&
    world.phaseEndsAtTick - world.tick <= ARMY_RETREAT_LEAD_TICKS
  );
}

/**
 * How far inside `attackRange` a standoff fighter parks (see `standoffTargetPos`), and how far
 * inside it ENGAGES.
 *
 * ⛔ THE TWO NUMBERS MUST DIFFER, AND THE ENGAGE ONE MUST BE THE LARGER. `computeSteeringAccel`
 * returns ZERO_ACCEL the moment a creature enters ATTACKING — no force at all, which means no
 * BRAKING either. So if the FSM engaged at the full `attackRange` the unit would lose its steering
 * while still closing at terminal velocity and coast straight through the ring: measured at 18 px
 * from a shape the bat rider is supposed to harpoon from 150. Engaging just INSIDE the approach,
 * slightly outside the ring, means `arriveForce`'s linear ramp-down has already slowed it to a crawl
 * by the time the steering is switched off, so the residual coast is a few px rather than ~175.
 */
export const STANDOFF_RANGE_FRACTION = 0.8;
/** Where a standoff fighter starts shooting, as a fraction of `attackRange`. See above. */
export const STANDOFF_ENGAGE_FRACTION = 0.9;
/** Half-width of the firing arc a squad spreads across, in radians (~14°). */
export const STANDOFF_ARC_RAD = 0.25;

/**
 * PURE — the distance at which `creature` engages, which is its full `attackRange` unless it is a
 * standoff fighter. One definition, consumed by the FSM's three engage predicates and by the strike
 * re-check, so "how close do I have to be" cannot fork between deciding to shoot and shooting.
 */
export function engageRange(config: { attackRange: number; holdsRange: boolean }): number {
  return config.holdsRange ? config.attackRange * STANDOFF_ENGAGE_FRACTION : config.attackRange;
}

/**
 * R85 (the shipped half) — where a structure-attacker walks when the enemy has NO shapes left.
 *
 * ⛔ A0 F6: there is NO castle entity and no castle HP. `castleBanks` is an inventory Map, and the
 * match is still won on VICTORY POINTS. So this deliberately returns a POSITION and nothing else —
 * goblins march on the enemy keep and mill there menacingly instead of freezing mid-field, which is
 * the half of the owner's point 7 that costs nothing. Making the castle DAMAGEABLE forces a
 * decision about whether the game is still won on points at all, which is the owner's call and its
 * own session (owner ruling D2).
 *
 * Returns `null` in the one case that has no answer: no live enemy seat (S192: no enemy keep standing).
 */
export function enemyCastleMarchPos(world: World, creature: Creature): Vec2 | null {
  let best: Vec2 | null = null;
  let bestDistSq = Infinity;
  let bestSeat = Infinity;
  for (const seat of world.players.keys()) {
    if (sameTeam(world, seat, creature.ownerPlayerId)) continue; // S192 — never march on a teammate's keep
    /*
     * ⭐⭐ S192 T13 (owner) — **NEVER MARCH ON A FALLEN KEEP.** *"an enemy castle was destroyed, and
     * instead of my … creatures going and attacking other towers or another's castle, they went back
     * to the castle that's already destroyed."* This loop had no `castleHp` test at all, while
     * `enemyCastleInReach` refuses to strike a fallen keep — so a unit walked to the ruin and milled
     * there forever (measured: 26 px from the fallen keep after 1200 ticks, the live keep untouched).
     * Same test as `enemyCastleInReach` and `isEliminated`, so march, engage and strike agree. With no
     * live enemy keep left this returns `null` and the caller keeps its current destination.
     */
    const victim = world.players.get(seat);
    if (victim === undefined || victim.castleHp <= 0) continue;
    const anchor = castleAnchor(seat as unknown as number, world.layout);
    const d = distSq(creature.pos, anchor);
    const seatN = seat as unknown as number;
    // Lowest-seat tie-break, matching the lowest-id convention every other selector here uses.
    if (d < bestDistSq || (d === bestDistSq && seatN < bestSeat)) {
      bestDistSq = d;
      bestSeat = seatN;
      best = anchor;
    }
  }
  return best;
}
