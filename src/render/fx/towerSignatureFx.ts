/**
 * SPARK — S196 `s196/tower-fx` (owner R196-T1) — **EVERY TOWER'S OWN LIVING SIGNATURE.**
 *
 * Owner, S196, verbatim: *"what you done for the lightning hub is gorgeous to actually make him look like
 * lightning and like it's hitting lightning around and it's moving. I want that for all the towers, stuff
 * like that, like effects like that … We should do that for everything. It's already starting to look a lot
 * better. Like the backdrop behind … the little effects you made around the towers."*
 *
 * The hub got `hubArcFx.ts` in S194: a constant crackle round its crown plus a periodic discharge. This is
 * the same idea for every other tower — something that shows what the tower IS and DOES, always alive, and
 * brighter in the beat it ACTS:
 *
 * | tower | signature (idle) | flare (the action, derived from synced state) |
 * |---|---|---|
 * | goblin tower | a forge: the mouth glows, sparks spit and arc down, a chimney smokes | a goblin is born → a spark burst |
 * | laser turret | a charging energy core at the crown, humming faster, motes orbiting and drawn in | it FIRES → a flash + a shock ring |
 * | pentagram | a glowing five-point star turning slowly on the ground, embers rising off it | a chewer is born → a pillar of fire |
 * | Helga's hall | the hearth glowing in the windows, chimney smoke, golden motes | she SLAPS → a golden horn-call ring |
 * | stink tower | green fumes curling up off the vat, toxic bubbles at the rim | the WIND-UP thickens the fumes; the throw BURPS gas |
 * | lightning hub | `hubArcFx` (S194) — unchanged | — |
 * | Voltkin TV | a live screen: glow, snow, a rolling scanline, a stray arc | (the emergence crackle already existed) |
 * | tier-3 race towers | the race's own motif at the crown (below) | its unit is born → the motif bursts |
 * | tier-9 boss towers | the same motif, heavier, over a turning boss seal and a heartbeat pillar | the boss is released |
 *
 * Race motifs (colours from `RACE_COLORS`): vampires — bats circling the crown + blood mist; nagas — a
 * fountain of droplets; mummies — a golden sand helix with scarab glints; zombies — toxic bubbles boiling
 * and dripping; orcs — a war brazier (flame tongues, embers, smoke); demons — violet hellfire licking up
 * the walls + soul wisps.
 *
 * ⛔ THE FLARE IS DERIVED, NEVER PUSHED. A one-shot `world.effects` entry is lost ~5/6 of the time on a
 * peer (effects sample at 10 Hz). The caller passes `actAge` — ticks since the tower last acted — read off
 * synced state every frame: a creature's `spawnedAtTick` + `sourceSpawnerId` (both on the wire) for a
 * spawner, a defender's `state` + `ticksInState` + `nextFireTick` (all on the wire) for a defender.
 *
 * ⛔ PURE — no Pixi, no DOM, no clock, no `Math.random` (`fxGuards.test.ts`). Every particle is a function
 * of (the structure id, the tick); every cycle is periodic in the tick, never accumulated. Smoke and dark
 * silhouettes go to the SHADE sink (normal blend, never bloomed — audit V-2); light goes to TOP (additive);
 * what lies on the ground goes to GROUND.
 *
 * ⚠ EVERY NUMBER, COLOUR AND LOOK HERE IS MINE (an owner LOOK item). LOW quality draws the same picture
 * with about half the particles and no smoke; MINIMAL and `?fx=legacy` never reach this file (the caller
 * is inside the `fxActive()` branch), so the weakest tier gets no heavier.
 */

import type { GodlyId } from '../../state/godlyRecipes/types.ts';
import { RACE_COLORS, type RaceId } from '../../state/races.ts';
import { clamp01, envelope, forEachLive, fxHash, fxSeed, mixColor, type FxSink } from './emitter.ts';
import { hubArcFx } from './hubArcFx.ts';
import { LASER_STYLE, tvCrackleFx } from './lightningFx.ts';

/** What a tower's signature looks like. One per kind of building, never per instance. */
export type TowerSigKind = 'goblinForge' | 'laserCore' | 'pentagramRunes' | 'helgaHearth' | 'stinkFumes' | 'hubArcs' | 'tvStatic' | 'race3' | 'boss9';

/**
 * ⭐ THE CENSUS. Every buildable tower id → its signature. A `Record` over the whole `GodlyId` union, so a
 * new tower id fails `tsc` here until it is given one — a tower without a signature cannot ship by accident.
 */
export const TOWER_SIGNATURE: Readonly<Record<GodlyId, TowerSigKind>> = {
  goblinTower: 'goblinForge',
  laserTurret: 'laserCore',
  pentagram: 'pentagramRunes',
  helga: 'helgaHearth',
  stinkTower: 'stinkFumes',
  lightningHub: 'hubArcs',
  voltkin: 'tvStatic',
  t3TowerVampires: 'race3',
  t3TowerNagas: 'race3',
  t3TowerMummies: 'race3',
  t3TowerZombies: 'race3',
  t3TowerOrcs: 'race3',
  t3TowerDemons: 'race3',
  t9TowerVampires: 'boss9',
  t9TowerNagas: 'boss9',
  t9TowerMummies: 'boss9',
  t9TowerZombies: 'boss9',
  t9TowerOrcs: 'boss9',
  t9TowerDemons: 'boss9',
};

/** How long the action flare lasts, ticks. MINE. */
export const TOWER_SIG_FLARE_TICKS = 36;
/** "Never acted" (or too long ago to show). */
export const TOWER_SIG_NO_ACT = -1;

const TAU = Math.PI * 2;

/** 1 at the action, easing to 0 over `TOWER_SIG_FLARE_TICKS`. PURE. */
export function towerSigFlare(actAge: number): number {
  if (!(actAge >= 0) || actAge >= TOWER_SIG_FLARE_TICKS) return 0;
  const u = 1 - actAge / TOWER_SIG_FLARE_TICKS;
  return u * u;
}

/**
 * ⭐ A DEFENDER'S ACT, from its synced FSM. PURE.
 *   · `actAge` — ticks since it entered FIRE (FIRE, then RECOVER which follows it), else `TOWER_SIG_NO_ACT`;
 *   · `charge` 0..1 — how close the next shot is: 0 right after one, rising to 1 at `nextFireTick`, 1 while
 *     winding up (or, for a tower with a visible wind-up, the wind-up's own progress).
 */
export function defenderSigAct(
  state: string, ticksInState: number, nextFireTick: number, tick: number,
  fireIntervalTicks: number, windupTicks: number, fireHoldTicks: number,
): { actAge: number; charge: number } {
  switch (state) {
    case 'FIRE': return { actAge: ticksInState, charge: 0 };
    case 'RECOVER': return { actAge: fireHoldTicks + ticksInState, charge: 0 };
    case 'WINDUP': return { actAge: TOWER_SIG_NO_ACT, charge: windupTicks > 0 ? clamp01(ticksInState / windupTicks) : 1 };
    case 'IDLE': {
      const left = nextFireTick - tick;
      return { actAge: TOWER_SIG_NO_ACT, charge: fireIntervalTicks > 0 ? clamp01(1 - left / fireIntervalTicks) : 1 };
    }
    default: return { actAge: TOWER_SIG_NO_ACT, charge: 0 }; // DORMANT (HELGA fallen), WALK
  }
}

/** The three sinks a signature may write: ground (under buildings), top (light, bloomed), shade (smoke). */
export interface TowerSigSinks { readonly ground: FxSink; readonly top: FxSink; readonly shade: FxSink }

/**
 * Draw one tower's signature. `footX/footY` is where its sprite meets the ground and `artW/artH` its drawn
 * size (the `towerCover` foot its renderer published); `race` is required for `race3`/`boss9`.
 */
export function towerSignatureFx(
  s: TowerSigSinks, kind: TowerSigKind, id: number,
  footX: number, footY: number, artW: number, artH: number,
  tick: number, low: boolean, actAge: number, charge: number, race: RaceId | null,
): void {
  const flare = towerSigFlare(actAge);
  switch (kind) {
    case 'goblinForge': goblinForge(s, id, footX, footY, artW, artH, tick, low, flare, actAge); break;
    case 'laserCore': laserCore(s, id, footX, footY, artW, artH, tick, low, flare, charge); break;
    case 'pentagramRunes': pentagramRunes(s, id, footX, footY, artW, artH, tick, low, flare); break;
    case 'helgaHearth': helgaHearth(s, id, footX, footY, artW, artH, tick, low, flare); break;
    case 'stinkFumes': stinkFumes(s, id, footX, footY, artW, artH, tick, low, flare, charge, actAge); break;
    case 'hubArcs': hubArcFx(s.top, id, footX, footY, artW, artH, tick, low); break;
    case 'tvStatic': tvStatic(s, id, footX, footY, artW, artH, tick, low); break;
    case 'race3': if (race !== null) raceMotif(s, race, id, footX, footY, artW, artH, tick, low, flare, actAge, 1); break;
    case 'boss9':
      if (race !== null) {
        bossSeal(s, race, id, footX, footY, artW, artH, tick, low, flare);
        raceMotif(s, race, id, footX, footY, artW, artH, tick, low, flare, actAge, 1.35);
      }
      break;
    default: {
      const unhandled: never = kind;
      void unhandled;
    }
  }
}

/* ── shared helpers ──────────────────────────────────────────────────────────────────────────── */

/** Particle-birth period: HIGH as given, LOW doubled (≈ half the particles). */
function per(base: number, low: boolean): number { return low ? base * 2 : base; }
/** A 0..1 wave of period `p` ticks, phased by `ph`. */
function wave(tick: number, p: number, ph: number): number {
  return 0.5 + 0.5 * Math.sin(((((tick + ph) % p) + p) % p) / p * TAU);
}
/** A 0..1 position inside a repeating cycle of `p` ticks. */
function cyc(tick: number, p: number, off: number): number {
  return ((((tick + off) % p) + p) % p) / p;
}
/** A firelight flicker, re-rolled every `step` ticks: `lo`..1. */
function flicker(seed: number, tick: number, step: number, lo: number): number {
  return lo + (1 - lo) * fxHash(seed, Math.floor(tick / step), 0xf11c);
}
/** A streak sprite between two points (`soft` stretched along the segment). */
function streak(sink: FxSink, x0: number, y0: number, x1: number, y1: number, thick: number, alpha: number, tint: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.5) return;
  sink.emit('soft', (x0 + x1) / 2, (y0 + y1) / 2, len + thick, thick, Math.atan2(dy, dx), alpha, tint, 'add');
}
/** A short burst of `count` sparks thrown from (x, y), `age` ticks old. */
function burst(top: FxSink, seed: number, x: number, y: number, age: number, life: number, count: number, reach: number, hot: number, cool: number, gravity: number): void {
  if (!(age >= 0) || age >= life) return;
  const t = age / life;
  for (let k = 0; k < count; k++) {
    const a = fxHash(seed, k, 0xb1) * TAU;
    const v = reach * (0.55 + 0.45 * fxHash(seed, k, 0xb2));
    const d = v * (1 - (1 - t) * (1 - t));
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d * 0.7 + gravity * t * t * reach;
    const a2 = (1 - t) * (0.6 + 0.4 * fxHash(seed, k, 0xb3));
    top.emit('core', px, py, 5 * (1 - t) + 2, 5 * (1 - t) + 2, 0, a2, mixColor(hot, cool, t), 'add');
  }
}

/* ── goblin tower: the FORGE ─────────────────────────────────────────────────────────────────── */

/** The forge mouth sits this fraction of the art height above the foot. MINE. */
export const GOBLIN_FORGE_MOUTH_FRAC = 0.24;
/** A forge spark is born every this many ticks (HIGH), and lives this long. MINE. */
export const GOBLIN_SPARK_PERIOD = 5;
export const GOBLIN_SPARK_LIFE = 40;
const FORGE_HOT = 0xffe08a;
const FORGE_EMBER = 0xff7a1a;
const FORGE_RED = 0xc8280a;

function goblinForge(s: TowerSigSinks, id: number, x: number, fy: number, w: number, h: number, tick: number, low: boolean, flare: number, actAge: number): void {
  const seed = fxSeed(id, 0x60b1);
  const mx = x;
  const my = fy - h * GOBLIN_FORGE_MOUTH_FRAC;
  const fl = flicker(seed, tick, 4, 0.7);
  // The forge mouth's glow, and the warm light it throws on the ground in front.
  s.top.emit('soft', mx, my, w * 0.42, h * 0.2, 0, (0.34 + 0.4 * flare) * fl, FORGE_EMBER, 'add');
  s.top.emit('core', mx, my, w * 0.12, h * 0.07, 0, (0.45 + 0.4 * flare) * fl, FORGE_HOT, 'add');
  s.ground.emit('soft', mx, fy + 4, w * 0.9, w * 0.22, 0, 0.22 * fl + 0.25 * flare, FORGE_EMBER, 'add');
  // Sparks spit out of the mouth, arc up and fall.
  forEachLive(tick, per(GOBLIN_SPARK_PERIOD, low), GOBLIN_SPARK_LIFE, 1, id * 7, (b, k, t) => {
    const vx = (fxHash(seed, b, k) - 0.5) * w * 0.012;
    const vy = h * (0.006 + 0.006 * fxHash(seed, b, k + 9));
    const age = t * GOBLIN_SPARK_LIFE;
    const px = mx + vx * age;
    const py = my - vy * age + 0.012 * age * age;
    const pvx = vx;
    const pvy = -vy + 0.024 * age;
    const len = 3 + Math.min(6, Math.hypot(pvx, pvy) * 3);
    s.top.emit('core', px, py, len, 2.2, Math.atan2(pvy, pvx), envelope(t, 0.1) * 0.95, mixColor(FORGE_HOT, FORGE_RED, t), 'add');
  });
  // The chimney smokes (HIGH only — smoke is the first thing LOW drops).
  if (!low) {
    const cx = x + w * 0.2;
    const cy = fy - h * 0.9;
    forEachLive(tick, 13, 96, 1, id * 5, (b, _k, t) => {
      const sway = Math.sin((t * 3 + fxHash(seed, b, 3)) * TAU * 0.5) * w * 0.06 * t;
      const size = w * (0.08 + 0.2 * t);
      s.shade.emit('smoke', cx + sway + t * w * 0.08, cy - t * h * 0.5, size, size, fxHash(seed, b, 4) * TAU, envelope(t, 0.2) * 0.3, 0x3c3632, 'normal');
    });
  }
  // A goblin is born: the forge roars.
  if (flare > 0) burst(s.top, fxSeed(id, actAge >= 0 ? tick - actAge : 0), mx, my, actAge, TOWER_SIG_FLARE_TICKS, low ? 6 : 12, w * 0.34, FORGE_HOT, FORGE_RED, 0.6);
}

/* ── laser turret: the CHARGING CORE ─────────────────────────────────────────────────────────── */

/** The energy core sits this fraction of the art height above the foot. MINE. */
export const LASER_CORE_FRAC = 0.8;
/** Motes orbiting the core (HIGH; LOW draws two). MINE. */
export const LASER_ORBITERS = 3;

function laserCore(s: TowerSigSinks, id: number, x: number, fy: number, w: number, h: number, tick: number, low: boolean, flare: number, charge: number): void {
  const seed = fxSeed(id, 0x1a5e);
  const cx = x;
  const cy = fy - h * LASER_CORE_FRAC;
  const c = clamp01(charge);
  // The hum: faster and brighter as the shot comes due.
  const hum = 0.5 + 0.5 * Math.sin(tick * (0.12 + 0.4 * c) + id);
  const glow = w * (0.16 + 0.14 * c) * (0.9 + 0.1 * hum);
  s.top.emit('soft', cx, cy, glow * 2.2, glow * 2.2, 0, 0.22 + 0.3 * c * hum + 0.5 * flare, LASER_STYLE.glow, 'add');
  s.top.emit('soft', cx, cy, glow, glow, 0, 0.5 + 0.35 * c + 0.4 * flare, LASER_STYLE.sheath, 'add');
  s.top.emit('core', cx, cy, 5 + 7 * c + 26 * flare, 5 + 7 * c + 26 * flare, 0, 0.75 + 0.25 * hum, 0xffffff, 'add');
  // Orbiting motes, each with a short trail; they spin up with the charge.
  const orb = low ? 2 : LASER_ORBITERS;
  const R = w * 0.24;
  const speed = 0.035 + 0.13 * c;
  for (let k = 0; k < orb; k++) {
    const a = tick * speed + (k / orb) * TAU + fxHash(seed, k) * 0.4;
    const px = cx + Math.cos(a) * R;
    const py = cy + Math.sin(a) * R * 0.42;
    const tx = cx + Math.cos(a - 0.35) * R;
    const ty = cy + Math.sin(a - 0.35) * R * 0.42;
    streak(s.top, tx, ty, px, py, 3, 0.35 + 0.35 * c, LASER_STYLE.sheath);
    s.top.emit('core', px, py, 5, 5, 0, 0.8, 0xffe0d0, 'add');
  }
  // Energy drawn IN once the charge is past half: motes converge from the rim onto the core.
  if (c > 0.5) {
    const a0 = (c - 0.5) * 2;
    forEachLive(tick, per(4, low), 18, 1, id * 3, (b, k, t) => {
      const a = fxHash(seed, b, k + 31) * TAU;
      const r = w * 0.5 * (1 - t);
      s.top.emit('core', cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.55, 3.5, 3.5, 0, a0 * envelope(t, 0.3), LASER_STYLE.sheath, 'add');
    });
  }
  // It fires: a shock ring off the core and a recoil spray.
  if (flare > 0) {
    const t = 1 - Math.sqrt(flare);
    const rr = w * (0.2 + 0.7 * t);
    s.top.emit('ring', cx, cy, rr * 2, rr * 1.1, 0, flare * 0.9, LASER_STYLE.sheath, 'add');
  }
}

/* ── pentagram: the TURNING STAR ─────────────────────────────────────────────────────────────── */

/** The star's radius as a fraction of the art width; it turns one revolution every this many ticks. MINE. */
export const PENTAGRAM_STAR_R = 0.62;
export const PENTAGRAM_TURN_TICKS = 1500;
const PENT_FIRE = 0xff3a1e;
const PENT_HOT = 0xffb050;

function pentagramRunes(s: TowerSigSinks, id: number, x: number, fy: number, w: number, h: number, tick: number, low: boolean, flare: number): void {
  const seed = fxSeed(id, 0x9e47);
  const gy = fy - h * 0.04;
  const R = w * PENTAGRAM_STAR_R;
  const ry = R * 0.36;
  const pulse = wave(tick, 96, id * 13);
  const lit = 0.32 + 0.22 * pulse + 0.45 * flare;
  // The circle.
  s.ground.emit('ring', x, gy, R * 2.25, ry * 2.25, 0, lit, PENT_FIRE, 'add');
  // The five points, turning, and the star drawn between them (k → k+2).
  const turn = (cyc(tick, PENTAGRAM_TURN_TICKS, id * 37)) * TAU;
  const px: number[] = [0, 0, 0, 0, 0];
  const py: number[] = [0, 0, 0, 0, 0];
  for (let k = 0; k < 5; k++) {
    const a = turn + (k / 5) * TAU - Math.PI / 2;
    px[k] = x + Math.cos(a) * R;
    py[k] = gy + Math.sin(a) * ry;
  }
  for (let k = 0; k < 5; k++) {
    const j = (k + 2) % 5;
    streak(s.ground, px[k]!, py[k]!, px[j]!, py[j]!, 3, lit * 0.85, PENT_FIRE);
    s.ground.emit('soft', px[k]!, py[k]!, 22, 12, 0, lit, PENT_HOT, 'add');
    // a rune flame standing on each point (top: it rises in front of the building's base)
    const fl = flicker(seed + k, tick, 3, 0.55);
    s.top.emit('soft', px[k]!, py[k]! - 7, 7, 15 + 8 * flare, 0, (0.55 + 0.4 * flare) * fl, PENT_HOT, 'add');
  }
  // Embers rise off the circle.
  forEachLive(tick, per(7, low), 72, 1, id * 11, (b, k, t) => {
    const a = fxHash(seed, b, k) * TAU;
    const ex = x + Math.cos(a) * R * (0.4 + 0.6 * fxHash(seed, b, k + 1));
    const ey = gy + Math.sin(a) * ry;
    const sway = Math.sin(t * TAU + fxHash(seed, b, 5) * TAU) * 6;
    s.top.emit('core', ex + sway, ey - t * h * 0.55, 3.5, 3.5, 0, envelope(t, 0.2) * 0.85, mixColor(PENT_HOT, PENT_FIRE, t), 'add');
  });
  // A chewer is born: a pillar of fire stands up out of the star.
  if (flare > 0) {
    s.top.emit('soft', x, fy - h * 0.5, w * 0.34 * (0.6 + 0.4 * flare), h * 1.25, 0, 0.55 * flare, PENT_FIRE, 'add');
    s.top.emit('soft', x, fy - h * 0.45, w * 0.12, h * 0.9, 0, 0.6 * flare, PENT_HOT, 'add');
  }
}

/* ── Helga's hall: the HEARTH ────────────────────────────────────────────────────────────────── */

/** The two lit windows: ± this fraction of the art width, this fraction of its height up. MINE. */
export const HELGA_WINDOW_DX = 0.17;
export const HELGA_WINDOW_FRAC = 0.3;
const HEARTH = 0xffa83a;
const HEARTH_HOT = 0xffe2a0;
const HELGA_GOLD = 0xffd54a;

function helgaHearth(s: TowerSigSinks, id: number, x: number, fy: number, w: number, h: number, tick: number, low: boolean, flare: number): void {
  const seed = fxSeed(id, 0x4e19);
  const wy = fy - h * HELGA_WINDOW_FRAC;
  for (let k = 0; k < 2; k++) {
    const wx = x + (k === 0 ? -1 : 1) * w * HELGA_WINDOW_DX;
    const fl = flicker(seed + k, tick, 5, 0.65);
    s.top.emit('soft', wx, wy, w * 0.2, h * 0.16, 0, (0.38 + 0.3 * flare) * fl, HEARTH, 'add');
    s.top.emit('core', wx, wy, w * 0.06, h * 0.05, 0, 0.5 * fl, HEARTH_HOT, 'add');
  }
  // The door's warm spill on the ground.
  s.ground.emit('soft', x, fy + 3, w * 0.7, w * 0.18, 0, 0.2 + 0.25 * flare, HEARTH, 'add');
  // Golden motes drifting up round the hall (the feast).
  forEachLive(tick, per(11, low), 90, 1, id * 17, (b, k, t) => {
    const ox = (fxHash(seed, b, k) - 0.5) * w * 0.8;
    const sway = Math.sin(t * TAU * 1.5 + fxHash(seed, b, 2) * TAU) * 5;
    s.top.emit('core', x + ox + sway, fy - h * (0.15 + 0.7 * t), 3, 3, 0, envelope(t, 0.25) * 0.75, HELGA_GOLD, 'add');
  });
  // Chimney smoke (HIGH only).
  if (!low) {
    const cx = x - w * 0.2;
    const cy = fy - h * 0.92;
    forEachLive(tick, 15, 100, 1, id * 3, (b, _k, t) => {
      const size = w * (0.07 + 0.18 * t);
      s.shade.emit('smoke', cx - t * w * 0.1 + Math.sin(t * 4 + fxHash(seed, b, 7) * TAU) * 4, cy - t * h * 0.45, size, size, fxHash(seed, b, 8) * TAU, envelope(t, 0.2) * 0.26, 0x8a8070, 'normal');
    });
  }
  // She slaps: the hall sounds a golden horn-call — a ring runs out over the ground, sparkles off the roof.
  if (flare > 0) {
    const t = 1 - Math.sqrt(flare);
    const rr = w * (0.4 + 0.9 * t);
    s.ground.emit('ring', x, fy, rr * 2, rr * 0.72, 0, flare * 0.8, HELGA_GOLD, 'add');
    burst(s.top, fxSeed(id, 0x5a9), x, fy - h * 0.85, (1 - Math.sqrt(flare)) * TOWER_SIG_FLARE_TICKS, TOWER_SIG_FLARE_TICKS, low ? 5 : 9, w * 0.3, HEARTH_HOT, HELGA_GOLD, 0.8);
  }
}

/* ── stink tower: the FUMES ──────────────────────────────────────────────────────────────────── */

/** The vat's rim sits this fraction of the art height above the foot. MINE. */
export const STINK_VAT_FRAC = 0.82;
/** A fume puff is born every this many ticks (HIGH), and lives this long. MINE. */
export const STINK_FUME_PERIOD = 8;
export const STINK_FUME_LIFE = 100;
const FUME_GREEN = 0x7fa63a;
const FUME_TOXIC = 0xb8ff4a;
const FUME_GREY = 0x5c6a40;

function stinkFumes(s: TowerSigSinks, id: number, x: number, fy: number, w: number, h: number, tick: number, low: boolean, flare: number, charge: number, actAge: number): void {
  const seed = fxSeed(id, 0x57c4);
  const vx = x;
  const vy = fy - h * STINK_VAT_FRAC;
  // The wind-up thickens the fumes (charge is the wind-up's progress while winding up).
  const thick = 1 + 0.8 * clamp01(charge) + 0.6 * flare;
  // A sickly glow over the vat.
  s.top.emit('soft', vx, vy, w * 0.5, h * 0.18, 0, 0.18 + 0.12 * wave(tick, 70, id * 7) + 0.3 * flare, FUME_TOXIC, 'add');
  // Fumes curl up off the vat (shade: smoke darkens, it does not glow).
  forEachLive(tick, per(STINK_FUME_PERIOD, low), STINK_FUME_LIFE, 1, id * 9, (b, k, t) => {
    const ph = fxHash(seed, b, k) * TAU;
    const curl = Math.sin(t * TAU * 1.2 + ph) * w * 0.14 * t;
    const size = w * (0.1 + 0.26 * t);
    s.shade.emit('smoke', vx + curl + (fxHash(seed, b, 2) - 0.5) * w * 0.12, vy - t * h * 0.55, size, size * 0.9, ph + t * 1.5,
      Math.min(0.6, envelope(t, 0.15) * 0.32 * thick), mixColor(FUME_GREEN, FUME_GREY, t), 'normal');
  });
  // Toxic bubbles swell and pop at the rim.
  const nb = low ? 2 : 3;
  for (let k = 0; k < nb; k++) {
    const t = cyc(tick, 44, Math.floor(fxHash(seed, k, 0x2b) * 44));
    const bx = vx + (fxHash(seed, k, 0x2c) - 0.5) * w * 0.34;
    const sz = 6 + 6 * fxHash(seed, k, 0x2d);
    if (t < 0.8) s.top.emit('bubble', bx, vy - 2 - t * 4, sz * (0.3 + 0.7 * t / 0.8), sz * (0.3 + 0.7 * t / 0.8), 0, 0.7, FUME_TOXIC, 'add');
    else s.top.emit('ring', bx, vy - 6, sz * 1.8, sz * 1.1, 0, (1 - (t - 0.8) / 0.2) * 0.6, FUME_TOXIC, 'add');
  }
  // The throw: a BURP of gas off the vat.
  if (flare > 0 && actAge >= 0) {
    const t = actAge / TOWER_SIG_FLARE_TICKS;
    const n = low ? 4 : 7;
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (fxHash(seed, k, 0x3b) - 0.5) * 2.2;
      const d = w * 0.45 * (1 - (1 - t) * (1 - t));
      const sz = w * (0.12 + 0.2 * t);
      s.shade.emit('smoke', vx + Math.cos(a) * d, vy + Math.sin(a) * d * 0.8, sz, sz, a, (1 - t) * 0.42, FUME_GREEN, 'normal');
    }
    s.top.emit('soft', vx, vy, w * 0.5 * (1 + t), w * 0.3 * (1 + t), 0, 0.45 * flare, FUME_TOXIC, 'add');
  }
}

/* ── Voltkin TV: the LIVE SCREEN ─────────────────────────────────────────────────────────────── */

/** The screen's centre sits this fraction of the art height above the foot; its size, of the art. MINE. */
export const TV_SCREEN_FRAC = 0.52;
export const TV_SCREEN_W = 0.44;
export const TV_SCREEN_H = 0.3;
/** A stray arc jumps off the set once every this many ticks, for a few ticks. MINE. */
export const TV_ARC_CYCLE_TICKS = 110;
const TV_GLOW = 0x6fc8ff;
const TV_SNOW = 0xdff4ff;

function tvStatic(s: TowerSigSinks, id: number, x: number, fy: number, w: number, h: number, tick: number, low: boolean): void {
  const seed = fxSeed(id, 0x7e57);
  const sx = x;
  const sy = fy - h * TV_SCREEN_FRAC;
  const sw = w * TV_SCREEN_W;
  const sh = h * TV_SCREEN_H;
  const fl = flicker(seed, tick, 3, 0.6);
  s.top.emit('soft', sx, sy, sw * 1.6, sh * 1.6, 0, 0.2 * fl, TV_GLOW, 'add');
  // Snow: specks re-rolled every two ticks inside the screen.
  const snow = low ? 4 : 8;
  const roll = Math.floor(tick / 2);
  for (let k = 0; k < snow; k++) {
    const px = sx + (fxHash(seed, roll, k * 2) - 0.5) * sw;
    const py = sy + (fxHash(seed, roll, k * 2 + 1) - 0.5) * sh;
    s.top.emit('core', px, py, 3, 2, 0, 0.35 + 0.4 * fxHash(seed, roll, k + 50), TV_SNOW, 'add');
  }
  // The rolling scanline.
  const u = cyc(tick, 80, id * 19);
  s.top.emit('soft', sx, sy - sh / 2 + u * sh, sw * 1.05, 3, 0, 0.45 * Math.sin(u * Math.PI), TV_SNOW, 'add');
  // Now and then a stray arc jumps off the set.
  const a = cyc(tick, TV_ARC_CYCLE_TICKS, id * 41) * TV_ARC_CYCLE_TICKS;
  if (a < 9) tvCrackleFx(s.top, sx, sy, Math.max(10, sw * 0.7), seed, tick, 0.55 * (1 - a / 9), 1);
}

/* ── the six race towers: each race's MOTIF at the crown ─────────────────────────────────────── */

/** The motif's centre sits this fraction of the art height above the foot. MINE. */
export const RACE_CROWN_FRAC = 0.82;

function raceMotif(
  s: TowerSigSinks, race: RaceId, id: number, x: number, fy: number, w: number, h: number,
  tick: number, low: boolean, flare: number, actAge: number, scale: number,
): void {
  const base = RACE_COLORS[race];
  const seed = fxSeed(id, 0x3ace + RACE_SALT[race]);
  const cy = fy - h * RACE_CROWN_FRAC;
  switch (race) {
    case 'vampires': vampires(s, seed, id, x, cy, w, h, tick, low, flare, base, scale); break;
    case 'nagas': nagas(s, seed, id, x, cy, fy, w, h, tick, low, flare, base, scale); break;
    case 'mummies': mummies(s, seed, id, x, cy, fy, w, h, tick, low, flare, base, scale); break;
    case 'zombies': zombies(s, seed, id, x, cy, w, h, tick, low, flare, base, scale); break;
    case 'orcs': orcs(s, seed, id, x, cy, w, h, tick, low, flare, base, scale); break;
    case 'demons': demons(s, seed, id, x, cy, fy, w, h, tick, low, flare, base, scale); break;
    default: {
      const unhandled: never = race;
      void unhandled;
    }
  }
  // Its unit is born: the race's colour bursts off the crown.
  if (flare > 0) burst(s.top, fxSeed(id, 0xb0b + RACE_SALT[race]), x, cy, actAge, TOWER_SIG_FLARE_TICKS, low ? 6 : 12, w * 0.4 * scale, mixColor(base, 0xffffff, 0.5), base, 0.4);
}

const RACE_SALT: Readonly<Record<RaceId, number>> = { vampires: 1, nagas: 2, mummies: 3, zombies: 4, orcs: 5, demons: 6 };

/** Bats circling the crown (HIGH; LOW draws two). MINE. */
export const VAMPIRE_BATS = 3;

function vampires(s: TowerSigSinks, seed: number, id: number, x: number, cy: number, w: number, h: number, tick: number, low: boolean, flare: number, base: number, scale: number): void {
  const blood = mixColor(base, 0xff1030, 0.4);
  s.top.emit('soft', x, cy, w * 0.5 * scale, h * 0.2 * scale, 0, 0.16 + 0.1 * wave(tick, 120, id * 5) + 0.3 * flare, blood, 'add');
  // Bats: a dark body and two flapping wings, circling; the flare flings them wide.
  const bats = low ? 2 : VAMPIRE_BATS;
  const R = w * 0.36 * scale * (1 + 0.8 * flare);
  for (let k = 0; k < bats; k++) {
    const dir = k % 2 === 0 ? 1 : -1;
    const a = dir * tick * 0.028 + (k / bats) * TAU + fxHash(seed, k) * 0.6;
    const bx = x + Math.cos(a) * R;
    const by = cy + Math.sin(a) * R * 0.32 - Math.sin(tick * 0.07 + k * 2) * 6;
    const flap = Math.sin(tick * 0.55 + k * 1.7);
    const span = 9 * scale;
    const lift = 0.35 + 0.45 * flap;
    s.shade.emit('soft', bx - span * 0.55, by - lift * 3, span, span * 0.34, -lift, 0.85, 0x14060c, 'normal');
    s.shade.emit('soft', bx + span * 0.55, by - lift * 3, span, span * 0.34, lift, 0.85, 0x14060c, 'normal');
    s.shade.emit('soft', bx, by, span * 0.42, span * 0.5, 0, 0.95, 0x0c0408, 'normal');
    s.top.emit('core', bx, by - 1, 2.4, 2.4, 0, 0.9, 0xff2040, 'add'); // eyes
  }
  // Blood mist drifting down off the crown.
  forEachLive(tick, per(9, low), 70, 1, id * 13, (b, k, t) => {
    const ox = (fxHash(seed, b, k) - 0.5) * w * 0.5 * scale;
    s.top.emit('soft', x + ox + Math.sin(t * 5 + b) * 4, cy + t * h * 0.4, 9 * scale, 9 * scale, 0, envelope(t, 0.3) * 0.45, blood, 'add');
  });
}

function nagas(s: TowerSigSinks, seed: number, id: number, x: number, cy: number, fy: number, w: number, h: number, tick: number, low: boolean, flare: number, base: number, scale: number): void {
  const water = mixColor(base, 0x9ff0ff, 0.45);
  const foam = mixColor(base, 0xffffff, 0.7);
  s.top.emit('soft', x, cy, w * 0.32 * scale, h * 0.14 * scale, 0, 0.25 + 0.3 * flare, water, 'add');
  // A fountain: droplets thrown up from the crown, falling back in arcs.
  const life = 38;
  forEachLive(tick, per(3, low), life, 1, id * 3, (b, k, t) => {
    const a = (fxHash(seed, b, k) - 0.5) * 1.6;
    const v = h * 0.011 * scale * (0.7 + 0.5 * fxHash(seed, b, k + 3)) * (1 + 0.6 * flare);
    const age = t * life;
    const px = x + Math.sin(a) * v * age * 1.4;
    const py = cy - Math.cos(a) * v * age + 0.03 * age * age * scale;
    if (py > fy) return;
    s.top.emit('core', px, py, 3.4, 4.2, 0, envelope(t, 0.15) * 0.9, t < 0.5 ? foam : water, 'add');
  });
  // Ripples running out at the foot.
  const rn = low ? 1 : 2;
  for (let k = 0; k < rn; k++) {
    const t = cyc(tick, 90, k * 45 + id * 7);
    const r = w * 0.25 * scale + w * 0.5 * scale * t;
    s.ground.emit('ring', x, fy, r * 2, r * 0.7, 0, (1 - t) * 0.45, water, 'add');
  }
}

function mummies(s: TowerSigSinks, seed: number, id: number, x: number, cy: number, fy: number, w: number, h: number, tick: number, low: boolean, flare: number, base: number, scale: number): void {
  const sand = mixColor(base, 0xf0d080, 0.5);
  const gold = 0xffd860;
  s.top.emit('soft', x, cy, w * 0.36 * scale, h * 0.16 * scale, 0, 0.18 + 0.12 * wave(tick, 140, id * 3) + 0.35 * flare, gold, 'add');
  // A sand helix winding up round the tower.
  const motes = low ? 6 : 12;
  for (let k = 0; k < motes; k++) {
    const u = cyc(tick, 170, Math.floor((k / motes) * 170) + id * 11);
    const a = u * TAU * 2 + fxHash(seed, k) * 0.5;
    const r = w * 0.4 * scale * (1 - 0.35 * u) * (1 + 0.5 * flare);
    const px = x + Math.cos(a) * r;
    const py = fy - (fy - cy) * (0.05 + 1.0 * u) + Math.sin(a) * r * 0.28;
    // the far half of the helix is behind the tower: dimmer
    const near = Math.sin(a) > 0 ? 1 : 0.35;
    s.top.emit('soft', px, py, 7, 5, 0, envelope(u, 0.15) * 0.75 * near, sand, 'add');
  }
  // Scarab glints flashing on the crown.
  const roll = Math.floor(tick / 12);
  for (let k = 0; k < 2; k++) {
    if (fxHash(seed, roll, k + 7) < 0.45) continue;
    const gx = x + (fxHash(seed, roll, k + 8) - 0.5) * w * 0.4 * scale;
    const gy = cy + (fxHash(seed, roll, k + 9) - 0.5) * h * 0.12;
    const tw = 1 - (tick % 12) / 12;
    s.top.emit('core', gx, gy, 10 * tw + 2, 2.5, 0, 0.9 * tw, gold, 'add');
    s.top.emit('core', gx, gy, 2.5, 10 * tw + 2, 0, 0.9 * tw, gold, 'add');
  }
}

function zombies(s: TowerSigSinks, seed: number, id: number, x: number, cy: number, w: number, h: number, tick: number, low: boolean, flare: number, base: number, scale: number): void {
  const goo = mixColor(base, 0x9cff3a, 0.35);
  const hot = mixColor(base, 0xffffff, 0.45);
  s.top.emit('soft', x, cy, w * 0.4 * scale, h * 0.16 * scale, 0, 0.2 + 0.12 * wave(tick, 90, id * 9) + 0.35 * flare, goo, 'add');
  // Bubbles boil up on the crown and pop.
  const nb = low ? 3 : 5;
  for (let k = 0; k < nb; k++) {
    const t = cyc(tick, 40, Math.floor(fxHash(seed, k, 1) * 40));
    const bx = x + (fxHash(seed, k, 2) - 0.5) * w * 0.4 * scale;
    const sz = (6 + 7 * fxHash(seed, k, 3)) * scale;
    if (t < 0.75) {
      const q = t / 0.75;
      s.top.emit('bubble', bx, cy - q * 10, sz * (0.3 + 0.7 * q), sz * (0.3 + 0.7 * q), 0, 0.55 + 0.4 * q, goo, 'add');
    } else {
      const q = (t - 0.75) / 0.25;
      s.top.emit('ring', bx, cy - 10, sz * (1 + q), sz * 0.7 * (1 + q), 0, (1 - q) * 0.7, hot, 'add');
    }
  }
  // Drips running down the walls.
  forEachLive(tick, per(10, low), 50, 1, id * 5, (b, k, t) => {
    const ox = (fxHash(seed, b, k) - 0.5) * w * 0.5 * scale;
    s.top.emit('soft', x + ox, cy + t * t * h * 0.55, 4, 7, 0, envelope(t, 0.2) * 0.75, goo, 'add');
  });
}

function orcs(s: TowerSigSinks, seed: number, id: number, x: number, cy: number, w: number, h: number, tick: number, low: boolean, flare: number, base: number, scale: number): void {
  const big = scale * (1 + 0.7 * flare);
  // The brazier's glow.
  s.top.emit('soft', x, cy, w * 0.4 * big, h * 0.22 * big, 0, (0.3 + 0.3 * flare) * flicker(seed, tick, 3, 0.75), mixColor(base, 0xff8a2a, 0.5), 'add');
  // Flame tongues licking up.
  const life = 24;
  forEachLive(tick, per(2, low), life, 1, id * 7, (b, k, t) => {
    const ox = (fxHash(seed, b, k) - 0.5) * w * 0.22 * scale;
    const sway = Math.sin(t * 6 + fxHash(seed, b, 2) * TAU) * 3;
    const fw = 12 * big * (1 - 0.6 * t);
    s.top.emit('soft', x + ox + sway, cy - t * h * 0.32 * big, fw, fw * 1.7, 0, envelope(t, 0.15) * 0.8, mixColor(0xffe070, 0xff2a08, t), 'add');
  });
  // Embers.
  forEachLive(tick, per(6, low), 60, 1, id * 3, (b, k, t) => {
    const ox = (fxHash(seed, b, k + 5) - 0.5) * w * 0.4;
    s.top.emit('core', x + ox + Math.sin(t * 7 + b) * 5, cy - t * h * 0.6, 3, 3, 0, envelope(t, 0.15) * 0.9, 0xffa040, 'add');
  });
  // War smoke (HIGH only).
  if (!low) {
    forEachLive(tick, 16, 90, 1, id * 11, (b, _k, t) => {
      const size = w * (0.1 + 0.2 * t) * scale;
      s.shade.emit('smoke', x + Math.sin(t * 3 + b) * 6 + t * w * 0.1, cy - h * 0.25 - t * h * 0.45, size, size, fxHash(seed, b, 9) * TAU, envelope(t, 0.25) * 0.28, 0x2e2a28, 'normal');
    });
  }
}

function demons(s: TowerSigSinks, seed: number, id: number, x: number, cy: number, fy: number, w: number, h: number, tick: number, low: boolean, flare: number, base: number, scale: number): void {
  const violet = mixColor(base, 0xc060ff, 0.4);
  const pale = mixColor(base, 0xffffff, 0.6);
  s.top.emit('soft', x, cy, w * 0.4 * scale, h * 0.18 * scale, 0, 0.2 + 0.15 * wave(tick, 100, id * 7) + 0.35 * flare, violet, 'add');
  // Hellfire licking up the walls from the base.
  const life = 30;
  forEachLive(tick, per(3, low), life, 1, id * 5, (b, k, t) => {
    const side = fxHash(seed, b, k) < 0.5 ? -1 : 1;
    const x0 = x + side * w * (0.18 + 0.14 * fxHash(seed, b, k + 1)) * scale;
    const y0 = fy - h * 0.1 * fxHash(seed, b, k + 2);
    const fw = 10 * scale * (1 - 0.5 * t) * (1 + 0.5 * flare);
    s.top.emit('soft', x0 + Math.sin(t * 7 + b) * 2, y0 - t * h * 0.38, fw, fw * 1.8, 0, envelope(t, 0.15) * 0.75, mixColor(0xff70ff, violet, t), 'add');
  });
  // Soul wisps spiralling up.
  const wisps = low ? 1 : 2;
  for (let k = 0; k < wisps; k++) {
    const u = cyc(tick, 130, k * 65 + id * 13);
    const a = u * TAU * 1.5 + k * Math.PI;
    const px = x + Math.cos(a) * w * 0.3 * scale;
    const py = cy + h * 0.1 - u * h * 0.6;
    const al = envelope(u, 0.2) * 0.8;
    s.top.emit('soft', px, py, 9, 12, 0, al, pale, 'add');
    s.top.emit('soft', px - Math.cos(a) * 6, py + 8, 6, 10, 0, al * 0.5, violet, 'add');
  }
}

/* ── tier-9: the BOSS SEAL under the motif ───────────────────────────────────────────────────── */

/** The seal's heartbeat: a double pulse every this many ticks. MINE. */
export const BOSS_HEARTBEAT_TICKS = 72;

/** 0..1 — a heartbeat (two beats, then a rest) at `u` through the cycle. PURE. */
export function bossHeartbeat(u: number): number {
  const beat = (c: number): number => { const d = (u - c) / 0.06; return Math.exp(-d * d); };
  return Math.min(1, beat(0.1) + 0.7 * beat(0.3));
}

function bossSeal(s: TowerSigSinks, race: RaceId, id: number, x: number, fy: number, w: number, h: number, tick: number, low: boolean, flare: number): void {
  const base = RACE_COLORS[race];
  const bright = mixColor(base, 0xffffff, 0.35);
  const hb = bossHeartbeat(cyc(tick, BOSS_HEARTBEAT_TICKS, id * 17));
  const R = w * 0.7;
  // Two seal rings on the ground, the inner one throbbing with the heartbeat.
  s.ground.emit('ring', x, fy, R * 2.3, R * 0.85, 0, 0.35 + 0.2 * hb + 0.4 * flare, base, 'add');
  s.ground.emit('ring', x, fy, R * 1.5 * (1 + 0.06 * hb), R * 0.55 * (1 + 0.06 * hb), 0, 0.3 + 0.4 * hb, bright, 'add');
  // Glyphs turning on the outer ring.
  const glyphs = low ? 4 : 8;
  const turn = -cyc(tick, 2000, id * 23) * TAU;
  for (let k = 0; k < glyphs; k++) {
    const a = turn + (k / glyphs) * TAU;
    s.ground.emit('core', x + Math.cos(a) * R * 1.08, fy + Math.sin(a) * R * 0.39, 8, 5, 0, 0.55 + 0.35 * hb, bright, 'add');
  }
  // A pillar of the race's light, beating.
  s.top.emit('soft', x, fy - h * 0.55, w * 0.3, h * 1.3, 0, 0.12 + 0.2 * hb + 0.5 * flare, base, 'add');
}
