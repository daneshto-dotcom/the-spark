/**
 * SPARK — S100 P1 (TD Phase 1a) chewer renderer.
 *
 * The persistent tower-defense swarm creature, drawn as an ORIGINAL child's-
 * pencil sketch: a round goofy graphite body, many little scuttling legs, two
 * oversized comedic chompers, and a rough WOBBLY outline that re-jitters every
 * frame so it reads as hand-drawn-with-a-pencil (NOT a copied franchise design,
 * NOT a static looping image). Higher-fidelity + more characterful than the
 * Voltkin sprite (which keeps using `creatureRenderer`).
 *
 * One shared `Graphics`, cleared + redrawn each frame from `world.creatures`,
 * filtered to `type === 'chewer'` (mirrors SeagullRenderer / HunterRenderer /
 * BombRenderer — a per-entity sprite Map would be overkill, and one Graphics is
 * the bundle-budget-friendly path). Voltkin + chewers share the SAME
 * `world.creatures` map, partitioned by `creature.type`, so this never forks a
 * parallel entity list.
 *
 * ── ALIVE THROUGH REAL MOTION (the brief) ──
 * The amusing hop is driven by the creature's REAL physics motion, not a fixed
 * loop. Each frame we estimate the chewer's per-frame velocity from its own
 * last-seen position (the same estimator creatureRenderer uses, because wire
 * `prevPos` is dead on the 10 Hz client mirror) and accumulate distance
 * travelled into a per-chewer hop PHASE. A moving chewer hops briskly; a
 * stationary chewer (idle / mid-chew) only idle-breathes. From the phase we
 * derive:
 *   - a vertical ARC offset (it leaps off the board and lands),
 *   - SQUASH-and-STRETCH (wide+short on landing, tall+thin at apex),
 *   - a little leg-scuttle + body lean,
 * and it FACES its movement/target direction via `atan2` (mirror-flip on the
 * sign of vx, like the seagull/hunter facing pattern).
 *
 * RENDER-ONLY. This module reads `world` but never mutates it, and it is the
 * one creature path explicitly cleared to use `performance.now()` for purely
 * cosmetic per-frame outline jitter + leg wiggle (the design says render-only
 * code MAY use wall-clock for cosmetics; the HOP itself is keyed off the
 * tick-deterministic sim motion, so two clients agree on where the chewer is —
 * only the graphite "sketchiness" differs frame-to-frame, which is invisible
 * as desync). Runs on host AND client (the client sees chewers via the
 * additive-optional creatures[] NetSnapshot field; it never simulates).
 */

import { Application, Container, Graphics } from 'pixi.js';
import { CHEW_INTERVAL_TICKS } from '../constants.ts';
import { CREATURE_DESPAWNING_TICKS, CREATURE_FADE_TICKS } from '../state/creatures/creature.ts';
import type { CreatureState } from '../state/creatures/creature.ts';
import type { World } from '../state/world.ts';
import type { CreatureId } from '../types.ts';
import { playSplatSFX, playGnawSFX } from './audioManager.ts';

// ── palette: graphite + paper, like a kid's pencil drawing ──
const GRAPHITE = 0x2e2f36; // main outline / lead
const GRAPHITE_SOFT = 0x4a4c55; // softer 2B shading
const PAPER_FILL = 0xe9e7df; // off-white paper showing through the body
const TOOTH_COLOR = 0xf6f4ec; // bright ivory chompers
const EYE_COLOR = 0x1a1320; // near-black pupil
const SHADOW_COLOR = 0x000000; // ground shadow under the hop

// ── S102 #1 — green-goo splat (a chewer being popped by a raid/potato) ──
const GOO_CORE = 0x8fd14a; // bright slime green
const GOO_DARK = 0x3f7a1f; // dark green centre/rim
const GOO_DURATION_SEC = 0.55; // splat lifetime (expand + fade)
const GOO_DROPLETS = 7; // radial flung droplets

/** Base body radius in px (the goofy round body). */
const BODY_R = 17;
/** Peak height of the hop arc (px the body lifts off the ground at apex). */
const HOP_HEIGHT = 16;
/** Number of little scuttling legs down each side. */
const LEGS_PER_SIDE = 4;
/** px of board distance that advances the hop phase by one full hop. */
const HOP_DISTANCE_PER_CYCLE = 46;
/** Idle "breathing" hops per second when the chewer is standing still / chewing. */
const IDLE_HOP_HZ = 0.85;
/** A >this px/frame jump is a teleport (snapshot restore), not motion — ignore. */
const TELEPORT_PX = 200;
/** Min |vx| (px/frame) to flip facing — below this, hold prior facing (anti-jitter). */
const FACING_VX_THRESHOLD = 0.6;
/** S104 P1 — max NEW chewing gnaws started per frame. Caps the swarm's audio so 12 chewers all
 *  ATTACKING don't become a wall of raspy static (Council M4); nearest-first, low volume. */
const MAX_GNAW_VOICES = 3;

/** Two-π convenience. */
const TAU = Math.PI * 2;

export class ChewerRenderer {
  private readonly graphics: Graphics;
  /** Render-side last-seen position per chewer (per-frame velocity estimator). */
  private readonly lastSeenPos: Map<CreatureId, { x: number; y: number }> = new Map();
  /** Accumulated hop phase per chewer (0..1 wraps = one hop). Render-only. */
  private readonly hopPhase: Map<CreatureId, number> = new Map();
  /** Last horizontal facing per chewer (+1 right, -1 left). Anti-jitter hold. */
  private readonly facing: Map<CreatureId, 1 | -1> = new Map();
  /** S104 P1 — last-seen FSM state per chewer. The death-watcher reads it to tell a KILL (vanished
   *  from a LIVE state — raid/potato/laser/slap hard-deleted it) from a natural lifetime despawn
   *  (which now passes through DESPAWNING — fade, NOT green-goo splat). Mirrors creatureRenderer. */
  private readonly lastSeenState: Map<CreatureId, CreatureState> = new Map();
  /** S104 P1 — last CHEW_INTERVAL bucket (floor(ticksInState / CHEW_INTERVAL_TICKS)) per chewer, for
   *  the render-driven gnaw. Keyed on the WIRED state+ticksInState (chewProgress is stripped from the
   *  client mirror), so the gnaw fires on host AND the 1v1 joiner as each bite lands. */
  private readonly lastChewBucket: Map<CreatureId, number> = new Map();
  /** S102 #1 — active green-goo splats (a chewer that vanished = was killed). Render-only;
   *  outlives the chewer that spawned it, so it is drawn unconditionally each frame + culled
   *  by wall-clock age. */
  private readonly gooSplats: Array<{ x: number; y: number; bornSec: number; seed: number }> = [];
  /** Wall-clock seconds of the previous frame (idle-hop advance + jitter clock). */
  private prevNowSec = -1;

  // S100 P1 — `parent` defaults to app.stage but main.ts passes aboveFogLayer so
  // chewers (cross-player reach — they chew ANY enemy's connectors) render THROUGH
  // the fog to all players, exactly like the Voltkin/hunter/seagull rule.
  constructor(app: Application, parent: Container = app.stage) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
  }

  /** Clear + redraw every chewer from world.creatures. Cheap no-op when none. */
  sync(world: World): void {
    const g = this.graphics;
    g.clear();

    const nowSec = performance.now() / 1000;
    const dtSec = this.prevNowSec < 0 ? 0 : Math.max(0, nowSec - this.prevNowSec);
    this.prevNowSec = nowSec;

    const liveIds = new Set<CreatureId>();
    // S104 P1 — per-frame gnaw budget (Council M4 voice cap): at most MAX_GNAW_VOICES new
    // chewing rasps start per frame so a full swarm doesn't clip into raspy static.
    let gnawsThisFrame = 0;

    for (const c of world.creatures.values()) {
      if (c.type !== 'chewer') continue;
      liveIds.add(c.id);
      this.lastSeenState.set(c.id, c.state);

      // ── S104 P1: render-driven CHEWING gnaw (host + 1v1 client). Keyed on the WIRED
      // state + ticksInState (chewProgress is stripped from the client mirror, so we must
      // NOT use it, and NEVER use performance.now as the cadence — host/client frame-rate
      // would diverge and it'd play while backgrounded). A bite lands each CHEW_INTERVAL_TICKS;
      // fire one rasp when the bucket increments while ATTACKING (≈ CHEW_HITS bites/bond at 1/s).
      const bucket = c.state === 'ATTACKING' ? Math.floor(c.ticksInState / CHEW_INTERVAL_TICKS) : -1;
      const prevBucket = this.lastChewBucket.get(c.id) ?? -1;
      if (c.state === 'ATTACKING' && bucket > prevBucket && bucket >= 1 && gnawsThisFrame < MAX_GNAW_VOICES) {
        void playGnawSFX({ x: c.pos.x, y: c.pos.y }, false);
        gnawsThisFrame++;
      }
      this.lastChewBucket.set(c.id, bucket);

      // S104 P1 — DESPAWNING fade: a chewer that aged out (finite lifetime) routes through
      // DESPAWNING; fade its alpha over the last CREATURE_FADE_TICKS so it dissolves instead of
      // popping (the death-watcher below reserves the green-goo splat for KILLS, not timeouts).
      const fade = c.state === 'DESPAWNING'
        ? Math.max(0, Math.min(1, (CREATURE_DESPAWNING_TICKS - c.ticksInState) / CREATURE_FADE_TICKS))
        : 1;

      // ── real physics-driven motion estimate (see module docblock) ──
      const last = this.lastSeenPos.get(c.id);
      let vx = last === undefined ? 0 : c.pos.x - last.x;
      let vy = last === undefined ? 0 : c.pos.y - last.y;
      // A single huge jump is a snapshot teleport, not motion — don't let it
      // spin the hop phase or flip facing.
      if (vx * vx + vy * vy > TELEPORT_PX * TELEPORT_PX) {
        vx = 0;
        vy = 0;
      }
      this.lastSeenPos.set(c.id, { x: c.pos.x, y: c.pos.y });
      const speed = Math.hypot(vx, vy);

      // Advance the hop phase by REAL distance travelled; when standing still
      // (idle / mid-chew) tick a gentle idle-breathe so it never freezes dead.
      let phase = this.hopPhase.get(c.id) ?? 0;
      phase += speed / HOP_DISTANCE_PER_CYCLE;
      phase += dtSec * IDLE_HOP_HZ * (speed < FACING_VX_THRESHOLD ? 1 : 0.25);
      phase %= 1;
      this.hopPhase.set(c.id, phase);

      // ── facing: prefer real horizontal velocity; fall back to the AI target ──
      let face = this.facing.get(c.id) ?? 1;
      if (vx > FACING_VX_THRESHOLD) face = 1;
      else if (vx < -FACING_VX_THRESHOLD) face = -1;
      else {
        // Nearly stationary — face the target it's gnawing/seeking (atan2 sign).
        const tdx = c.targetPos.x - c.pos.x;
        if (Math.abs(tdx) > 1) face = tdx >= 0 ? 1 : -1;
      }
      this.facing.set(c.id, face);
      // Lean angle toward the movement/target direction (atan2), kept subtle.
      const ldx = Math.abs(vx) > FACING_VX_THRESHOLD ? vx : c.targetPos.x - c.pos.x;
      const ldy = Math.abs(vx) > FACING_VX_THRESHOLD ? vy : c.targetPos.y - c.pos.y;
      const lean = (Math.atan2(ldy, ldx === 0 && ldy === 0 ? 1 : ldx)) * 0.10;

      // S105 P3 (smooth-regardless-of-host) — skip the whole ~50-op draw for a chewer that has
      // faded to near-invisible (the tail of a DESPAWNING fade); its state/hop bookkeeping above
      // still runs, only the draw is elided. Render-only, no determinism impact.
      if (fade > 0.04) {
        this.drawChewer(g, c.pos.x, c.pos.y, phase, face, lean, nowSec, c, fade);
      }
    }

    // S102 #1 — DEATH WATCHER. Any chewer alive last frame but GONE from the synced snapshot
    // this frame was killed (raid / potato / future laser). Splat green goo at its last position
    // + a wet fly-splat SFX — reliable on host AND the 1v1 client (both render the same snapshot)
    // and it covers EVERY chewer death with zero wire/effect surface. Guarded on PLAYING so a
    // match-end / title-return creature wipe doesn't spuriously splat.
    if (this.lastSeenPos.size > liveIds.size) {
      const playing = world.gameState === 'PLAYING';
      for (const [id, pos] of [...this.lastSeenPos]) {
        if (liveIds.has(id)) continue;
        // S104 P1 — KILL vs natural timeout: a chewer that vanished from a LIVE state (raid /
        // potato / laser / slap hard-deleted it) splats green goo; one that aged out passes
        // through DESPAWNING (faded above) and dies QUIETLY — no kill-VFX on natural expiry
        // (mirrors the Voltkin death-watcher's DESPAWNING discriminator).
        const wasState = this.lastSeenState.get(id);
        if (playing && wasState !== undefined && wasState !== 'DESPAWNING') {
          this.gooSplats.push({ x: pos.x, y: pos.y, bornSec: nowSec, seed: (id as unknown as number) * 2.39 });
          void playSplatSFX({ x: pos.x, y: pos.y });
        }
        this.lastSeenPos.delete(id);
        this.hopPhase.delete(id);
        this.facing.delete(id);
        this.lastSeenState.delete(id);
        this.lastChewBucket.delete(id);
      }
    }

    // Draw active goo splats LAST + UNCONDITIONALLY — they outlive the chewer that spawned them
    // (a splat must keep animating for ~0.55 s after the swarm is gone).
    this.drawGoo(g, nowSec);
  }

  /** S102 #1 — render + cull the active green-goo splats (expanding blob + flung droplets that
   *  fade over GOO_DURATION_SEC). Wall-clock fade is render-only cosmetic (no sim coupling). */
  private drawGoo(g: Graphics, nowSec: number): void {
    for (let i = this.gooSplats.length - 1; i >= 0; i--) {
      const s = this.gooSplats[i];
      const t = (nowSec - s.bornSec) / GOO_DURATION_SEC;
      if (t >= 1 || t < 0) { this.gooSplats.splice(i, 1); continue; }
      const alpha = 1 - t;
      const spread = BODY_R * (0.6 + t * 1.5); // droplets fling outward as it bursts
      // central splat blob (bright core over a dark centre)
      g.circle(s.x, s.y, BODY_R * (0.95 - t * 0.35)).fill({ color: GOO_CORE, alpha: 0.85 * alpha });
      g.circle(s.x, s.y, BODY_R * (0.55 - t * 0.25)).fill({ color: GOO_DARK, alpha: 0.6 * alpha });
      // radial droplets, drooping a touch as they fall
      for (let d = 0; d < GOO_DROPLETS; d++) {
        const a = (d / GOO_DROPLETS) * TAU + s.seed;
        const dist = spread * (0.7 + (Math.sin(s.seed + d * 2.1) + 1) * 0.3);
        const dx = s.x + Math.cos(a) * dist;
        const dy = s.y + Math.sin(a) * dist + t * 6;
        const r = Math.max(0.5, (2.6 - t * 1.6) * (0.7 + (Math.sin(s.seed * 1.7 + d) + 1) * 0.4));
        g.circle(dx, dy, r).fill({ color: GOO_CORE, alpha: 0.8 * alpha });
      }
    }
  }

  /**
   * Draw one chewer. `phase` 0..1 is the hop cycle (0 = grounded, 0.5 ≈ apex).
   * `face` ±1 mirror-flips the whole sketch; `lean` is a small radian tilt into
   * the direction of travel. `nowSec` drives ONLY the cosmetic graphite jitter +
   * leg wiggle (render-only wall-clock; the hop arc itself is physics-keyed).
   */
  private drawChewer(
    g: Graphics,
    px: number,
    py: number,
    phase: number,
    face: 1 | -1,
    lean: number,
    nowSec: number,
    c: { id: CreatureId },
    fade = 1,
  ): void {
    // S104 P1 — `fade` (1 normally, ramps to 0 during DESPAWNING) multiplies EVERY alpha so a
    // timed-out chewer dissolves rather than popping. One shared Graphics → per-chewer alpha is
    // applied per draw-call via this helper.
    const fa = (a: number): number => a * fade;
    // ── hop arc + squash/stretch derived from the phase ──
    // height: a parabola peaking at phase=0.5 (one leap per cycle).
    const arc = Math.sin(phase * Math.PI); // 0 at ground, 1 at apex
    const lift = arc * HOP_HEIGHT;
    const bodyY = py - lift;

    // Squash-and-stretch: tall+thin near apex, wide+short on landing/takeoff.
    // `arc` near 1 → stretch (sy>1, sx<1); arc near 0 → squash (sx>1, sy<1).
    const stretch = 0.22; // amplitude of the deform
    const sx = 1 + stretch * (0.5 - arc); // wide when grounded
    const sy = 1 - stretch * (0.5 - arc); // tall when airborne
    const rx = BODY_R * sx;
    const ry = BODY_R * sy;

    // Cosmetic per-frame outline wobble — tiny, so the sketch "breathes" like a
    // child redrawing the same shape. Keyed off wall-clock + the (deterministic)
    // id so two on-screen chewers wobble out of phase. RENDER-ONLY.
    const idSeed = (c.id as number) * 1.37;
    const wob = (k: number) => Math.sin(nowSec * 6.0 + idSeed + k * 1.9) * 1.2;

    // Ground shadow — shrinks + fades as the chewer leaps up (sells the arc).
    const shadowScale = 1 - arc * 0.45;
    g.ellipse(px, py + BODY_R * 0.78, rx * 0.85 * shadowScale, ry * 0.26 * shadowScale)
      .fill({ color: SHADOW_COLOR, alpha: fa(0.18 * (1 - arc * 0.5)) });

    // ── many little scuttling legs (drawn UNDER the body) ──
    // Legs splay wider on landing (arc→0), tuck in at apex (arc→1); each wiggles
    // on the cosmetic clock so the scuttle reads as alive.
    const legSpread = 1 - arc * 0.6;
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < LEGS_PER_SIDE; i++) {
        const t = (i + 0.5) / LEGS_PER_SIDE; // 0..1 front→back along the belly
        const rootX = px + s * rx * 0.55 * (0.4 + t * 0.6);
        const rootY = bodyY + ry * 0.35;
        const wiggle = Math.sin(nowSec * 9 + idSeed + i * 1.3 + (s > 0 ? 0 : Math.PI)) * 2.4;
        const footX = rootX + s * (5 + 4 * legSpread) + wiggle;
        const footY = py + BODY_R * 0.7 - (1 - legSpread) * 3;
        const midX = (rootX + footX) / 2 + s * 1.5;
        const midY = (rootY + footY) / 2 - 2;
        g.moveTo(rootX, rootY)
          .quadraticCurveTo(midX, midY, footX, footY)
          .stroke({ width: 2, color: GRAPHITE_SOFT, alpha: fa(0.85) });
        // little foot tick
        g.moveTo(footX, footY).lineTo(footX + s * 2.5, footY + 1.5)
          .stroke({ width: 1.5, color: GRAPHITE, alpha: fa(0.8) });
      }
    }

    // ── body: a round goofy blob, drawn as a rough wobbly hand-stroked outline ──
    // Build the outline as a ring of points with a small per-vertex jitter so the
    // edge looks pencil-drawn rather than a perfect vector ellipse.
    // S105 P3 — 16 segments (was 22) for the body ring: a BODY_R≈17 graphite blob reads identically
    // hand-drawn at 16, and it's redrawn 3× (fill + 2 sketch strokes) every frame per chewer, so the
    // trim removes ~18 path ops/chewer/frame at the 12-chewer cap. Render-only.
    const SEGS = 16;
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < SEGS; i++) {
      const a = (i / SEGS) * TAU;
      // lean tilts the body; the wobble jitters the radius a hair per vertex.
      const jr = 1 + (wob(i) / BODY_R) * 0.6;
      let ox = Math.cos(a) * rx * jr;
      let oy = Math.sin(a) * ry * jr;
      // apply lean as a shear/rotation about the body centre
      const lx = ox * Math.cos(lean) - oy * Math.sin(lean);
      const ly = ox * Math.sin(lean) + oy * Math.cos(lean);
      ox = lx;
      oy = ly;
      pts.push({ x: px + face * ox, y: bodyY + oy });
    }
    // paper fill first
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath().fill({ color: PAPER_FILL, alpha: fa(0.95) });
    // rough graphite outline — double-stroked slightly offset for a sketchy edge
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath().stroke({ width: 2.4, color: GRAPHITE, alpha: fa(0.95) });
    g.moveTo(pts[0].x + 1, pts[0].y + 1);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x + 1, pts[i].y + 1);
    g.closePath().stroke({ width: 1, color: GRAPHITE_SOFT, alpha: fa(0.5) });

    // a couple of graphite shading scribbles on the lower-back (pencil hatching)
    const backX = px - face * rx * 0.45;
    g.moveTo(backX, bodyY + ry * 0.1)
      .lineTo(backX - face * 5, bodyY + ry * 0.5)
      .moveTo(backX + face * 4, bodyY + ry * 0.15)
      .lineTo(backX - face * 2, bodyY + ry * 0.55)
      .stroke({ width: 1, color: GRAPHITE_SOFT, alpha: fa(0.4) });

    // ── OVERSIZED comedic teeth + huge gawping mouth at the front ──
    const frontX = px + face * rx * 0.62;
    const mouthY = bodyY + ry * 0.18;
    // The mouth gapes as it lands (chomp!) and is closed-ish at apex.
    const gape = (BODY_R * 0.55) * (0.5 + (1 - arc) * 0.5);
    const mw = rx * 0.7; // mouth half-width
    // dark mouth interior
    g.moveTo(frontX - face * mw * 0.2, mouthY - gape * 0.5)
      .quadraticCurveTo(frontX + face * mw, mouthY, frontX - face * mw * 0.2, mouthY + gape * 0.5)
      .quadraticCurveTo(frontX - face * mw * 0.5, mouthY, frontX - face * mw * 0.2, mouthY - gape * 0.5)
      .closePath()
      .fill({ color: GRAPHITE, alpha: fa(0.9) });
    // ── TWO BIG funny beaver buck-teeth (S102 #4) ──
    // Two oversized flat incisors side-by-side at the front of the mouth, jutting
    // DOWN well past the lower lip — the classic goofy buck-tooth overbite. Funny
    // = huge, a little gapped, each with a soft vertical pencil seam + a tiny
    // rounded-off bottom nick so they read as worn beaver chompers, not boxes.
    const toothW = mw * 0.5; // each incisor is wide + flat
    const toothH = gape * 0.6 + BODY_R * 0.72; // long buck overbite, hangs below the chin
    const toothTopY = mouthY - gape * 0.35; // anchored up under the lip
    const gap = toothW * 0.14; // small comedic gap between the two front teeth
    const pairCx = frontX - face * mw * 0.04; // pair centred on the mouth front
    for (let s = -1; s <= 1; s += 2) {
      const tx = pairCx + s * (toothW * 0.5 + gap * 0.5) - toothW * 0.5;
      // the big flat incisor
      g.rect(tx, toothTopY, toothW, toothH)
        .fill({ color: TOOTH_COLOR, alpha: fa(1) })
        .stroke({ width: 2, color: GRAPHITE, alpha: fa(0.95) });
      // a worn rounded "chewed" bottom edge (little graphite arc across the tip)
      g.moveTo(tx, toothTopY + toothH)
        .quadraticCurveTo(tx + toothW * 0.5, toothTopY + toothH + 2.5, tx + toothW, toothTopY + toothH)
        .stroke({ width: 1.4, color: GRAPHITE_SOFT, alpha: fa(0.7) });
      // soft vertical pencil seam down the face of each tooth (cosmetic)
      g.moveTo(tx + toothW * 0.34, toothTopY + toothH * 0.16)
        .lineTo(tx + toothW * 0.34, toothTopY + toothH * 0.82)
        .stroke({ width: 1, color: GRAPHITE_SOFT, alpha: fa(0.35) });
    }

    // ── two big goofy googly eyes on stalks (over the top of the body) ──
    for (let s = -1; s <= 1; s += 2) {
      const eyeBaseX = px + face * rx * 0.2 + s * rx * 0.28;
      const eyeBaseY = bodyY - ry * 0.55;
      const stalkLen = BODY_R * 0.5;
      const bobx = Math.sin(nowSec * 7 + idSeed + s) * 1.5;
      const eyeX = eyeBaseX + bobx;
      const eyeY = eyeBaseY - stalkLen - arc * 2;
      // stalk
      g.moveTo(eyeBaseX, eyeBaseY).lineTo(eyeX, eyeY)
        .stroke({ width: 2, color: GRAPHITE, alpha: fa(0.9) });
      // white of the eye
      g.circle(eyeX, eyeY, BODY_R * 0.34)
        .fill({ color: PAPER_FILL, alpha: fa(1) })
        .stroke({ width: 1.6, color: GRAPHITE, alpha: fa(0.95) });
      // pupil — looks toward the facing/target direction
      g.circle(eyeX + face * BODY_R * 0.12, eyeY + 1, BODY_R * 0.15)
        .fill({ color: EYE_COLOR, alpha: fa(1) });
    }
  }

  /** Drop the chewer graphic (title-return; closes the one-frame orphan window). */
  clear(): void {
    this.graphics.clear();
    this.lastSeenPos.clear();
    this.hopPhase.clear();
    this.facing.clear();
    this.lastSeenState.clear();
    this.lastChewBucket.clear();
    this.gooSplats.length = 0; // S102 #1 — drop in-flight splats on a hard reset (no spurious goo)
    this.prevNowSec = -1;
  }

  destroy(): void {
    this.graphics.destroy();
    this.lastSeenPos.clear();
    this.hopPhase.clear();
    this.facing.clear();
    this.lastSeenState.clear();
    this.lastChewBucket.clear();
    this.gooSplats.length = 0;
  }
}
