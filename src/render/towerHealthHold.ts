/**
 * SPARK — S194 T15 (owner R194-30) — **A WELDED TOWER DOES NOT REBUILD ITSELF WHEN ITS STRUCTURE RE-FORMS.**
 *
 * > *"this pentagram tower is connected to the whole shape above … as they destroy the connectors, it
 * > gets rebuilt … even though the tower connector has been destroyed, it rebuilds the tower
 * > automatically. That's completely wrong."* — owner, S194 live playtest. And, narrowing it: *"It's not
 * > only the pentagram … the golden goblin tower … All the buildings connected to structures … make up
 * > the whole health pool … Once this 100% of the health is done, there's a new 100% … but it still
 * > shows as like 100% health, and I think that's why it rebuilds the tower."*
 *
 * ## The defect, measured (`weldRebuildR194.test.ts`, through `runHostTick`)
 *
 * Two readings of one welded tower disagree, BY DESIGN, and the gap between them is the "rebuild":
 *
 *   · The SIM prices a sever against the whole welded structure: `damageConnector` banks structure-wide
 *     and fells the struck connector once `n × (5 + n)` is banked (canon §2, R173-B) — 2250 fifths for a
 *     45-connector weld.
 *   · The BAR, the CARD and the DAMAGE ART read the tower's OWN connectors (S191 C-7 / S193 SEAM-C7,
 *     `towerUnit.towerOwnPoolAt`): the recipe's pool (a pentagram's 50, a goblin tower's 50) minus the
 *     damage standing on ITS connectors. Three orc swings (18 each) empty it; the art walks to the last
 *     collapse frame while the tower stands on for another ~15 s. That much was ACCEPTED (S191 C-7's
 *     docblock states it as the consequence).
 *
 * ⛔ What was NOT accepted, and is the bug: when a connector ELSEWHERE in the weld finally falls,
 * `damageConnector` SPENDS the pool — the struck bond first, then the survivors in ascending id, and a
 * tower's own connectors are the oldest bonds in its structure, so they are drained first. The damage on
 * the tower's own connectors drops to ~0, its own pool reads 50/50 again, and `advanceRampCursor` snaps
 * a decrease straight back to frame 1 (its docblock: *"the only way health goes UP is FIX"* — false for
 * a welded tower). Rubble → pristine building, green full bar, no FIX, no shape spent, same spawner, no
 * new tower: on the board that IS "it rebuilds automatically", every time a connector of the weld falls.
 *
 * ⚠ AND NO DRAIN ORDER CAN FIX IT IN THE SIM. A sever happens when the structure's TOTAL bank reaches
 * the pool, and the pool is then spent, so whatever order the drain takes, what is left on the whole
 * structure afterwards is the breaking hit's overkill and nothing more. Any reading of per-bond damage
 * refills on a re-form. Holding the tower's damage across one needs MEMORY.
 *
 * ## ⭐ The fix — the tower's own reading HOLDS through a re-form, and only a FIX heals it
 *
 * Once per rendered frame (`beginTowerHealthHoldFrame`, beside `beginTowerCoverFrame`) every live tower's
 * own banked damage is read, and this module keeps a HELD figure per tower — the own damage as if a
 * re-form had never drained it:
 *   · damage rising → the held figure rises by the same amount (new hits always show);
 *   · damage FALLING while the tower's structure LOST a connector since the last frame → a re-form drain:
 *     the held figure does not move;
 *   · damage falling with no connector lost → a REPAIR (FIX is the only other writer of
 *     `Bond.damageFifths` — `structureRepair.ts:624`; the drain is `damage.ts:686`): the held figure
 *     takes the repaired reading;
 *   · a tower seen for the first time (a genuinely NEW tower, or a joiner's first sight) starts from its
 *     current reading — a new tower still builds, and plays its build, exactly as before.
 * The bar, both cards and the ramp art all read `heldOwnBanked`, so the three surfaces still show ONE
 * number (canon §9d item 3: *"the bar needs to follow the art or the art needs to follow the bar"*).
 *
 * ⚠ WHAT DOES NOT CHANGE: the sim. Nothing here is simulated, hashed or sent — the structure-wide pool,
 * the re-form at `(n−1)(5+n−1)` (owner: *"a new 100%, which is less health in total"* — correct), the
 * welded STRUCTURE's pool on the card, the spawner (same id, same timers — it never re-registered), the
 * cover set and the hub's sim-side fuse (`structureStarHealth.ts`) are all untouched. No PROTOCOL bump.
 *
 * ⚠ CLIENT-LOCAL, LIKE THE RAMP CURSOR IT FEEDS. Every peer that watched the drain holds the same figure
 * from the same synced data; a peer that JOINED after the drain never saw the damage and reads the tower
 * as the sim has it (the S183 `seedCursor` rule, for the same reason: the ramp is for damage arriving
 * NOW). Inactive until `beginTowerHealthHoldFrame` is first called, so a test or a model call with no
 * frame reads exactly the pre-S194 numbers.
 */
import { componentOf } from '../game/structure.ts';
import { towerOwnPoolAt } from '../state/towerUnit.ts';
import { towerMembersAt } from '../state/towerMembers.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import type { World } from '../state/worldTypes.ts';
import type { BondId, PrimitiveId } from '../types.ts';

interface Hold {
  /** The tower's own banked damage as if no re-form had drained it, fifths. */
  held: number;
  /** The raw own banked damage at the last frame. */
  raw: number;
  /** Connectors in the tower's whole structure (its anchor's component) at the last frame. */
  compBonds: number;
  /** The tower's own connector ids at the last frame (a FIX re-weld mints a NEW id — audit 2a). */
  ownBonds: ReadonlySet<BondId>;
  /** Was a repair job covering this tower queued at the last frame? (`world.repairJobs` is synced.) */
  hadJob: boolean;
}

const holds = new Map<string, Hold>();
let active = false;
/**
 * ⛔ S194 audit F1 — the MATCH the holds belong to. NOT a tick watermark: on a JOINER `world.tick` steps
 * BACK routinely (the client steps `tick++`, then a snapshot sets `world.tick = snap.tick`, `save.ts`), and
 * a "the clock went backwards ⇒ new match" clear wiped every hold on every joiner — the tower rebuilt again
 * there. The real boundaries: a different `World` object, or the world leaving PLAYING (title, lobby, win
 * screen); ids restart only across those. The per-frame prune below drops towers that vanish mid-match.
 */
let lastWorld: World | null = null;

const keyOf = (recipeId: GodlyId, anchorId: PrimitiveId): string => `${recipeId}:${anchorId as unknown as number}`;

/**
 * Read every live tower once and advance its held figure. Call once per rendered frame, BEFORE any
 * renderer syncs (next to `beginTowerCoverFrame`). Spawners by id, then defenders by id — a total order,
 * though nothing here depends on it (each tower's update reads only its own state).
 */
export function beginTowerHealthHoldFrame(world: World): void {
  active = true;
  if (world !== lastWorld || world.gameState !== 'PLAYING') holds.clear();
  lastWorld = world;
  const seen = new Set<string>();
  const towers: { recipeId: GodlyId; anchorId: PrimitiveId }[] = [];
  for (const sp of [...world.creatureSpawners.values()].sort((a, b) => Number(a.id) - Number(b.id))) {
    towers.push({ recipeId: sp.recipeId, anchorId: sp.anchorPrimitiveId });
  }
  for (const d of [...world.defenders.values()].sort((a, b) => Number(a.id) - Number(b.id))) {
    towers.push({ recipeId: d.recipeId, anchorId: d.anchorPrimitiveId });
  }
  for (const t of towers) {
    const key = keyOf(t.recipeId, t.anchorId);
    if (seen.has(key)) continue;
    const anchor = world.primitives.get(t.anchorId);
    if (anchor === undefined) continue;
    const own = towerOwnPoolAt(world, t.recipeId, t.anchorId);
    if (own === null) continue;
    seen.add(key);
    const compBonds = componentOf(anchor, world.primitives, world.bonds).bondIds.size;
    const ownBonds = new Set<BondId>(towerMembersAt(world, t.recipeId, t.anchorId)?.bonds ?? []);
    const members = new Set<PrimitiveId>(own.prims);
    const hasJob = world.repairJobs.some((j) => j.memberIds.some((m) => members.has(m)));
    const h = holds.get(key);
    if (h === undefined) {
      // First sight: a NEW tower (or a joiner's first look) reads exactly what the sim says.
      holds.set(key, { held: own.banked, raw: own.banked, compBonds, ownBonds, hadJob: hasJob });
      continue;
    }
    /*
     * ⭐ S194 audit 2a — A REPAIR IS AUTHORITATIVE, even when a weld connector fell in the same frame /
     * snapshot (which alone would read as a drain and hide the heal forever): a FIX job covering this tower
     * that was queued last frame and is gone now (it finished — `repairJobs.ts` removes a job on restore;
     * a cancel leaves the tower as the sim reads it anyway), or an own connector id that was not there last
     * frame (a FIX re-weld mints a new bond id; placement never bonds two existing own shapes).
     */
    let rewelded = false;
    for (const b of ownBonds) if (!h.ownBonds.has(b)) { rewelded = true; break; }
    const repaired = rewelded || (h.hadJob && !hasJob);
    if (own.banked >= h.raw) {
      h.held += own.banked - h.raw; // new damage always shows
    } else if (compBonds < h.compBonds && !repaired) {
      // ⛔ THE R194-30 CASE: a connector of its structure fell and the drain spent the tower's own
      // damage. The structure re-formed; the TOWER was not repaired. Hold.
    } else {
      h.held = own.banked; // a FIX: the repair is real, show it
    }
    h.raw = own.banked;
    h.compBonds = compBonds;
    h.ownBonds = ownBonds;
    h.hadJob = hasJob;
  }
  for (const key of [...holds.keys()]) if (!seen.has(key)) holds.delete(key); // fallen / scrapped towers
}

/**
 * The own banked damage a surface should SHOW for the live tower `recipeId` at `anchorId`: the held
 * figure, never less than `rawBanked` (a reader one frame ahead of the hold still shows its new hit).
 * `rawBanked` unchanged while inactive or for a tower the hold has not seen.
 */
export function heldOwnBanked(recipeId: GodlyId, anchorId: PrimitiveId, rawBanked: number): number {
  if (!active) return rawBanked;
  const h = holds.get(keyOf(recipeId, anchorId));
  return h === undefined ? rawBanked : Math.max(rawBanked, h.held);
}

/** TEST-ONLY — forget every hold and go inactive. */
export function __resetTowerHealthHoldForTests(): void {
  holds.clear();
  active = false;
  lastWorld = null;
}
