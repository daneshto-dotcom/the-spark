/**
 * SPARK — S194 `s194/visuals-6` — **THE BUILD / DESTROY SPARKLE, ONE EFFECT FOR EVERY TOWER.**
 *
 * Owner, S194: *"when I placed the Soul Eater Tower level three. It did have those little sparks on
 * the connectors and … shapes before they disappeared. But … when I built a laser turret, it didn't
 * have those little sparks … that should be a cool effect … make it consistent across all built …
 * towers … Anything that has the connectors go … transparent … before the towers … gets built …
 * have that effect, that same effect."* And, on the same moment: *"it does that little sparkle before
 * the connectors behind it disappear … That's fine. It's like a little effect that happens."*
 *
 * ⭐ WHAT HE SAW, AND WHY ONLY ON SOME TOWERS. The sparkle was two things drawn by
 * `spawnerZoneRenderer`: the S192 aura's rising embers (`auraFx.ts`, × the anchor's cover alpha) and
 * the S100 charged strokes + travelling beads over each connector (× that connector's cover alpha).
 * Both faded with the connectors, so they read as a sparkle while a tower was going up. But that
 * renderer walks `world.creatureSpawners` only — the laser turret, HELGA and the stink tower live in
 * `world.defenders`, so they hid their connectors with no sparkle at all.
 *
 * ⭐ NOW IT IS KEYED ON `towerCover`'s GROUPS — one per tower a renderer actually drew — so it plays on
 * exactly the towers whose connectors go transparent, whatever collection they live in, and the same
 * way on every one: the same embers, the same connector sparks, the same shape twinkles, scaled to the
 * art's footprint and tinted the owner's colour.
 *
 * ⭐ AND IT PLAYS AT THE DESTROY MOMENT TOO. When the building crumbles its connectors phase back in
 * (`TOWER_COVER_REVEAL_TICKS`, his *"within like a second"*); the sparkle rises with them and dies
 * away over `TOWER_SPARKLE_TAIL_TICKS` — the same effect, run backwards.
 *
 * ⛔ IT IS A TRANSIENT, NOT THE BACKGROUND. Under a finished tower the strength is 0 and nothing here
 * draws; the always-on per-race background is `towerBackdropFx.ts`.
 *
 * ⛔ PURE — no Pixi, no DOM, no clock, no `Math.random` (`fxGuards.test.ts`). Every particle is a
 * function of (the group key, the tick). Every number is MINE except the two ramp lengths (owner).
 */

import { auraEmberAt, auraEmberPeriod, AURA_EMBER_LIFE } from './auraFx.ts';
import { forEachLive, fxHash, fxSeed, mixColor, type FxSink } from './emitter.ts';

/** After the connectors are fully back (destroy), the sparkle fades out over this many ticks. MINE. */
export const TOWER_SPARKLE_TAIL_TICKS = 45;
/** The connector reveal the destroy sparkle rises with (`towerCover.TOWER_COVER_REVEAL_TICKS`, owner — duplicated to stay Pixi-free; pinned by test). */
export const TOWER_SPARKLE_REVEAL_TICKS = 60;
/** Below this strength nothing is drawn. */
export const TOWER_SPARKLE_EPSILON = 0.02;
/** A bead travels the length of a connector in this many ticks. MINE. */
export const TOWER_SPARKLE_BEAD_TICKS = 40;

/**
 * ⭐ How strong the sparkle is, 0..1. PURE.
 *   · standing (being built, or standing): the shapes' cover alpha — full the moment the building
 *     lands, gone when the connectors are (the S192 aura's behaviour, which he liked);
 *   · just gone (crumbled): rises with the reveal, then dies away over the tail.
 */
export function towerSparkleStrength(standing: boolean, alpha: number, downTicks: number): number {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  if (standing) return a;
  const tail = downTicks <= TOWER_SPARKLE_REVEAL_TICKS ? 1 : 1 - (downTicks - TOWER_SPARKLE_REVEAL_TICKS) / TOWER_SPARKLE_TAIL_TICKS;
  return Math.max(0, Math.min(a, tail));
}

/** One connector, resolved by the caller: its ends and its own 0..1 sparkle alpha. */
export interface SparkleBond { readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number; readonly a: number }
/** One shape, resolved by the caller: its centre, radius and 0..1 sparkle alpha. */
export interface SparklePrim { readonly x: number; readonly y: number; readonly r: number; readonly a: number }

/**
 * Draw one tower's sparkle. `s` is `towerSparkleStrength` (the pool and the embers ride it);
 * `bonds`/`prims` carry their OWN final alpha — while the tower stands, each one's own cover alpha (a
 * mid-ramp connector must not wear a fully-lit bead — the S183 rule the legacy strokes followed);
 * once it has gone, `s`.
 */
export function towerSparkleFx(
  ground: FxSink, top: FxSink,
  key: number,
  footX: number, footY: number, artW: number, artH: number,
  tint: number, tick: number, s: number,
  bonds: readonly SparkleBond[], prims: readonly SparklePrim[],
): void {
  if (!(s > TOWER_SPARKLE_EPSILON)) return;
  const seed = fxSeed(key, 0x5ba);
  const bright = mixColor(tint, 0xffffff, 0.35);
  const ember = mixColor(tint, 0xffffff, 0.5);
  // The footprint the embers rise around: centred a third of the way up the art.
  const cx = footX;
  const cy = footY - artH * 0.3;
  const radius = Math.max(28, artW * 0.55);

  // The light pool at the base (the S192 pilot's, now on the FOOT rather than the shapes' centroid).
  ground.emit('soft', cx, footY, radius * 3.0, radius * 1.1, 0, 0.3 * s, tint, 'add');
  ground.emit('soft', cx, footY, radius * 1.6, radius * 0.6, 0, 0.32 * s, bright, 'add');

  // The fireflies: the S192 aura's embers, the same function, so it reads as the effect he liked.
  forEachLive(tick, auraEmberPeriod(radius), AURA_EMBER_LIFE, 1, key * 37, (b, k, t) => {
    const e = auraEmberAt(key, b, k, t, cx, cy, radius);
    top.emit('core', e.x, e.y, e.size, e.size * 1.6, 0, e.alpha * s, ember, 'add');
  });

  // The charged connectors: a soft glow along each, and a white bead running its length.
  for (let i = 0; i < bonds.length; i++) {
    const bd = bonds[i]!;
    const a = bd.a;
    if (!(a > TOWER_SPARKLE_EPSILON)) continue;
    const dx = bd.bx - bd.ax;
    const dy = bd.by - bd.ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) continue;
    const rot = Math.atan2(dy, dx);
    const shimmer = 0.5 + 0.5 * Math.sin(((tick + i * 13) / 60) * Math.PI * 2 * 1.4);
    top.emit('soft', (bd.ax + bd.bx) / 2, (bd.ay + bd.by) / 2, len + 10, 7 + 4 * shimmer, rot, (0.35 + 0.35 * shimmer) * a, tint, 'add');
    const off = Math.floor(fxHash(seed, i, 1) * TOWER_SPARKLE_BEAD_TICKS);
    const u = (((tick + off) % TOWER_SPARKLE_BEAD_TICKS) + TOWER_SPARKLE_BEAD_TICKS) % TOWER_SPARKLE_BEAD_TICKS / TOWER_SPARKLE_BEAD_TICKS;
    const bs = 7 + 3 * shimmer;
    top.emit('core', bd.ax + dx * u, bd.ay + dy * u, bs, bs, 0, (0.6 + 0.35 * shimmer) * a, 0xffffff, 'add');
  }

  // The shapes: a twinkle on each — a cross of two thin streaks and a hot core, blinking out of step.
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i]!;
    const a = p.a;
    if (!(a > TOWER_SPARKLE_EPSILON)) continue;
    const ph = fxHash(seed, i, 7);
    const tw = 0.5 + 0.5 * Math.sin(((tick / 60) * 2.2 + ph) * Math.PI * 2);
    const size = Math.max(8, p.r * 1.4) * (0.7 + 0.5 * tw);
    top.emit('soft', p.x, p.y, size * 1.8, size * 1.8, 0, 0.35 * a, tint, 'add');
    top.emit('core', p.x, p.y, size * 2.2, 2.4, 0.785, 0.7 * tw * a, bright, 'add');
    top.emit('core', p.x, p.y, size * 2.2, 2.4, -0.785, 0.7 * tw * a, bright, 'add');
  }
}

/*
 * ⭐⭐ S194 (owner R194-22) — **THE FIX-ME SPARKLE: THE SAME EFFECT, SOFT, FOR AS LONG AS A FALLEN TOWER CAN
 * BE FIXED.** *"when the tower is destroyed, those little sparks, little graphic comes back to life where
 * the connectors are of the tower. That way users will know, oh, that's where I need to fix."*
 *
 * The destroy sparkle above plays the moment the building goes; this is what stays after it: the same
 * vocabulary (connector glow, a bead running each connector, a twinkle on each shape, a few motes) at a
 * fraction of the strength and at a slow breath, plus — on each blueprint edge that is MISSING between
 * two surviving shapes — a row of twinkling motes along the gap, which is exactly where FIX re-welds.
 * The tower list is `render/brokenTowers.ts` (synced state, the FIX card's own predicates).
 * ⚠ MINE: every intensity and period here (owner: "soft persistent version").
 */

/** One breath of the fix-me sparkle, ticks. MINE. */
export const FIX_SPARKLE_BREATH_TICKS = 150;
/** Peak strength of the fix-me sparkle relative to the build sparkle. MINE. */
export const FIX_SPARKLE_STRENGTH = 0.45;
/** Motes along a MISSING edge. MINE. */
export const FIX_SPARKLE_GAP_MOTES = 4;

/** One blueprint edge resolved by the caller: its ends, and whether a connector stands there. */
export interface FixEdge { readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number; readonly missing: boolean }

export function towerFixSparkleFx(
  top: FxSink, key: number, tint: number, tick: number, low: boolean,
  edges: readonly FixEdge[], prims: ReadonlyArray<{ readonly x: number; readonly y: number; readonly r: number }>,
): void {
  const seed = fxSeed(key, 0xf1c);
  const breath = 0.6 + 0.4 * Math.sin((((tick + key * 17) % FIX_SPARKLE_BREATH_TICKS) / FIX_SPARKLE_BREATH_TICKS) * Math.PI * 2);
  const s = FIX_SPARKLE_STRENGTH * breath;
  const bright = mixColor(tint, 0xffffff, 0.45);
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!;
    const dx = e.bx - e.ax;
    const dy = e.by - e.ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) continue;
    const rot = Math.atan2(dy, dx);
    if (!e.missing) {
      top.emit('soft', (e.ax + e.bx) / 2, (e.ay + e.by) / 2, len + 8, 6, rot, 0.4 * s, tint, 'add');
      const off = Math.floor(fxHash(seed, i, 1) * FIX_SPARKLE_BREATH_TICKS);
      const u = (((tick + off) % FIX_SPARKLE_BREATH_TICKS) + FIX_SPARKLE_BREATH_TICKS) % FIX_SPARKLE_BREATH_TICKS / FIX_SPARKLE_BREATH_TICKS;
      top.emit('core', e.ax + dx * u, e.ay + dy * u, 6, 6, 0, 0.9 * s, 0xffffff, 'add');
    } else {
      // the gap FIX would re-weld: motes along it, twinkling out of step
      const motes = low ? 2 : FIX_SPARKLE_GAP_MOTES;
      for (let k = 0; k < motes; k++) {
        const f = (k + 0.5) / motes;
        const tw = 0.5 + 0.5 * Math.sin(((tick / 60) * 2.4 + fxHash(seed, i, 10 + k)) * Math.PI * 2);
        top.emit('core', e.ax + dx * f, e.ay + dy * f, 4 + 3 * tw, 4 + 3 * tw, 0, (0.35 + 0.6 * tw) * s * 1.6, bright, 'add');
      }
    }
  }
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i]!;
    const tw = 0.5 + 0.5 * Math.sin(((tick / 60) * 0.9 + fxHash(seed, i, 7)) * Math.PI * 2);
    const size = Math.max(8, p.r * 1.3) * (0.7 + 0.4 * tw);
    top.emit('soft', p.x, p.y, size * 1.8, size * 1.8, 0, 0.35 * s, tint, 'add');
    if (!low) top.emit('core', p.x, p.y, size * 2, 2.2, 0.785, 0.8 * tw * s, bright, 'add');
  }
  // a few slow motes drifting up off the shapes
  if (!low && prims.length > 0) {
    forEachLive(tick, 30, 90, 1, key * 13, (b, k, t) => {
      const p = prims[Math.floor(fxHash(seed, b, k + 20) * prims.length)]!;
      top.emit('core', p.x + Math.sin(t * 5 + b) * 4, p.y - 30 * t, 4, 6, 0, envelope(t, 0.3) * 0.8 * s, bright, 'add');
    });
  }
}
