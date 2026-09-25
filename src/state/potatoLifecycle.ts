/**
 * SPARK — S72 P3 potato-bomb lifecycle reducers.
 *
 * Mirrors the bomb/creature lifecycle shape: pure case-body helpers consumed by
 * world.ts dispatch. Actions:
 *   SPAWN_POTATO    (host-internal; emitted by the spawner cadence) — mint a FREE potato.
 *   PICKUP_POTATO   (client INTENT) — grab a FREE potato (carry-slot exclusive with a spark).
 *   PLACE_POTATO    (client INTENT) — plant the carried potato at the cursor → ARMED.
 *   DROP_POTATO     (client INTENT) — discard the carried potato; it stays ARMED at the
 *                   drop position and keeps its fuse.
 *   POTATO_DETONATE (host-internal; polled in main.ts) — deterministic radial AoE.
 *
 * FORK E (user reading): the fuse runs FROM SPAWN (set in makePotato, NOT reset on
 * place) — a potato held too long cooks off in your hand. One-line flip to Council's
 * from-PLACEMENT is documented in makePotato + applyPlacePotato.
 *
 * Determinism (Council Fork F + the replay guards): the AoE is a PURE fn of the frozen
 * pre-state — SQUARED distance (no sqrt/hypot) + victims iterated in SORTED PrimitiveId
 * order + incident bonds deleted in SORTED BondId order. Host-authoritative; clients
 * receive the result (deleted prims/bonds + BOMB_EXPLODE burst) in the next NetSnapshot.
 */

import {
  DRONE_ATK,
  DRONE_PEN,
  POTATO_BLAST_RADIUS,
  POTATO_CARRIER_BENCH_TICKS,
  POTATO_HOLD_DETONATE_TICKS,
} from '../constants.ts';
import {
  asPotatoId,
  type BondId,
  type CreatureId,
  type DefenderId,
  type PlayerId,
  type PotatoId,
  type PrimitiveId,
  type StinkCloudId,
  type Vec2,
} from '../types.ts';
import { makePotato, type Potato } from './potato.ts';
import { removeCreature } from './creatures/creatureLifecycle.ts';
import { razePrimitives } from './razePrimitives.ts';
// ⭐ S191 C-5 — the hub's blast is ladder damage through the ordinary funnels, and its connector
// sever goes straight to the one sever reducer (see `applyHubLadderBlast`).
import { damageConnector, damageEntity, type DamageTarget } from './damage.ts';
import { applySeverBond } from './severBond.ts';
import { attackFifths } from './stats.ts';
import type { Creature, CreatureType } from './creatures/creature.ts';
import type { Primitive } from '../game/primitive.ts';
import type { World } from './worldTypes.ts';

const POTATO_BLAST_RADIUS_SQ = POTATO_BLAST_RADIUS * POTATO_BLAST_RADIUS;

/** Action shapes — exported so world.ts can compose GameAction. */
export interface SpawnPotatoAction {
  readonly type: 'SPAWN_POTATO';
  readonly pos: Vec2;
}
export interface PickupPotatoAction {
  readonly type: 'PICKUP_POTATO';
  readonly potatoId: PotatoId;
  readonly playerId: PlayerId;
}
export interface PlacePotatoAction {
  readonly type: 'PLACE_POTATO';
  readonly playerId: PlayerId;
  readonly pos: Vec2;
}
export interface DropPotatoAction {
  readonly type: 'DROP_POTATO';
  readonly playerId: PlayerId;
}
export interface PotatoDetonateAction {
  readonly type: 'POTATO_DETONATE';
  readonly potatoId: PotatoId;
}
export interface DissipatePotatoAction {
  readonly type: 'DISSIPATE_POTATO';
  readonly potatoId: PotatoId;
}
/**
 * S113 Batch C — the lightningHub structure self-destruct (host-internal; `hostTick`'s spawner poll).
 *
 * ⭐⭐ S191 C-5 — **TWO BLASTS SHARE THIS ACTION, AND ONLY ONE OF THEM WAS RULED.** `blast` says which,
 * and it is REQUIRED so `tsc` makes every dispatcher choose (an optional flag defaulting to either
 * would be the tolerant default this repo keeps being bitten by):
 *   · `'ladder'` — the LIGHTNING HUB (canon §9d item 2, R182-C): 120 fifths to every enemy entity in
 *     radius (`applyHubLadderBlast`). It always has an owner, so the variant REQUIRES one;
 *   · `'raze'` — the ZOMBIE BOSS's R138 death blast (*"hurting everything"*), which borrowed this
 *     action in S168. Nobody has ruled that it stops deleting, so it is byte-identical to before.
 */
export type StructureSelfDestructAction =
  | {
      readonly type: 'STRUCTURE_SELFDESTRUCT';
      readonly blast: 'ladder';
      readonly pos: Vec2;
      readonly radius: number;
      /** ⭐ S157 P0 (owner) — the seat whose hub is detonating. Spared, always. */
      readonly ownerPlayerId: PlayerId;
    }
  | {
      readonly type: 'STRUCTURE_SELFDESTRUCT';
      readonly blast: 'raze';
      readonly pos: Vec2;
      readonly radius: number;
      /**
       * ⭐ S157 P0 (owner) — the seat whose structure is detonating, so the blast can spare it.
       *
       * OPTIONAL, because this is a HOST-INTERNAL action (`protocol.ts` records it as never a client
       * intent) and an omitted owner means "spare nobody" — the pre-S157 behaviour, which is what the
       * zombie boss's blast passes.
       */
      readonly ownerPlayerId?: PlayerId;
    };

/** Host-only: mint a FREE potato at the spawner-chosen position. */
export function applySpawnPotato(world: World, action: SpawnPotatoAction): World {
  const id = asPotatoId(world.nextPotatoId++);
  world.potatoes.set(id, makePotato({ id, pos: action.pos, spawnedAtTick: world.tick }));
  return world;
}

/**
 * Grab a potato. S75 P1: accepts FREE *or* ARMED — a placed potato is RE-GRABBABLE so it can
 * be passed around as a true hot-potato until the fuse fires. Rejects if: the potato is gone;
 * the potato is CARRIED (already in a hand — first-grab-wins race: two same-tick grabs, the
 * first sets CARRIED, the second sees CARRIED and no-ops); the player is gone; OR the player
 * is already Carrying a spark / a potato (carry-1 mutual exclusion, both directions).
 */
export function applyPickupPotato(world: World, action: PickupPotatoAction): World {
  const potato = world.potatoes.get(action.potatoId);
  if (potato === undefined || potato.state === 'CARRIED') return world;
  const player = world.players.get(action.playerId);
  if (player === undefined) return world;
  if (player.kind === 'Carrying' || player.carriedPotatoId !== undefined) return world;
  potato.state = 'CARRIED';
  potato.carrierId = action.playerId;
  // S81 P2 — stamp the grab: the hold-detonate window (3s) starts NOW. A re-grab (pass)
  // restarts it — that's the hot-potato loop: grab → pass within 3s → repeat.
  potato.carriedAtTick = world.tick;
  player.carriedPotatoId = action.potatoId;
  return world;
}

/**
 * S81 P2 — pure hot-potato predicate for the main.ts poll: a CARRIED potato held
 * continuously for POTATO_HOLD_DETONATE_TICKS cooks off IN HAND (the existing
 * applyPotatoDetonate carrier path benches the holder). Exported for unit tests.
 */
export function shouldCookOffInHand(potato: Potato, tick: number): boolean {
  return (
    potato.state === 'CARRIED' &&
    potato.carriedAtTick !== undefined &&
    tick - potato.carriedAtTick >= POTATO_HOLD_DETONATE_TICKS
  );
}

/**
 * Plant the carried potato at the cursor → ARMED. FORK E: detonateAtTick is UNCHANGED
 * (fuse from-SPAWN). One-line flip to from-PLACEMENT: assign
 * `potato.detonateAtTick = world.tick + POTATO_FUSE_TICKS;` below + arm to Infinity in makePotato.
 */
export function applyPlacePotato(world: World, action: PlacePotatoAction): World {
  const player = world.players.get(action.playerId);
  if (player === undefined || player.carriedPotatoId === undefined) return world;
  const potatoId = player.carriedPotatoId;
  player.carriedPotatoId = undefined;
  const potato = world.potatoes.get(potatoId);
  if (potato === undefined) return world; // detonated mid-carry (race) — slot already cleared
  potato.state = 'ARMED';
  potato.pos.x = action.pos.x;
  potato.pos.y = action.pos.y;
  potato.prevPos.x = action.pos.x;
  potato.prevPos.y = action.pos.y;
  potato.carrierId = null;
  potato.carriedAtTick = undefined; // S81 P2 — placed in time: the hold window dies with the carry
  return world;
}

/**
 * Discard the carried potato: it stays ARMED at its current (last carrier-synced) pos
 * and keeps its from-SPAWN fuse (PDR — "drop stays armed, continues its fuse").
 */
export function applyDropPotato(world: World, action: DropPotatoAction): World {
  const player = world.players.get(action.playerId);
  if (player === undefined || player.carriedPotatoId === undefined) return world;
  const potatoId = player.carriedPotatoId;
  player.carriedPotatoId = undefined;
  const potato = world.potatoes.get(potatoId);
  if (potato === undefined) return world;
  potato.state = 'ARMED';
  potato.carrierId = null;
  potato.carriedAtTick = undefined; // S81 P2 — dropped in time: the hold window dies with the carry
  // CHECK-Grok hygiene — keep prevPos consistent with pos (matches applyPlacePotato).
  // prevPos is vestigial in v1 (the potato is never Verlet-integrated), so this has no
  // functional effect today; it forward-protects a future thrown-potato variant.
  potato.prevPos.x = potato.pos.x;
  potato.prevPos.y = potato.pos.y;
  return world;
}

/**
 * DETERMINISTIC radial AoE at the potato's pos (the uniform blast center across all
 * states). Owner-AGNOSTIC + POSITION-based (fires at the coord even if the structure
 * there is already gone = area denial); NO chain reaction (deletes prims/bonds — and,
 * S100 P1, any CHEWER in radius — only). The chewer kill is the Phase-1 swarm counterplay
 * (R6): chewers are otherwise untargetable since every other primitive hits bonds/positions.
 */
export function applyPotatoDetonate(world: World, action: PotatoDetonateAction): World {
  const potato = world.potatoes.get(action.potatoId);
  if (potato === undefined) return world;
  const cx = potato.pos.x;
  const cy = potato.pos.y;

  // Burst visual — reuse BOMB_EXPLODE (wire-mirrored, so the 1v1 client sees the blast).
  world.effects.push({ kind: 'BOMB_EXPLODE', tick: world.tick, pos: { x: cx, y: cy }, radius: POTATO_BLAST_RADIUS });

  // S75 P1 — if the potato cooked off while still CARRIED (held too long, or force-detonated
  // on carrier disconnect), free the carrier's slot AND bench them (avatar hidden + input
  // locked, reusing the hunter bench infra; Math.max so a longer existing bench can't be
  // shortened). A placed (ARMED) or un-grabbed (FREE) detonation has carrierId===null => no
  // bench: only holding the potato to detonation is punished (the AoE already hit their base).
  if (potato.carrierId !== null) {
    const carrier = world.players.get(potato.carrierId);
    if (carrier !== undefined) {
      carrier.carriedPotatoId = undefined;
      carrier.benchedUntilTick = Math.max(
        carrier.benchedUntilTick ?? 0,
        world.tick + POTATO_CARRIER_BENCH_TICKS,
      );
    }
  }
  world.potatoes.delete(action.potatoId);

  // S100 P1 (TD Phase 1a) — Phase-1 CHEWER KILL PATH (TOWER_DEFENSE_DESIGN.md §4.3, R6):
  // a potato blast also DESPAWNS any CHEWER within the same radius, so chewers are not
  // untargetable in Phase 1 ("blow up the swarm"). Owner-AGNOSTIC (your own potato can
  // catch an enemy chewer or a stray of your own) + POSITION-based (same blast center as
  // the prim AoE), and only CHEWERS (sourceSpawnerId !== null) — a Voltkin is summoned-
  // lifetime and not part of this counterplay. Iterated in SORTED CreatureId order (the
  // canonical sequence, mirroring the sorted prim/bond deletion below) so removal is
  // replay-deterministic regardless of Map insertion history. Runs BEFORE the empty-prim
  // early-return so a chewer-only blast (no structure at the coord) still clears the swarm.
  // S113 (Δ1 guarded extraction) — the chewer/drone-kill + prim/bond radial clear, SAME
  // predicate (sourceSpawnerId !== null) + SAME step order + SAME sorted-id iteration as the
  // original inline body, now via the shared `applyRadialClear` so the lightningHub structure
  // self-destruct reuses ONE tested radial clear instead of duplicating it. The potato call site
  // is byte-IDENTICAL (the save.replay.test.ts two-seed gate is the proof).
  /*
   * ⛔ S165 — THE PREDICATE IS NOW A TYPE TEST, AND THE COMMENT ABOVE HAD BEEN WRONG FOR SEVERAL
   * SESSIONS. It says "only CHEWERS (sourceSpawnerId !== null)". That stopped being true at S151,
   * when `goblinTowerFeed` began stamping every goblin with a spawner id: a potato has been
   * deleting goblins ever since, and W1-C's race unit joined the same silent widening.
   *
   * ⚠ THIS CHANGE IS DELIBERATELY BEHAVIOUR-PRESERVING. The list below is exactly the set the old
   * provenance test already matched, written out — chewer, drone, all six goblins, and the race unit
   * — so the `save.replay.test.ts` two-seed gate the comment above cites as its proof still holds.
   * What it buys is that the NEXT spawner-sourced creature has to be added here on purpose instead
   * of being swept in silently, which is the third time this exact drift has cost something this
   * session (`botBrain.nearestChewer` and the stink-tower taunt were the other two).
   *
   * ⚠ AND THERE IS A BALANCE QUESTION HERE FOR THE OWNER, NOT FOR ME. `applyRadialClear` DELETES
   * rather than damages, so one potato erases a whole squad of free castle units regardless of their
   * ehp — while a Voltkin standing in the same blast survives, because it alone has no spawner id.
   * R123/R124 make race units uncapped and permanent, so a keep accumulates a standing squad that a
   * single potato wipes. Whether that is the intended counterplay is a ruling; the current answer is
   * simply what the old predicate already did, preserved.
   */
  return applyRadialClear(world, cx, cy, POTATO_BLAST_RADIUS_SQ, (c) => potatoClearsType(c.type));
}

/**
 * ⭐ S167 — HOISTED OUT OF THE FUNCTION BODY SO A TEST CAN ASK IT QUESTIONS.
 *
 * It was a `const` inside `applyPotatoDetonate`, which made it unreachable from vitest — and that is
 * part of why the omission below went unnoticed for a session. A membership rule nothing can
 * interrogate is a rule nothing can guard.
 */
const POTATO_CLEARS: ReadonlySet<CreatureType> = new Set<CreatureType>([
  'chewer', 'lightningDrone',
  'goblinMelee', 'goblinArcher', 'goblinShield', 'goblinHound', 'goblinBat', 'goblinSuicide',
  'raceUnit',
  /*
   * ⛔ S167 — THE SIX TIER-3 UNITS WERE MISSING, AND THAT IS THE DRIFT THIS LIST WAS WRITTEN TO
   * PREVENT — HAPPENING ONE SESSION LATER.
   *
   * The set was authored in S165 as a behaviour-preserving spelling-out of the old
   * `sourceSpawnerId !== null` predicate. S166 then added the tier-3 units, and `applyFeedTower`
   * stamps every one of them with `sourceSpawnerId: action.spawnerId` — so under the OLD predicate a
   * potato WOULD have cleared them. Under the explicit list it did not, which left the tier-3 units
   * UNIQUELY POTATO-IMMUNE among tower units: a goblin hound dies to a blast its tier-3 counterpart
   * shrugs off, for no stated reason. Restoring them is a consistency fix, not a balance decision.
   *
   * ⚠ The irony is the durable lesson: this list exists so the next spawner-sourced creature has to
   * be added ON PURPOSE, and the very next one was not. An explicit list only helps if something
   * FAILS when it is incomplete — `potatoClears.test.ts` is now that something.
   */
  't3Hound', 't3Scarab', 't3Piranha', 't3Bat', 't3Warband', 't3Souleater',
  // S188 APEX PREDATOR — a tower unit like the piranha it replaces, so the same potato rule.
  't3PiranhaElite',
  // S188 THE SWARM — a tower unit like the bat it replaces, so the same potato rule.
  't3BatSwarm',
  /*
   * ⛔ AND THE SIX TIER-9 BOSSES ARE DELIBERATELY **ABSENT** — a decision, not the same omission.
   *
   * A boss is dispatched with `sourceSpawnerId: null` (`hostTick`'s t9 arm), so the OLD predicate
   * never covered it either: it sits in the Voltkin's class, which has always been potato-immune for
   * exactly that reason. Consistency alone settles it.
   *
   * ⭐ AND THE CONSEQUENCE WOULD BE INDEFENSIBLE OTHERWISE. `applyRadialClear` **DELETES** rather
   * than damages, ignoring `ehp` entirely. A boss costs NINE shapes — the most expensive build in
   * the game — releases once, and takes its whole tower with it. One potato erasing it outright, at
   * full health, with no damage step, would make the most expensive structure in the game
   * answerable by the cheapest item. A hard counter to a boss should be something that FIGHTS it.
   *
   * ⭐ S168 — **AND THE ORC WARLORD'S DIREWOLF IS ABSENT ON THE SAME GROUNDS**, stated here rather
   * than left to omission. A summon carries `sourceSpawnerId: null` (`bossSkillsWarlord.ts`), so it
   * is in the Voltkin's class exactly as a boss is, and the old predicate would never have covered
   * it either. The post-audit flagged it as *"the only direwolf membership question in the tree
   * answered by omission rather than by a line"* — this is the line. The whole point of this Set,
   * per the note above, is that the next spawner-sourced creature is added ON PURPOSE instead of
   * being swept in silently; the inverse deserves the same treatment.
   */
]);

/**
 * Does a potato blast DELETE this creature type outright?
 *
 * ⚠ A PREDICATE RATHER THAN THE `Set`, so a caller cannot mutate the rule — and so the membership
 * question has one answer at one call site.
 */
export function potatoClearsType(type: CreatureType): boolean {
  return POTATO_CLEARS.has(type);
}

/**
 * S113 Batch C (Δ1) — the DETERMINISTIC radial-clear core, lifted VERBATIM (same step order, same
 * SORTED-id iteration, same effects) from the S72 applyPotatoDetonate body so the structure
 * self-destruct shares it WITHOUT a second copy. The CALLER emits its own burst effect
 * (BOMB_EXPLODE) BEFORE calling this, preserving the original effect order (burst, then per-victim
 * SEVER_ERASE). `creatureKill` selects which creatures the blast despawns: the potato passes
 * `c => c.sourceSpawnerId !== null` (chewers + drones — its original filter); the structure
 * self-destruct passes `() => true` (owner: "destroying EVERYTHING in its radius").
 *
 * Order (unchanged from S72): creature-kill (SORTED CreatureId) -> collect prim victims (SQUARED
 * dist, SORTED PrimitiveId) -> early-return if none -> SEVER_ERASE per victim + collect incident
 * bonds -> delete bonds (SORTED BondId) -> delete prims + snapPrevPos -> reconcileFouledPrimitives.
 */
export function applyRadialClear(
  world: World,
  cx: number,
  cy: number,
  radiusSq: number,
  creatureKill: (creature: Creature) => boolean,
  /**
   * ⭐ S157 P0 (owner) — WHICH PRIMITIVES THIS BLAST IS ALLOWED TO TAKE. Optional, and omitting it
   * destroys everything in radius — which is what the potato does and what this function did for its
   * whole life, so the potato path stays byte-identical.
   *
   * It exists because the primitive loop had NO predicate at all while the creature loop had one,
   * and `applyStructureSelfDestruct` passed `() => true` for creatures and inherited "everything"
   * for shapes. That is the owner's report: *"lightning hubs blow up own structures … they shouldnt
   * be able to hit friendlies"*. A blast that can choose its victims among creatures but not among
   * shapes is an asymmetry with no design behind it.
   */
  primKill: (prim: Primitive) => boolean = () => true,
): World {
  const creatureVictims: CreatureId[] = [];
  for (const [cid, creature] of world.creatures) {
    if (!creatureKill(creature)) continue;
    const dx = creature.pos.x - cx;
    const dy = creature.pos.y - cy;
    if (dx * dx + dy * dy <= radiusSq) creatureVictims.push(cid);
  }
  creatureVictims.sort((a, b) => (a as number) - (b as number));
  // ⭐ S171 — THE SITE THAT MADE A CHOKEPOINT NECESSARY. This loop "obliterates regardless of hp"
  // (see damageCreature's docstring), so it bypasses every damage-side guard there is. A potato
  // blast is exactly how a channelling Pharaoh would have been deleted mid-ritual.
  for (const cid of creatureVictims) removeCreature(world, cid);

  const victims: PrimitiveId[] = [];
  for (const [pid, prim] of world.primitives) {
    if (!primKill(prim)) continue;
    const dx = prim.pos.x - cx;
    const dy = prim.pos.y - cy;
    if (dx * dx + dy * dy <= radiusSq) victims.push(pid);
  }
  victims.sort((a, b) => (a as number) - (b as number));
  if (victims.length === 0) return world;

  // The per-victim SEVER_ERASE is CALLER semantics (effect kind + position), so it stays here
  // and must run BEFORE the raze while the primitives are still readable.
  for (const pid of victims) {
    const prim = world.primitives.get(pid);
    if (prim === undefined) continue;
    world.effects.push({ kind: 'SEVER_ERASE', tick: world.tick, pos: { x: prim.pos.x, y: prim.pos.y }, color: prim.placerColor, radius: prim.radius });
  }

  // S138 P1 — bond teardown (SORTED BondId), prim deletion, snapPrevPos and the fouled-set
  // reconcile are the shared raze contract, now in state/razePrimitives.ts. Behaviour is
  // unchanged: this site is where that sort order came from.
  razePrimitives(world, victims);
  return world;
}

/**
 * ⭐⭐ S191 C-5 — **THE LIGHTNING HUB'S BLAST IS A NUMBER ON THE LADDER** (canon §9d item 2, R182-C).
 *
 * > *"four times a drone's damage"* — owner, S182 (the AMOUNT)
 * > *"The lightning hub self-destruct will have to rework then. It can't destroy everything around
 * > it, but there should be a certain damage output."* — owner, S187 (the raze is killed)
 *
 * `4 × attackFifths(DRONE_ATK 5, DRONE_PEN 1)` = 4 × 30 = **120 fifths**. The 4 is his; the ATK/PEN are
 * the drone config's own constants, so a retune of the drone retunes this.
 *
 * ⚠ HIS RULING'S CONSEQUENCE, STATED SO NOBODY READS IT LATER AS A REGRESSION: **120 does not kill a
 * tier-9 boss** (pools 260–462), where the raze deleted one where it stood. Nor Helga (156).
 * ⚠ MINE — **PER CONNECTOR**: every enemy connector whose midpoint is inside takes its own 120, so a
 * 5-connector tower wholly inside takes 600 and still falls. Once-per-structure (120 to the whole
 * building) is the other reading, and it is the owner's call.
 * ⚠ MINE — the UNBUFFED drone: a seat that drafted ATK/PEN has drones that hit harder (S190
 * `creatureAttackFifths`), and its hub's blast stays 120, because his words price it off "a drone".
 */
export const STRUCTURE_SELFDESTRUCT_DRONE_MULTIPLE = 4;
export const STRUCTURE_SELFDESTRUCT_FIFTHS = STRUCTURE_SELFDESTRUCT_DRONE_MULTIPLE * attackFifths(DRONE_ATK, DRONE_PEN);

/**
 * ⭐⭐ S191 C-5 — the hub's blast, arm by arm. Every victim is COLLECTED (sorted by id) before anything
 * is mutated — `applyRadialDamage`'s iteration discipline — and then damaged in a fixed family order:
 * creatures → Helga → lone shapes → stink bags → connectors. Each arm is enemy-only by the S157 P0 rule.
 *
 *   · **creatures** — 120 each, through `damageEntity` (a channelling Pharaoh takes nothing, as always);
 *   · **Helga** — the one defender with a pool (`ehp !== null`); a TOWER has none and dies through its
 *     connectors (R75), so it is not collected;
 *   · **lone built shapes** — `bonds.size === 0` AT COLLECTION: a shape inside a structure has NO arm
 *     (canon §4, *"you kill a building through its connectors"*). This is why the blast cannot be
 *     `applyRadialDamage` at 120: its shape arm hits every shape in radius, and 120 > a shape's 70, so
 *     every enemy building inside would still be razed — the raze he ruled out (S191 Council);
 *   · **stink bags** — an explicit `world.stinkClouds` arm (the radial helper never visits them). ⚠ A
 *     bag the blast pops still BURSTS, and a burst spares the BAG's owner, not the killer — so it can
 *     hurt the hub owner's own things beside it. That is the bag's existing rule, not a new one;
 *   · **connectors** — the suicide goblin's arm: the bond's MIDPOINT inside, NEITHER endpoint the
 *     owner's (a mixed bond is spared), `damageConnector(120, null)` — no creature attacker, so no
 *     lifesteal — and, when it gives way, severed with cause `'drone'`: an EXISTING cause (no bump for
 *     the value), and the honest one for *"a suicide drone building"* (R182-A). ⚠ MINE. The sever goes
 *     straight to `applySeverBond`, not through `dispatch`, for POWER OF RA's audit-F1 reason:
 *     `dispatch`'s bench and elimination gates would REFUSE the sever if the owner were benched or out,
 *     leaving a connector standing after its pool was spent. `canSeverBond` still runs.
 *
 * ⛔ THE CASTLE IS NOT AN ARM. On every shipped board no enemy keep can be inside 240 px of a hub built
 * on its owner's ground (`hubSelfDestructLadder.test.ts` measures it); a board that changes that needs
 * his ruling first.
 */
function applyHubLadderBlast(world: World, cx: number, cy: number, radius: number, owner: PlayerId): void {
  const r2 = radius * radius;
  const inR = (x: number, y: number): boolean => {
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r2;
  };
  const byId = (a: unknown, b: unknown): number => (a as number) - (b as number);

  // ── collect first, mutate second ──
  const creatures: CreatureId[] = [];
  for (const [id, c] of world.creatures) if (c.ownerPlayerId !== owner && inR(c.pos.x, c.pos.y)) creatures.push(id);
  creatures.sort(byId);
  const helgas: DefenderId[] = [];
  for (const [id, d] of world.defenders) {
    if (d.ehp !== null && d.ownerPlayerId !== owner && inR(d.pos.x, d.pos.y)) helgas.push(id);
  }
  helgas.sort(byId);
  const loneShapes: PrimitiveId[] = [];
  for (const [id, p] of world.primitives) {
    if (p.bonds.size === 0 && p.placedBy !== owner && inR(p.pos.x, p.pos.y)) loneShapes.push(id);
  }
  loneShapes.sort(byId);
  const bags: StinkCloudId[] = [];
  for (const [id, s] of world.stinkClouds) if (s.ownerPlayerId !== owner && inR(s.pos.x, s.pos.y)) bags.push(id);
  bags.sort(byId);
  const connectors: BondId[] = [];
  for (const [id, b] of world.bonds) {
    if (world.primitives.get(b.aId)?.placedBy === owner || world.primitives.get(b.bId)?.placedBy === owner) continue;
    if (inR((b.a.pos.x + b.b.pos.x) / 2, (b.a.pos.y + b.b.pos.y) / 2)) connectors.push(id);
  }
  connectors.sort(byId);

  // ── apply ── (one `damageEntity` site, `null` attacker: a blast names nobody — S183)
  const targets: DamageTarget[] = [
    ...creatures.map((id): DamageTarget => ({ kind: 'creature', id })),
    ...helgas.map((id): DamageTarget => ({ kind: 'defender', id })),
    ...loneShapes.map((id): DamageTarget => ({ kind: 'primitive', id })),
    ...bags.map((id): DamageTarget => ({ kind: 'stinkCloud', id })),
  ];
  for (const t of targets) damageEntity(world, t, STRUCTURE_SELFDESTRUCT_FIFTHS, 'hazard', null);
  for (const bondId of connectors) {
    if (!world.bonds.has(bondId)) continue; // an earlier sever, raze or burst already took it
    if (damageConnector(world, bondId, STRUCTURE_SELFDESTRUCT_FIFTHS, null)) {
      applySeverBond(world, { type: 'SEVER_BOND', bondId, playerId: owner, cause: 'drone' });
    }
  }
}

/**
 * S113 Batch C — the lightningHub STRUCTURE self-destruct: a BOMB_EXPLODE burst at the anchor, then
 * the blast. ⭐ S191 C-5 — the hub's blast is now `'ladder'` (above); `'raze'` is the zombie boss's
 * R138 death blast, which still deletes everything in its radius through the shared radial clear
 * (the S113 body, below, unchanged). Position-based; host-internal (`hostTick` dispatches it on the
 * destruction branch, then REMOVE_SPAWNER, so it fires exactly once).
 */
export function applyStructureSelfDestruct(world: World, action: StructureSelfDestructAction): World {
  const cx = action.pos.x;
  const cy = action.pos.y;
  world.effects.push({ kind: 'BOMB_EXPLODE', tick: world.tick, pos: { x: cx, y: cy }, radius: action.radius });
  if (action.blast === 'ladder') {
    applyHubLadderBlast(world, cx, cy, action.radius, action.ownerPlayerId);
    return world;
  }
  /*
   * ⭐ S157 P0 (owner) — **THE BLAST NO LONGER EATS ITS OWN BASE.**
   *
   * Owner: *"lightning hubs blow up own structures or nearby friendlies … they shouldnt be able to
   * hit friendlies in friendly territory"*. This was the single most damaging line in the report and
   * it was a one-word omission: `() => true` for creatures, and nothing at all for primitives, so a
   * 240 px raze took the owner's own shapes and the three drones they had just paid for.
   *
   * With `ownerPlayerId` supplied, the owner's shapes and units are spared and everyone else's are
   * not — the hub becomes the offensive finale it was designed to be. Omitted (the potato path, and
   * any pre-S157 caller), the behaviour is byte-identical to before.
   */
  const owner = action.ownerPlayerId;
  return applyRadialClear(
    world,
    cx,
    cy,
    action.radius * action.radius,
    (c) => owner === undefined || c.ownerPlayerId !== owner,
    (p) => owner === undefined || p.placedBy !== owner,
  );
}

/**
 * Host-only: a FREE (never-picked-up) potato's from-SPAWN fuse elapsed — remove it HARMLESSLY
 * (no blast, no victims), mirroring applyDissipateBomb. S78 fix for "random explosions": a FREE
 * potato used to DETONATE in the spawn-zone centre ~23s after spawning, deleting central structures
 * nobody triggered. Now only a CARRIED (cooked-off-in-hand) or ARMED (planted) potato detonates;
 * an un-engaged one quietly rots, freeing the POTATO_MAX_ACTIVE slot for the next spawn.
 */
export function applyDissipatePotato(world: World, action: DissipatePotatoAction): World {
  world.potatoes.delete(action.potatoId);
  return world;
}

/**
 * Teardown — clear all potato state. Called on PLAYING -> WIN (WIN_TRIGGER) and on
 * RETURN_TO_TITLE / START_GAME so no potato / carry-slot persists across matches.
 */
export function teardownPotatoes(world: World): void {
  world.potatoes.clear();
  world.nextPotatoId = 0;
  for (const player of world.players.values()) player.carriedPotatoId = undefined;
}
