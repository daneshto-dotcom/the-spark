/**
 * SPARK — S170 — **FOG OF WAR THE WAY EVERY RTS SINCE THE NINETIES HAS DONE IT: DON'T DRAW IT.**
 *
 * Owner, after three failed attempts at this: *"When I told you to look into the games, other real
 * time strategies, how does fog of war work? Did you look into them or no? I said, look at Red
 * Alert. They're, like, from the fucking nineties. They did it fine."*
 *
 * He was right and I had not. The classic Command & Conquer / Warcraft model is three things, and
 * only the third was missing here:
 *
 *   1. A per-cell visibility grid with three states — UNEXPLORED, EXPLORED-but-not-visible,
 *      VISIBLE. ⭐ ALREADY SHIPPED as `state/exploredMemory.ts`, composed into the fog overlay as the
 *      dark / dim / clear tiers.
 *   2. Buildings you have seen are REMEMBERED and drawn as their last-seen state while out of
 *      vision. ⭐ ALREADY SHIPPED as S60's `memoryLayer` ghost silhouettes in `fogRenderer`.
 *   3. **Units and structures in non-visible cells are simply NOT RENDERED.** ⛔ THIS WAS MISSING,
 *      and it is the entire complaint.
 *
 * ## ⛔ WHY THE THREE PREVIOUS ATTEMPTS FAILED, recorded so nobody tries them again
 *
 * All three tried to hide things by COMPOSITING rather than by culling:
 *   · S166 — backdrop above an opaque fog sheet: visible, but the 0.55-alpha backdrop composited
 *     over every building whenever the fog was inactive.
 *   · S169 — backdrop below the sheet: stopped covering buildings, got blacked out with them.
 *     *"You made everything in fog. That's stupid."*
 *   · S170's first two cuts — an inverse Pixi mask on the concealable layer. It could not work: the
 *     mask texture was tinted `FOG_COLOR`, and a Pixi alpha mask samples a colour CHANNEL, so a
 *     black mask evaluates to zero everywhere and excludes nothing. Fixing the tint still left a
 *     mechanism this project cannot TEST — `renderer.extract` does not apply filter effects, and
 *     Pixi implements alpha masks as filters, so no assertion in the suite could see whether the
 *     board was actually concealed. A mechanism whose correctness is invisible to the suite is how
 *     all three of these shipped green.
 *
 * ⭐ CULLING HAS NONE OF THOSE PROBLEMS. It is a pure predicate over synced state, so it is unit
 * testable without a GPU; it cannot "look right while doing nothing"; and it composes with the two
 * pieces that already worked instead of fighting them.
 *
 * ## THE FRAME PROTOCOL, and why it is a module-level context
 *
 * `beginConcealmentFrame` is called ONCE per rendered frame from `main.ts`, before any renderer
 * syncs; `isConcealed` is then a cheap read. The alternative — threading a context parameter through
 * ten renderer signatures — was rejected because a renderer that silently kept the old signature
 * would keep drawing, which is precisely the failure mode being fixed. A missing `beginFrame` fails
 * LOUDLY instead: the context defaults to "fog off", which is the pre-existing behaviour.
 *
 * ⚠ NOT A SIM CONCERN. This is render-side only: it changes what you SEE, never what exists. The sim
 * is untouched, no wire field is added, and `world.tick` still advances identically on both peers.
 */

import { computeVisionSources, fogActive, isPointVisible, type VisionSource } from '../state/vision.ts';
import type { World } from '../state/world.ts';
import type { PlayerId, Vec2 } from '../types.ts';

interface Ctx {
  /** False when the fog is not up at all — solo, TITLE, WIN, or the FIGHT phase (owner R62). */
  active: boolean;
  localPlayerId: PlayerId | null;
  sources: readonly VisionSource[];
}

/*
 * Defaults to INACTIVE, deliberately. If `beginConcealmentFrame` is ever not called, every renderer
 * draws exactly as it did before this module existed — a visible regression to old behaviour rather
 * than an invisible blank board.
 */
let ctx: Ctx = { active: false, localPlayerId: null, sources: [] };

/**
 * Compute this frame's vision once. Call from the render tick BEFORE any renderer syncs.
 *
 * ⚠ ONCE PER FRAME, NOT PER ENTITY. `computeVisionSources` is O(own primitives + own creatures), so
 * calling it inside a per-entity loop would make concealment quadratic on a busy board — the kind of
 * cost that gets a feature reverted for "feeling laggy" rather than for being wrong.
 */
export function beginConcealmentFrame(world: World, cursor: Vec2): void {
  const active = fogActive(world);
  ctx = {
    active,
    localPlayerId: world.localPlayerId,
    sources: active ? computeVisionSources(world, cursor) : [],
  };
}

/**
 * Should a thing at (x, y) owned by `owner` be HIDDEN from the local player right now?
 *
 * ⭐ THE OWNER'S SPEC, VERBATIM, IS THIS FUNCTION: *"I shouldn't see their buildings, their sparks,
 * their spawn, their connectors, even their gatherers... UNLESS I moused over them before and then
 * moved away — then there is fog again over that whole area because I'm not there anymore with my
 * [spark], but I could see where the buildings were, and the last stage they were in."*
 *
 * The "could see where the buildings were" half is NOT this function's job — that is the S60 ghost
 * layer, which already draws last-seen enemy STRUCTURES while they are out of vision. This function
 * only answers the live question, and the two together are the C&C behaviour.
 *
 * ⚠ YOUR OWN THINGS ARE NEVER CONCEALED, and that is checked before any geometry: an owner test is
 * one comparison, while the vision scan walks every source. It also means a player can always see
 * their own board even in a corner their cursor has never visited, which is the owner's *"your own
 * character zone or quadrant should be always lit and visible, completely"*.
 *
 * ⚠ `owner === null` means UNOWNED — a free spark in the shared quarry. Those are concealed by
 * geometry alone, which is correct: the quarry sits inside `SPAWNER_RADIUS`, a permanent vision
 * source for every seat, so quarry sparks are always visible while a stray unowned spark out in a
 * dark corner is not.
 */
export function isConcealed(x: number, y: number, owner: PlayerId | null): boolean {
  if (!ctx.active) return false;
  if (owner !== null && owner === ctx.localPlayerId) return false;
  return !isPointVisible(ctx.sources, x, y);
}

/** DEV/test only — the context this frame is culling against. */
export function concealmentContext(): Readonly<Ctx> {
  return ctx;
}

/** Test-only reset, so one spec cannot leak a context into the next. */
export function resetConcealmentForTest(): void {
  ctx = { active: false, localPlayerId: null, sources: [] };
}
