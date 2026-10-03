/**
 * SPARK — S194 `s194/visuals-6` — **THE TOWER BACKGROUND: EACH RACE'S GROUND, ALIVE, AROUND THE BUILDING.**
 *
 * Owner, S194 (the spec, verbatim): *"we're going to have … the tower aura … that's unique to the race.
 * That's gonna be … the active graphic, you know, the cool looking graphic of the tower. … For now,
 * it's just fucking shapes, you know, and it looks stupid. But now that you're doing the cool stuff with
 * Pixie … we can make each tower, each race aura. So whenever you place a building, like a lot cooler
 * around it, not just aura, but like background … take what we have now and develop that into something
 * cooler and better looking."* And S193 Q1, on the zombies: *"that green little bubbly … goo background
 * that's around the tower supposedly. That kind of still looks like shit. And it's not really around
 * the tower, it's behind it."*
 *
 * ## ⭐ AROUND, NOT BEHIND — THE TWO DEPTHS
 *
 * The S185 mark was one flat ellipse centred half a building up (`ZONE_SINK`), so the art covered its
 * middle and it read as a disc hung BEHIND the tower. This draws at TWO depths around the sprite's real
 * FOOT (`towerCover`'s published foot — where the sprite meets the ground, not a re-derived guess):
 *   · `back` — the GROUND layer (`fxGround`: over the shapes, under every building): the pool's glow,
 *     cracks, sigils, ripples, coals — everything that lies ON the ground the building stands in;
 *   · `front` / `frontShade` — over the building (`fxTop` light, `fxTopShade` for smoke and dust that
 *     must darken): what rises or passes IN FRONT of it — goo lapping the base, miasma, embers, the
 *     near half of the sand vortex, mist, drum dust. That is what makes it wrap the silhouette.
 * The flat body under it all is still `groundDecalRenderer`'s noise stain (the S185 one-fade rule —
 * overlapping zones integrate, they do not darken), re-centred on the same foot.
 *
 * ## THE SIX (every colour from `RACE_COLORS`; every number MINE — ⚠ owner LOOK item)
 *   zombies  — toxic goo: bubbles that swell and pop into droplets, goo lapping the base, green miasma.
 *   demons   — cracked hellfire ground in his VIOLET (S185: *"cracks with purple fire"*): glowing seams
 *              that pulse outward, flame licks at the base, violet embers.
 *   vampires — a crimson ritual sigil turning under the tower, blood mist curling round the base.
 *   mummies  — a sun glyph under the tower and a sand vortex ORBITING it (near half in front).
 *   orcs     — scorched war-camp earth: smouldering coals, a war-drum beat that kicks dust, smoke.
 *   nagas    — a tidal pool: ripples running out from the base, caustic glints, droplets, lapping water.
 *
 * ⚠ S194 audit perf trim: every count was roughly halved after the 12-tower re-bench (HIGH was +2.8 ms).
 * LOW quality draws the same picture with about half the particles and no smoke/mist/dust (the
 * `frontShade` sprites); `?fx=legacy` draws the S185 marks instead (the caller does not call this).
 *
 * ⛔ PURE — no Pixi, no DOM, no clock, no `Math.random` (`fxGuards.test.ts`). Every particle is a
 * function of (the tower id, the tick); the pulses and orbits are periodic in the tick, never accumulated.
 */

import { RACE_COLORS, type RaceId } from '../../state/races.ts';
import { envelope, forEachLive, fxHash, fxSeed, mixColor, type FxSink } from './emitter.ts';

/** The pool's half-width as a fraction of the art width. MINE. */
export const BACKDROP_POOL_R = 0.66;
/** Perspective squash of everything lying on the ground (height / width). MINE. */
export const BACKDROP_SQUASH = 0.36;
/** The pool's centre sits this fraction of the art height ABOVE the foot (under the building's footprint). MINE. */
export const BACKDROP_CENTRE_LIFT = 0.06;

const TAU = Math.PI * 2;

/** Particle-count multiplier: HIGH 1, LOW ~0.5. */
function n(base: number, low: boolean): number {
  return low ? Math.max(1, Math.round(base * 0.5)) : base;
}
/** A 0..1 wave of period `p` ticks, phased by `ph`. */
function wave(tick: number, p: number, ph: number): number {
  return 0.5 + 0.5 * Math.sin((((tick + ph) % p) / p) * TAU);
}
/** A 0..1 position inside a repeating cycle of `p` ticks. */
function cyc(tick: number, p: number, off: number): number {
  return ((((tick + off) % p) + p) % p) / p;
}

/** The geometry every race shares: centre, pool radii, art height. */
export interface BackdropGeom { readonly x: number; readonly y: number; readonly R: number; readonly ry: number; readonly H: number; readonly footY: number }

export function backdropGeom(footX: number, footY: number, artW: number, artH: number): BackdropGeom {
  const R = Math.max(30, artW * BACKDROP_POOL_R);
  return { x: footX, y: footY - artH * BACKDROP_CENTRE_LIFT, R, ry: R * BACKDROP_SQUASH, H: artH, footY };
}

/**
 * Draw one tower's background. `id` is the structure's id (spawner or defender) — the seed and the
 * phase, so two towers never breathe in step.
 */
export function towerBackdropFx(
  back: FxSink, front: FxSink, frontShade: FxSink,
  race: RaceId, id: number,
  footX: number, footY: number, artW: number, artH: number,
  tick: number, low: boolean,
): void {
  const g = backdropGeom(footX, footY, artW, artH);
  const base = RACE_COLORS[race];
  const seed = fxSeed(id, 0xbac0 + RACE_SLOT[race]);
  const ph = id * 29;
  // Shared: the ground glow the race's colour throws around the base (one pool — the wide halo was cut for perf).
  const pulse = wave(tick, 150, ph);
  back.emit('soft', g.x, g.y, g.R * 2.4, g.ry * 2.6, 0, 0.26 + 0.1 * pulse, mixColor(base, 0xffffff, 0.15), 'add');
  switch (race) {
    case 'zombies': zombies(back, front, frontShade, g, seed, tick, ph, low, base); break;
    case 'demons': demons(back, front, g, seed, tick, ph, low, base); break;
    case 'vampires': vampires(back, front, frontShade, g, seed, tick, ph, low, base); break;
    case 'mummies': mummies(back, front, g, seed, tick, ph, low, base); break;
    case 'orcs': orcs(back, front, frontShade, g, seed, tick, ph, low, base); break;
    case 'nagas': nagas(back, front, g, seed, tick, ph, low, base); break;
    default: {
      const unhandled: never = race;
      void unhandled;
    }
  }
}

const RACE_SLOT: Readonly<Record<RaceId, number>> = { vampires: 1, nagas: 2, mummies: 3, zombies: 4, orcs: 5, demons: 6 };

/** A point on the ground ellipse at angle `a` and radius fraction `f` (perspective-squashed). */
function onGround(g: BackdropGeom, a: number, f: number): { x: number; y: number } {
  return { x: g.x + Math.cos(a) * g.R * f, y: g.y + Math.sin(a) * g.ry * f };
}

/* ── zombies: toxic goo ──────────────────────────────────────────────────────────────────────── */

export const ZOMBIE_BUBBLES = 4;
export const ZOMBIE_BUBBLE_CYCLE = 54;

function zombies(back: FxSink, front: FxSink, shade: FxSink, g: BackdropGeom, seed: number, tick: number, ph: number, low: boolean, base: number): void {
  const goo = mixColor(base, 0x9cff3a, 0.35);
  const hot = mixColor(base, 0xffffff, 0.45);
  const dark = mixColor(base, 0x0a1a06, 0.7);
  // The goo surface: a slow sheen sliding across the pool.
  const sx = Math.sin(((tick + ph) / 240) * TAU) * g.R * 0.35;
  back.emit('soft', g.x + sx, g.y + g.ry * 0.15, g.R * 0.9, g.ry * 0.7, 0, 0.3, goo, 'add');
  // Bubbles: swell, pop into a splash ring and three droplets.
  const count = n(ZOMBIE_BUBBLES, low);
  for (let k = 0; k < count; k++) {
    const a = fxHash(seed, k, 1) * TAU;
    const f = 0.25 + 0.85 * Math.sqrt(fxHash(seed, k, 2));
    const p = onGround(g, a, f);
    const t = cyc(tick, ZOMBIE_BUBBLE_CYCLE, Math.floor(fxHash(seed, k, 3) * ZOMBIE_BUBBLE_CYCLE));
    const size = 7 + 9 * fxHash(seed, k, 4);
    // a bubble behind the foot line is hidden by the building anyway; one in front rides OVER its base
    const sink = p.y > g.footY - 2 ? front : back;
    if (t < 0.72) {
      const s = size * (0.3 + 0.7 * (t / 0.72));
      sink.emit('bubble', p.x, p.y - s * 0.3, s, s * 0.85, 0, 0.55 + 0.4 * (t / 0.72), goo, 'add');
    } else {
      const q = (t - 0.72) / 0.28;
      back.emit('ring', p.x, p.y, size * (1 + 1.4 * q), size * (0.45 + 0.7 * q), 0, (1 - q) * 0.35, goo, 'add');
      for (let j = 0; j < 3; j++) {
        const da = fxHash(seed, k * 3 + j, 5) * TAU;
        const d = size * (0.5 + 1.3 * q);
        const hop = Math.sin(q * Math.PI) * size * 1.3;
        front.emit('core', p.x + Math.cos(da) * d, p.y + Math.sin(da) * d * 0.45 - hop, 5, 5, 0, (1 - q) * 0.9, hot, 'add');
      }
    }
  }
  // Goo LAPPING the base: slow fat blobs along the foot line, over the bottom of the building.
  const laps = n(3, low);
  for (let k = 0; k < laps; k++) {
    const u = (k + 0.5) / laps - 0.5;
    const w = wave(tick, 90 + 17 * k, ph + k * 23);
    const lx = g.x + u * g.R * 1.35;
    const lw = g.R * (0.34 + 0.12 * w);
    shade.emit('soft', lx, g.footY + 1, lw, 9 + 5 * w, 0, 0.75, dark, 'normal');
    front.emit('soft', lx, g.footY - 1, lw * 0.85, 5 + 3 * w, 0, 0.32 + 0.18 * w, goo, 'add');
  }
  // Miasma: green wisps rising round the silhouette.
  forEachLive(tick, low ? 44 : 22, 110, 1, ph, (b, k, t) => {
    const side = fxHash(seed, b, k + 40) < 0.5 ? -1 : 1;
    const x0 = g.x + side * g.R * (0.45 + 0.5 * fxHash(seed, b, k + 41));
    const rise = g.H * (0.15 + 0.85 * t);
    const sway = Math.sin(t * 4 + fxHash(seed, b, k + 42) * TAU) * 7;
    const s = 14 + 22 * t;
    front.emit('smoke', x0 + sway, g.footY - rise, s, s * 0.85, t * 2, envelope(t, 0.3) * 0.32, goo, 'add');
  });
}

/* ── demons: violet hellfire cracks ──────────────────────────────────────────────────────────── */

export const DEMON_CRACKS = 4;

function demons(back: FxSink, front: FxSink, g: BackdropGeom, seed: number, tick: number, ph: number, low: boolean, base: number): void {
  const seam = mixColor(base, 0xffffff, 0.35);
  const hot = mixColor(base, 0xffd6ff, 0.6);
  const cracks = n(DEMON_CRACKS, low);
  for (let c = 0; c < cracks; c++) {
    const a0 = (c / cracks) * TAU + (fxHash(seed, c, 1) - 0.5) * 0.7;
    // A jagged three-segment seam from under the building out past the pool's rim.
    let px = g.x + Math.cos(a0) * g.R * 0.2;
    let py = g.y + Math.sin(a0) * g.ry * 0.2;
    for (let s = 0; s < 2; s++) {
      const a = a0 + (fxHash(seed, c, 10 + s) - 0.5) * 0.9;
      const f = 0.2 + (s + 1) * (0.5 + 0.15 * fxHash(seed, c, 20 + s));
      const qx = g.x + Math.cos(a) * g.R * f;
      const qy = g.y + Math.sin(a) * g.ry * f;
      const dx = qx - px, dy = qy - py;
      const len = Math.sqrt(dx * dx + dy * dy);
      const rot = Math.atan2(dy, dx);
      // the heat runs OUTWARD along each seam: a bright band travelling from the root to the tip
      const run = cyc(tick, 80, ph + c * 11);
      const along = (s + 0.5) / 2;
      const heat = Math.max(0, 1 - Math.abs(run - along) * 3.2);
      const taper = 1 - s * 0.35;
      const mx = (px + qx) / 2, my = (py + qy) / 2;
      if (s === 0) back.emit('soft', mx, my, len + 8, 11 * taper, rot, 0.28 + 0.3 * heat, base, 'add');
      back.emit('core', mx, my, len + 3, 3.4 * taper, rot, 0.55 + 0.45 * heat, heat > 0.5 ? hot : seam, 'add');
      px = qx; py = qy;
    }
    // a flame lick at a few seam roots, flickering on 4-tick steps
    if (c % 2 === 0) {
      const fl = fxHash(seed, c, Math.floor((tick + c * 5) / 4));
      const fx = g.x + Math.cos(a0) * g.R * 0.55;
      const fy = g.y + Math.sin(a0) * g.ry * 0.55;
      const h = 12 + 16 * fl;
      (fy > g.footY - 2 ? front : back).emit('soft', fx, fy - h * 0.45, 7 + 3 * fl, h, 0, 0.35 + 0.35 * fl, mixColor(base, 0xff5ad8, 0.3), 'add');
    }
  }
  // Violet embers rising round the building.
  forEachLive(tick, low ? 16 : 8, 80, 1, ph, (b, k, t) => {
    const a = fxHash(seed, b, k + 50) * TAU;
    const p = onGround(g, a, 0.4 + 0.7 * fxHash(seed, b, k + 51));
    const rise = g.H * (0.9 * t) * (0.6 + 0.6 * fxHash(seed, b, k + 52));
    const sway = Math.sin(t * 6 + a) * 5;
    const sz = 3 + 3 * fxHash(seed, b, k + 53);
    front.emit('core', p.x + sway, p.y - rise, sz, sz * 1.8, 0, envelope(t, 0.2) * 0.9, hot, 'add');
  });
}

/* ── vampires: a ritual sigil and blood mist ─────────────────────────────────────────────────── */

export const VAMPIRE_SIGIL_TURN_TICKS = 1500;

function vampires(back: FxSink, front: FxSink, shade: FxSink, g: BackdropGeom, seed: number, tick: number, ph: number, low: boolean, base: number): void {
  const blood = mixColor(base, 0x8a0018, 0.35);
  const glow = mixColor(base, 0xffffff, 0.2);
  const pulse = wave(tick, 120, ph);
  // two rings, squashed onto the ground
  back.emit('ring', g.x, g.y, g.R * 2.15, g.ry * 2.15, 0, 0.45 + 0.25 * pulse, glow, 'add');
  back.emit('ring', g.x, g.y, g.R * 1.55, g.ry * 1.55, 0, 0.3 + 0.2 * pulse, base, 'add');
  // the five-pointed star, turning slowly, drawn in perspective
  const rot = cyc(tick, VAMPIRE_SIGIL_TURN_TICKS, ph) * TAU;
  const pts: Array<{ x: number; y: number }> = [];
  for (let k = 0; k < 5; k++) pts.push(onGround(g, rot + (k * TAU) / 5 - Math.PI / 2, 0.92));
  for (let k = 0; k < 5; k++) {
    const p = pts[k]!;
    const q = pts[(k + 2) % 5]!;
    const dx = q.x - p.x, dy = q.y - p.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const r = Math.atan2(dy, dx);
    back.emit('soft', (p.x + q.x) / 2, (p.y + q.y) / 2, len, 7, r, 0.22 + 0.15 * pulse, base, 'add');
    back.emit('core', (p.x + q.x) / 2, (p.y + q.y) / 2, len, 2.4, r, 0.5 + 0.3 * pulse, glow, 'add');
    back.emit('core', p.x, p.y, 9, 9, 0, 0.6 + 0.4 * wave(tick, 40, ph + k * 8), glow, 'add');
  }
  // blood mist curling low round the base — dark in front of the building, lit at the rim
  if (!low) {
    forEachLive(tick, 30, 160, 1, ph, (b, k, t) => {
      const a = fxHash(seed, b, k + 60) * TAU + t * 1.4;
      const p = onGround(g, a, 0.85 + 0.35 * fxHash(seed, b, k + 61));
      const s = g.R * (0.5 + 0.4 * t);
      const al = envelope(t, 0.35);
      (p.y > g.footY - 2 ? shade : back).emit('smoke', p.x, p.y - 4 - 6 * t, s, s * 0.45, a, al * 0.45, blood, 'normal');
    });
  }
  // a few drops of light rising off the sigil's points
  forEachLive(tick, low ? 32 : 16, 90, 1, ph + 3, (b, k, t) => {
    const p = pts[Math.floor(fxHash(seed, b, k + 70) * 5)]!;
    const rise = g.H * 0.6 * t;
    front.emit('core', p.x, p.y - rise, 3.5, 6, 0, envelope(t, 0.25) * 0.8, glow, 'add');
  });
}

/* ── mummies: a sun glyph and a sand vortex ──────────────────────────────────────────────────── */

export const MUMMY_SAND_MOTES = 8;
export const MUMMY_ORBIT_TICKS = 260;

function mummies(back: FxSink, front: FxSink, g: BackdropGeom, seed: number, tick: number, ph: number, low: boolean, base: number): void {
  const sand = mixColor(base, 0xc8a064, 0.55);
  const gold = mixColor(base, 0xffffff, 0.25);
  const pulse = wave(tick, 180, ph);
  // the sun glyph: a disc ring and twelve rays, turning very slowly
  back.emit('ring', g.x, g.y, g.R * 1.3, g.ry * 1.3, 0, 0.4 + 0.2 * pulse, gold, 'add');
  const turn = cyc(tick, 2400, ph) * TAU;
  const rays = n(8, low);
  for (let k = 0; k < rays; k++) {
    const a = turn + (k * TAU) / rays;
    const p0 = onGround(g, a, 0.78);
    const p1 = onGround(g, a, k % 2 === 0 ? 1.28 : 1.08);
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    back.emit('core', (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, Math.sqrt(dx * dx + dy * dy), 2.6, Math.atan2(dy, dx), 0.45 + 0.3 * pulse, gold, 'add');
  }
  // the vortex: motes ORBITING the building, climbing as they go. The near half of the orbit is in
  // FRONT of it (top layer), the far half BEHIND it (ground layer, hidden by the art) — the wrap.
  const motes = n(MUMMY_SAND_MOTES, low);
  for (let k = 0; k < motes; k++) {
    const t = cyc(tick, MUMMY_ORBIT_TICKS, Math.floor(fxHash(seed, k, 1) * MUMMY_ORBIT_TICKS));
    const a = fxHash(seed, k, 2) * TAU + t * TAU * 1.6;
    const f = 0.7 + 0.55 * fxHash(seed, k, 3) - 0.2 * t;
    const x = g.x + Math.cos(a) * g.R * f;
    const ground = g.y + Math.sin(a) * g.ry * f;
    const y = ground - g.H * 0.75 * t;
    const sz = 3 + 3 * fxHash(seed, k, 4);
    const al = envelope(t, 0.15) * (0.55 + 0.35 * fxHash(seed, k, 5));
    const near = Math.sin(a) > 0;
    (near ? front : back).emit('soft', x, y, sz * 2.2, sz, a + Math.PI / 2, al, sand, 'add');
  }
  // a low sand haze skirting the base
  forEachLive(tick, low ? 48 : 24, 140, 1, ph, (b, k, t) => {
    const a = fxHash(seed, b, k + 80) * TAU + t * 2;
    const p = onGround(g, a, 1.05);
    const s = g.R * (0.4 + 0.3 * t);
    (Math.sin(a) > 0 ? front : back).emit('smoke', p.x, p.y - 3, s, s * 0.4, 0, envelope(t, 0.3) * 0.22, sand, 'add');
  });
}

/* ── orcs: scorched earth, coals, the war drum ───────────────────────────────────────────────── */

export const ORC_DRUM_TICKS = 50;

function orcs(back: FxSink, front: FxSink, shade: FxSink, g: BackdropGeom, seed: number, tick: number, ph: number, low: boolean, base: number): void {
  const coal = mixColor(base, 0xff3a00, 0.3);
  const hot = mixColor(base, 0xffe0a0, 0.5);
  const dust = 0xb89a72;
  // smouldering coals, flickering on 6-tick steps
  const coals = n(7, low);
  for (let k = 0; k < coals; k++) {
    const p = onGround(g, fxHash(seed, k, 1) * TAU, 0.3 + 0.85 * Math.sqrt(fxHash(seed, k, 2)));
    const fl = fxHash(seed, k, 1000 + Math.floor((tick + k * 3) / 6));
    const s = 5 + 4 * fxHash(seed, k, 3);
    back.emit('soft', p.x, p.y, s * 3, s * 1.6, 0, 0.25 + 0.25 * fl, coal, 'add');
    back.emit('core', p.x, p.y, s, s * 0.7, 0, 0.5 + 0.5 * fl, fl > 0.7 ? hot : coal, 'add');
  }
  // THE WAR DRUM: every beat a dust ring runs out along the ground and the dust kicks up.
  const beat = cyc(tick, ORC_DRUM_TICKS, ph);
  if (beat < 0.6) {
    const q = beat / 0.6;
    back.emit('ring', g.x, g.y, g.R * 2 * (0.6 + 1.1 * q), g.ry * 2 * (0.6 + 1.1 * q), 0, (1 - q) * 0.4, mixColor(dust, base, 0.3), 'add');
    if (!low) {
      const beatNo = Math.floor((tick + ph) / ORC_DRUM_TICKS);
      for (let j = 0; j < 3; j++) {
        const a = (j / 3) * TAU + fxHash(seed, beatNo, j) * 0.6;
        const p = onGround(g, a, 0.9 + 0.6 * q);
        const s = g.R * (0.25 + 0.35 * q);
        (p.y > g.footY - 2 ? shade : back).emit('smoke', p.x, p.y - 10 * q, s, s * 0.55, a, (1 - q) * 0.4, dust, 'normal');
      }
    }
  }
  // smoke from the camp, rising off both flanks (it darkens, so it rides the shade layer)
  if (!low) {
    forEachLive(tick, 34, 170, 1, ph, (b, k, t) => {
      const side = fxHash(seed, b, k + 90) < 0.5 ? -1 : 1;
      const x0 = g.x + side * g.R * (0.55 + 0.35 * fxHash(seed, b, k + 91));
      const s = 16 + 34 * t;
      shade.emit('smoke', x0 + Math.sin(t * 3 + b) * 6 + side * 10 * t, g.footY - g.H * 1.1 * t, s, s * 0.9, t * 2, envelope(t, 0.25) * 0.6, 0x3a302a, 'normal');
    });
  }
  // a few sparks off the coals
  forEachLive(tick, low ? 28 : 14, 70, 1, ph + 5, (b, k, t) => {
    const p = onGround(g, fxHash(seed, b, k + 95) * TAU, 0.5 + 0.6 * fxHash(seed, b, k + 96));
    const rise = g.H * 0.7 * t;
    front.emit('core', p.x + Math.sin(t * 7 + b) * 4, p.y - rise, 3, 5, 0, envelope(t, 0.2) * 0.85, hot, 'add');
  });
}

/* ── nagas: a tidal pool ─────────────────────────────────────────────────────────────────────── */

export const NAGA_RIPPLE_TICKS = 90;

function nagas(back: FxSink, front: FxSink, g: BackdropGeom, seed: number, tick: number, ph: number, low: boolean, base: number): void {
  const foam = mixColor(base, 0xffffff, 0.55);
  const deep = mixColor(base, 0x0a3a8a, 0.4);
  back.emit('soft', g.x, g.y, g.R * 2.2, g.ry * 2.2, 0, 0.3, deep, 'add');
  // ripples running out from the base, three at a time
  const rings = n(3, low);
  for (let k = 0; k < rings; k++) {
    const q = cyc(tick, NAGA_RIPPLE_TICKS, ph + (k * NAGA_RIPPLE_TICKS) / rings);
    const r = 0.35 + 0.95 * q;
    back.emit('ring', g.x, g.y, g.R * 2 * r, g.ry * 2 * r, 0, (1 - q) * 0.55, foam, 'add');
  }
  // caustic glints
  const glints = n(5, low);
  for (let k = 0; k < glints; k++) {
    const p = onGround(g, fxHash(seed, k, 1) * TAU, 0.2 + 0.95 * Math.sqrt(fxHash(seed, k, 2)));
    const tw = wave(tick, 30 + Math.floor(fxHash(seed, k, 3) * 40), ph + k * 7);
    back.emit('core', p.x, p.y, 3 + 5 * tw, 2 + 2 * tw, 0, 0.25 + 0.6 * tw * tw, foam, 'add');
  }
  // water lapping the base: two bright wavelets sliding along the foot line, over the building
  for (let k = 0; k < 2; k++) {
    const w = wave(tick, 70, ph + k * 35);
    front.emit('soft', g.x + (k === 0 ? -1 : 1) * g.R * (0.15 + 0.35 * w), g.footY, g.R * 0.7, 5, 0, 0.3 + 0.25 * w, foam, 'add');
  }
  // droplets thrown up from the rim, arcing and falling back
  forEachLive(tick, low ? 24 : 12, 44, 1, ph, (b, k, t) => {
    const a = fxHash(seed, b, k + 30) * TAU;
    const p = onGround(g, a, 0.9 + 0.3 * fxHash(seed, b, k + 31));
    const out = 10 * t * (fxHash(seed, b, k + 32) - 0.5);
    const hop = Math.sin(t * Math.PI) * (14 + 16 * fxHash(seed, b, k + 33));
    (p.y > g.footY - 2 ? front : back).emit('core', p.x + out, p.y - hop, 4, 5, 0, (1 - t) * 0.9, foam, 'add');
  });
}
