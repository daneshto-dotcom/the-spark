/**
 * SPARK — S194 `s194/visuals-6` (V28) — **THE HEALTH-BAR GHOST: A TRAILING SEGMENT THAT DRAINS AFTER A HIT.**
 *
 * S192 plan V28: *"a trailing 'ghost' segment that drains after a hit; the bar itself stays crisp."* When a
 * bar drops, the part just lost stays lit for `BAR_GHOST_HOLD_TICKS`, then drains down to the new value
 * at `BAR_GHOST_DRAIN_PER_TICK` of the bar a tick — so a player SEES how big the hit was, which a bar that
 * simply jumps cannot show. A heal lifts the bar; the ghost is never drawn below it, so a full heal hides it.
 *
 * ⛔ PURE AND TICK-DRIVEN, no frame accumulator: the ghost's position is a closed form of (where it was
 * at the hit, the hit's tick, now). Two screens on the same tick draw the same ghost; a paused sim holds it.
 * Every number is MINE (⚠ owner LOOK item).
 */

/** The lost segment holds this long before it drains. MINE. */
export const BAR_GHOST_HOLD_TICKS = 18;
/** Drain speed, fraction of the full bar per tick (60 Hz ⇒ 1.2 bars a second). MINE. */
export const BAR_GHOST_DRAIN_PER_TICK = 0.02;

export interface GhostState {
  /** The ghost's fraction at the last hit. */
  from: number;
  /** The tick of the last hit. */
  hitTick: number;
  /** The bar's own fraction last frame. */
  last: number;
}

/** Where the ghost is at `tick`: never below the bar, draining from `from` after the hold. PURE. */
export function ghostFrac(st: GhostState, tick: number): number {
  const drained = st.from - BAR_GHOST_DRAIN_PER_TICK * Math.max(0, tick - st.hitTick - BAR_GHOST_HOLD_TICKS);
  return Math.max(st.last, drained);
}

/** Fold this frame's fraction into the ghost. Returns the (possibly new) state. PURE. */
export function stepGhost(st: GhostState | undefined, frac: number, tick: number): GhostState {
  if (st === undefined || tick < st.hitTick) return { from: frac, hitTick: tick, last: frac };
  if (frac < st.last) {
    // A hit: the ghost starts from wherever it already is (a second hit mid-drain keeps the whole loss lit).
    return { from: Math.max(ghostFrac(st, tick), st.last), hitTick: tick, last: frac };
  }
  // A heal (or no change): the bar moves; the ghost keeps draining and is never drawn below the bar.
  st.last = frac;
  return st;
}
