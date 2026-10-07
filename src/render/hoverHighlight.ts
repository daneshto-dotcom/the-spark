/**
 * ⭐ S196 (ui-5) — PROTOTYPE, SHIPS OFF: A WORLD-SPACE HOVER HIGHLIGHT. The owner decides; nothing here
 * runs unless `?hover=1` is on the URL (or `HOVER_HIGHLIGHT_DEFAULT_ON` is flipped).
 *
 * The gap it answers: every UI control lifts under the pointer (uiSkin, R81) but nothing on the BOARD
 * does — you cannot tell, before clicking, which castle / unit / tower the click will open. This draws ONE
 * shared highlight — a soft glow pooled on the ground under the thing plus a ring on its footprint, in the
 * board's perspective (squashed ellipse) — on the fx GROUND layer, under the art, so it never covers it.
 *
 * ⭐ READ-ONLY REUSE of the fx substrate (`render/fx/*` is owned by another tree): only `fxGround()` and the
 * `FxSink` contract (`'soft'` / `'ring'` textures, `'add'` blend). Render-only: reads synced state and
 * `world.tick` for the pulse, writes nothing, so it cannot touch determinism or the wire (no bump).
 *
 * ⛔ WHAT IT HIGHLIGHTS IS WHAT A CLICK OPENS — the pick order mirrors `Controls`' character-sheet pick
 * (castle → creature (own drawn radius, nearest-by-ratio, ties to lower id) → tower art box → shape), using
 * the SAME geometry helpers (`isPointInKeep`, `creatureDrawnSizeRatio`, `towerHitAtPoint`, `rampHitAtPoint`,
 * `stinkTowerAt`). ⚠ MINE: if the owner adopts this, extract that pick into ONE function both call — a
 * second, independently-written picker is how a highlight ends up on the wrong thing (footerBand's R81
 * note). `hoverHighlight.test.ts` pins the two orders together meanwhile.
 */
import { KEEP_H, KEEP_W } from '../constants.ts';
import { castleAnchor, isPointInKeep } from '../state/gatherers/gatherer.ts';
import { sameTeam } from '../state/teams.ts';
import type { World } from '../state/world.ts';
import type { FxSink } from './fx/emitter.ts';
import { fxGround } from './fx/fxState.ts';
import { stinkTowerAt } from './stinkTowerCover.ts';
import { rampHitAtPoint } from './structureRamp.ts';
import { creatureDrawnSizeRatio, towerArtForRecipe, towerHitAtPoint, towerRingCentroid } from './towerFrames.ts';

/** ⚠ MINE (S196) — OFF until the owner rules on the screenshots in SPARK_S196_HoverHighlight. */
export const HOVER_HIGHLIGHT_DEFAULT_ON = false;

/** `?hover=1` opts a viewer in (the `?fx=legacy` / `?worker=1` pattern); `?hover=0` forces it off. */
export function hoverHighlightEnabled(search: string, defaultOn: boolean = HOVER_HIGHLIGHT_DEFAULT_ON): boolean {
  const v = new URLSearchParams(search).get('hover');
  if (v === '1') return true;
  if (v === '0') return false;
  return defaultOn;
}

/** Mirrors `CREATURE_PICK_DIST` in controls.ts (the click radius of a grunt-sized creature). */
export const HOVER_CREATURE_PICK_DIST = 34;
/** Mirrors the click forgiveness on a loose shape (`prim.radius + 6` in controls.ts). */
const SHAPE_FORGIVE = 6;
/** Ring for an art-less ramp / stink tower whose box size is not exported: ⚠ MINE, eyeballed. */
const ANCHOR_RING_R = 48;

export interface HoverTarget {
  readonly kind: 'castle' | 'creature' | 'tower' | 'shape';
  /** Footprint centre (board px) and ring radius. */
  readonly x: number;
  readonly y: number;
  readonly r: number;
  /** Your side (team-aware) → cool cyan; anyone else → warm red; a shape → neutral. */
  readonly tone: 'friendly' | 'hostile' | 'neutral';
}

/** PURE — what the pointer is over, in the order a click would open it. */
export function hoverTargetAt(world: World, x: number, y: number): HoverTarget | null {
  const me = world.localPlayerId;
  const tone = (owner: number): HoverTarget['tone'] => (sameTeam(world, me, owner) ? 'friendly' : 'hostile');

  for (const id of world.players.keys()) {
    const seat = id as unknown as number;
    if (isPointInKeep(x, y, seat, world.layout)) {
      const a = castleAnchor(seat, world.layout);
      return { kind: 'castle', x: a.x, y: a.y + KEEP_H * 0.3, r: Math.max(KEEP_W, KEEP_H) * 0.55, tone: tone(seat) };
    }
  }

  let best: { id: number; score: number; x: number; y: number; r: number; owner: number } | null = null;
  for (const c of world.creatures.values()) {
    const r = HOVER_CREATURE_PICK_DIST * creatureDrawnSizeRatio(c.type);
    const score = Math.hypot(x - c.pos.x, y - c.pos.y) / r;
    if (score >= 1) continue;
    const id = c.id as unknown as number;
    if (best !== null && (score > best.score || (score === best.score && id >= best.id))) continue;
    best = { id, score, x: c.pos.x, y: c.pos.y, r, owner: c.ownerPlayerId as unknown as number };
  }
  if (best !== null) return { kind: 'creature', x: best.x, y: best.y, r: best.r * 0.8, tone: tone(best.owner) };

  const hit = towerHitAtPoint(world, x, y);
  if (hit !== null) {
    const art = towerArtForRecipe(hit.recipeId);
    const c = art !== null ? towerRingCentroid(world, hit.anchorId, art) : null;
    if (art !== null && c !== null) return { kind: 'tower', x: c.x, y: c.y, r: art.sizePx * 0.42, tone: 'neutral' };
  }
  const other = rampHitAtPoint(world, x, y)?.anchorId ?? stinkTowerAt(world, x, y);
  if (other !== null) {
    const p = world.primitives.get(other);
    if (p !== undefined) return { kind: 'tower', x: p.pos.x, y: p.pos.y, r: ANCHOR_RING_R, tone: 'neutral' };
  }

  let shape: { x: number; y: number; r: number; d2: number } | null = null;
  for (const p of world.primitives.values()) {
    const dx = p.pos.x - x;
    const dy = p.pos.y - y;
    const d2 = dx * dx + dy * dy;
    const rr = p.radius + SHAPE_FORGIVE;
    if (d2 > rr * rr || (shape !== null && d2 >= shape.d2)) continue;
    shape = { x: p.pos.x, y: p.pos.y, r: p.radius * 1.4, d2 };
  }
  if (shape !== null) return { kind: 'shape', x: shape.x, y: shape.y, r: shape.r, tone: 'neutral' };
  return null;
}

export const HOVER_TONE_COLOR: Readonly<Record<HoverTarget['tone'], number>> = {
  friendly: 0x3bd7ff,
  hostile: 0xff5a4a,
  neutral: 0xfff1b8,
};
/** The board's ground perspective: a footprint ellipse is this much flatter than it is wide. ⚠ MINE. */
export const HOVER_GROUND_SQUASH = 0.45;
/** Pulse period in sim ticks (render-only read of `world.tick`). ⚠ MINE. */
export const HOVER_PULSE_TICKS = 48;

/** PURE layout — the highlight for one target, written to any sink (the fx ground layer in the game). */
export function hoverHighlightFx(sink: FxSink, t: HoverTarget, tick: number): void {
  const color = HOVER_TONE_COLOR[t.tone];
  const phase = (tick % HOVER_PULSE_TICKS) / HOVER_PULSE_TICKS;
  const pulse = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2); // 0..1, smooth
  const w = t.r * 2;
  const h = w * HOVER_GROUND_SQUASH;
  sink.emit('soft', t.x, t.y, w * 1.25, h * 1.25, 0, 0.28 + 0.12 * pulse, color, 'add');
  sink.emit('ring', t.x, t.y, w * (1 + 0.04 * pulse), h * (1 + 0.04 * pulse), 0, 0.75 + 0.2 * pulse, color, 'add');
}

/** The per-frame call (between `fxBeginFrame` and `fxEndFrame`). A no-op unless enabled. */
export function drawHoverHighlight(world: World, cursor: { x: number; y: number }, enabled: boolean, sink: FxSink = fxGround()): HoverTarget | null {
  if (!enabled || world.gameState !== 'PLAYING') return null;
  const t = hoverTargetAt(world, cursor.x, cursor.y);
  if (t !== null) hoverHighlightFx(sink, t, world.tick);
  return t;
}
