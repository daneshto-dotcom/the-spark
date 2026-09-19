/**
 * SPARK — S175 P6: PHASE THE SHAPES OUT WHILE A BUILDING STANDS ON THEM (owner R169 / S170 P11).
 *
 * Owner: *"when the building is built you shouldn't see the shapes, the primitives, the connectors
 * behind. You should see ONLY the tower until the first connector is destroyed, and then you should
 * see them again … like you phase them in and out of reality."* And on the loop, S175: *"the tower's
 * there. And once the first connector gets destroyed … that's when you see the connectors again, you
 * can rebuild it. And then it gets built and then the connectors … disappear. It looks better."*
 *
 * ⭐ **RENDERER-ONLY, AND STRONGER THAN THAT PHRASE USUALLY MEANS.** Nothing here is simulated, and
 * nothing COULD have been: "is this tower intact" flips no field anywhere — it is derived from
 * topology every frame (`ringMembersAt` walks `world.bonds`), and both `world.primitives` and
 * `world.bonds` are required, fully-synced wire fields. Every peer computes the identical answer, so
 * this costs no sim state, no snapshot bytes and no PROTOCOL_VERSION bump. The shapes stay
 * simulated, raidable and chewable throughout; only their alpha changes.
 *
 * ⛔ **THE COVER SET IS PUBLISHED BY WHOEVER ACTUALLY DREW A SPRITE, NEVER RE-DERIVED HERE.** That is
 * the single most important decision in this file. A tower sprite reaches the screen only after
 * clearing five separate gates — the recipe has art, the anchor is not fogged, the atlas has finished
 * loading, the ring still resolves, the ring has members — and `towerRenderer`'s own docblock states
 * the fallback contract for the ones it fails: *"the shapes themselves stay visible underneath, so
 * the structure is still readable"*. A module that re-derived "is a tower here" from the recipe would
 * disagree with the renderer on every one of those paths and hide the shapes under a tower that is
 * not being drawn — a blank patch of board, which is the exact defect this feature exists to remove.
 * So the renderers call `markTowerCover` at the point they commit a sprite, and this module only
 * remembers what they said.
 *
 * ⛔ **AND THAT ALSO CLOSES THE TWO-CLOCK WINDOW.** The tower sprite stops drawing at 60 Hz the moment
 * `ringMembersAt` returns null, but `REMOVE_SPAWNER` only fires on a throttled 30-tick re-validation
 * poll. Keying the reveal on the spawner still existing would leave up to half a second with no tower
 * AND no visible connectors. Keying it on "did anyone draw a sprite for these shapes this frame"
 * cannot open that window, because it is the same event.
 *
 * ⚠ **ONE FRAME OF LAG, DELIBERATELY.** `structureRenderer.sync` runs at main.ts:3675, BEFORE
 * `towerRenderer.sync` (:3697) and the defender renderers (:3710-3714). Rather than reorder the
 * render tick — which risks z-order and fog interactions for a cosmetic feature — the marks made
 * during frame N are read during frame N+1. At 60 Hz that is 16 ms against a 2-second ramp, and it
 * is self-correcting. Reordering would have been the fragile choice, not the clean one.
 *
 * ## ⛔⛔ S183 — THE OWNER CORRECTED THE REVEAL TRIGGER. THE S175 RULE ABOVE IS SUPERSEDED.
 *
 * He said in S175 *"once the first connector gets destroyed … that's when you see the connectors
 * again"*, and in S183, having played it:
 *
 * > *"It does not come back when the building starts dying so you can still repair it. No —
 * > because you can see the tower is damaged. You can just click the tower and repair it. You
 * > don't have to see the connectors. The connectors come back when the tower is being destroyed,
 * > like when it hits zero health and you can see it crumble and fall."*
 *
 * ⭐ **WHAT MADE THE CORRECTION POSSIBLE IS THE DAMAGE RAMP.** In S175 a hidden connector being
 * chewed had nothing on screen to show for it, so `structureRenderer` pinned a damaged connector
 * back to legible (`DAMAGED_BOND_MIN_ALPHA`) — his *"you gotta see damage everywhere"*. The ramp
 * art now carries that signal on the BUILDING itself, so the pin has been retired: a damaged tower
 * looks damaged and its shapes stay hidden. Both of his rulings are honoured; the second one moved
 * where the first one is answered.
 *
 * ⚠ **AND THE MECHANIC IN THIS MODULE DID NOT CHANGE — ONLY WHEN THE MARK STOPS ARRIVING.** Cover
 * is still published per frame by whoever commits a sprite. What S183 changed is that the ramp
 * renderer keeps drawing (and therefore keeps covering) all the way through the damage states and
 * across the connector snap, so the reveal now fires at the crumble instead of at the first hit.
 *
 * ⭐ **SCOPE: THE RACE TOWERS, THE FIVE RAMP TOWERS AND — SINCE S183 — THE DEFENDERS.** Asked
 * whether "a tower on top" includes the defenders, he said yes — turret, Helga, stink tower,
 * pentagram — and then, in the same breath, that none of them HAS building art yet: *"we haven't
 * even generated an image yet. I'll do it, and then we'll do the damage state and the destroyed
 * state and the whole loop … So for now, let's focus on the race ones that we do have."*
 *
 * That falls out of the design rather than needing a filter. Cover is published by whoever commits a
 * tower SPRITE, and the general towers draw a character or a turret rig, not a building standing on
 * the ring — so they never mark, and their shapes keep drawing exactly as they do today. When their
 * art lands, each one is a single `markTowerCover` call at its own sprite commit. Nothing here
 * changes.
 *
 * ✅ **AND IT LANDED EXACTLY THAT WAY IN S183.** The laser turret and HELGA got building art, so
 * `StructureRampRenderer.drawStructure` — which now walks `world.defenders` as well as
 * `world.creatureSpawners` — is the FOURTH publish site and the first one a defender can reach.
 * Nothing in this module changed to allow it. ⛔ `towerCover.test.ts` counts the publish sites and
 * the sites that CONSUME cover alpha, and pins both totals, because an un-consuming draw site is
 * how the shapes stayed visible for eight sessions: `spawnerZoneRenderer` faithfully redrew every
 * bond this module had just faded to nothing.
 *
 * ⚠ **NO WALL CLOCK.** The ramp is driven off `world.tick`. `performance.now()` is the established
 * idiom for purely local shimmer elsewhere in the renderer, but this fade is something two players
 * watch happen to the same structure, and a tick-driven ramp means they watch the same thing.
 */
import type { World } from '../state/world.ts';
import type { BondId, PrimitiveId } from '../types.ts';

/**
 * How long a shape takes to phase out or back in, in ticks (60 Hz ⇒ 2.0 s).
 *
 * ⚠ THE NUMBER IS MINE. The owner described the feeling (*"phase them in and out of reality"*) and
 * gave a two-second figure for a different effect in the same breath; nothing in his rulings fixes
 * this one. Two seconds is slow enough to read as a phase rather than a pop, and short enough that a
 * connector broken mid-fight brings the shapes back while the fight is still happening. Overrule it
 * against the live board.
 */
export const TOWER_COVER_FADE_TICKS = 120;

/**
 * ⭐⭐ S183 (owner) — **THE REVEAL IS FASTER THAN THE FADE, AND HE GAVE BOTH NUMBERS.**
 *
 * > *"It should disappear within, like, two seconds after this tower is built, like, phase out."*
 * > *"The connectors come back when the tower is being destroyed, like when it hits zero health and
 * > you can see it crumble and fall. **That's when they phase back in within like a second.**"*
 *
 * Two seconds out, one second back: 60 ticks at 60 Hz. ⚠ The asymmetry is HIS, not a tuning choice
 * — the fade-out is ambience and can take its time, while the phase-in is the player being told
 * *this building is coming down, the shapes are yours again*, and that has to land inside the beat
 * the collapse plays in (`RAMP_RUINS_HOLD_TICKS` 42 + the death run).
 *
 * ⛔ AND THE RAMP STILL REVERSES FROM WHERE IT IS, NOT FROM THE END — see `reconcile`. Two
 * durations make that arithmetic asymmetric too: the position is carried across the flip as an
 * ALPHA and re-projected onto the new duration, never as a tick count.
 */
export const TOWER_COVER_REVEAL_TICKS = 60;

/** Alpha below which a bond's decorative overlays are skipped rather than drawn invisibly. */
export const TOWER_COVER_DRAW_EPSILON = 0.02;

interface Phase {
  /** Was this id covered as of the last completed frame? */
  covered: boolean;
  /** The tick that state last CHANGED — the ramp's anchor. */
  sinceTick: number;
}

/** Marks accumulated during the frame currently being drawn. */
let building = { prims: new Set<PrimitiveId>(), bonds: new Set<BondId>() };
/** What consumers read: the completed marks from the previous frame. */
let current = { prims: new Set<PrimitiveId>(), bonds: new Set<BondId>() };

const primPhase = new Map<PrimitiveId, Phase>();
const bondPhase = new Map<BondId, Phase>();

let tick = 0;
/**
 * Defaults to INACTIVE, exactly as `concealment.ts` does and for the same reason: if
 * `beginTowerCoverFrame` is never called, every renderer draws precisely as it did before this
 * module existed. A missing call is then a visible return to old behaviour, not an invisible blank
 * board.
 */
let active = false;

/**
 * Promote last frame's marks and start collecting this frame's. Call from the render tick BEFORE any
 * renderer syncs — next to `beginConcealmentFrame`.
 */
export function beginTowerCoverFrame(world: World): void {
  active = true;
  tick = world.tick;
  current = building;
  building = { prims: new Set<PrimitiveId>(), bonds: new Set<BondId>() };
  /*
   * ⛔ RECONCILE HERE, NOT ON READ, AND A TEST IS WHY THIS IS NOT A ONE-LINER.
   *
   * The first version detected the covered/uncovered flip lazily, inside the alpha getter. It read
   * correctly for anything queried every frame — and `structureRenderer` does query every shape it
   * draws — but it made the ramp depend on READ ORDER, which is a trap in exactly the case that
   * matters: a shape skipped by the concealment `continue` is never queried, so its flip would be
   * noticed only whenever it next came into vision, and the whole 2-second ramp would then run from
   * THAT moment. A shape would phase in as you looked at it. The reveal test caught it.
   *
   * Doing it at the frame boundary makes every getter pure and read-order independent. It costs one
   * pass over the TRACKED ids — only things a tower has covered are ever tracked, and `pruneTowerCover`
   * drops them when the shape dies — so this is a handful of entries, not the whole board.
   */
  reconcile(primPhase, current.prims);
  reconcile(bondPhase, current.bonds);
}

/** Flip any tracked id whose covered-ness changed this frame, preserving ramp position. */
function reconcile<K>(map: Map<K, Phase>, covered: ReadonlySet<K>): void {
  for (const [id, p] of map) {
    const now = covered.has(id);
    if (p.covered === now) continue;
    /*
     * Reverse from WHERE THE RAMP ACTUALLY IS, not from the end. A connector broken one frame after
     * the tower finished building must fade back in from nearly-invisible rather than snapping to
     * invisible and ramping from there — a pop, in the one feature whose purpose is to remove pops.
     */
    const a = alphaOf(p);
    p.covered = now;
    p.sinceTick = tick - Math.round((now ? 1 - a : a) * rampTicks(now));
  }
}

/** How many ticks this direction of the ramp takes. Out is the owner's ~2 s, back is his ~1 s. */
function rampTicks(covered: boolean): number {
  return covered ? TOWER_COVER_FADE_TICKS : TOWER_COVER_REVEAL_TICKS;
}
/**
 * Declare that a building is standing on these shapes and connectors THIS FRAME.
 *
 * @param anchorTick the newest `createdTick` among the ring's bonds. Used only on FIRST SIGHT, to
 * decide whether a shape should fade out or start already hidden — a joiner arriving at a match in
 * progress must not watch every standing tower phase out from scratch. `Bond.createdTick` is the
 * right anchor because it is REQUIRED and unconditionally serialized; `CreatureSpawner.ignitedAtTick`
 * looks like the natural choice and is a trap — `trimMirrorSpawner` strips it from the wire and
 * `deserializeSpawner` re-seeds it from the client's own current tick, so a ramp anchored on it would
 * restart ten times a second on the joiner.
 */
export function markTowerCover(
  primIds: Iterable<PrimitiveId>, bondIds: Iterable<BondId>, anchorTick: number,
): void {
  if (!active) return;
  for (const id of primIds) {
    building.prims.add(id);
    seed(primPhase, id, anchorTick);
  }
  for (const id of bondIds) {
    building.bonds.add(id);
    seed(bondPhase, id, anchorTick);
  }
}

/**
 * First sight of a covered id: start its ramp at the ring's own age rather than at "now", so a tower
 * that was already standing when this client arrived is already hidden.
 */
function seed<K>(map: Map<K, Phase>, id: K, anchorTick: number): void {
  if (map.has(id)) return;
  map.set(id, { covered: true, sinceTick: Math.min(anchorTick, tick) });
}

/** 0 = fully hidden, 1 = fully drawn. Pure given (phase, tick). */
function alphaOf(p: Phase | undefined): number {
  if (p === undefined) return 1;
  const span = rampTicks(p.covered);
  const elapsed = tick - p.sinceTick;
  const t = elapsed <= 0 ? 0 : elapsed >= span ? 1 : elapsed / span;
  return p.covered ? 1 - t : t;
}

/** Alpha multiplier for a placed shape. 1 when the feature is inactive or nothing covers it. */
export function coverAlphaForPrim(id: PrimitiveId): number {
  if (!active) return 1;
  return alphaOf(primPhase.get(id));
}

/** Alpha multiplier for a connector. 1 when the feature is inactive or nothing covers it. */
export function coverAlphaForBond(id: BondId): number {
  if (!active) return 1;
  return alphaOf(bondPhase.get(id));
}

/**
 * Drop remembered phases for ids that no longer exist. Called from `structureRenderer` alongside its
 * own sprite reap, so a long match does not accumulate an entry per destroyed shape.
 */
export function pruneTowerCover(world: World): void {
  for (const id of primPhase.keys()) if (!world.primitives.has(id)) primPhase.delete(id);
  for (const id of bondPhase.keys()) if (!world.bonds.has(id)) bondPhase.delete(id);
}

/** TEST-ONLY — reset every module-level buffer between cases. */
export function __resetTowerCoverForTests(): void {
  building = { prims: new Set<PrimitiveId>(), bonds: new Set<BondId>() };
  current = { prims: new Set<PrimitiveId>(), bonds: new Set<BondId>() };
  primPhase.clear();
  bondPhase.clear();
  tick = 0;
  active = false;
}
