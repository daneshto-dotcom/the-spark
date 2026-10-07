/**
 * SPARK — placed primitives + bonds + carry/connect overlay.
 * Spec § 10.7 LOCKED:
 *   - One Graphics for ALL bonds (clear/redraw on bond commit/sever — but
 *     bonds drift each substep, so we redraw per frame; cheap given <100
 *     bonds Phase 1).
 *     ⚠ S195 N17 — that last clause stopped being true: a late board has ~500 connectors and the per-frame
 *     redraw was the biggest single cost on a joiner's frame. The per-frame redraw is now the HIGH tier only;
 *     LOW and MINIMAL draw from a bucketed cache that redraws only what changed (`drawBondsCached`).
 *   - Pixi v8 batches Sprites automatically — no per-primitive filter.
 *
 * Spec § VI.4 (v0.5.1): placed primitives render in their PLACER's player
 * color. Type identity is shape; ownership is color. Bond gradients now
 * blend player-colors of both endpoints (single-player Phase 1 = monochrome
 * bonds, looks identical, makes Phase 2 multi-color bonds free).
 *
 * Bonds are drawn first (under primitives), then placed-primitive sprites.
 *
 * S53 P2 — drawPreview removed (was the carry-then-aim RMB ConnectDrag
 * preview line + target highlight + spawner-zone no-build glyph). Post-
 * S52 P1 atomic LMB-up there is no Carrying state, so the ConnectDrag
 * preview had no input to render. Removed alongside the controls.ts
 * ConnectDrag state variant + handler branches.
 */

import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { comboView } from './comboView.ts';
import {
  POOP_FOUL_TINT,
  POOP_FOUL_TINT_STRENGTH,
  STRAIN_BREAK_BY_TIER,
  type StiffnessTier,
} from '../constants.ts';
import type { Primitive } from '../game/primitive.ts';
import type { World } from '../state/world.ts';
import type { PrimitiveId } from '../types.ts';
import { drawBondVisual } from './bondVisualRenderer.ts';
import { isConcealed } from './concealment.ts';
import { TOWER_COVER_DRAW_EPSILON, coverAlphaForBond, coverAlphaForPrim, pruneTowerCover } from './towerCover.ts';

/*
 * ⛔⛔ S183 (owner) — **`DAMAGED_BOND_MIN_ALPHA` IS RETIRED IN PLACE. A COVERED CONNECTOR STAYS
 * HIDDEN THROUGH EVERY DAMAGE STATE.**
 *
 * It was 0.85: the instant `damageFifths` went non-zero, a connector under a standing tower was
 * pinned back to legible. That was S175 P9, and it was HIS ruling too — *"I wanna see damage on
 * connectors … you gotta see damage everywhere"* — because in S175 a hidden connector being chewed
 * had nothing on screen to show for it at all.
 *
 * He corrected it in S183, having played it:
 *
 * > *"It does not come back when the building starts dying so you can still repair it. No —
 * > because you can see the tower is damaged. You can just click the tower and repair it. You
 * > don't have to see the connectors. The connectors come back when the tower is being destroyed,
 * > like when it hits zero health and you can see it crumble and fall."*
 *
 * ⭐ **THE TWO RULINGS ONLY LOOK OPPOSED, AND WHAT RESOLVED THEM IS THE DAMAGE RAMP.** S182 gave
 * the lightning hub 24 frames of real damage art and S183 gave four more towers theirs, so the
 * signal S175 P9 was standing in for now lives on the BUILDING. Damage is still visible
 * everywhere; it is just visible on the thing that is taking it.
 *
 * ⚠ **AND THE PIN ONLY EVER DID ANYTHING UNDER A TOWER**, which is why retiring it is narrow
 * rather than sweeping: `coverAlphaForBond` returns 1 for any connector no sprite is standing on,
 * and `Math.max(1, 0.85)` is 1. A loose lattice, a half-built structure and every non-tower bond
 * in the game drew identically before and after this line was deleted.
 */
import { makeShapeTextures, destroyShapeTextures, type ShapeTextures } from './shapes.ts';
import { BOND_CACHE_KNOBS, graphicsTier, type BondCacheKnobs } from './graphicsTier.ts';

const PLACED_PRIMITIVE_SCALE = 1.0;

export class StructureRenderer {
  private readonly bondGraphics: Graphics;
  private readonly primitiveLayer: Container;
  // S48 P5 (Sym B fix) — carryHalo REMOVED. Live S47 smoke: user reported
  // an undesired colored ring appearing around the carried spark on the
  // joiner side. drawCarryHalo iterated ALL Carrying players + drew a 2px
  // colored ring; joiner's client-prediction of PICKUP_SPARK (S46 C13)
  // diverged from host (Sym A rejects) → joiner saw the halo, host didn't.
  // User-preferred resolution per S47 directive ("i just want everything
  // to work properly"): remove halo entirely. Carry state is still
  // communicated by the spark-following-cursor motion + the avatar pulse
  // boost from S45 C10 (avatarRenderer.ts:72,114).
  //
  // S53 P2 — previewGraphics REMOVED. Was the RMB ConnectDrag preview line
  // (carry-then-aim mode); ConnectDrag is unreachable post-S52 P1 atomic
  // LMB-up, so the preview Graphics had no input to render.
  private readonly spriteByPrim: Map<PrimitiveId, Sprite> = new Map();
  private readonly textures: ShapeTextures;
  /*
   * S195 N17 — the LOW/MINIMAL connector cache. ⚠ It lives INSIDE `primitiveLayer`, as its first child,
   * and that placement is load-bearing: `e2e/fog.spec.ts` roll-calls `fogHiddenLayer`'s children by type
   * and index (index 1 must stay the `_Graphics` connectors), so the cache may not add a stage child. As the
   * bottom child of the shapes layer it still draws above `bondGraphics` and under every shape — the same
   * z-order the connectors always had.
   */
  private readonly bondCacheLayer: Container;
  private readonly bondBuckets = new Map<number, BondBucket>();
  private readonly cacheScratch = new Map<number, { draws: BondDraw[]; hash: number; shape: number }>();
  /** S196 — buckets whose only change this frame is motion, waiting on the MINIMAL budget (reused, no per-frame alloc). */
  private readonly motionQueue: Array<{ key: number; bucket: BondBucket; draws: BondDraw[]; hash: number; shape: number }> = [];
  private cacheFrame = 0;
  /** S196 — the knobs the cache last drew with: a tier switch redraws everything at once, never on a budget. */
  private lastKnobs: BondCacheKnobs | null = null;
  private bucketRedraws = 0;

  /*
   * ⭐⭐ S170 P1 (owner) — `parent` DEFAULTS TO `app.stage`, AND THE DEFAULT IS THE OLD BUG.
   *
   * Owner, on what the fog is for: *"Fog is just what hides. You have the buildings, the enemy
   * sparks, the connectors that are being built, the unbuilt buildings, the freeform buildings, the
   * spawn."* And on how it broke: *"once we started putting towers, like, real buildings that we've
   * generated, that's when they started being visible. Like, everything else was hidden."*
   *
   * That is the whole history of this defect. A renderer that attaches itself to `app.stage` lands
   * ABOVE or BELOW the fog purely by WHEN it was constructed, so every new art renderer arrived
   * visible-through-the-fog by accident. Taking the parent as an argument is what makes concealment
   * a DECISION at the call site instead of a side effect of construction order.
   */
  constructor(app: Application, parent: Container = app.stage) {
    this.textures = makeShapeTextures(app);

    this.bondGraphics = new Graphics();
    this.primitiveLayer = new Container();
    this.bondCacheLayer = new Container();
    this.bondCacheLayer.label = 'bondCache';
    this.bondCacheLayer.visible = false;
    this.primitiveLayer.addChild(this.bondCacheLayer);

    parent.addChild(this.bondGraphics);
    parent.addChild(this.primitiveLayer);
  }

  // S53 P2 — sync no longer takes controls param. The drawPreview consumer
  // of controls.state was the only reason the param existed; now removed.
  sync(world: World): void {
    this.syncPrimitives(world);
    this.drawBonds(world);
    // S48 P5 (Sym B fix) — drawCarryHalo call removed; see field comment.
    // S53 P2 — drawPreview call removed; see field comment.
  }

  private syncPrimitives(world: World): void {
    const seen = new Set<PrimitiveId>();
    for (const prim of world.primitives.values()) {
      /*
       * ⭐⭐ S170 (owner) — **FOG: AN ENEMY'S SHAPES ARE NOT DRAWN UNLESS THEY ARE IN LIVE VISION.**
       *
       * This renderer is the one the owner photographed: *"I can see the enemy sparks actively
       * building and their connectors while they are being placed!!!"* Three previous attempts tried
       * to hide it by compositing (a backdrop above/below an opaque sheet, then an inverse mask) and
       * all three concealed nothing. C&C simply does not render it. So neither do we.
       *
       * ⚠ SKIPPED BEFORE `seen.add`, WHICH IS LOAD-BEARING. The cleanup pass below destroys any
       * sprite whose id is absent from `seen`, so continuing here also REAPS the sprite — a shape
       * that leaves vision disappears rather than freezing in place. Adding to `seen` first and then
       * skipping would leave a stale sprite on the board forever, which is a worse bug than the one
       * being fixed.
       */
      if (isConcealed(prim.pos.x, prim.pos.y, prim.placedBy)) continue;
      seen.add(prim.id);
      // S79 P2 — a poop-FOULED primitive renders tinted toward the splat colour so the whole
      // building reads "pooped on, earning nothing, go wipe it". world.fouledPrimitives rides
      // NetSnapshot (S77), so the joiner sees the identical tint with no extra wire state.
      const tint = foulAwareTint(prim.ownerColor, world.fouledPrimitives.has(prim.id));
      let sprite = this.spriteByPrim.get(prim.id);
      if (sprite === undefined) {
        sprite = new Sprite(this.textures[prim.type]);
        sprite.anchor.set(0.5);
        // Player color = ownership. Spec § VI.4 v0.5.1.
        sprite.tint = tint;
        sprite.scale.set(PLACED_PRIMITIVE_SCALE);
        this.primitiveLayer.addChild(sprite);
        this.spriteByPrim.set(prim.id, sprite);
      } else {
        // ownerColor mutates on Phase-2 Steal disruption (and foul state toggles on
        // splat/clean) — keep tint synced.
        if (sprite.tint !== tint) sprite.tint = tint;
      }
      sprite.x = prim.pos.x;
      sprite.y = prim.pos.y;
      /*
       * ⭐⭐ S175 P6 (owner R169) — phase the shape out while a building stands on it.
       *
       * ⛔ AN ALPHA, NOT A `continue`, AND THE DIFFERENCE IS LOAD-BEARING. The concealment skip
       * twenty lines above deliberately jumps BEFORE `seen.add` so the cleanup pass destroys the
       * sprite. Copying that here would destroy and recreate the shape instead of fading it: it
       * would pop out at the start of the ramp and pop back in on reveal, which is the opposite of
       * the owner's *"phase them in and out of reality"*.
       */
      sprite.alpha = coverAlphaForPrim(prim.id);
    }
    pruneTowerCover(world);
    if (this.spriteByPrim.size > seen.size) {
      for (const [id, sprite] of this.spriteByPrim) {
        if (!seen.has(id)) {
          sprite.destroy();
          this.spriteByPrim.delete(id);
        }
      }
    }
  }

  private drawBonds(world: World): void {
    const knobs = BOND_CACHE_KNOBS[graphicsTier()];
    if (knobs === null) {
      // HIGH — every connector re-stroked every frame, exactly as before S195.
      if (this.bondCacheLayer.visible) this.clearBondCache();
      const g = this.bondGraphics;
      g.clear();
      forEachBondDraw(world, null, (d) => strokeBondDraw(g, d));
      return;
    }
    if (!this.bondCacheLayer.visible) {
      this.bondGraphics.clear();
      this.bondCacheLayer.visible = true;
    }
    this.drawBondsCached(world, knobs);
  }

  /*
   * ⭐⭐ S195 N17 — THE CONNECTOR CACHE (LOW / MINIMAL). Measured: on a built board the joiner's frame was this
   * renderer re-stroking all ~500 connectors every frame, and Pixi re-tessellating the result (profile, wave
   * 10, 4× throttle: `drawBonds` 16 % inclusive plus the tessellation inside Pixi's render). A settled
   * structure does not change between frames, so the strokes are kept and only REDRAWN WHEN THEY CHANGE.
   *
   * The board is split into `BOND_CACHE_CELL_PX` buckets by each connector's (snapped) midpoint; each bucket
   * is its own Graphics with a hash of everything that decides what it draws — both ends' snapped positions,
   * both colours (foul + stress tint included), the alpha (tower cover fade), the width, the silhouette, its
   * stepped animation clock, the stress pulse and the ownership pattern — and the bucket's connectors in
   * order. Same hash ⇒ the Graphics is left exactly as it was. A sever, a placement, damage stress, a cover
   * change, a foul, a steal or a fog change all change the hash of the bucket they touch, and only that one.
   * ⚠ A 32-bit hash can collide; the cost of a collision is one stale bucket until its next change.
   */
  private drawBondsCached(world: World, knobs: BondCacheKnobs): void {
    const cells = this.cacheScratch;
    for (const cell of cells.values()) { cell.draws.length = 0; cell.hash = FNV_OFFSET; cell.shape = FNV_OFFSET; }
    BOND_CACHE_STATS.frames++;
    const frame = ++this.cacheFrame;
    forEachBondDraw(world, knobs, (d) => {
      const key = Math.floor((d.ax + d.bx) / 2 / BOND_CACHE_CELL_PX) * 1024 + Math.floor((d.ay + d.by) / 2 / BOND_CACHE_CELL_PX);
      let cell = cells.get(key);
      if (cell === undefined) cells.set(key, (cell = { draws: [], hash: FNV_OFFSET, shape: FNV_OFFSET }));
      cell.draws.push(d);
      cell.hash = hashBondDraw(cell.hash, d);
      cell.shape = hashBondShape(cell.shape, d);
    });
    const queue = this.motionQueue;
    queue.length = 0;
    const budgeted = Number.isFinite(knobs.motionRedrawsPerFrame) && this.lastKnobs === knobs;
    this.lastKnobs = knobs;
    for (const [key, cell] of cells) {
      let bucket = this.bondBuckets.get(key);
      if (cell.draws.length === 0) {
        if (bucket !== undefined && bucket.hash !== FNV_OFFSET) { bucket.g.clear(); bucket.hash = FNV_OFFSET; bucket.shape = FNV_OFFSET; }
        continue;
      }
      if (bucket === undefined) {
        bucket = { g: new Graphics(), hash: FNV_OFFSET, shape: FNV_OFFSET, lastFrame: 0 };
        this.bondCacheLayer.addChild(bucket.g);
        this.bondBuckets.set(key, bucket);
      }
      BOND_CACHE_STATS.buckets++;
      if (bucket.hash === cell.hash) {
        // ⛔ S196 audit MED-1 — an identical DRAWING by different connectors (a swap at the same geometry) needs no
        // re-stroke, but the bucket must remember who it now holds, or its next motion is misfiled.
        bucket.shape = cell.shape;
        continue;
      }
      // ⭐ S196 — a change that is MOTION ONLY (same connectors, same silhouettes, same patterns) waits for the
      // MINIMAL budget below; anything structural is drawn this frame, exactly as before.
      if (budgeted && bucket.shape === cell.shape) {
        queue.push({ key, bucket, draws: cell.draws, hash: cell.hash, shape: cell.shape });
        continue;
      }
      this.restrokeBucket(bucket, cell.draws, cell.hash, cell.shape, frame);
    }
    if (queue.length === 0) return;
    // Stalest first, then by key: a total order, so no bucket can starve and two runs pick the same ones.
    if (queue.length > knobs.motionRedrawsPerFrame) {
      queue.sort((a, b) => (a.bucket.lastFrame - b.bucket.lastFrame) || (a.key - b.key));
      BOND_CACHE_STATS.deferred += queue.length - knobs.motionRedrawsPerFrame;
    }
    const n = Math.min(queue.length, knobs.motionRedrawsPerFrame);
    for (let i = 0; i < n; i++) {
      const q = queue[i]!;
      this.restrokeBucket(q.bucket, q.draws, q.hash, q.shape, frame);
    }
    queue.length = 0;
  }

  private restrokeBucket(bucket: BondBucket, draws: readonly BondDraw[], hash: number, shape: number, frame: number): void {
    bucket.g.clear();
    for (const d of draws) strokeBondDraw(bucket.g, d);
    bucket.hash = hash;
    bucket.shape = shape;
    bucket.lastFrame = frame;
    this.bucketRedraws++;
    BOND_CACHE_STATS.redraws++;
  }

  private clearBondCache(): void {
    for (const b of this.bondBuckets.values()) { b.g.clear(); b.hash = FNV_OFFSET; b.shape = FNV_OFFSET; }
    this.lastKnobs = null;
    this.bondCacheLayer.visible = false;
  }

  /** Test/probe seam: how many buckets were re-stroked since construction. */
  bondBucketRedraws(): number { return this.bucketRedraws; }

  // S53 P2 — drawPreview() DELETED. Was the RMB ConnectDrag preview line +
  // target highlight + spawner-zone no-build glyph. Post-S52 P1 atomic
  // LMB-up, the ConnectDrag ControlState variant is unreachable (no public
  // path enters player.kind='Carrying' state). Removed alongside the
  // drawNoBuildGlyph / drawTierGlyph / TIER_COLOR / isInsideSpawnerZone
  // helpers that ONLY drawPreview consumed.
  //
  // S48 P5 (Sym B fix) — private drawCarryHalo(world) DELETED earlier. See
  // field comment for rationale; carry state is communicated by other
  // visuals already (spark-cursor follow + avatar pulse boost).

  destroy(): void {
    this.bondGraphics.destroy();
    // S53 P2 — previewGraphics.destroy() removed (field removed).
    this.primitiveLayer.destroy({ children: true });
    destroyShapeTextures(this.textures);
    this.spriteByPrim.clear();
  }
}

// ===== S195 N17 — one walk over the connectors, shared by HIGH and the LOW/MINIMAL cache =====

/** Everything one connector draws. HIGH strokes it at once; the cache hashes it, then strokes it if needed. */
export interface BondDraw {
  readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number;
  readonly visualEffectId: string;
  readonly colorA: number; readonly colorB: number;
  readonly alpha: number; readonly width: number; readonly tick: number;
  /** The near-break red overlay's alpha, or -1 when the connector is not near breaking. */
  readonly pulseAlpha: number;
  readonly pattern: BondPatternKind;
  /**
   * ⛔ S196 audit MED-1 — WHICH connector this is: its id and both shape ids. Never drawn; folded ONLY into
   * `hashBondShape`, so a cell whose connector SET changes at an equal count and an equal look (a sever + a
   * same-look placement in one snapshot, a fog swap, a reused id) is STRUCTURAL and drawn on the next frame.
   */
  readonly bondId: number; readonly aId: number; readonly bId: number;
}

/** Measurement probe (read by `scripts/lag/joiner-replay.spec.ts` through a dev-server module import). */
export const BOND_CACHE_STATS = { frames: 0, buckets: 0, redraws: 0, deferred: 0 };

/** One cache bucket: its Graphics, the full hash it was drawn from, its STRUCTURAL hash, and when it was drawn. */
interface BondBucket { readonly g: Graphics; hash: number; shape: number; lastFrame: number }

/** ⚠ MINE — the cache bucket size: 15 × 9 buckets on the 1920 × 1080 board (192 px redrew ~40 connectors per change). */
export const BOND_CACHE_CELL_PX = 128;

const DEFAULT_BOND_FX = 'fx.bond.default';

/**
 * Walk the drawable connectors in `world.bonds` order and hand each one's draw to `emit`. With `knobs`
 * null (HIGH) the values are exactly what `drawBonds` computed before S195 — raw positions, the raw tick —
 * so HIGH strokes the identical geometry in the identical order. With knobs (LOW / MINIMAL) the positions
 * are snapped to `posQuantum` and the animation clock steps by `animStepTicks` (0 = frozen); every rule
 * that decides WHETHER and in WHAT COLOUR a connector draws (fog, tower cover, foul, stress, ownership
 * pattern) is the same single code path for every tier.
 */
export function forEachBondDraw(world: World, knobs: BondCacheKnobs | null, emit: (d: BondDraw) => void): void {
  const q = knobs === null ? 0 : knobs.posQuantum;
  const snap = (v: number): number => (q > 0 ? Math.round(v / q) * q : v);
  const tick = knobs === null
    ? world.tick
    : knobs.animStepTicks > 0 ? Math.floor(world.tick / knobs.animStepTicks) * knobs.animStepTicks : 0;
  const fouled = world.fouledPrimitives;
  // S85 P4b — per-owner bond patterning (the S82 CVD carry-forward:
  // "structure-ownership non-color cue"). Bonds are same-color by the S46 P3
  // segregation invariant, so a bond belongs entirely to ONE seat; overlay a
  // seat-keyed white pattern (rungs/beads/chevrons) so ownership reads
  // without the color channel. Networked-only — solo has one owner (same
  // gate as the S82 avatar nameplates). Color→seat is rebuilt per frame
  // (≤MAX_PLAYERS entries) and stays correct through rainbow shuffles
  // because player.color and placerColor remap in lockstep.
  const patterned = world.gameMode !== 'solo';
  const colorToSeat = patterned ? new Map<number, number>() : null;
  if (colorToSeat !== null) {
    for (const [pid, p] of world.players) colorToSeat.set(p.color, pid as number);
  }
  for (const bond of world.bonds.values()) {
    // Bond gradient = blend of two endpoints' player colors. The cast is safe: bond.a / bond.b are always
    // Primitives at runtime (the PhysicsBody type is a structural subset to keep the solver narrow).
    const a = bond.a as Primitive;
    const b = bond.b as Primitive;
    /*
     * ⭐ S170 (owner) — the CONNECTORS, named explicitly in his spec: *"I shouldn't see their
     * buildings, their sparks, their spawn, their connectors."*
     *
     * ⚠ A bond is hidden unless BOTH ends are visible. The stricter test is the right one: a
     * connector drawn from a visible shape to a concealed one would trace a line straight to
     * something the player is not allowed to see, which leaks the position it exists to hide.
     */
    if (isConcealed(a.pos.x, a.pos.y, a.placedBy) || isConcealed(b.pos.x, b.pos.y, b.placedBy)) continue;
    /*
     * ⭐⭐ S175 P6 — the connector's phase-out. Fully hidden means SKIP: this bond draws into a
     * shared Graphics and an alpha-0 stroke still costs the geometry.
     *
     * ⛔⛔ S183 — **DAMAGE NO LONGER UN-HIDES A CONNECTOR.** This read
     * `bond.damageFifths > 0 ? Math.max(coverAlphaForBond(bond.id), DAMAGED_BOND_MIN_ALPHA) : …`
     * from S175 P9 until S183. See the retirement note at the top of this file for both of the
     * owner's rulings and why the damage ramp is what let the later one replace the earlier.
     */
    const coverAlpha = coverAlphaForBond(bond.id);
    if (coverAlpha <= TOWER_COVER_DRAW_EPSILON) continue;
    const dx = b.pos.x - a.pos.x;
    const dy = b.pos.y - a.pos.y;
    const dist = Math.hypot(dx, dy);
    const ratio = dist / bond.restLength;
    const breakAt = STRAIN_BREAK_BY_TIER[bond.stiffnessTier];
    const stress = Math.max(0, Math.min(1, (ratio - 1) / (breakAt - 1)));
    // S17 P2 — Phase-2 §VI.4 / §X.2: source per-endpoint placerColor (immutable contribution record per
    // Council R1 Gemini #1 BLOCKER — NOT transient ownerColor which mutates on Steal). Stress tint applied
    // per-endpoint so the bond turns red as it approaches break threshold even when endpoint colors differ.
    // S79 P2 — a FOULED structure's bonds tint toward the splat colour first (either endpoint fouled =
    // whole component fouled by construction), then stress-red layers on top so near-break feedback
    // survives the foul.
    const isFouled = fouled.size > 0 && (fouled.has(bond.aId) || fouled.has(bond.bId));
    const baseA = foulAwareTint(a.placerColor, isFouled);
    const baseB = foulAwareTint(b.placerColor, isFouled);
    const stressedA = stress > 0.05 ? lerpTint(baseA, 0xff3030, stress * 0.85) : baseA;
    const stressedB = stress > 0.05 ? lerpTint(baseB, 0xff3030, stress * 0.85) : baseB;
    const width = stiffnessToWidth(bond.stiffnessTier) + (stress > 0.5 ? (stress - 0.5) * 2 : 0);
    // S7 P2: per-combo persistent silhouette. Direction is a→b matching the PLACE_PRIMITIVE dispatch order
    // (carried→target). The 22 functional combos resolve to fx.bond.default and render as a plain line; the
    // 14 magic combos render their named silhouette stretched between endpoints.
    // Red overlay pulse on near-break stress — drawn over the silhouette so it's still visible even on busy
    // combos (lattice, vortex, star).
    const pulseAlpha = stress > 0.7 ? (0.4 + 0.6 * ((stress - 0.7) / 0.3)) * coverAlpha : -1;
    /*
     * S85 P4b — ownership pattern overlay (see the header comment above).
     * ⚠ THE OWNERSHIP PATTERN IS SKIPPED RATHER THAN FADED. `drawOwnershipPattern` strokes
     * straight into the shared Graphics with its own alpha, so a phased-out connector would keep
     * a fully opaque dash pattern floating where it used to be — the S175 version of the three
     * separate draw calls this bond is made of not agreeing with each other.
     */
    const pattern: BondPatternKind = colorToSeat !== null && coverAlpha > TOWER_COVER_DRAW_EPSILON
      ? seatPatternKind(colorToSeat.get(a.placerColor))
      : 'none';
    emit({
      ax: snap(a.pos.x), ay: snap(a.pos.y), bx: snap(b.pos.x), by: snap(b.pos.y),
      visualEffectId: comboView(a.type, b.type).visualEffectId, // S196 — memoised, no per-frame string key
      colorA: stressedA, colorB: stressedB,
      alpha: 0.85 * coverAlpha, width, tick, pulseAlpha, pattern,
      bondId: bond.id as unknown as number, aId: bond.aId as unknown as number, bId: bond.bId as unknown as number,
    });
  }
}

/** Stroke one connector: the silhouette, then the near-break pulse, then the ownership pattern (pre-S195 order). */
export function strokeBondDraw(g: Graphics, d: BondDraw): void {
  drawBondVisual(g, {
    ax: d.ax, ay: d.ay, bx: d.bx, by: d.by,
    visualEffectId: d.visualEffectId,
    colorA: d.colorA, colorB: d.colorB,
    alpha: d.alpha, width: d.width, tick: d.tick,
  });
  if (d.pulseAlpha >= 0) {
    g.moveTo(d.ax, d.ay).lineTo(d.bx, d.by).stroke({ width: 1, color: 0xff8080, alpha: d.pulseAlpha });
  }
  drawOwnershipPattern(g, d.ax, d.ay, d.bx, d.by, d.pattern);
}

const FNV_OFFSET = 0x811c9dc5;
function mix(h: number, v: number): number {
  return Math.imul(h ^ (v | 0), 0x01000193) >>> 0;
}
const fxIdIndex = new Map<string, number>();
const PATTERN_INDEX: Record<BondPatternKind, number> = { none: 0, rungs: 1, beads: 2, chevrons: 3 };

/** Fold one connector's draw into a bucket hash. Positions are already snapped; ×8 keeps every quantum distinct. */
export function hashBondDraw(h: number, d: BondDraw): number {
  let fx = fxIdIndex.get(d.visualEffectId);
  if (fx === undefined) fxIdIndex.set(d.visualEffectId, (fx = fxIdIndex.size + 1));
  h = mix(h, Math.round(d.ax * 8));
  h = mix(h, Math.round(d.ay * 8));
  h = mix(h, Math.round(d.bx * 8));
  h = mix(h, Math.round(d.by * 8));
  h = mix(h, d.colorA);
  h = mix(h, d.colorB);
  h = mix(h, Math.round(d.alpha * 1000));
  h = mix(h, Math.round(d.width * 100));
  h = mix(h, fx);
  // The default line never reads the clock; only the animated silhouettes are keyed on it.
  h = mix(h, d.visualEffectId === DEFAULT_BOND_FX ? 0 : d.tick);
  h = mix(h, Math.round(d.pulseAlpha * 1000));
  h = mix(h, PATTERN_INDEX[d.pattern]);
  return h;
}

/**
 * ⭐ S196 — the STRUCTURAL part of a bucket's hash: WHICH connectors it holds (each one's bond id and both
 * shape ids, in walk order), each one's silhouette and its ownership pattern. Positions, stress tint/width,
 * cover alpha, foul tint and the clock are deliberately absent — those are the MOTION a MINIMAL budget may defer.
 *
 * ⛔ S196 audit MED-1 — the first version folded only the LOOK (silhouette + pattern) and the count, and claimed
 * a sever, a placement or a fog change always moved the count. Not so: a sever plus a same-look placement in one
 * snapshot, a fog SWAP (one enemy connector hidden, another revealed in the same cell — the hidden one stayed
 * drawn: a leak) or a reused id kept count and look equal, and waited up to ~25 frames on the motion budget.
 * Identity is what makes "structure is never deferred" true.
 */
export function hashBondShape(h: number, d: BondDraw): number {
  let fx = fxIdIndex.get(d.visualEffectId);
  if (fx === undefined) fxIdIndex.set(d.visualEffectId, (fx = fxIdIndex.size + 1));
  h = mix(h, d.bondId);
  h = mix(h, d.aId);
  h = mix(h, d.bId);
  h = mix(h, fx);
  return mix(h, PATTERN_INDEX[d.pattern]);
}

// S53 P2 — isInsideSpawnerZone(x, y) helper REMOVED (only consumed by
// drawPreview's no-build-zone check).

function stiffnessToWidth(tier: StiffnessTier): number {
  return tier === 'HIGH' ? 3 : tier === 'MID' ? 2 : 1.5;
}

// S17 P2: mixTints (single-color mid-blend of endpoint ownerColors) removed;
// drawBondVisual now consumes per-endpoint colorA + colorB and produces the
// gradient via stroke-decomposition (Council R1 Grok #6 + Gemini #5). The
// stress-tint path still uses lerpTint below — applied to each endpoint's
// placerColor separately.

/**
 * S79 P2 — pooped-building tint. Pure + exported for unit tests: a fouled element's colour
 * lerps toward POOP_FOUL_TINT (the splat's green-brown core) by POOP_FOUL_TINT_STRENGTH;
 * an un-fouled element keeps its base colour bit-exactly.
 */
export function foulAwareTint(baseColor: number, isFouled: boolean): number {
  return isFouled ? lerpTint(baseColor, POOP_FOUL_TINT, POOP_FOUL_TINT_STRENGTH) : baseColor;
}

// ===== S85 P4b — per-owner bond patterning (CVD structure-ownership cue) =====

export type BondPatternKind = 'none' | 'rungs' | 'beads' | 'chevrons';

const PATTERN_SPACING = 28;
/** Keep marks clear of the endpoint primitives' sprites. */
const PATTERN_END_CLEARANCE = 12;
const PATTERN_COLOR = 0xffffff;
const PATTERN_ALPHA = 0.45;
const RUNG_HALF = 4;
const BEAD_RADIUS = 1.7;
const CHEVRON_ARM = 4.5;

/**
 * Seat → pattern vocabulary. Seat 0 is the solid baseline (no overlay) so the
 * pattern count stays at "one cue per ADDITIONAL seat"; seats beyond 3 cycle.
 * Pure + exported for unit tests.
 */
export function seatPatternKind(seat: number | undefined): BondPatternKind {
  if (seat === undefined || seat === 0) return 'none';
  const idx = (seat - 1) % 3;
  return idx === 0 ? 'rungs' : idx === 1 ? 'beads' : 'chevrons';
}

export interface PatternMark {
  readonly x: number;
  readonly y: number;
  /** Unit vector ALONG the bond (a→b). */
  readonly ux: number;
  readonly uy: number;
}

/**
 * Evenly spaced mark anchors along the bond, clear of both endpoints. Pure +
 * exported for unit tests (spacing, clearance, unit-vector contract). Returns
 * [] for degenerate/short bonds — a bond too short for one mark stays solid.
 */
export function bondPatternMarks(ax: number, ay: number, bx: number, by: number): PatternMark[] {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const usable = dist - 2 * PATTERN_END_CLEARANCE;
  if (usable < PATTERN_SPACING * 0.5) return [];
  const ux = dx / dist;
  const uy = dy / dist;
  const count = Math.max(1, Math.floor(usable / PATTERN_SPACING));
  const step = usable / (count + 1);
  const marks: PatternMark[] = [];
  for (let i = 1; i <= count; i++) {
    const d = PATTERN_END_CLEARANCE + step * i;
    marks.push({ x: ax + ux * d, y: ay + uy * d, ux, uy });
  }
  return marks;
}

/** Stroke the seat pattern over an already-drawn bond visual. */
function drawOwnershipPattern(
  g: Graphics,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  kind: BondPatternKind,
): void {
  if (kind === 'none') return;
  for (const m of bondPatternMarks(ax, ay, bx, by)) {
    const nx = -m.uy; // perpendicular
    const ny = m.ux;
    if (kind === 'rungs') {
      g.moveTo(m.x - nx * RUNG_HALF, m.y - ny * RUNG_HALF)
        .lineTo(m.x + nx * RUNG_HALF, m.y + ny * RUNG_HALF)
        .stroke({ width: 1.5, color: PATTERN_COLOR, alpha: PATTERN_ALPHA });
    } else if (kind === 'beads') {
      g.circle(m.x, m.y, BEAD_RADIUS).fill({ color: PATTERN_COLOR, alpha: PATTERN_ALPHA });
    } else {
      // chevron: a V opening along the bond direction.
      const tipX = m.x + m.ux * CHEVRON_ARM * 0.6;
      const tipY = m.y + m.uy * CHEVRON_ARM * 0.6;
      const baseX = m.x - m.ux * CHEVRON_ARM * 0.6;
      const baseY = m.y - m.uy * CHEVRON_ARM * 0.6;
      g.moveTo(baseX + nx * CHEVRON_ARM, baseY + ny * CHEVRON_ARM)
        .lineTo(tipX, tipY)
        .lineTo(baseX - nx * CHEVRON_ARM, baseY - ny * CHEVRON_ARM)
        .stroke({ width: 1.5, color: PATTERN_COLOR, alpha: PATTERN_ALPHA });
    }
  }
}

function lerpTint(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const gc = Math.round(ag + (bg - ag) * t);
  const bc = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (gc << 8) | bc;
}

// S53 P2 — TIER_COLOR, drawTierGlyph, drawNoBuildGlyph helpers REMOVED.
// Only consumers were drawPreview's RMB ConnectDrag aim indicator (target
// highlight + tier-glyph bars + spawner-zone slash-circle). All three
// dead alongside the rest of the ConnectDrag path.
