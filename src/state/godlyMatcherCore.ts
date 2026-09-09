/**
 * SPARK — S122 P1 (B2 phase d): the godly matcher CORE — the world-mutating half of
 * runGodlyMatcher, extracted VERBATIM from state/godlyOrchestration.ts into a module that
 * imports ONLY state/ (no render/, no DOM) so it can run inside the sim Worker.
 *
 * SPLIT CONTRACT (Council S122 L2):
 *   • CORE (this file): spawner/defender ignition + the cinematic matcher loop + the
 *     authoritative dispatch(world, GODLY_TRIGGER) + the cursor advance. Runs ONCE PER
 *     BATCH in worker mode (= once per render frame in direct mode) — the cadence cap
 *     ("at most ONE godly trigger per frame", WORKER_SIM_FOUNDATION.md contract) is
 *     preserved by the single loop + `break` exactly as before.
 *   • SIDE EFFECTS (injected callbacks / returned event): transport GODLY_TRIGGER
 *     broadcast, codex unlockGodly (localStorage), debug probes — main-thread concerns.
 *     Direct mode injects them as callbacks at the ORIGINAL call sites (byte-identical
 *     ordering: broadcast BEFORE dispatch — the S22 D4 latency choice); worker mode
 *     omits them and the caller performs them on BatchResult receipt (tick-tagged).
 *
 * The original file-level rationale comments (S99 sever-retrigger, S23 P4 strict-`<`,
 * S100/S103/S113 ignition rules) are preserved inline below — they document THIS code.
 */

import { findDefenderMatches, findGodlyMatch, getRecipe, makeTriggerEvent } from './godlyRecipes/index.ts';
import { findAllPentagramAnchors, pentagramOwnerForAnchor } from './godlyRecipes/pentagram.ts';
// S113 Batch C — importing the lightning-hub recipe also triggers its registerRecipe side-effect,
// exactly like the pentagram import above (registry parity with the pre-split module).
import { findAllLightningHubAnchors, lightningHubOwnerForAnchor } from './godlyRecipes/lightningHub.ts';
// ⛔ A VALUE IMPORT OF A RECIPE MODULE, WHICH FIRES ITS `registerRecipe` — SAFE HERE AND ONLY HERE.
// The S144/S151 trap is `world.ts -> ... -> a recipe module`, which registers every recipe for
// essentially the whole codebase. This file is on the OTHER side of that edge: it imports world.ts,
// world.ts does not import it. Both lines above are the same shape and have been for sessions.
import { findAllGoblinTowerAnchors, goblinTowerOwnerForAnchor } from './godlyRecipes/goblinTower.ts';
// S166 — the six tier-3 race towers. Importing a RECIPE module here is fine and is the existing
// pattern (the goblinTower line above does it): the matcher is a consumer of recipes, so firing
// their registration as a side effect is harmless. `blueprints.ts` is the file that must not.
import { findRaceTowerAnchors, findRaceTowerMembers, raceTowerOwnerForAnchor } from './godlyRecipes/raceTower.ts';
// S167 — the tier-9 pair. This module already value-imports recipe modules (six lines above), so
// the S144 registration side effect is accepted here by precedent rather than avoided.
import { findT9TowerAnchors, findT9TowerMembers, t9TowerOwnerForAnchor } from './godlyRecipes/t9BossTower.ts';
import type { GodlyId, GodlyTriggerEvent } from './godlyRecipes/types.ts';
import { cinematicMsToTicks } from './creatures/creature.ts';
import { CUTSCENE_FADE_MS } from '../constants.ts';
import type { PlayerId, PrimitiveId } from '../types.ts';
import { dispatch, type World } from './world.ts';

/** The matcher's cross-frame cursor state (structural subset of GodlyOrchestrationState). */
export interface GodlyMatcherCursor {
  lastMatcherTick: number;
}

/** Main-thread side-effect injection points (all optional — worker mode passes none). */
export interface GodlyMatchSideEffects {
  /** Per fresh BOND_FORMED observation (debug probes; direct mode only). */
  observeBondFormed?: (effTick: number) => void;
  /** Fired with the matched event BEFORE the authoritative dispatch (transport broadcast slot). */
  beforeDispatch?: (event: GodlyTriggerEvent) => void;
  /** Fired AFTER the dispatch (codex unlock + probes slot). */
  afterDispatch?: (event: GodlyTriggerEvent) => void;
}

/**
 * S22 P3 — godly matcher (core). Host-only. Single trigger per invocation; queue handles
 * concurrent. Cursor advances to current tick after the scan (full sweep, not just the
 * matched eff). Returns the fired event (already dispatched into `world`) or null.
 */
export function runGodlyMatcherCore(
  world: World,
  state: GodlyMatcherCursor,
  fx: GodlyMatchSideEffects = {},
): GodlyTriggerEvent | null {
  if (!world.isHost) return null;

  // S100 P1 (TD Phase 1b, Layer 5) — SPAWNER ignition, scanned FIRST + DECOUPLED from the
  // cinematic single-slot (a pentagram never blocks, nor is blocked by, a cinematic).
  runSpawnerIgnition(world);
  // S103 P2 — DEFENDER ignition, same decoupled treatment.
  runDefenderIgnition(world);

  if (world.activeCinematicPlayerId !== null) return null; // queue handled in reducer

  let fired: GodlyTriggerEvent | null = null;
  for (const eff of world.effects) {
    // S99 — a godly is matched on any TOPOLOGY change: BOND_FORMED (build UP to the
    // pattern) OR a PLAYER-initiated BOND_SEVERED (reduce DOWN to it). Only cause
    // 'player' re-triggers; combat severs must not random-fire a godly. The single
    // loop + `break` caps to ONE trigger per invocation.
    const isForm = eff.kind === 'BOND_FORMED';
    const isPlayerSever = eff.kind === 'BOND_SEVERED' && eff.cause === 'player';
    if (!isForm && !isPlayerSever) continue;
    // S23 P2 — probe observation BEFORE the stale-cursor skip (surfaces every event).
    if (isForm && fx.observeBondFormed !== undefined) fx.observeBondFormed(eff.tick);
    // S23 P4 — strict `<` not `<=`: click-handler dispatches between physics ticks emit
    // BOND_FORMED with the current (un-advanced) world.tick; `<=` silently skipped those
    // (the "Voltkin never fires" root cause). Equality passes; only stale replays skip.
    if (eff.tick < state.lastMatcherTick) continue;
    const result = findGodlyMatch(world, eff.pos);
    if (result === null) continue;
    const event = makeTriggerEvent(result, world.tick);
    // Broadcast slot first so the client renders sooner (S22 D4 latency choice).
    if (fx.beforeDispatch !== undefined) fx.beforeDispatch(event);
    dispatch(world, { type: 'GODLY_TRIGGER', event });
    if (fx.afterDispatch !== undefined) fx.afterDispatch(event);
    fired = event;
    break; // single trigger per invocation; queue handles concurrent
  }
  // Advance cursor to current tick after scan.
  state.lastMatcherTick = world.tick;
  return fired;
}

/**
 * S113 Batch C — register the lowest un-registered anchor of ONE spawner recipe. Returns true if
 * it ignited one (caller stops — single ignition per frame). Per-(player, anchor) de-dup against
 * the live creatureSpawners map (can't double-register; CAN rebuild after removal).
 */
function igniteOneSpawnerRecipe(
  world: World,
  anchors: PrimitiveId[],
  ownerForAnchor: (world: World, anchor: PrimitiveId) => PlayerId | null,
  recipeId: GodlyId,
): boolean {
  for (const anchor of anchors) {
    const owner = ownerForAnchor(world, anchor);
    if (owner === null) continue;
    let alreadyLive = false;
    for (const sp of world.creatureSpawners.values()) {
      if (sp.anchorPrimitiveId === anchor && sp.ownerPlayerId === owner) {
        alreadyLive = true;
        break;
      }
    }
    if (alreadyLive) continue;
    dispatch(world, {
      type: 'REGISTER_SPAWNER',
      ownerPlayerId: owner,
      anchorPrimitiveId: anchor,
      recipeId,
    });
    return true; // single ignition per frame (lowest-anchor tie-break)
  }
  return false;
}

/**
 * ⭐⭐ S169 (owner playtest) — DRAIN **EVERY** UN-REGISTERED ANCHOR OF ONE RECIPE.
 *
 * Owner: *"I did the Piranha, and it didn't produce at all. And then I build another Piranha tower,
 * and it just stayed as shaped. It didn't even show, like, the picture of the tower. And then all of
 * a sudden, the first tower produced two piranhas at once."*
 *
 * ⛔ THE DEFECT WAS `igniteOneSpawnerRecipe`'s NAME BEING TRUE. It registers the lowest un-registered
 * anchor and returns; the chain calls it ONCE per recipe id. So a seat holding TWO finished rings of
 * the same race got one spawner and one inert pile of primitives — no tower art (nothing to draw
 * without a spawner), no production, no error, no log line.
 *
 * ⛔ AND THE INERT ONE IS NEVER RETRIED ON A TIMER, which is what turned a one-frame miss into
 * *"sometimes it takes a whole turn"*. Ignition is NOT a structural scan: `runSpawnerIgnition` opens
 * with a sweep of `world.effects` and `if (!hasTopologyChange) return;`. The second ring therefore
 * waits for the next `BOND_FORMED` or player-caused `BOND_SEVERED` **anywhere on the board** — and a
 * player who has finished placing may not produce one again that turn. `blueprintBuild.ts` warns
 * about exactly this dependency in the singular: *"a perfectly-formed stamped structure sits inert
 * forever: no tower, no error, no log line."* It was true in the plural too.
 *
 * ⭐ THE CHAIN'S OWN COMMENTS ALREADY NAMED THIS FIX — *"Making ignition registry-driven (as
 * `runDefenderIgnition` already is, draining ALL matches) would end it"* — and deferred it as a
 * semantics change on the sim hot path. This is the narrow half of that: the DRAIN, applied only to
 * the recipes for which one-per-frame was never a design choice, with the pentagram and the
 * lightning hub left on `igniteOneSpawnerRecipe` and their early `return`s intact.
 *
 * ⚠ DETERMINISTIC, AND THAT IS LOAD-BEARING NOW IN A WAY IT WAS NOT BEFORE. Registering N spawners
 * in one sweep mints N ids, so the ORDER decides hashed state rather than merely which single anchor
 * won. `findRingAnchors` sorts its ids ascending (`ringShape.ts:176`) and `isRingAt` is pure, so the
 * order is a total order over primitive ids — identical on host, mirror and worker replay. No
 * `Map`-iteration tie-break is relied on anywhere in this path.
 *
 * ⚠ IDEMPOTENT by the same per-(anchor, owner) de-dup the one-shot version used, so re-running a
 * sweep with no new rings registers nothing.
 */
function igniteAllSpawnerRecipe(
  world: World,
  anchors: PrimitiveId[],
  ownerForAnchor: (world: World, anchor: PrimitiveId) => PlayerId | null,
  membersOf: (world: World, anchor: PrimitiveId) => PrimitiveId[] | null,
  recipeId: GodlyId,
): void {
  /*
   * ⛔⛔ DE-DUP BY **STRUCTURE**, NOT BY ANCHOR, AND THIS IS THE WHOLE DIFFICULTY OF THE FIX.
   *
   * `findRingAnchors` returns EVERY node of a ring, because every node is a valid seed by symmetry.
   * `igniteOneSpawnerRecipe` survived that by taking the lowest and returning — its "lowest-anchor
   * tie-break" comment was not a tidiness note, it was the mechanism that made one ring one tower.
   * A drain that only checked `(anchor, owner)` against the live map therefore registered one
   * spawner PER NODE: **three per tier-3 ring, and nine per tier-9 boss ring — nine bosses from one
   * pyramid.** The first draft did exactly that and `spawnerIgnitionDrain.test.ts` read back 3 where
   * it expected 1.
   *
   * `raceTower.ts`'s anchor-finder docblock had already written this warning in full — *"every node
   * of a ring is a valid seed by symmetry, which makes this the one recipe family where 'any match
   * will do' is actively wrong"*. It was aimed at a future caller, and it was right.
   *
   * So each candidate resolves its ring's MEMBER SET and claims all of it. `claimed` covers rings
   * registered earlier in this same sweep; the `creatureSpawners` scan covers rings already live
   * from a previous one. Both are needed: the first alone misses a re-ignition, the second alone
   * misses two nodes of one fresh ring.
   *
   * ⚠ `membersOf` RETURNING `null` MEANS "not a valid ring seed" and the candidate is skipped. A
   * star-shaped recipe (the goblin tower) has exactly one hub anchor and passes `[anchor]`.
   */
  const claimed = new Set<PrimitiveId>();
  for (const anchor of anchors) {
    if (claimed.has(anchor)) continue;
    const owner = ownerForAnchor(world, anchor);
    if (owner === null) continue;
    const members = membersOf(world, anchor);
    if (members === null) continue;
    const memberSet = new Set<PrimitiveId>(members);
    let alreadyLive = false;
    for (const sp of world.creatureSpawners.values()) {
      if (sp.ownerPlayerId === owner && memberSet.has(sp.anchorPrimitiveId)) {
        alreadyLive = true;
        break;
      }
    }
    // Claim the structure either way — a live ring must not be re-examined node by node.
    for (const m of members) claimed.add(m);
    if (alreadyLive) continue;
    dispatch(world, {
      type: 'REGISTER_SPAWNER',
      ownerPlayerId: owner,
      anchorPrimitiveId: anchor,
      recipeId,
    });
  }
}

/** A star recipe's anchor is its unique hub, so the structure it claims is just itself. */
const selfMember = (_w: World, a: PrimitiveId): PrimitiveId[] => [a];

/**
 * S100 P1 (TD Phase 1b, Layer 5) — host-only spawner ignition. Runs only on a topology change
 * this frame (BOND_FORMED or player-caused BOND_SEVERED); never touches the cinematic
 * single-slot or godlyFiredThisMatch. Pentagram scanned first (registry-order parity), then
 * the S113 lightning-hub; single ignition per frame.
 */
export function runSpawnerIgnition(world: World): void {
  let hasTopologyChange = false;
  for (const eff of world.effects) {
    if (eff.kind === 'BOND_FORMED') { hasTopologyChange = true; break; }
    if (eff.kind === 'BOND_SEVERED' && eff.cause === 'player') { hasTopologyChange = true; break; }
  }
  if (!hasTopologyChange) return;

  /*
   * ⛔⛔ S169 CORRECTION — THE `return`s ARE GONE, AND THEY WERE A HOLE IN THE FIX ONE COMMIT EARLIER.
   *
   * These read `if (igniteOneSpawnerRecipe(...)) return;`. That return is BOARD-WIDE, not per-owner:
   * any un-registered pentagram or lightning hub anywhere skipped ALL THIRTEEN tower drains below for
   * that tick. And ignition is not a structural scan — `runSpawnerIgnition` opens with
   * `if (!hasTopologyChange) return;` — so the skipped ring then waited for the next BOND_FORMED
   * anywhere on the board, which may never come if the player has stopped placing.
   *
   * That is verbatim the failure `fa89e6a` set out to kill (*"the inert ring is never retried ...
   * sometimes it takes a whole turn"*), still reachable: two players closing rings on the same tick,
   * or one player building a second pentagram while a tower ring waits.
   *
   * ⚠ THE ONE-PER-FRAME CAP ON THESE TWO IS UNCHANGED, which is why dropping the `return` is safe
   * rather than a behaviour change: `igniteOneSpawnerRecipe` already ignites AT MOST ONE anchor per
   * call. The `return` was capping the whole SWEEP, not the recipe — and nothing ever wanted that.
   */
  igniteOneSpawnerRecipe(world, findAllPentagramAnchors(world), pentagramOwnerForAnchor, 'pentagram');
  igniteOneSpawnerRecipe(world, findAllLightningHubAnchors(world), lightningHubOwnerForAnchor, 'lightningHub');
  /*
   * ⭐ S152 P2 — THE GOBLIN TOWER NEVER IGNITED. This line is the whole defect.
   *
   * S151 P3 shipped the tower's recipe, its predicate, its anchor finder, its owner resolver, its
   * teardown (`recipeStillSatisfied` case 'goblinTower') and 13 tests for the feed reducer — and
   * registered `goblinTowerRecipe` into the REGISTRY, whose spawner matcher (`findSpawnerMatch`)
   * has ZERO production callers. This function is the only live ignition path and it names its
   * recipes by hand, so the tower could be BUILT and would never become a spawner.
   *
   * ⛔ SO EVERY DOWNSTREAM GATE WAS CORRECT AND UNREACHABLE. `applyFeedTower`'s Gate 1 looks the
   * spawner up in `world.creatureSpawners`; there was never an entry to find. The S151 handoff
   * recorded "it builds, it IGNITES, it tears down" — building and teardown were true, ignition
   * was not, and nothing failed because no test drove BUILD_BLUEPRINT through this sweep.
   *
   * ⚠ A REGISTERED RECIPE IS NOT A LIVE RECIPE. That is the durable lesson: registration only
   * feeds `findSpawnerMatch`, and adding a recipe to the registry looks like wiring it up.
   */
  igniteAllSpawnerRecipe(world, findAllGoblinTowerAnchors(world), goblinTowerOwnerForAnchor, selfMember, 'goblinTower');
  /*
   * ⭐ S166 — THE SIX TIER-3 RACE TOWERS. `registerAll.test.ts` failed by NAME until these existed
   * (*"'t3TowerDemons' is a kind:'spawner' recipe in the registry but runSpawnerIgnition never names
   * it. It can be BUILT and will never produce"*), which is the S152 P2 guard doing its job.
   *
   * ⛔ SIX EXPLICIT LINES AND NOT A LOOP, WHICH LOOKS LIKE THE WRONG CALL UNTIL YOU READ THE GUARD.
   * That test extracts ignited ids from comment-STRIPPED SOURCE with
   * `/igniteOneSpawnerRecipe\([^;]*?,\s*'([A-Za-z]+)'\s*\)/`, i.e. it needs a LITERAL id at the call
   * site. A `for (const race of ALL_RACES)` loop passing `RACE_TOWER_IDS[race]` would satisfy the
   * compiler, ignite correctly, and make the guard blind — trading a real protection for six saved
   * lines. Explicit stays.
   *
   * ⚠ NO EARLY `return` ON THESE SIX, unlike the pentagram and lightningHub lines above. The six are
   * pairwise disjoint (one race per player, R110) so at most one can match per seat, and returning
   * after the first would let a vampire tower defer a naga tower to the next topology change — which
   * may not come if the player stops placing. The goblinTower line above sets the same precedent.
   *
   * ⚠ THE DEFECT CLASS SURVIVES THIS FIX AND IS WORTH NAMING: this chain is hand-written, so an
   * eighth recipe can still be forgotten. `registerAll.test.ts`'s own note says the S152 fix
   * *"was to add the third line, which leaves the defect class intact"*. Making ignition
   * registry-driven (as `runDefenderIgnition` already is, draining ALL matches) would end it, but
   * that changes one-spawner-per-topology-change semantics on the sim hot path and belongs in its own
   * priority with its own deliberation — not bolted onto this one.
   */
  igniteAllSpawnerRecipe(world, vampireTowerAnchors(world), vampireTowerOwner, vampireTowerMembers, 't3TowerVampires');
  igniteAllSpawnerRecipe(world, nagaTowerAnchors(world), nagaTowerOwner, nagaTowerMembers, 't3TowerNagas');
  igniteAllSpawnerRecipe(world, mummyTowerAnchors(world), mummyTowerOwner, mummyTowerMembers, 't3TowerMummies');
  igniteAllSpawnerRecipe(world, zombieTowerAnchors(world), zombieTowerOwner, zombieTowerMembers, 't3TowerZombies');
  igniteAllSpawnerRecipe(world, orcTowerAnchors(world), orcTowerOwner, orcTowerMembers, 't3TowerOrcs');
  igniteAllSpawnerRecipe(world, demonTowerAnchors(world), demonTowerOwner, demonTowerMembers, 't3TowerDemons');
  /*
   * ⭐ S167 — THE SIX TIER-9 BOSS TOWERS. Same six-explicit-lines shape as the tier-3 block above
   * and for the same reason: the guard needs a LITERAL id at the call site, so a loop over
   * `ALL_RACES` would compile, ignite correctly, and make `registerAll.test.ts` blind.
   *
   * ⚠ NO EARLY `return` HERE EITHER. A seat has one race (R110), so at most one of these twelve
   * lines can match for a given player, and returning after the first would let a tier-3 tower
   * defer a tier-9 tower to the next topology change — which may never come if the player stops
   * placing, leaving a finished nine-ring inert.
   *
   * ⛔ AND THE TWO TIERS CANNOT BOTH MATCH THE SAME ANCHOR. A 9-ring fails the 3-walk's closure
   * test and a 3-ring fails the 9-walk's revisit guard — traced in `t9BossTower.ts`'s docblock and
   * pinned in `t9BossTower.test.ts`. So the ordering of these twelve lines carries no meaning and
   * nothing depends on tier-3 being scanned first.
   */
  igniteAllSpawnerRecipe(world, vampireT9Anchors(world), vampireT9Owner, vampireT9Members, 't9TowerVampires');
  igniteAllSpawnerRecipe(world, nagaT9Anchors(world), nagaT9Owner, nagaT9Members, 't9TowerNagas');
  igniteAllSpawnerRecipe(world, mummyT9Anchors(world), mummyT9Owner, mummyT9Members, 't9TowerMummies');
  igniteAllSpawnerRecipe(world, zombieT9Anchors(world), zombieT9Owner, zombieT9Members, 't9TowerZombies');
  igniteAllSpawnerRecipe(world, orcT9Anchors(world), orcT9Owner, orcT9Members, 't9TowerOrcs');
  igniteAllSpawnerRecipe(world, demonT9Anchors(world), demonT9Owner, demonT9Members, 't9TowerDemons');
}

/*
 * Per-race anchor finders and owner resolvers.
 *
 * ⛔ THESE EXIST TO KEEP THE RECIPE ID THE **ONLY** STRING LITERAL IN EACH IGNITION CALL, and the
 * guard caught me getting that wrong. `registerAll.test.ts` extracts ignited ids with
 * `/igniteOneSpawnerRecipe\([^;]*?,\s*'([A-Za-z0-9]+)'\s*\)/`, which is NON-GREEDY — so my first
 * version, `igniteOneSpawnerRecipe(world, findRaceTowerAnchors(world, 'vampires'), …, 't3TowerVampires')`,
 * handed it `'vampires'` and it reported *"runSpawnerIgnition ignites 'vampires', which is not a
 * kind:'spawner' recipe"* while ALSO still reporting all six ids as unwired. Both messages were
 * right and both were about the same mistake.
 *
 * ⚠ SO A RACE NAME MUST NEVER APPEAR INSIDE ONE OF THOSE CALLS. It is baked into the helper name
 * instead, where the regex cannot see it.
 *
 * Each resolver enforces R137 inside `raceTowerOwnerForAnchor`: an off-race player standing on
 * another race's ring resolves to `null`, and the ring never ignites.
 */
const vampireTowerAnchors = (w: World): PrimitiveId[] => findRaceTowerAnchors(w, 'vampires');
const nagaTowerAnchors = (w: World): PrimitiveId[] => findRaceTowerAnchors(w, 'nagas');
const mummyTowerAnchors = (w: World): PrimitiveId[] => findRaceTowerAnchors(w, 'mummies');
const zombieTowerAnchors = (w: World): PrimitiveId[] => findRaceTowerAnchors(w, 'zombies');
const orcTowerAnchors = (w: World): PrimitiveId[] => findRaceTowerAnchors(w, 'orcs');
const demonTowerAnchors = (w: World): PrimitiveId[] => findRaceTowerAnchors(w, 'demons');

const vampireTowerOwner = (w: World, a: PrimitiveId): PlayerId | null => raceTowerOwnerForAnchor(w, a, 'vampires');
const nagaTowerOwner = (w: World, a: PrimitiveId): PlayerId | null => raceTowerOwnerForAnchor(w, a, 'nagas');
const mummyTowerOwner = (w: World, a: PrimitiveId): PlayerId | null => raceTowerOwnerForAnchor(w, a, 'mummies');
const zombieTowerOwner = (w: World, a: PrimitiveId): PlayerId | null => raceTowerOwnerForAnchor(w, a, 'zombies');
const orcTowerOwner = (w: World, a: PrimitiveId): PlayerId | null => raceTowerOwnerForAnchor(w, a, 'orcs');
const demonTowerOwner = (w: World, a: PrimitiveId): PlayerId | null => raceTowerOwnerForAnchor(w, a, 'demons');

/*
 * ⭐ S169 — RING MEMBER RESOLVERS, one per race, same no-race-literal-in-the-call discipline as the
 * two tables above. A drain-all ignition claims a whole ring rather than each of its three nodes;
 * without these it registered three spawners per tower. See `igniteAllSpawnerRecipe`.
 */
const vampireTowerMembers = (w: World, a: PrimitiveId): PrimitiveId[] | null => findRaceTowerMembers(w, a, 'vampires');
const nagaTowerMembers = (w: World, a: PrimitiveId): PrimitiveId[] | null => findRaceTowerMembers(w, a, 'nagas');
const mummyTowerMembers = (w: World, a: PrimitiveId): PrimitiveId[] | null => findRaceTowerMembers(w, a, 'mummies');
const zombieTowerMembers = (w: World, a: PrimitiveId): PrimitiveId[] | null => findRaceTowerMembers(w, a, 'zombies');
const orcTowerMembers = (w: World, a: PrimitiveId): PrimitiveId[] | null => findRaceTowerMembers(w, a, 'orcs');
const demonTowerMembers = (w: World, a: PrimitiveId): PrimitiveId[] | null => findRaceTowerMembers(w, a, 'demons');

/*
 * S167 — the same pair of tables for the six TIER-9 BOSS towers, and they exist for the identical
 * reason: a race name must never appear as a string literal INSIDE an `igniteOneSpawnerRecipe`
 * call, because the guard's extraction regex is non-greedy and would read the race instead of the
 * recipe id.
 *
 * Each resolver enforces R137 inside `t9TowerOwnerForAnchor`.
 */
const vampireT9Anchors = (w: World): PrimitiveId[] => findT9TowerAnchors(w, 'vampires');
const nagaT9Anchors = (w: World): PrimitiveId[] => findT9TowerAnchors(w, 'nagas');
const mummyT9Anchors = (w: World): PrimitiveId[] => findT9TowerAnchors(w, 'mummies');
const zombieT9Anchors = (w: World): PrimitiveId[] => findT9TowerAnchors(w, 'zombies');
const orcT9Anchors = (w: World): PrimitiveId[] => findT9TowerAnchors(w, 'orcs');
const demonT9Anchors = (w: World): PrimitiveId[] => findT9TowerAnchors(w, 'demons');

const vampireT9Owner = (w: World, a: PrimitiveId): PlayerId | null => t9TowerOwnerForAnchor(w, a, 'vampires');
const nagaT9Owner = (w: World, a: PrimitiveId): PlayerId | null => t9TowerOwnerForAnchor(w, a, 'nagas');
const mummyT9Owner = (w: World, a: PrimitiveId): PlayerId | null => t9TowerOwnerForAnchor(w, a, 'mummies');
const zombieT9Owner = (w: World, a: PrimitiveId): PlayerId | null => t9TowerOwnerForAnchor(w, a, 'zombies');
const orcT9Owner = (w: World, a: PrimitiveId): PlayerId | null => t9TowerOwnerForAnchor(w, a, 'orcs');
const demonT9Owner = (w: World, a: PrimitiveId): PlayerId | null => t9TowerOwnerForAnchor(w, a, 'demons');

/*
 * ⭐ S169 — the tier-9 pair of the same. ⛔ HIGHEST STAKES IN THE CHAIN: a nine-ring has NINE valid
 * anchors, so an anchor-scoped drain releases NINE BOSSES from one pyramid.
 */
const vampireT9Members = (w: World, a: PrimitiveId): PrimitiveId[] | null => findT9TowerMembers(w, a, 'vampires');
const nagaT9Members = (w: World, a: PrimitiveId): PrimitiveId[] | null => findT9TowerMembers(w, a, 'nagas');
const mummyT9Members = (w: World, a: PrimitiveId): PrimitiveId[] | null => findT9TowerMembers(w, a, 'mummies');
const zombieT9Members = (w: World, a: PrimitiveId): PrimitiveId[] | null => findT9TowerMembers(w, a, 'zombies');
const orcT9Members = (w: World, a: PrimitiveId): PrimitiveId[] | null => findT9TowerMembers(w, a, 'orcs');
const demonT9Members = (w: World, a: PrimitiveId): PrimitiveId[] | null => findT9TowerMembers(w, a, 'demons');

/**
 * S103 P2 — host-only DEFENDER ignition (mirror of runSpawnerIgnition). On a topology change,
 * scan every registered defender recipe for a buildable anchor and REGISTER_DEFENDER each
 * (one per recipe per frame; predicates already skip live anchors — the map check below is
 * defense-in-depth).
 */
export function runDefenderIgnition(world: World): void {
  /*
   * ⭐ S157 B6 (owner) — **DEFENDERS IGNITE DURING BUILD ONLY, WHICH IS ALSO THE "ONLY NEXT TURN" RULE.**
   *
   * Owner: *"if she is destroyed but tower is up he will not produce another helga during the same
   * fight stage that she was destroyed in. only next turn."*
   *
   * Before this, ignition ran on ANY topology change anywhere on the board, with a single de-dup:
   * "is a defender already live at this anchor?". So killing Helga and then forming any bond anywhere
   * re-summoned her instantly, mid-fight, for free — proven by review (delete her, push one
   * BOND_FORMED, she is back in the same FIGHT).
   *
   * ⛔ AND THE FIX IS A PHASE GATE RATHER THAN A NEW SPENT-SET, deliberately. The obvious build is a
   * per-phase `Set<PrimitiveId>` of anchors that have already summoned — but that is new WORLD state,
   * which means serializing it, hashing it, adding it to FIELD_COVERAGE and to the worker
   * differential's SEEDING_COVERAGE, and another PROTOCOL_VERSION bump. The phase gate delivers the
   * owner's rule EXACTLY ("only next turn") with no new state at all, because a turn boundary is
   * precisely a BUILD.
   *
   * It is also coherent for the whole roster, not a Helga special case: `canBuildNow` already refuses
   * every placement outside BUILD, so a recipe can only be COMPLETED during BUILD anyway. The one
   * behaviour this removes is a structure being severed DOWN into a valid recipe mid-fight and popping
   * a tower into existence — which is not a thing a player should be able to do while the walls are
   * down.
   */
  if (world.matchPhase !== 'BUILD') return;
  let hasTopologyChange = false;
  for (const eff of world.effects) {
    if (eff.kind === 'BOND_FORMED') { hasTopologyChange = true; break; }
    if (eff.kind === 'BOND_SEVERED' && eff.cause === 'player') { hasTopologyChange = true; break; }
  }
  if (!hasTopologyChange) return;

  for (const { recipe, match } of findDefenderMatches(world, { x: 0, y: 0 })) {
    let alreadyLive = false;
    for (const d of world.defenders.values()) {
      if (d.anchorPrimitiveId === match.anchorPrimitiveId) { alreadyLive = true; break; }
    }
    if (alreadyLive) continue;
    dispatch(world, {
      type: 'REGISTER_DEFENDER',
      defenderKind: recipe.defenderKind,
      ownerPlayerId: match.triggererPlayerId,
      anchorPrimitiveId: match.anchorPrimitiveId,
      recipeId: recipe.id,
      pos: { x: match.pos.x, y: match.pos.y },
    });
  }
}

/**
 * S122 P1 — WORKER-side cinematic lifecycle (the sim-authoritative half of
 * startCinematicIfNeeded). Direct mode completes a cinematic via the render overlay's
 * wall-clock onComplete (cutsceneOverlay fade-end → GODLY_COMPLETE + queue advance); the
 * worker has no overlay, so completion is scheduled in the TICK domain at the exact fade-end
 * moment the S31 P0-1 math already defines: cinematicMsToTicks(cinematicMs + sustainedEffectMs
 * + CUTSCENE_FADE_MS). Deterministic (replay-safe), and it removes any main→worker completion
 * round-trip. The same transition also schedules pendingCreatureSpawn — the EXACT host-only
 * block of startCinematicIfNeeded (same fireAtTick value by construction).
 *
 * Main-thread in worker mode keeps running the render startCinematicIfNeeded on the MIRROR
 * for overlay/vignette (the client's existing posture); its local GODLY_COMPLETE echo on the
 * mirror is overwritten by the next snapshot — exactly like a joiner's.
 */
export interface WorkerCinematicState {
  lastOwner: PlayerId | null;
  completeAtTick: number | null;
}

export function makeWorkerCinematicState(): WorkerCinematicState {
  return { lastOwner: null, completeAtTick: null };
}

export function tickWorkerCinematics(world: World, cs: WorkerCinematicState): void {
  const owner = world.activeCinematicPlayerId;
  if (owner !== cs.lastOwner) {
    cs.lastOwner = owner;
    if (owner === null) {
      // Non-null → null outside our own completion (GODLY_ABORT path): drop the schedule.
      cs.completeAtTick = null;
    } else {
      const event = world.currentCinematicEvent;
      const recipe = event !== null ? getRecipe(event.godlyId) : undefined;
      if (event !== null && recipe !== undefined && recipe.kind === 'cinematic') {
        const delayTicks = cinematicMsToTicks(
          recipe.cinematicMs + recipe.sustainedEffectMs + CUTSCENE_FADE_MS,
        );
        cs.completeAtTick = world.tick + delayTicks;
        // S28 P0 / S31 P0-1 — the host-only pendingCreatureSpawn schedule, verbatim value.
        world.pendingCreatureSpawn = {
          fireAtTick: world.tick + delayTicks,
          event,
        };
      } else {
        cs.completeAtTick = null;
      }
    }
  }
  if (owner !== null && cs.completeAtTick !== null && world.tick >= cs.completeAtTick) {
    cs.completeAtTick = null;
    dispatch(world, { type: 'GODLY_COMPLETE' });
    // Queue advance — the cutsceneOverlay.onComplete behavior, tick-domain.
    const next = world.pendingCinematics.shift();
    if (next !== undefined) {
      dispatch(world, { type: 'GODLY_TRIGGER', event: next });
    }
    // Reset to null (the completion moment) so the NEXT invocation observes the
    // null→chained-owner transition and schedules the chained cinematic — one
    // invocation later, exactly like direct mode's startCinematicIfNeeded picking
    // up the onComplete-dispatched trigger on the following frame.
    cs.lastOwner = null;
  }
}
