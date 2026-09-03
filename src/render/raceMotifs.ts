/**
 * SPARK — S161 W1-B: the three PROCEDURAL race marks. `sparkGlyph.ts`'s idiom exactly — take a
 * shared `Graphics`, draw into it, return nothing, touch no state.
 *
 * Three jobs, and they are here together because they are one design decision seen from three
 * distances: **what does this race look like at a glance?**
 *
 *   1. `drawRaceKeepFallback` — the keep before (or instead of) its atlas.
 *   2. `drawRaceGathererMark`  — W1-B work item 3, per-race gatherer silhouettes.
 *   3. `drawCastleShotVfx`     — W1-B work item 4, per-race castle attack VFX.
 *
 * ## ⛔ Why items 3 and 4 are PROCEDURAL when item 1 got generated art
 *
 * Not for lack of budget — for legibility at the size they are actually drawn.
 *
 * A gatherer is `GATHERER_RADIUS = 11` px and it is ALREADY a shapeshifting spark: it morphs
 * through all six primitives on a 72-tick cycle (`gathererMorphShape`), and that morph is the
 * game's core read — "these are my sparks". A generated 11 px sprite would have to fight the morph
 * for the same pixels and would lose; four such units clustered at a spawner would be mush. So the
 * race mark is drawn AROUND the spark rather than instead of it: a stroke in the owner's colour
 * that changes the unit's OUTLINE without touching the glyph inside it. Silhouette, literally.
 *
 * A castle shot lasts `CASTLE_SHOT_VFX_TICKS` ticks and is re-derived from `(seat, tick)` every
 * frame. There is nothing to animate through an atlas — the whole thing IS the animation, and it
 * has to be a pure function of the tick anyway (see `ticksSinceCastleShot`).
 *
 * ## ⛔ Everything here is RENDER-ONLY and takes no `World`
 *
 * Same contract as `sparkGlyph.ts` and `keepRainbowTint`: no world reads, no mutation, no RNG, no
 * wall clock. Every one of these is a pure function of its arguments, so host and a 10 Hz client
 * draw the same mark on the same tick, and none of it can desync because none of it is state.
 *
 * ⚠ COLOUR ALWAYS ARRIVES AS AN ARGUMENT, NEVER FROM `RACE_COLORS`. The caller passes the LIVE
 * `player.color` (already through `keepRainbowTint`). Looking the colour up from the race here would
 * re-break exactly what the S135 ownership audit fixed and what S136 P3's rainbow depends on: during
 * the eight-second shuffle a seat's colour is NOT its race's colour, and a mark that ignored that
 * would label your units with an opponent's hue. `raceId` chooses the SHAPE; the seat owns the HUE.
 */

import type { Graphics } from 'pixi.js';
import type { RaceId } from '../state/races.ts';

/**
 * How long a castle shot stays on screen, in ticks (~0.4 s at 60 Hz).
 *
 * ⚠ MINE, not the owner's. Bounded on both sides rather than chosen for taste: the gun's own
 * `CASTLE_FIRE_INTERVAL_TICKS` is 240, so anything under that cannot overlap its own next shot
 * (24 is a 10 % duty cycle — the castle reads as "firing occasionally", not "permanently lit"),
 * and anything much below ~12 is a single-digit number of frames, which on a 10 Hz client snapshot
 * would be missed entirely on some frames. 24 is comfortably inside both bounds.
 */
export const CASTLE_SHOT_VFX_TICKS = 24;

/* ── 1. THE FALLBACK KEEP ──────────────────────────────────────────────────────────────────────
 *
 * ⭐ WHY A RACE-SHAPED FALLBACK AND NOT JUST THE OLD BOX. `SPARK_RACES_SPEC.md` §6 W1-B says
 * outright: *"Ship a race-tinted procedural placeholder for any race whose art is not ready — do
 * NOT block the wave."* All six atlases shipped in this session, so on the happy path none of this
 * is ever seen. It runs on the LOAD-FAILURE path, and that is the whole argument for making it
 * race-shaped rather than leaving the plain box: the failure mode of a missing atlas should be
 * "your castle looks unfinished", not "every castle on the board is anonymous". Both the HELGA and
 * the stink-tower renderers keep a procedural rig for exactly this reason.
 *
 * Drawn as the shipped placeholder — body band, gate, and a roofline — with only the ROOFLINE
 * varying, so it stays the same object the player already knows.
 */
export function drawRaceKeepFallback(
  g: Graphics,
  left: number,
  top: number,
  w: number,
  h: number,
  battlementH: number,
  color: number,
  raceId: RaceId,
): void {
  const x = left + w / 2;
  const bodyTop = top + battlementH;
  g.rect(left, bodyTop, w, h - battlementH)
    .fill({ color, alpha: 0.22 })
    .stroke({ width: 2, color, alpha: 0.85 });

  switch (raceId) {
    case 'vampires': {
      // Three spires of different heights — the gothic keep's read at any size.
      for (const [dx, up] of [[-0.28, 0.7], [0, 1], [0.28, 0.55]] as const) {
        const sx = x + dx * w;
        g.moveTo(sx - w * 0.07, bodyTop)
          .lineTo(sx, bodyTop - battlementH * up * 2.1)
          .lineTo(sx + w * 0.07, bodyTop)
          .fill({ color, alpha: 0.35 })
          .stroke({ width: 1.5, color, alpha: 0.85 });
      }
      break;
    }
    case 'nagas': {
      // A scalloped shell crest: three arcs across the top.
      for (let i = 0; i < 3; i++) {
        const cx = left + w * (0.2 + i * 0.3);
        g.arc(cx, bodyTop, w * 0.15, Math.PI, 0)
          .fill({ color, alpha: 0.35 })
          .stroke({ width: 1.5, color, alpha: 0.85 });
      }
      break;
    }
    case 'mummies': {
      // Receding tiers — the stepped mastaba, flat and monumental.
      for (let i = 0; i < 3; i++) {
        const inset = w * 0.13 * (i + 1);
        const th = battlementH * 0.55;
        g.rect(left + inset, bodyTop - th * (i + 1), w - inset * 2, th)
          .fill({ color, alpha: 0.3 })
          .stroke({ width: 1.2, color, alpha: 0.8 });
      }
      break;
    }
    case 'zombies': {
      // A crooked sagging roof: one leaning quad, deliberately not level.
      g.moveTo(left, bodyTop)
        .lineTo(left + w * 0.15, bodyTop - battlementH * 1.4)
        .lineTo(left + w, bodyTop - battlementH * 0.4)
        .lineTo(left + w, bodyTop)
        .fill({ color, alpha: 0.32 })
        .stroke({ width: 1.5, color, alpha: 0.85 });
      break;
    }
    case 'orcs': {
      // A stockade of blunt-pointed logs.
      const n = 5;
      for (let i = 0; i < n; i++) {
        const sx = left + (w / n) * (i + 0.5);
        g.moveTo(sx - w * 0.06, bodyTop)
          .lineTo(sx, bodyTop - battlementH * 1.2)
          .lineTo(sx + w * 0.06, bodyTop)
          .fill({ color, alpha: 0.35 })
          .stroke({ width: 1.4, color, alpha: 0.85 });
      }
      break;
    }
    case 'demons': {
      // Asymmetric obsidian shards — the one roofline that is deliberately unbalanced.
      for (const [dx, up] of [[-0.33, 0.6], [-0.1, 1.15], [0.18, 0.85], [0.38, 0.45]] as const) {
        const sx = x + dx * w;
        g.moveTo(sx - w * 0.05, bodyTop)
          .lineTo(sx + w * 0.03, bodyTop - battlementH * up * 2)
          .lineTo(sx + w * 0.08, bodyTop)
          .fill({ color, alpha: 0.35 })
          .stroke({ width: 1.4, color, alpha: 0.85 });
      }
      break;
    }
  }

  // The gate, shared by every race — it is the doorway the bank glyphs are drawn in.
  g.rect(x - 9, top + h - 18, 18, 18).fill({ color: 0x000000, alpha: 0.45 });
}

/* ── 2. THE GATHERER SILHOUETTE (W1-B work item 3) ─────────────────────────────────────────────
 *
 * ⭐ DRAWN AROUND THE SPARK, NOT INSTEAD OF IT — see the file docblock. `drawGatherer` still draws
 * the morphing glyph at the centre; this adds the outline that says which race owns it.
 *
 * ⚠ SIZED OFF `r` AND NOTHING ELSE. The caller passes `GATHERER_RADIUS`, and every mark below is a
 * multiple of it, so the whole family rescales together if that constant ever moves. A mark with a
 * hard-coded pixel size would silently stop fitting.
 *
 * ⚠ AND IT MUST NOT COLLIDE WITH THE STATUS RINGS. `drawGatherer` already owns three concentric
 * rings outside the glyph: hauling at `r + 7`, WAITING at `r + 10` and `r + 14`, a standing order at
 * `r + 11`. Those are STATE and they have to stay readable, so every mark here stays inside `r + 6`
 * or reaches outward only in directions a ring does not occupy (wings, a tail) rather than adding a
 * fourth circle. A race mark that could be mistaken for "my haulers have stalled" would be worse
 * than no race mark.
 */
export function drawRaceGathererMark(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  color: number,
  raceId: RaceId,
): void {
  const a = 0.75;
  switch (raceId) {
    case 'vampires': {
      // Bat wings: two swept arcs either side, above the ring band.
      for (const s of [-1, 1]) {
        g.moveTo(x + s * r * 0.4, y - r * 0.2)
          .quadraticCurveTo(x + s * r * 1.5, y - r * 1.1, x + s * r * 1.45, y - r * 0.1)
          .quadraticCurveTo(x + s * r * 1.0, y - r * 0.35, x + s * r * 0.4, y - r * 0.2)
          .fill({ color, alpha: 0.45 })
          .stroke({ width: 1, color, alpha: a });
      }
      break;
    }
    case 'nagas': {
      // A serpent tail curling off the bottom-right.
      g.moveTo(x, y + r * 0.5)
        .quadraticCurveTo(x + r * 1.3, y + r * 1.1, x + r * 0.5, y + r * 1.5)
        .quadraticCurveTo(x + r * 0.1, y + r * 1.6, x + r * 0.15, y + r * 1.2)
        .stroke({ width: 2, color, alpha: a });
      break;
    }
    case 'mummies': {
      // Two bandage wraps: short horizontal bars across the glyph.
      for (const dy of [-r * 0.45, r * 0.35]) {
        g.moveTo(x - r * 0.95, y + dy).lineTo(x + r * 0.95, y + dy)
          .stroke({ width: 1.6, color, alpha: a * 0.8 });
      }
      // …and the trailing end, so it is not just "a striped spark".
      g.moveTo(x + r * 0.9, y + r * 0.35)
        .quadraticCurveTo(x + r * 1.6, y + r * 0.7, x + r * 1.2, y + r * 1.2)
        .stroke({ width: 1.4, color, alpha: a * 0.8 });
      break;
    }
    case 'zombies': {
      // A lopsided hunch — the outline leans, and one arm hangs.
      g.moveTo(x - r * 1.1, y - r * 0.5)
        .quadraticCurveTo(x - r * 0.2, y - r * 1.25, x + r * 0.95, y - r * 0.75)
        .stroke({ width: 2, color, alpha: a });
      g.moveTo(x - r * 0.9, y - r * 0.35).lineTo(x - r * 1.15, y + r * 0.9)
        .stroke({ width: 1.6, color, alpha: a * 0.85 });
      break;
    }
    case 'orcs': {
      // Two upward tusks — broad, blunt, unmistakable at 11 px.
      for (const s of [-1, 1]) {
        g.moveTo(x + s * r * 0.55, y + r * 0.65)
          .quadraticCurveTo(x + s * r * 1.25, y + r * 0.2, x + s * r * 0.95, y - r * 0.6)
          .stroke({ width: 2.2, color, alpha: a });
      }
      break;
    }
    case 'demons': {
      // Two horns, swept out and up.
      // ⚠ THE TIPS WERE PULLED IN FROM 1.75r TO 1.55r AND THAT WAS A TEST FINDING, NOT TASTE. At the
      // original sweep the tip sat 2.09r from the unit centre — further out than any other race's
      // mark and, at GATHERER_RADIUS = 11, only two pixels short of the r+14 WAITING ring. The mark
      // that says "this is a demon" must not crowd the ring that says "my haulers have stalled".
      for (const s of [-1, 1]) {
        g.moveTo(x + s * r * 0.5, y - r * 0.7)
          .quadraticCurveTo(x + s * r * 1.3, y - r * 0.95, x + s * r * 1.05, y - r * 1.55)
          .stroke({ width: 2, color, alpha: a });
      }
      break;
    }
  }
}

/* ── 3. THE CASTLE ATTACK VFX (W1-B work item 4) ───────────────────────────────────────────────
 *
 * ⛔ COSMETIC ONLY, PER §3.2 AND R94/R117 — *same targeting, same numbers*. `castleGuns.ts`'s
 * docblock puts it as strongly as it can: *"Nothing in this file reads `raceId`, and nothing ever
 * may"*, and `castleGuns.test.ts` holds that as a tripwire. This function is the sanctioned place
 * for the difference, and it can only change PIXELS: it receives two points and a progress, has no
 * `World`, and returns nothing.
 *
 * `progress` runs 0 → 1 across `CASTLE_SHOT_VFX_TICKS`, derived by the caller from
 * `ticksSinceCastleShot`. Every race spends it the same way — a bolt travelling from the castle to
 * the target — so the CADENCE reads identically for all six and only the ammunition differs. That
 * is the spec's own framing: the mechanical claim a player makes from this VFX ("their castle just
 * fired") must be true for every race, or the cosmetic becomes misinformation.
 */
export function drawCastleShotVfx(
  g: Graphics,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  progress: number,
  color: number,
  raceId: RaceId,
): void {
  const t = Math.max(0, Math.min(1, progress));
  const px = fromX + (toX - fromX) * t;
  const py = fromY + (toY - fromY) * t;
  // Fades out over the tail of its life so a shot does not vanish mid-flight on a slow frame.
  const fade = 1 - t * 0.65;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;

  switch (raceId) {
    case 'vampires': {
      // A bat-swarm bolt: three small arcs fanned across the flight line.
      for (let i = -1; i <= 1; i++) {
        const ox = -ny * i * 5;
        const oy = nx * i * 5;
        g.moveTo(px + ox - nx * 4, py + oy - ny * 4)
          .quadraticCurveTo(px + ox, py + oy - 4, px + ox + nx * 4, py + oy + ny * 4)
          .stroke({ width: 1.6, color, alpha: fade * 0.9 });
      }
      break;
    }
    case 'nagas': {
      // A water lance: a long thin streak with a bright head.
      g.moveTo(px - nx * 16, py - ny * 16).lineTo(px, py)
        .stroke({ width: 3, color, alpha: fade * 0.6 });
      g.circle(px, py, 3).fill({ color, alpha: fade });
      break;
    }
    case 'mummies': {
      // A sand spray: a widening cone of specks behind the head.
      for (let i = 1; i <= 4; i++) {
        const back = i * 4;
        const spread = i * 1.6;
        g.circle(px - nx * back - ny * spread, py - ny * back + nx * spread, 1.4)
          .fill({ color, alpha: fade * (1 - i * 0.18) });
        g.circle(px - nx * back + ny * spread, py - ny * back - nx * spread, 1.4)
          .fill({ color, alpha: fade * (1 - i * 0.18) });
      }
      g.circle(px, py, 2.6).fill({ color, alpha: fade });
      break;
    }
    case 'zombies': {
      // A spore glob: a fat blob with a loose trailing droplet.
      g.circle(px, py, 4).fill({ color, alpha: fade * 0.85 });
      g.circle(px - nx * 7, py - ny * 7, 2).fill({ color, alpha: fade * 0.5 });
      break;
    }
    case 'orcs': {
      // A tumbling axe: a short bar whose angle spins with progress.
      const spin = t * Math.PI * 4;
      const ax = Math.cos(spin) * 5;
      const ay = Math.sin(spin) * 5;
      g.moveTo(px - ax, py - ay).lineTo(px + ax, py + ay)
        .stroke({ width: 2.6, color, alpha: fade });
      break;
    }
    case 'demons': {
      // A shadow bolt: a dark core inside a bright rim, with a short smear behind it.
      g.moveTo(px - nx * 10, py - ny * 10).lineTo(px, py)
        .stroke({ width: 5, color, alpha: fade * 0.35 });
      g.circle(px, py, 4).stroke({ width: 2, color, alpha: fade });
      g.circle(px, py, 1.6).fill({ color: 0x000000, alpha: fade * 0.8 });
      break;
    }
  }
}
