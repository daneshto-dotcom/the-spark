/**
 * SPARK — PER-RACE ZONE BACKGROUNDS (S165, owner brief 2026-09-03 + ruling R137).
 *
 * Each seat's quarter of the board is painted in its race's world instead of deep black space:
 * zombies a rotting swamp, orcs a badlands war-camp, demons hell, nagas a drowned military citadel,
 * mummies a desert necropolis, vampires a Carpathian valley.
 *
 * ⭐ TWELVE IMAGES, NOT SIX, AND THE REASON IS GEOMETRIC (R137). Measured against `zones.ts`:
 * `PITCH_2P` splits the canvas on ONE VERTICAL line, so a zone is 960x1080 — PORTRAIT.
 * `QUADRANTS_4P` splits on a CROSS, so a zone is 960x540 — LANDSCAPE. One image cannot serve both:
 * stretched it distorts, letterboxed it leaves dead ground, cropped it loses the composition. The
 * castle anchor also sits in the GOALMOUTH on one board and the OUTER CORNER on the other, so the
 * focal point belongs in a different part of the frame per board.
 *
 * ⛔ IT DRAWS BEHIND EVERYTHING AND IT STAYS QUIET. The owner's requirement is that the art be
 * *"partially transparent so towers, structures, connectors and creatures stay readable"*. Two
 * halves make that true and BOTH are needed:
 *   · the ART is dark and low-contrast by construction — measured at generation, mean max-channel
 *     22–41 out of 255 with ZERO pixels above 200 across all twelve;
 *   · this renderer draws it at `ZONE_BG_ALPHA`, and the QUARRY is cut out of it entirely.
 *
 * ⛔ AND THE SENTENCE THAT USED TO SIT HERE WAS THE BUG. It read *"into the FIRST layer added to
 * the stage, so every spark, bond, structure and creature paints on top of it"*, which was true of
 * the first cut and false from the moment the layer moved onto `aboveFogLayer` (see the constructor,
 * which records the move and why). Structures, creatures, goblins and gatherers DO paint on top,
 * because they are on `aboveFogLayer` too. **`SparkRenderer` and the bond overlay are not** — they
 * are on `app.stage` (`main.ts:535`) BELOW `aboveFogLayer` (`main.ts:679`), so they are the two
 * gameplay layers this one covers rather than backs.
 *
 * ⚠ The 0.55 alpha is what keeps that survivable for the sprites. It did NOT save the portal disc,
 * which was opaque — owner, S166: *"you have put the layer of dark background OVER the primitives
 * (shapes), cant see them being generated but my gatherer keeps gathering"*. Exactly right, and the
 * giveaway is in his own sentence: the sim was never involved.
 *
 * ⚠ TOGGLEABLE, because the owner asked for it: `setEnabled(false)` restores the plain black board.
 * Kept as renderer state rather than world state on purpose — this is a display preference, it must
 * never reach the wire or the hash, and two peers may legitimately disagree about it.
 *
 * ⭐ LAZY, PER RACE. The twelve backgrounds are ~11 MB on disk. A 1v1 match needs TWO of them and a
 * 4-player match four, so loading all twelve would spend most of that budget on races nobody is
 * playing — the same reasoning `gathererRenderer` and the race-unit atlas loader already follow.
 *
 * ⚠ RENDER-ONLY. It reads `world.layout` and each player's `raceId`, both already synced, and writes
 * nothing. No new wire field, no protocol bump.
 */
import { Application, Assets, Container, Sprite, Texture } from 'pixi.js';

import type { World } from '../state/world.ts';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';
import { zoneOwner, type ZoneLayout } from '../state/zones.ts';
import { defaultRaceForSeat, isRaceId, type RaceId } from '../state/races.ts';
import { seatHoldsPerk } from '../state/racialPerks.ts';
// ⭐ S191 — SCORCHED EARTH: the live cast (the burn's own predicate) and this client's aim.
import { scorchedEarthActiveZone } from '../state/racial/scorchedEarthRules.ts';
import { scorchedEarthHoverSeat } from './scorchedEarthAim.ts';
import type { PlayerId } from '../types.ts';
// ⭐ S193 visuals-3 — V12 (the scorch's embers, burn flickers and heat shimmer) and V26 (the grade).
import { isScorchImmune } from '../state/racial/scorchedEarthRules.ts';
import { scorchedEarthZones, scorchedZones } from '../state/racial/scorchedGround.ts';
import { zoneOf } from '../state/zones.ts';
import { fxActive, fxGround, fxHaze, fxTop } from './fx/fxState.ts';
import { fxSeed } from './fx/emitter.ts';
import { BURN_FLICKER_MAX_UNITS, burnFlickerFx, scorchZoneFx } from './fx/perkFx.ts';
import { isConcealed } from './concealment.ts';
import { creatureSpriteScaleMul } from './towerFrames.ts';

/**
 * How strongly the backdrop shows through.
 *
 * ⚠ THIS NUMBER IS MINE, NOT THE OWNER'S. The art is already dark enough that 1.0 would not blow
 * out gameplay, but the brief asks for *partially* transparent and a backdrop that competes for
 * attention is worse than none. 0.55 keeps each race's world legible as a place while leaving the
 * board unmistakably a board. It is one constant and it is cheap to overrule on sight.
 */
const ZONE_BG_ALPHA = 0.55;

/**
 * ⭐ S188 — SCORCHED GROUND (demons L0): *"burning hell"*. A seat holding it has its backdrop washed
 * toward ember red, so the burning quarter reads as burning to everyone who can see the board.
 *
 * ⚠ DERIVED EVERY FRAME from `Player.draftPicks` (synced) — no wire field, no effect push, and the
 * same tint on every peer. A multiply tint on the existing sprite rather than a new Graphics: this
 * layer deliberately paints nothing opaque (see the constructor). ⚠ MINE, a placeholder look until
 * he supplies art, and it shows only while backdrops are on — with them off the board is plain black.
 */
export const SCORCHED_ZONE_TINT = 0xff6a3a;

/**
 * PURE — the backdrop tint for a seat: ember while it holds SCORCHED GROUND and its castle stands,
 * untinted otherwise (S188 F4 — a fallen seat's land has stopped burning, so it must stop LOOKING it).
 *
 * ⚠ S191 — the PHASE-FREE half: which land burns in a fight. The renderer never calls this directly;
 * it calls `zoneBackdropTintNow`, which adds the FIGHT gate (S191 1a).
 */
export function zoneBackdropTint(
  player: Parameters<typeof seatHoldsPerk>[0] & { readonly castleHp: number },
): number {
  return player.castleHp > 0 && seatHoldsPerk(player, 'demons.l0') ? SCORCHED_ZONE_TINT : 0xffffff;
}

/**
 * ⭐ S191 1a (owner) — **THE TINT THE RENDERER PAINTS: ONLY WHILE THE LAND BURNS — FIGHT, in a PLAYING
 * match.** *"it kind of turns your whole … side of the screen into red, which sucks because they want
 * to see the original art … switched on only during fight."* The burn runs in `runRacialPerksFight`,
 * inside `hostTick`'s FIGHT gate and behind its own `gameState === 'PLAYING'` return, so the look takes
 * the same two tests: BUILD (and a decided match) shows the original backdrop. `matchPhase` and
 * `gameState` are both synced, so every peer flips on the same snapshot
 * (`s191ScorchedTintFightOnly.test.ts` drives the real host tick and the real `sync` across both edges).
 */
export function zoneBackdropTintNow(
  player: Parameters<typeof zoneBackdropTint>[0],
  phase: { readonly matchPhase: World['matchPhase']; readonly gameState: World['gameState'] },
): number {
  if (phase.gameState !== 'PLAYING' || phase.matchPhase !== 'FIGHT') return 0xffffff;
  return zoneBackdropTint(player);
}

/**
 * ⭐ S191 (owner item 1b) — the HOVER PREVIEW while aiming SCORCHED EARTH: *"there's going to be like a
 * cool preview when you mouse over it like shows you it turning red"*. A deeper red than the ember, so
 * "this is where it WILL burn" never reads as "this already burns". ⚠ MINE, a placeholder look — and,
 * like the ember, it shows only while backdrops are on (with them off the board is plain black).
 */
export const SCORCHED_EARTH_PREVIEW_TINT = 0xff2a2a;

/**
 * ⭐ S191 — THE TINT A SEAT'S ZONE IS PAINTED, all three reasons in one place:
 *   1. the aiming preview — the zone under the cursor, while this client may cast (`hoverSeat`);
 *   2. a live SCORCHED EARTH cast on this zone (`scorchedEarthActiveZone` — the SAME predicate the burn
 *      reads, so the red is exactly the burning ground, FIGHT only, gone with the caster);
 *   3. the passive, FIGHT only (`zoneBackdropTintNow`, S191 1a).
 * DERIVED every frame from synced state plus this client's own aim — never from a pushed effect.
 */
export function zoneTintFor(world: World, seat: PlayerId, hoverSeat: PlayerId | null): number {
  const player = world.players.get(seat);
  if (player === undefined) return 0xffffff;
  if (hoverSeat === seat) return SCORCHED_EARTH_PREVIEW_TINT;
  const zone = zoneOwner(seat as unknown as number, world.layout);
  if (zone !== null) {
    for (const caster of world.players.values()) {
      if (scorchedEarthActiveZone(world, caster) === zone) return SCORCHED_ZONE_TINT;
    }
  }
  return zoneBackdropTintNow(player, world);
}

/**
 * ⭐ S193 V12 — **WHICH GROUND IS BURNING THIS TICK, AND WHO IT SPARES.** PURE, and it is the burn's own
 * two lists, never a restatement: the passive (`scorchedZones`, which `runScorchedGround` runs only
 * inside the host tick's FIGHT gate of a PLAYING match — so the same two tests gate it here) and every
 * live SCORCHED EARTH cast (`scorchedEarthZones`, whose own predicate already carries FIGHT/PLAYING).
 * A zone burning twice (the passive plus a cast on it, the owner's *"double scorched earth"*) is listed
 * twice — once per burn, as the sim burns it.
 */
export function burningZonesNow(world: World): Array<{ spared: PlayerId; zone: number }> {
  const out: Array<{ spared: PlayerId; zone: number }> = [];
  if (world.gameState !== 'PLAYING' || world.matchPhase !== 'FIGHT') return out;
  for (const { seat, zone } of scorchedZones(world)) out.push({ spared: seat, zone });
  for (const { caster, zone } of scorchedEarthZones(world)) out.push({ spared: caster, zone });
  return out;
}

/**
 * ⭐ S193 V12 — PURE: is this creature burning under any of `burning`? The burn's own predicates —
 * `zoneOf(pos) === zone` and `isScorchImmune(owner, spared)` — so a flicker is drawn exactly on a unit
 * the DoT is ticking on (`burnCreatures`), never on the caster's own and never in the quarry.
 */
export function isCreatureBurning(
  world: Pick<World, 'layout'>,
  c: { readonly pos: { x: number; y: number }; readonly ownerPlayerId: PlayerId; readonly ehp: number },
  burning: ReadonlyArray<{ spared: PlayerId; zone: number }>,
): boolean {
  if (c.ehp <= 0 || burning.length === 0) return false;
  const z = zoneOf(c.pos, world.layout);
  if (z === null) return false;
  for (const b of burning) if (b.zone === z && !isScorchImmune(c.ownerPlayerId, b.spared)) return true;
  return false;
}

/**
 * ⭐ S193 V26 (`S192_VISUALS_PLAN.md`) — **THE PER-RACE COLOUR GRADE.** Each race's world is pulled
 * toward its own hue so the six quarters read as six places at a glance: crimson Carpathia, drowned
 * teal, desert amber, bile swamp, rust badlands, blood hell. ⚠ MINE, every value.
 *
 * ⛔ BAKED INTO THE TEXTURE, NOT A FILTER — the plan named an `AdjustmentFilter`, and this is the
 * deliberate deviation: a per-frame full-zone filter pass is exactly the cost class that took the CI
 * runner (software GL) to 5 ticks/s in S166 (the `PORTAL_CUT_RADIUS` docblock). The grade is static,
 * so it rides the same one-time canvas bake as the portal hole, costs the frame NOTHING, and shows on
 * LOW quality too. `?fx=legacy` (and the suite, where nothing is installed) bakes the ungraded art.
 */
export const ZONE_GRADE: Readonly<Record<RaceId, { readonly hue: number; readonly hueAlpha: number; readonly light: number; readonly lightAlpha: number }>> = {
  vampires: { hue: 0xc0183c, hueAlpha: 0.26, light: 0xffb0c0, lightAlpha: 0.22 },
  nagas: { hue: 0x10a8c8, hueAlpha: 0.26, light: 0xb0f4ff, lightAlpha: 0.22 },
  mummies: { hue: 0xd09020, hueAlpha: 0.24, light: 0xffe4a0, lightAlpha: 0.24 },
  zombies: { hue: 0x58b020, hueAlpha: 0.26, light: 0xd0ffa0, lightAlpha: 0.2 },
  orcs: { hue: 0xc05010, hueAlpha: 0.24, light: 0xffc890, lightAlpha: 0.22 },
  demons: { hue: 0xc01010, hueAlpha: 0.28, light: 0xffa080, lightAlpha: 0.22 },
};

/** ⭐ S193 V26 — the board vignette's darkest corner (normal blend, under every gameplay layer). ⚠ MINE. */
export const ZONE_VIGNETTE_ALPHA = 0.42;

/**
 * S165 (owner) - THE QUARRY IS A PORTAL, NOT GROUND, SO NO RACE OWNS IT.
 *
 * Owner, after playing the 1v1 board: "the center where the shapes spawn is split in half back
 * the race background while it should stay cosmos black (its like a spawn portal and not a part
 * of each players background - revert it to where it was)".
 *
 * Exactly right, and the reason is structural rather than aesthetic: the zone partition runs dead
 * through the canvas centre, and the quarry disc is centred there too. So the backdrop painted the
 * shared spawn well as one half of one race's world and one half of the other's - a seam across the
 * one object on the board that belongs to nobody.
 *
 * APPLIED TO BOTH LAYOUTS, not just the 1v1 the owner was playing. QUADRANTS_4P splits the same
 * disc four ways at the same centre, so it has the same defect one seam worse.
 *
 * ⛔ BAKED, AND THIS CONSTANT HAS NOW BEEN WRONG TWICE. READ BOTH FAILURES BEFORE TOUCHING IT.
 *
 * It said: *"DRAWN, NOT MASKED. Pixi masks are additive - a hole needs an even-odd path, which is
 * fragile and has to be rebuilt whenever the geometry moves. The board is FOG_COLOR black, so
 * painting the disc black over the backdrop and under every gameplay layer restores the original
 * pixels exactly."* Two of its three clauses are false here:
 *
 *   · **"under every gameplay layer"** — it was not. It was above every spark and bond on the
 *     board, and it is where 100% of them are BORN, so it hid the entire shape queue.
 *   · **"rebuilt whenever the geometry moves"** — the geometry cannot move. `CANVAS_WIDTH`,
 *     `CANVAS_HEIGHT`, `SPAWNER_CENTER_X/Y` and `SPAWNER_RADIUS` are all compile-time constants, so
 *     the mask is built ONCE in the constructor and never touched again.
 *
 * ⛔ AND THE FIX FOR THAT WAS ALSO WRONG — IT WAS A STENCIL MASK, AND IT BROKE CI. S166, measured.
 *
 * The first repair masked the sprite host with `rect(canvas).fill().circle(quarry).cut()`. It is
 * visually correct and it was verified in a real browser. It is also a **per-frame stencil pass over
 * the whole 1920x1080 canvas**, and on the CI runner (headless Linux, SOFTWARE GL) that is
 * catastrophic: the gating lane went from ~3.7 min to past its 720 s cap, and the sim crawled at
 * **5.28 ticks/s instead of 60**. Three gating specs died on `waitForWorld timeout: a gatherer banks
 * a shape into the local castle`.
 *
 * ⭐ THAT PREDICATE IS THIS RENDERER'S OWN FINGERPRINT, AND IT IS WHY THE DIAGNOSIS WAS QUICK: the
 * docblock in `sync` below records `hunter.spec.ts:68` failing on the identical line when the FIRST
 * cut of this file loaded textures during match boot. Same spec, same predicate, third cause. A
 * re-run reproduced it, so it was not the runner having a bad day.
 *
 * ⭐ SO THE HOLE IS BAKED INTO THE TEXTURE, ONCE, AND NOTHING PER-FRAME PAYS FOR IT. `punchPortal`
 * draws each backdrop into a 2D canvas at ITS OWN source resolution and erases the disc with
 * `destination-out`. Steady state is four plain sprites — exactly what shipped before S166, so the
 * portal now costs the frame budget NOTHING while still being a real hole rather than paint over
 * gameplay.
 *
 * ⚠ BAKED AT SOURCE RESOLUTION, NOT AT ZONE RESOLUTION, AND THAT IS DELIBERATE. Baking at the zone
 * rect (960x540) would add ~8 MB of texture memory across four seats; the source images are half-rect
 * by S165's own art fix, so baking there costs ~2 MB. This renderer has already killed a browser
 * CONTEXT once by decoding 23.7 MB of backdrop (see `sync`), and that is not a budget to spend twice.
 *
 * ⚠ A PER-ZONE `cut()` CANNOT WORK, so do not "simplify" this into a Graphics path. `cut()` requires
 * the hole to lie COMPLETELY inside the shape it cuts, and the quarry sits at the canvas centre —
 * which is the CORNER of every `QUADRANTS_4P` quadrant and dead on the `PITCH_2P` split line. The
 * disc straddles every zone rect there is.
 *
 * ⚠ FALLS BACK TO THE UNHOLED TEXTURE on any failure (no DOM, no 2D context, a tainted or
 * undrawable resource). The cost of the fallback is a cosmetic seam across the quarry, which is
 * where this whole story started — never a crash, and never a black disc over the shape queue.
 */
const PORTAL_CUT_RADIUS = SPAWNER_RADIUS + 2;

/**
 * How long a match runs before the backdrop starts loading. 3 s at 60 Hz.
 *
 * ⚠ THIS NUMBER IS MINE. Long enough to clear the boot burst that CI showed this renderer was
 * landing in the middle of (see `sync`), short enough that a player reaching the board has it before
 * they have finished reading the wave banner. The BUILD phase is 90 s, so it costs 3% of the opening
 * phase and nothing at all thereafter.
 */
const ZONE_BG_HOLD_TICKS = 3 * 60;

/** Where a race's zone art lives, per board. `-4p` is landscape, `-2p` portrait — see R137. */
function zoneArtUrl(race: RaceId, layout: ZoneLayout): string {
  return `/art/race-zones/zone-${race}-${layout === 'PITCH_2P' ? '2p' : '4p'}.png`;
}

/**
 * The rectangle a zone index occupies.
 *
 * ⚠ DERIVED FROM THE SAME SPLIT LINES `zones.ts` USES, and deliberately not imported from it —
 * `zones.ts` exports predicates (`zoneOf`, `zoneOwner`) rather than rects, and adding a render-only
 * geometry helper to a SIM module would put a display concern inside the hashed layer. The split is
 * dead centre on both boards, which is the one fact both files depend on.
 *
 * ⛔ CLOCK ORDER on QUADRANTS_4P, matching `zoneOf`: 0 = top-left, 1 = top-right, 2 = bottom-right,
 * 3 = bottom-left. Getting this wrong paints a seat's world over its neighbour's ground, which is
 * exactly the kind of thing that looks like an art bug and is a mapping bug.
 */
/*
 * ⭐ S170 P6 — EXPORTED, because `fogRenderer` now needs the same rectangle to leave the local
 * player's own quarter fully lit (owner: *"your own character zone or quadrant should be always lit
 * and visible, completely, not just around your structures"*). Shared rather than re-derived: a
 * second copy of this geometry that drifted would light a rectangle that does not match the
 * backdrop it is lighting, and this file's own docblock already warns that getting the clock order
 * wrong "looks like an art bug and is a mapping bug".
 */
export function zoneRect(
  zone: number,
  layout: ZoneLayout,
): { x: number; y: number; w: number; h: number } {
  const hx = CANVAS_WIDTH / 2;
  const hy = CANVAS_HEIGHT / 2;
  if (layout === 'PITCH_2P') {
    return { x: zone === 0 ? 0 : hx, y: 0, w: hx, h: CANVAS_HEIGHT };
  }
  const left = zone === 0 || zone === 3;
  const top = zone === 0 || zone === 1;
  return { x: left ? 0 : hx, y: top ? 0 : hy, w: hx, h: hy };
}

/**
 * Return `tex` with the shared quarry erased, for the zone it is about to fill.
 *
 * PURE apart from allocating a canvas: it reads `zoneRect` and the spawner constants and touches no
 * renderer state, which is what lets `zoneBackgroundRenderer.test.ts` reason about the geometry
 * without a GPU.
 *
 * ⭐ THE MAPPING IS THE WHOLE TRICK, and it MIRRORS `sync`'s cover-scale exactly. `sync` scales by
 * `max(r.w / tex.width, r.h / tex.height)` and centres the overflow, so a world point maps back into
 * source pixels by undoing precisely that. If `sync`'s placement ever changes, this must change with
 * it or the hole drifts off the quarry — which is why both live in this one file.
 */
export interface PortalInSource {
  /** Disc centre, in the texture's own pixels. Legitimately negative — see the docblock. */
  readonly cx: number;
  readonly cy: number;
  readonly rad: number;
  /** Does any of the disc fall on this texture at all? `false` means the bake is a no-op. */
  readonly intersects: boolean;
}

/**
 * Carry the quarry disc from WORLD space into the pixels of the texture that fills `zone`.
 *
 * ⭐ EXPORTED PURELY SO IT CAN BE TESTED WITHOUT A GPU, and it is the half of the bake that can be
 * silently wrong. `punchPortal` degrades to the unholed texture on every failure, so a mapping error
 * does not throw — it just quietly stops punching, and the symptom is the S165 seam growing back
 * across the quarry. `intersects` is what a test can assert must be TRUE for every zone on every
 * layout.
 *
 * ⚠ `cx`/`cy` ARE ROUTINELY NEGATIVE AND THAT IS CORRECT, not a bug to clamp. The quarry sits on the
 * shared corner of the `QUADRANTS_4P` quadrants, so for three of the four zones its centre lies
 * outside the texture and only an arc of the disc falls on it.
 *
 * ⛔ IT MIRRORS `sync`'s COVER-SCALE EXACTLY — `max(r.w / w, r.h / h)` with the overflow centred —
 * because it is undoing that placement. Change one and you must change the other, which is why both
 * live in this file.
 */
export function portalInSource(
  texW: number,
  texH: number,
  zone: number,
  layout: ZoneLayout,
): PortalInSource {
  const r = zoneRect(zone, layout);
  const scale = Math.max(r.w / texW, r.h / texH);
  const spx = r.x + (r.w - texW * scale) / 2;
  const spy = r.y + (r.h - texH * scale) / 2;
  const cx = (SPAWNER_CENTER_X - spx) / scale;
  const cy = (SPAWNER_CENTER_Y - spy) / scale;
  const rad = PORTAL_CUT_RADIUS / scale;
  const intersects = !(cx + rad < 0 || cy + rad < 0 || cx - rad > texW || cy - rad > texH);
  return { cx, cy, rad, intersects };
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

function punchPortal(tex: Texture, zone: number, layout: ZoneLayout, grade: RaceId | null = null): Texture {
  const resource = (tex.source as unknown as { resource?: unknown }).resource;
  if (typeof document === 'undefined' || resource === undefined || resource === null) return tex;
  const w = Math.trunc(tex.width);
  const h = Math.trunc(tex.height);
  if (w <= 0 || h <= 0) return tex;

  const { cx, cy, rad, intersects } = portalInSource(w, h, zone, layout);
  if (!intersects && grade === null) return tex;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return tex;
  try {
    ctx.drawImage(resource as CanvasImageSource, 0, 0, w, h);
  } catch {
    // A resource Pixi can upload to the GPU but the 2D context refuses to draw (a tainted or
    // detached bitmap). Cosmetic seam beats a thrown renderer.
    return tex;
  }
  // ⭐ S193 V26 — the race grade, baked once with the hole (see `ZONE_GRADE`): a hue wash in `color`
  // mode (luminance kept, palette pulled to the race), then a soft-light lift for contrast.
  if (grade !== null) {
    const gr = ZONE_GRADE[grade];
    ctx.globalCompositeOperation = 'color';
    ctx.globalAlpha = gr.hueAlpha;
    ctx.fillStyle = hex(gr.hue);
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = gr.lightAlpha;
    ctx.fillStyle = hex(gr.light);
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
  if (intersects) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    // ⛔ canon §7c — a 2D-canvas path, not Pixi, but the same habit: the arc starts its own subpath.
    ctx.moveTo(cx + rad, cy);
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  return Texture.from(canvas);
}

/**
 * ⭐ S193 V26 — the board VIGNETTE texture: a radial ramp, transparent over the middle 55 % and
 * darkening to the corners. Generated once from a canvas gradient — no asset. `null` without a DOM.
 */
function vignetteTexture(): Texture | null {
  if (typeof document === 'undefined') return null;
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  const grad = ctx.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s * 0.72);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  return Texture.from(canvas);
}

/**
 * ⭐ S193 V12 (`S192_VISUALS_PLAN.md`) — **SCORCHED GROUND / SCORCHED EARTH, BURNING.** The ember tint
 * stays; this adds drifting embers and smouldering patches over every burning zone (the quarry spared,
 * as the burn spares it) and small flames on every enemy creature the burn is ticking on. Everything
 * is derived from the burn's own lists (`burningZonesNow`, `isCreatureBurning`) and `world.tick`;
 * the seed is the zone and the spared seat, so two screens light the same embers.
 *
 * Fog: the embers are terrain (which ground burns is as public as the red tint already makes it) but
 * they sit on the fx layer under the fog's mask like every other effect; a burning creature's flames
 * are drawn only where the creature itself is (`isConcealed`, the rule its renderer obeys).
 */
export function drawScorchFx(world: World, burning: ReadonlyArray<{ spared: PlayerId; zone: number }>): void {
  const top = fxTop();
  const ground = fxGround();
  const quarry = { cx: SPAWNER_CENTER_X, cy: SPAWNER_CENTER_Y, r: SPAWNER_RADIUS + 6 };
  for (let i = 0; i < burning.length; i++) {
    const b = burning[i]!;
    const r = zoneRect(b.zone, world.layout);
    scorchZoneFx(top, ground, r.x, r.y, r.w, r.h, world.tick, fxSeed(b.zone * 8 + (b.spared as unknown as number), 0x5c0 + i), quarry);
  }
  // ⭐ S193 audit — every burning unit (creatures, and HELGA: *"Helga is NOT immune"*, `burnHelgas`), then
  // capped at BURN_FLICKER_MAX_UNITS by a total order (creatures before Helgas, each by id).
  const units: Array<{ x: number; y: number; id: number; scale: number }> = [];
  for (const c of world.creatures.values()) {
    if (!isCreatureBurning(world, c, burning)) continue;
    if (isConcealed(c.pos.x, c.pos.y, c.ownerPlayerId)) continue;
    units.push({ x: c.pos.x, y: c.pos.y, id: c.id as number, scale: creatureSpriteScaleMul(c.type) });
  }
  if (units.length > BURN_FLICKER_MAX_UNITS) units.sort((a, b) => a.id - b.id);
  for (const d of world.defenders.values()) {
    if (units.length >= BURN_FLICKER_MAX_UNITS) break;
    if (!isHelgaBurning(world, d, burning)) continue;
    if (isConcealed(d.pos.x, d.pos.y, d.ownerPlayerId)) continue;
    units.push({ x: d.pos.x, y: d.pos.y, id: 0x40000000 + (d.id as unknown as number), scale: HELGA_FLAME_SCALE });
  }
  const n = Math.min(units.length, BURN_FLICKER_MAX_UNITS);
  for (let i = 0; i < n; i++) {
    const u = units[i]!;
    burnFlickerFx(top, u.x, u.y, world.tick, u.id, u.scale);
  }
}

/** ⭐ S193 audit — Helga's flames are drawn a little larger: she is a bigger figure than a goblin. ⚠ MINE. */
export const HELGA_FLAME_SCALE = 1.4;

/**
 * ⭐ S193 audit (LOW) — PURE: is this defender a burning HELGA? `burnHelgas`' own gates: a LIVE unit-class
 * defender (`ehp > 0`, not DORMANT — a tower carries `null`), in a burning zone, not spared (`isScorchImmune`).
 */
export function isHelgaBurning(
  world: Pick<World, 'layout'>,
  d: { readonly pos: { x: number; y: number }; readonly ownerPlayerId: PlayerId; readonly ehp: number | null; readonly state: string },
  burning: ReadonlyArray<{ spared: PlayerId; zone: number }>,
): boolean {
  if (d.ehp === null || d.ehp <= 0 || d.state === 'DORMANT' || burning.length === 0) return false;
  const z = zoneOf(d.pos, world.layout);
  if (z === null) return false;
  for (const b of burning) if (b.zone === z && !isScorchImmune(d.ownerPlayerId, b.spared)) return true;
  return false;
}

export class ZoneBackgroundRenderer {
  private readonly layer: Container;
  private readonly sprites: Map<number, Sprite> = new Map();
  private readonly textures: Map<string, Texture> = new Map();
  /**
   * The backdrop sprites live one level down so the portal mask can apply to THEM ALONE.
   *
   * ⛔ Masking `this.layer` directly would work today and break on the next thing added to it: the
   * mask would silently apply to that too. One container, one job.
   */
  private readonly spriteHost: Container;
  /**
   * Hole-punched backdrops, keyed `url|layout|zone`.
   *
   * ⛔ THE KEY NEEDS ALL THREE. The same race art is holed DIFFERENTLY per zone (the disc lands in
   * a different corner) and per layout (the zone rect changes shape), so keying on the url alone
   * would hand seat 2 the hole punched for seat 0.
   */
  private readonly baked: Map<string, Texture> = new Map();
  private readonly loadStarted: Set<string> = new Set();
  private enabled = true;
  /** ⭐ S193 V26 — the board vignette (one sprite, above the backdrops, inside this layer only). */
  private vignette: Sprite | null = null;
  private vignetteTried = false;

  constructor(app: Application, parent: Container = app.stage) {
    this.layer = new Container();
    /*
     * ⛔⛔ **SUPERSEDED BY S170 P1 — THIS RENDERER NOW LIVES ON `groundLayer`, AT THE BOTTOM OF THE
     * STAGE, AND THAT IS CORRECT.** The history below is kept because it is the reason the obvious
     * placement was rejected twice, and because the resolution is not "the old note was wrong" — it
     * is that the MECHANISM changed underneath it.
     *
     * The old note said: at index 0 of `aboveFogLayer`, never of the stage, because
     * `fogRenderer` painted unexplored ground in opaque `FOG_COLOR` from ABOVE the board layers, so a
     * stage-bottom backdrop was drawn and then painted over — black in every multiplayer match and
     * visible only on the TITLE screen. That was true of a fog that was a SHEET.
     *
     * ⭐ S170 made the fog an INVERSE MASK on the concealable layer instead (see
     * `fogRenderer.attachTo`), so it no longer paints the ground at all — it hides OBJECTS. With
     * nothing painting over the board, stage-bottom becomes the right home, and it is the only
     * placement that also stops this 0.55-alpha image compositing over the shapes (the owner's S166
     * and S169 reports). The backdrop is now painted over by nothing and paints over nothing.
     *
     * ⭐ ABOVE THE FOG IS ALSO THE CORRECT ANSWER, not merely the one that shows. Which race owns
     * which quarter is already public — the castle art and the leaderboard both say so — and terrain
     * is static, so it reveals nothing about what an opponent is DOING. Fog exists to hide activity,
     * not geography.
     *
     * At index 0 of that layer so every structure, creature and effect on it still paints on top.
     */
    parent.addChildAt(this.layer, 0);

    /*
     * ⭐ NO `sortableChildren`, AND ITS ABSENCE IS THE POINT. The old code needed zIndex ordering
     * because the portal was PAINT that had to stay above sprites which arrive lazily in `sync`. A
     * mask is not in the paint order at all, so the ordering problem is gone rather than solved —
     * and with it the failure mode where a sprite loading late landed on top of the cut.
     */
    this.spriteHost = new Container();
    this.layer.addChild(this.spriteHost);

    /*
     * ⛔ NO MASK, AND NO GRAPHICS AT ALL ON THIS LAYER. The portal is baked into each texture by
     * `punchPortal`, so there is nothing here to pay for per frame and nothing opaque that could
     * ever sit above the sparks again. Both of this constant's past failures are foreclosed by the
     * same absence — see the `PORTAL_CUT_RADIUS` docblock.
     */
    void app;
  }

  /** Owner-facing toggle: `false` restores the plain black board. Display-only, never synced. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.layer.visible = on;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private ensureTexture(url: string): void {
    if (this.loadStarted.has(url)) return;
    this.loadStarted.add(url);
    void (async () => {
      try {
        this.textures.set(url, (await Assets.load(url)) as Texture);
      } catch {
        // Deliberately silent, and the failure mode is benign by design: with no texture the zone
        // simply stays the black board it has always been. A backdrop is the one thing in this
        // renderer stack whose absence costs the player nothing.
      }
    })();
  }

  sync(world: World): void {
    // ⭐ S193 V12 — the scorch's light is perk feedback, not backdrop art: it draws with backdrops off.
    const burning = world.gameState === 'PLAYING' ? burningZonesNow(world) : [];
    if (fxActive() && burning.length > 0) drawScorchFx(world, burning);
    if (!this.enabled) return;
    /*
     * ⛔ NOT ON THE TITLE SCREEN. Seat 0 exists before a match starts, so without this the menu got
     * half a Carpathian valley behind it — caught by looking at the running app, not by any test.
     * WIN and POSTGAME deliberately still draw: the ceremony happens on the board the match was
     * played on, and blanking it mid-ceremony would read as a bug.
     */
    if (world.gameState === 'TITLE') {
      this.layer.visible = false;
      return;
    }
    /*
     * ⛔ A BACKDROP MUST NEVER COMPETE WITH THE FIRST SECONDS OF A MATCH, AND CI PROVED THAT THE
     * HARD WAY. The first cut started `Assets.load` on the very first PLAYING frame. Locally
     * (Windows, real GPU) that is invisible. On the CI runner (headless Linux, software GL) the
     * decode-and-upload of a ~900 KB texture lands squarely in match boot, and
     * `e2e/hunter.spec.ts:68` — a SOLO gating test — began timing out on "a gatherer banks a shape
     * into the local castle" after 15 s.
     *
     * ⚠ THE EVIDENCE IS UNAMBIGUOUS AND IT IS WHY THIS IS NOT GUESSWORK: the E2E lane passed on
     * every commit up to and including ef944bd (the W1-C wiring) and failed on all three commits
     * after 8aff165 — every one of which carries this renderer — while `npm run e2e:gating`, the
     * identical command, stayed green locally on all of them.
     *
     * ⭐ So the load is HELD until the match has been running for a moment. This is the right shape
     * regardless of CI: gameplay owns the opening seconds, and a backdrop appearing a beat late is
     * unnoticeable, while a stalled first second is not. Until then the board is the black it has
     * always been.
     */
    if (world.tick < ZONE_BG_HOLD_TICKS) {
      this.layer.visible = false;
      return;
    }
    /*
     * ⛔ AND HOLDING THE LOAD WAS NOT ENOUGH — THE REAL COST WAS MEMORY, NOT TIMING.
     *
     * The hold above was the first fix and CI stayed red. The evidence in the next failing run was
     * far broader than a slow boot: `browserContext.close: Protocol error ... Failed to find
     * context`, a 30 s "PLAYING on host" timeout, and 10 s "sparks on joiner" timeouts in specs this
     * renderer never touches. That is not a stalled frame — it is the BROWSER CONTEXT DYING, and the
     * 2-browser harness runs two of them plus a dev server on one runner.
     *
     * ⭐ SO THE FIX WAS THE ART, NOT THE CODE. At full zone resolution a four-seat board decoded
     * 23.7 MB of backdrop texture; at HALF the rect it is 5.9 MB. The renderer cover-scales, so a
     * 480x270 image fills a 960x540 zone at 2x — invisible on a dark, low-contrast image drawn at
     * 0.55 alpha behind every sprite on the board. A backdrop is the one asset in this stack that
     * does not need 1:1 pixels, and paying 4x for pixels nobody can resolve is what broke the runner.
     */
    this.layer.visible = true;
    const layout = world.layout;
    // ⭐ S191 — the SCORCHED EARTH hover preview, read once per frame from this client's aim.
    const hoverSeat = scorchedEarthHoverSeat(world);

    for (const [playerId, player] of world.players) {
      const seat = playerId as unknown as number;
      const zone = zoneOwner(seat, layout);
      // ⚠ `null` is NOT dead code: a seat can own no ground on a given board (`zones.ts` says so in
      // as many words, and warns against "simplifying" it into a modulo).
      if (zone === null) continue;

      const race: RaceId = isRaceId(player.raceId) ? player.raceId : defaultRaceForSeat(seat);
      const url = zoneArtUrl(race, layout);
      this.ensureTexture(url);
      const raw = this.textures.get(url);
      if (raw === undefined) continue; // still loading — the black board shows meanwhile

      // ⛔ EVERY PATH BELOW USES THE HOLED TEXTURE. Handing `raw` to either branch is how the
      // backdrop grows back over the quarry, and it would look exactly like the S165 seam bug.
      // ⭐ S193 V26 — `|g` / `|n`: the graded bake (new effects on) or the original (`?fx=legacy`).
      const graded = fxActive();
      const bakeKey = `${url}|${layout}|${zone}|${graded ? 'g' : 'n'}`;
      let tex = this.baked.get(bakeKey);
      if (tex === undefined) {
        tex = punchPortal(raw, zone, layout, graded ? race : null);
        this.baked.set(bakeKey, tex);
      }

      let sp = this.sprites.get(zone);
      if (sp === undefined) {
        sp = new Sprite(tex);
        sp.alpha = ZONE_BG_ALPHA;
        this.spriteHost.addChild(sp);
        this.sprites.set(zone, sp);
      } else if (sp.texture !== tex) {
        // A seat can change race in the lobby, and a rematch can change the board.
        sp.texture = tex;
      }

      // S188 SCORCHED GROUND, derived each frame; S191 1a FIGHT-only; S191 1b a cast's zone + the preview.
      sp.tint = zoneTintFor(world, playerId, hoverSeat);
      // ⭐ S193 V12 — the heat shimmer, on exactly the zones the burn is ticking in. ⭐ S194: it is
      // `fxRuntime`'s haze now (one module owns every ground distortion; HIGH-only and the legacy switch
      // are enforced THERE, and a zone not asked this frame loses its filter at `fxEndFrame`).
      if (burning.some((b) => b.zone === zone)) fxHaze().haze(sp, world.tick);
      const r = zoneRect(zone, layout);
      /*
       * COVER, not stretch. The generated aspect never matches the zone exactly — 3:4 is the
       * nearest portrait the generator offers to the true 8:9 — so fitting would letterbox and
       * stretching would distort a horizon. Scale by the LARGER ratio and let the overflow clip.
       */
      const scale = Math.max(r.w / tex.width, r.h / tex.height);
      sp.width = tex.width * scale;
      sp.height = tex.height * scale;
      sp.x = r.x + (r.w - sp.width) / 2;
      sp.y = r.y + (r.h - sp.height) / 2;
    }

    // Drop any zone that no longer has an owner (a seat left, or the board shrank on rematch).
    for (const [zone, sp] of [...this.sprites]) {
      const stillOwned = [...world.players.keys()].some(
        (pid) => zoneOwner(pid as unknown as number, layout) === zone,
      );
      if (!stillOwned) {
        sp.destroy();
        this.sprites.delete(zone);
      }
    }
    this.syncVignette();
  }

  /** ⭐ S193 V26 — the vignette: on with the new effects, off under `?fx=legacy`. Above the backdrops. */
  private syncVignette(): void {
    if (!this.vignetteTried) {
      this.vignetteTried = true;
      const tex = vignetteTexture();
      if (tex !== null) {
        this.vignette = new Sprite(tex);
        this.vignette.eventMode = 'none';
        this.vignette.width = CANVAS_WIDTH;
        this.vignette.height = CANVAS_HEIGHT;
        this.vignette.alpha = ZONE_VIGNETTE_ALPHA;
        this.layer.addChild(this.vignette); // after `spriteHost`: over the art, under every gameplay layer
      }
    }
    if (this.vignette !== null) this.vignette.visible = fxActive();
  }

}
