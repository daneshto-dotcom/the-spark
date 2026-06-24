/**
 * SPARK — NONET Sudoku overlay (S93 P1): the "different realm" trial UI.
 *
 * A full-screen Pixi overlay shown while world.sudoku is active. Late-90s arcade-Tetris
 * visual language (beveled jewel cells, gold cloisonné frame, CRT scanlines, chunky bitmap
 * numerals) fused with a painterly dusk-folklore world (an ORIGINAL mossy forest-kami guardian +
 * firefly wisps — deliberately NOT modeled on any existing studio character). The six Sudoku
 * digits ARE the six SparkType colours, so it reads as a colour-logic puzzle in SPARK's own
 * alphabet (the numeral is the colour-blind-safe primary token).
 *
 * Host-authoritative state lives on world.sudoku; this overlay is pure presentation + local
 * input. On a complete grid it calls the injected `onSubmit` (solo/host → submitSudokuSolve;
 * a future client build sends a SUDOKU_SOLVED intent). Vector spirits are Phase-1 placeholders;
 * Phase 2 swaps in illustrated sprites loaded off-bundle from public/art/nonet/.
 */

import { Application, Assets, Container, type FederatedPointerEvent, Graphics, Sprite, Text, Texture, TextStyle } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, SPARK_COLORS, SparkType } from '../constants.ts';
import type { World } from '../state/worldTypes.ts';
import {
  blinkPulse,
  floodAlpha,
  playNonetAppear,
  playNonetJackpot,
  playNonetLose,
  playNonetPop,
  playNonetTimeout,
  playNonetWrong,
  resolveFloodColor,
} from './nonetJuice.ts';
import {
  bannerPose,
  CELEBRATION_DURATION_TICKS,
  fireworkParticles,
  jackpotGlowAlpha,
  jackpotGlowColor,
  makeFireworks,
  type Firework,
} from './nonetCelebration.ts';

/** S95 — per-spirit idle behaviour; each illustrated guardian gets a DIFFERENT one so the realm reads as alive. */
type SpiritBehavior = 'breathe' | 'blink' | 'hop' | 'float';
interface SpiritAnim {
  readonly sprite: Sprite;
  readonly bx: number; // base (home) position the animation oscillates around
  readonly by: number;
  readonly s: number; // base scale
  readonly behavior: SpiritBehavior;
  readonly phase: number; // desync offset so spirits don't move in lockstep
}
/** A drifting, twinkling firefly mote (pre-drawn Graphics; only position + alpha animate). */
interface Firefly {
  readonly g: Graphics;
  readonly bx: number; readonly by: number;
  readonly ax: number; readonly ay: number; // drift amplitude
  readonly sx: number; readonly sy: number; // drift speed
  readonly px: number; readonly py: number; readonly pf: number; // phase offsets (x, y, flicker)
}
/** S96 — one guardian's placement + idle personality; drives both the video and static-fallback layers. */
interface Guardian {
  readonly id: string; // asset basename (kami | owl-a | owl-b | moss-b)
  readonly x: number; readonly y: number; // on-stage centre
  readonly vw: number; // on-stage video width (px); the matte ellipse + static sprite share this footprint
  readonly staticScale: number; // fallback webp scale (512px source)
  readonly behavior: SpiritBehavior; // procedural idle used ONLY while the video layer is absent
  readonly phase: number;
  readonly hero?: boolean; // the kami — also hides the vector placeholder on load
  readonly mask?: string; // guardian-specific matte basename (defaults to the shared 'spirit-mask')
}

// S96 — character video loops are authored 540×960 (9:16) and the matte PNG matches; the dusk backdrop
// loop is 1280×720 (16:9). Sprite scale = on-stage size ÷ these source widths.
const SPIRIT_VID_W = 540;
const BG_VID_W = 1280;

const N = 6;
const CELLS = 36;
const BOX_H = 2; // box height in cells (rows)
const BOX_W = 3; // box width in cells (cols)

// digit 1..6 → the six SparkType colours (Dot, Line, Triangle, Square, Circle, Spiral)
const DIGIT_TYPE = [
  SparkType.Dot,
  SparkType.Line,
  SparkType.Triangle,
  SparkType.Square,
  SparkType.Circle,
  SparkType.Spiral,
];
const digitColor = (d: number): number => SPARK_COLORS[DIGIT_TYPE[d - 1]];
/** Dark numeral on light jewels (white/yellow/green), light on dark jewels (red/blue/purple). */
const numeralColor = (d: number): number => (d === 1 || d === 2 || d === 5 ? 0x23222a : 0xffffff);

const BOARD = 540;
const CELL = BOARD / N; // 90
const BX = (CANVAS_WIDTH - BOARD) / 2; // 690
const BY = 320;
const GOLD = 0xe8c66a;

export type SubmitFn = (grid: number[]) => boolean;

export class SudokuOverlay {
  readonly container: Container;
  private readonly cells: Graphics;
  private readonly nums: Text[] = [];
  private readonly banner: Text;
  private readonly result: Text;
  private readonly hint: Text;
  // S95 — winner-colour resolve flood + its rising-edge latch + fade state.
  private readonly flood: Graphics;
  private floodStartTick = -1;
  private floodColor = 0xffffff;
  private prevResolved = false;
  // S97 P4 — WINNER-ONLY jackpot celebration (fireworks + screen glow + banner). Triggered on the
  // resolve edge only when ev.solvedBy === localPlayerId; losers/timeout never set celebrateStartTick.
  private readonly celebrateLayer = new Container();
  private readonly celebrateGlow = new Graphics();
  private readonly celebrateFx = new Graphics();
  private readonly wonBanner: Text;
  private celebrateStartTick = -1;
  private fireworks: Firework[] = [];
  // S95 — the living realm: animated guardian spirits + a firefly swarm (driven per-frame in render()).
  private readonly spirits: SpiritAnim[] = [];
  private readonly fireflies: Firefly[] = [];
  // S96 — the realm BROUGHT TO LIFE: veo-animated dusk video loops replace the procedural sprite idle.
  // The video layer is primary; the S95 static webp + procedural idle is the fallback until/if a video
  // loads. We hold the <video> elements to play on show / pause on hide. (vectorKami = hero 404-fallback.)
  private vectorKami: Graphics | null = null;
  private readonly spiritVideoEls: HTMLVideoElement[] = [];
  private bgVideoEl: HTMLVideoElement | null = null;
  private videosPlaying = false;
  // S96 — one z-slot (added before the board frame) holding ALL decorative realm visuals, so async
  // video sprites that resolve after the board is built still render BEHIND it, not over the grid.
  private readonly realmLayer = new Container();

  private world: World | null = null;
  private entries: number[] = new Array(CELLS).fill(0);
  private givens: number[] = new Array(CELLS).fill(0);
  private selected = -1;
  private activeSeed: number | null = null;
  private wrongFlash = 0;
  private readonly onSubmit: SubmitFn;

  constructor(app: Application, onSubmit: SubmitFn) {
    this.onSubmit = onSubmit;
    this.container = new Container();
    this.container.eventMode = 'static';
    this.container.visible = false;

    // ── dim backdrop (captures clicks so they never fall through to the duel) ──
    const bg = new Graphics();
    bg.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x0a0a14, alpha: 0.82 });
    bg.eventMode = 'static';
    this.container.addChild(bg);

    // ── dusk sky band behind the frame ──
    const sky = new Graphics();
    sky.rect(BX - 120, BY - 150, BOARD + 240, BOARD + 320).fill({ color: 0x2a3a5e, alpha: 0.55 });
    sky.rect(BX - 120, BY + 250, BOARD + 240, 200).fill({ color: 0xc8836a, alpha: 0.28 });
    this.container.addChild(sky);

    this.buildSpirits();

    // ── gold cloisonné frame ──
    const frame = new Graphics();
    frame
      .roundRect(BX - 60, BY - 110, BOARD + 120, BOARD + 200, 16)
      .fill({ color: 0x1c1430, alpha: 0.95 })
      .stroke({ width: 3, color: GOLD });
    frame
      .roundRect(BX - 48, BY - 98, BOARD + 96, BOARD + 176, 12)
      .stroke({ width: 1, color: 0x7c5a22 });
    this.container.addChild(frame);

    // ── title plate ──
    const plate = new Graphics();
    plate
      .roundRect(CANVAS_WIDTH / 2 - 150, BY - 96, 300, 64, 10)
      .fill({ color: 0x2a2012 })
      .stroke({ width: 2, color: GOLD });
    this.container.addChild(plate);
    const title = new Text({
      text: 'NONET',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontWeight: 'bold',
        fontSize: 44,
        fill: 0xf6d680,
        letterSpacing: 10,
      }),
    });
    title.anchor.set(0.5);
    title.position.set(CANVAS_WIDTH / 2, BY - 64);
    this.container.addChild(title);

    this.banner = new Text({
      text: 'first to solve · winner x2 · everyone else halved',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 20, fill: 0xffe9b8, letterSpacing: 1 }),
    });
    this.banner.anchor.set(0.5);
    this.banner.position.set(CANVAS_WIDTH / 2, BY - 18);
    this.container.addChild(this.banner);

    // ── board slot + dynamic cell graphics ──
    const slot = new Graphics();
    slot.roundRect(BX - 6, BY - 6, BOARD + 12, BOARD + 12, 8).fill({ color: 0x120c1f });
    this.container.addChild(slot);

    this.cells = new Graphics();
    this.container.addChild(this.cells);

    // 36 persistent numerals
    for (let i = 0; i < CELLS; i++) {
      const t = new Text({
        text: '',
        style: new TextStyle({ fontFamily: 'monospace', fontWeight: 'bold', fontSize: 48, fill: 0xffffff }),
      });
      t.anchor.set(0.5);
      const r = Math.floor(i / N);
      const c = i % N;
      t.position.set(BX + c * CELL + CELL / 2, BY + r * CELL + CELL / 2);
      this.nums.push(t);
      this.container.addChild(t);
    }

    // CRT scanlines over the board
    const scan = new Graphics();
    for (let y = 0; y < BOARD; y += 4) {
      scan.rect(BX, BY + y, BOARD, 1.6).fill({ color: 0x000000, alpha: 0.16 });
    }
    this.container.addChild(scan);

    this.hint = new Text({
      text: 'click a cell · press 1–6 · backspace clears',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fill: 0xbfd0e8 }),
    });
    this.hint.anchor.set(0.5);
    this.hint.position.set(CANVAS_WIDTH / 2, BY + BOARD + 50);
    this.container.addChild(this.hint);

    this.result = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontWeight: 'bold', fontSize: 34, fill: 0xfff2c8, letterSpacing: 2 }),
    });
    this.result.anchor.set(0.5);
    this.result.position.set(CANVAS_WIDTH / 2, BY + BOARD + 50);
    this.result.visible = false;
    this.container.addChild(this.result);

    // S95 — winner-colour resolve flood: a full-screen wash, drawn topmost + pointer-transparent,
    // filled per-frame in render() while a resolve flood is active.
    this.flood = new Graphics();
    this.flood.eventMode = 'none';
    this.flood.visible = false;
    this.container.addChild(this.flood);

    // S97 P4 — winner-only jackpot celebration layer (kept topmost on trigger, above the flood):
    // a full-screen gold glow wash + fireworks particles + a popping "JACKPOT!" banner. Pointer-
    // transparent + hidden until a LOCAL-win resolve.
    this.celebrateGlow.eventMode = 'none';
    this.celebrateFx.eventMode = 'none';
    this.wonBanner = new Text({
      text: 'JACKPOT!',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontWeight: 'bold',
        fontSize: 66,
        fill: GOLD,
        letterSpacing: 8,
        stroke: { color: 0x4a3200, width: 7 },
      }),
    });
    this.wonBanner.anchor.set(0.5);
    this.wonBanner.position.set(CANVAS_WIDTH / 2, 140);
    this.celebrateLayer.eventMode = 'none';
    this.celebrateLayer.visible = false;
    this.celebrateLayer.addChild(this.celebrateGlow, this.celebrateFx, this.wonBanner);
    this.container.addChild(this.celebrateLayer);

    this.container.on('pointertap', this.onTap);
    window.addEventListener('keydown', this.onKey);
    app.stage.addChild(this.container);
  }

  /**
   * Builds the LIVING realm in three upgrade layers per guardian (latest wins):
   *   1. vector moss-kami — instant 404-proof fallback for the hero (drawn here).
   *   2. illustrated static webp sprite + a procedural idle (breathe/blink/hop/float) — the S95 look.
   *   3. S96 — a veo-animated dusk VIDEO loop (image-to-video off each sprite, post-processed to a
   *      seamless loop + soft-vignette matte) that REPLACES the procedural idle: real, painterly motion
   *      (breathing, blinking, lantern flicker, drifting fireflies) instead of a transform twitch.
   * When a guardian's video loads it hides that guardian's static sprite and drops its procedural
   * entry from `this.spirits`, so animateLife() never twitches a video. A drifting firefly swarm and a
   * dusk-forest backdrop video round out the scene. Designs are deliberately ORIGINAL (mossy spirits +
   * owls — S95 replaced a prior Totoro-look-alike to avoid any Studio-Ghibli IP risk).
   */
  private buildSpirits(): void {
    this.realmLayer.eventMode = 'none'; // purely decorative — never intercept board clicks
    this.container.addChild(this.realmLayer);

    const kami = new Graphics();
    const kx = BX + BOARD + 150;
    const ky = BY + 250;
    // rounded mossy body
    kami.ellipse(kx, ky, 100, 122).fill(0x2f4a45);
    kami.ellipse(kx, ky + 34, 90, 92).fill(0x26403b); // lower shade
    // sprout tuft
    kami.moveTo(kx, ky - 116).lineTo(kx, ky - 150).stroke({ width: 5, color: 0x6fae5e });
    kami.ellipse(kx - 11, ky - 150, 9, 17).fill(0x6fae5e); // leaf L
    kami.ellipse(kx + 11, ky - 150, 9, 17).fill(0x7cbf66); // leaf R
    // calm glowing jade eyes
    kami.circle(kx - 30, ky - 18, 13).fill(0xcfe9cf);
    kami.circle(kx + 30, ky - 18, 13).fill(0xcfe9cf);
    kami.circle(kx - 30, ky - 18, 5).fill(0x223028);
    kami.circle(kx + 30, ky - 18, 5).fill(0x223028);
    // firefly freckles
    for (const [fx, fy] of [[kx - 52, ky + 6], [kx - 22, ky + 44], [kx + 16, ky - 52], [kx + 48, ky + 22], [kx - 8, ky + 74], [kx + 58, ky - 8]]) {
      kami.circle(fx, fy, 3).fill({ color: 0xdff0a0, alpha: 0.9 });
    }
    // carved stone amulet
    kami.roundRect(kx - 14, ky + 36, 28, 36, 9).fill(0x8a949a).stroke({ width: 2, color: 0x5d6469 });
    // raised paper lantern (right arm)
    kami.rect(kx + 88, ky - 34, 8, 12).fill(0x6b4a2a); // cap
    kami.circle(kx + 92, ky - 8, 18).fill({ color: 0xff9a4a, alpha: 0.95 }); // lantern glow
    this.realmLayer.addChild(kami);
    this.vectorKami = kami;

    // S96 — a slow dusk-forest ambient video drifts behind the board (above the dim backdrop).
    this.loadBackdropVideo();

    // S96 — guardians framing the board, in the LEFT + RIGHT margins only (the board+frame fills the
    // centre x≈630–1290 and there is no room below it on a 1080-tall stage). Each gets a video layer
    // (primary) over a static-sprite layer (fallback). The hero kami additionally hides the vector
    // placeholder above when EITHER of its richer layers loads. `vw` = on-stage video width in px.
    // S97 P3 — asymmetric, natural placement (user playtest: the old 2x2-corner layout read
    // 'symmetrical and unnatural'). Varied heights + sizes, all clear of the centred panel/frame
    // bbox [630,1290] x [210,1060]: LEFT margin (x right-edge < 630) holds the prominent elder
    // mid-height + the peppy owl low; RIGHT margin (x left-edge > 1290) holds the watchful owl high
    // + the dreamy moss low — so no two mirror each other.
    const GUARDIANS: ReadonlyArray<Guardian> = [
      { id: 'kami', x: 300, y: 558, vw: 360, staticScale: 0.55, behavior: 'breathe', phase: 0.0, hero: true }, // MIDDLE-LEFT — the stately elder, prominent
      { id: 'owl-a', x: 1628, y: 332, vw: 286, staticScale: 0.40, behavior: 'blink', phase: 0.6 }, // TOP-RIGHT — watchful, peeking high
      { id: 'owl-b', x: 372, y: 888, vw: 214, staticScale: 0.28, behavior: 'hop', phase: 1.7, mask: 'owl-b-mask' }, // BOTTOM-LEFT — peppy (tighter matte crops a stray veo flame — S97 P1)
      { id: 'moss-b', x: 1562, y: 842, vw: 252, staticScale: 0.33, behavior: 'float', phase: 3.1 }, // BOTTOM-RIGHT — dreamy
    ];
    GUARDIANS.forEach((g, i) => this.buildGuardian(g, i));

    // S95 — a SWARM of drifting, twinkling fireflies that wander the realm (replaces the 3 static
    // wisps). Each is a pre-drawn glow (core + halo) whose position + alpha animate per-frame in
    // animateLife(). Added here (before the board/frame) so they twinkle in the dusk sky and pass
    // BEHIND the board — natural, and keeps the grid numerals clean. Light randomness so the swarm
    // never looks gridded (decorative → Math.random is fine; no determinism needed).
    for (let i = 0; i < 16; i++) {
      const g = new Graphics();
      g.circle(0, 0, 5).fill({ color: 0xeaf7a0, alpha: 0.16 }); // halo
      g.circle(0, 0, 2.1).fill({ color: 0xf6ffc0, alpha: 0.95 }); // core
      const bx = BX - 150 + Math.random() * (BOARD + 360);
      const by = BY - 70 + Math.random() * (BOARD + 300);
      g.position.set(bx, by);
      this.realmLayer.addChild(g);
      this.fireflies.push({
        g, bx, by,
        ax: 22 + Math.random() * 46, ay: 16 + Math.random() * 36,
        sx: 0.3 + Math.random() * 0.8, sy: 0.3 + Math.random() * 0.8,
        px: Math.random() * 6.283, py: Math.random() * 6.283, pf: Math.random() * 6.283,
      });
    }
  }

  /**
   * S96 — builds one guardian's two upgrade layers into the realm layer. The static webp + procedural
   * idle (S95) shows first as a fallback; when the veo video loop loads it hides that sprite, drops its
   * procedural entry so animateLife() stops twitching it, and plays the masked video. `index` desyncs
   * the loops. Whichever layer wins the load race first wins (the other yields), so a missing/broken
   * video silently leaves the static spirit, and a fast video skips the static layer entirely.
   */
  private buildGuardian(g: Guardian, index: number): void {
    let staticEntry: SpiritAnim | null = null;
    let videoTookOver = false;

    // S99 — layer 1: a soft warm backing glow. The S99 mask fix makes the spirit
    // fully opaque (was fading into the bg); this halo GROUNDS it in the dusk scene
    // and softens its feathered rim against the dark surround so the now-crisp
    // outline reads naturally rather than "cut out" (Council P1). Added FIRST so it
    // sits BEHIND the static + video layers; concentric low-alpha ellipses = a cheap
    // soft radial. Render-only.
    const glow = new Graphics();
    const gw = g.vw * 0.60;
    const gh = g.vw * 0.80;
    for (const [rs, alpha] of [[1.0, 0.05], [0.68, 0.06], [0.42, 0.08]] as const) {
      glow.ellipse(g.x, g.y, gw * rs, gh * rs).fill({ color: 0x6b5836, alpha });
    }
    this.realmLayer.addChild(glow);

    // layer 2 — static webp + procedural idle (fallback)
    void Assets.load(`/art/nonet/${g.id}.webp`).then((tex: Texture) => {
      if (videoTookOver) return; // the video already won — don't add a redundant static sprite
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.position.set(g.x, g.y);
      s.scale.set(g.staticScale);
      this.realmLayer.addChild(s);
      if (g.hero) this.hideVectorKami();
      staticEntry = { sprite: s, bx: g.x, by: g.y, s: g.staticScale, behavior: g.behavior, phase: g.phase };
      this.spirits.push(staticEntry);
    }).catch(() => { /* no sprite → vector kami (hero) or nothing */ });

    // layer 3 — veo dusk video loop (primary), masked to a soft feathered vignette
    void Promise.all([
      this.makeVideoSprite(`/art/nonet/${g.id}.webm`, g.x, g.y, g.vw / SPIRIT_VID_W),
      Assets.load(`/art/nonet/${g.mask ?? 'spirit-mask'}.png`) as Promise<Texture>,
    ]).then(([made, maskTex]) => {
      videoTookOver = true;
      const { sprite, video } = made;
      const mask = new Sprite(maskTex);
      mask.anchor.set(0.5);
      mask.position.set(g.x, g.y);
      mask.scale.set(g.vw / SPIRIT_VID_W);
      this.realmLayer.addChild(mask);
      this.realmLayer.addChild(sprite);
      sprite.mask = mask; // feathered alpha matte — the dark dusk surround melts into the overlay
      if (g.hero) this.hideVectorKami();
      if (staticEntry) { // retire the fallback layer for this guardian
        staticEntry.sprite.visible = false;
        const i = this.spirits.indexOf(staticEntry);
        if (i >= 0) this.spirits.splice(i, 1);
      }
      try { video.currentTime = (index * 1.1) % 4; } catch { /* seek before metadata — harmless */ }
      this.spiritVideoEls.push(video);
      if (this.container.visible) void video.play().catch(() => { /* autoplay deferred to next show */ });
    }).catch(() => { /* video unavailable → the static sprite + procedural idle remains */ });
  }

  private hideVectorKami(): void {
    if (this.vectorKami) this.vectorKami.visible = false;
  }

  /**
   * Creates a looping, muted, paused <video> + a Pixi sprite bound to it. Resolves only once the element
   * has decoded its first frame (so the texture is never a 0×0 black box); rejects on error so the
   * caller can fall back. Muted + no audio track ⇒ autoplay is permitted once we call play() on show.
   */
  private makeVideoSprite(
    url: string,
    x: number,
    y: number,
    scale: number,
  ): Promise<{ sprite: Sprite; video: HTMLVideoElement }> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.src = url;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.addEventListener('error', () => reject(new Error(`video load failed: ${url}`)), { once: true });
      video.addEventListener('loadeddata', () => {
        const sprite = new Sprite(Texture.from(video));
        sprite.anchor.set(0.5);
        sprite.position.set(x, y);
        sprite.scale.set(scale);
        resolve({ sprite, video });
      }, { once: true });
      video.load();
    });
  }

  /** S96 — the dusk-forest ambient backdrop loop, drifting above the dim layer behind the board. */
  private loadBackdropVideo(): void {
    void this.makeVideoSprite('/art/nonet/bg.webm', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH / BG_VID_W)
      .then(({ sprite, video }) => {
        sprite.alpha = 0.42; // slow ambient (no strobe) — calm dusk wash, not a flash
        sprite.eventMode = 'none';
        this.realmLayer.addChildAt(sprite, 0); // bottom of the realm layer → behind every spirit
        this.bgVideoEl = video;
        if (this.container.visible) void video.play().catch(() => { /* deferred to next show */ });
      })
      .catch(() => { /* no backdrop video → the static dusk sky band remains */ });
  }

  /** S96 — play all realm videos while the overlay is visible; pause them when hidden to spare the GPU. */
  private setVideosPlaying(on: boolean): void {
    if (on === this.videosPlaying) return;
    this.videosPlaying = on;
    const els = this.bgVideoEl ? [...this.spiritVideoEls, this.bgVideoEl] : this.spiritVideoEls;
    for (const el of els) {
      if (on) void el.play().catch(() => { /* may need a gesture; retried on next show */ });
      else el.pause();
    }
  }

  /**
   * S95 — per-frame "life" pass: each guardian spirit idles with its OWN behaviour (breathe / blink
   * / hop-patrol / float) and the firefly swarm drifts + twinkles. Driven by wall-clock seconds
   * (performance.now) so motion is smooth + frame-rate independent regardless of the host tick rate;
   * decorative-only so no determinism is needed. Called from render() while the overlay is visible.
   */
  private animateLife(): void {
    const t = performance.now() / 1000;
    for (const sp of this.spirits) {
      const { sprite, bx, by, s, behavior, phase } = sp;
      if (behavior === 'breathe') {
        const br = Math.sin(t * 1.05 + phase); // ~6 s breath cycle
        sprite.scale.set(s * (1 - 0.016 * br), s * (1 + 0.03 * br)); // belly swells, slight x squash
        sprite.position.set(bx, by + 4 * Math.sin(t * 0.7 + phase));
        sprite.rotation = 0.012 * Math.sin(t * 0.4 + phase);
      } else if (behavior === 'blink') {
        const blink = blinkPulse(t, phase);
        sprite.scale.set(s, s * (1 - 0.55 * blink)); // quick vertical squint = a blink
        sprite.rotation = 0.05 * Math.sin(t * 0.45 + phase); // gentle head sway
        sprite.position.set(bx, by + 3 * Math.sin(t * 0.6 + phase));
      } else if (behavior === 'hop') {
        const hop = Math.abs(Math.sin(t * 2.05 + phase)); // bouncy
        const land = 1 - hop; // 1 at the bottom of the bounce
        sprite.position.set(bx + 30 * Math.sin(t * 0.5 + phase), by - 16 * hop); // patrols L↔R while hopping
        sprite.scale.set(s * (1 + 0.12 * land), s * (1 - 0.12 * land)); // squash on landing
      } else { // float
        sprite.position.set(bx + 20 * Math.sin(t * 0.55 + phase), by + 12 * Math.sin(t * 0.85 + phase + 1));
        sprite.rotation = 0.06 * Math.sin(t * 0.65 + phase);
      }
    }
    for (const f of this.fireflies) {
      f.g.position.set(f.bx + f.ax * Math.sin(t * f.sx + f.px), f.by + f.ay * Math.sin(t * f.sy + f.py));
      f.g.alpha = 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2.3 + f.pf)); // twinkle
    }
  }

  /** Per-frame. Shows/hides off world.sudoku and redraws the dynamic board state. */
  render(world: World): void {
    this.world = world;
    const ev = world.sudoku;
    if (ev === null) {
      this.container.visible = false;
      this.setVideosPlaying(false); // pause the realm loops while the overlay is dismissed
      this.activeSeed = null;
      this.endCelebration(); // S97 P4 — no winner celebration once the trial is gone
      return;
    }
    if (ev.seed !== this.activeSeed) {
      // New trial → seed the local entry grid from the givens.
      this.activeSeed = ev.seed;
      this.givens = ev.puzzle.givens.slice();
      this.entries = this.givens.slice();
      this.selected = this.givens.findIndex((g) => g === 0);
      this.wrongFlash = 0;
      // S95 — realm-shift sting + reset the resolve-edge latch / any prior flood for the new trial.
      this.prevResolved = false;
      this.floodStartTick = -1;
      this.flood.visible = false;
      this.endCelebration(); // S97 P4 — clear any prior winner celebration for the new trial
      playNonetAppear();
    }
    this.container.visible = true;
    this.setVideosPlaying(true); // S96 — the realm video loops play while the trial is on screen
    this.animateLife(); // S95 — drive any remaining static spirits + the firefly swarm each visible frame
    const resolved = ev.resolvedTick !== null;

    // S95 — resolve rising edge: fire the outcome SFX + kick off the winner-colour flood (once).
    if (resolved && !this.prevResolved) {
      this.prevResolved = true;
      if (ev.solvedBy === null) playNonetTimeout();
      else if (ev.solvedBy === world.localPlayerId) this.startCelebration(world.tick); // WINNER → jackpot
      else playNonetLose(); // LOSER → nothing new beyond the existing neutral flood
      const winnerColor = ev.solvedBy !== null ? world.players.get(ev.solvedBy)?.color : undefined;
      this.floodColor = resolveFloodColor(winnerColor);
      this.floodStartTick = world.tick;
      this.container.setChildIndex(this.flood, this.container.children.length - 1); // keep topmost
    }

    this.cells.clear();
    for (let i = 0; i < CELLS; i++) {
      const r = Math.floor(i / N);
      const c = i % N;
      const x = BX + c * CELL;
      const y = BY + r * CELL;
      const d = this.entries[i];
      if (d !== 0) {
        const col = digitColor(d);
        this.cells.roundRect(x + 5, y + 5, CELL - 10, CELL - 10, 8).fill(col);
        this.cells
          .roundRect(x + 8, y + 8, CELL - 16, 18, 6)
          .fill({ color: 0xffffff, alpha: 0.28 }); // gloss bevel
        if (this.givens[i] !== 0) {
          this.cells.rect(x + 14, y + CELL - 16, CELL - 28, 3).fill({ color: GOLD, alpha: 0.85 }); // given underline
        }
        this.nums[i].text = String(d);
        this.nums[i].style.fill = numeralColor(d);
        this.nums[i].visible = true;
      } else {
        this.nums[i].visible = false;
      }
      // selection ring
      if (i === this.selected && !resolved) {
        const ring = this.wrongFlash > 0 ? 0xff5a5a : 0x8fe9ff;
        this.cells.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 8).stroke({ width: 3, color: ring });
      }
    }
    // thick gold box separators + outer border
    for (let c = BOX_W; c < N; c += BOX_W) {
      this.cells.moveTo(BX + c * CELL, BY).lineTo(BX + c * CELL, BY + BOARD).stroke({ width: 3, color: 0xcaa044 });
    }
    for (let r = BOX_H; r < N; r += BOX_H) {
      this.cells.moveTo(BX, BY + r * CELL).lineTo(BX + BOARD, BY + r * CELL).stroke({ width: 3, color: 0xcaa044 });
    }
    this.cells.roundRect(BX, BY, BOARD, BOARD, 6).stroke({ width: 2, color: GOLD });

    if (this.wrongFlash > 0) this.wrongFlash--;

    // banner / result
    if (resolved) {
      this.banner.visible = false;
      this.hint.visible = false;
      this.result.visible = true;
      const you = world.localPlayerId;
      if (ev.solvedBy === null) {
        this.result.text = "TIME'S UP — no score change";
        this.result.style.fill = 0xbfd0e8;
      } else if (ev.solvedBy === you) {
        this.result.text = 'SOLVED FIRST!  your score x2';
        this.result.style.fill = 0x8fffc0;
      } else {
        this.result.text = `player ${(ev.solvedBy as number) + 1} solved it — your score halved`;
        this.result.style.fill = 0xff9a9a;
      }
    } else {
      this.banner.visible = true;
      this.hint.visible = true;
      this.result.visible = false;
    }

    // S95 — animate the resolve flood: a winner-colour wash that flashes then eases out over ~0.75 s.
    // world.tick advances during the NONET freeze (host) / via snapshots (client), so it drives the fade.
    if (this.floodStartTick >= 0) {
      const a = floodAlpha(world.tick - this.floodStartTick);
      if (a <= 0) {
        this.floodStartTick = -1;
        this.flood.visible = false;
        this.flood.clear();
      } else {
        this.flood.clear();
        this.flood.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: this.floodColor, alpha: a });
        this.flood.visible = true;
      }
    }

    // S97 P4 — animate the WINNER jackpot celebration (celebrateStartTick is set only in the local-win
    // branch, so losers/timeout never reach this). Kept topmost above the flood; gentle gold glow wash
    // (charter-capped, no strobe) + fireworks bursts + a popping "JACKPOT!" banner. Rides world.tick.
    if (this.celebrateStartTick >= 0) {
      const e = world.tick - this.celebrateStartTick;
      if (e >= CELEBRATION_DURATION_TICKS) {
        this.endCelebration();
      } else {
        this.container.setChildIndex(this.celebrateLayer, this.container.children.length - 1);
        this.celebrateLayer.visible = true;
        this.celebrateGlow.clear();
        const ga = jackpotGlowAlpha(e);
        if (ga > 0) this.celebrateGlow.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: jackpotGlowColor(e), alpha: ga });
        this.celebrateFx.clear();
        for (const fw of this.fireworks) {
          for (const p of fireworkParticles(fw, e, CANVAS_HEIGHT)) {
            if (p.alpha <= 0) continue;
            this.celebrateFx.circle(p.x, p.y, p.r).fill({ color: p.color, alpha: p.alpha });
          }
        }
        const bp = bannerPose(e);
        this.wonBanner.scale.set(bp.scale);
        this.wonBanner.alpha = bp.alpha;
      }
    }
  }

  /** S97 P4 — kick off the winner-only jackpot (SFX + fireworks + banner). Cosmetic + local. */
  private startCelebration(tick: number): void {
    playNonetJackpot();
    this.celebrateStartTick = tick;
    this.fireworks = makeFireworks(8, CANVAS_WIDTH, CANVAS_HEIGHT, Math.random);
    this.wonBanner.scale.set(0.55);
    this.wonBanner.alpha = 0;
    this.celebrateLayer.visible = true;
    this.container.setChildIndex(this.celebrateLayer, this.container.children.length - 1);
  }

  /** S97 P4 — tear down the celebration (window elapsed, new trial, or dismiss). Idempotent. */
  private endCelebration(): void {
    this.celebrateStartTick = -1;
    this.fireworks = [];
    this.celebrateLayer.visible = false;
    this.celebrateGlow.clear();
    this.celebrateFx.clear();
  }

  private cellAt(px: number, py: number): number {
    const c = Math.floor((px - BX) / CELL);
    const r = Math.floor((py - BY) / CELL);
    if (c < 0 || c >= N || r < 0 || r >= N) return -1;
    return r * N + c;
  }

  private onTap = (e: FederatedPointerEvent): void => {
    if (!this.container.visible || this.world?.sudoku?.resolvedTick != null) return;
    const p = e.getLocalPosition(this.container);
    const idx = this.cellAt(p.x, p.y);
    if (idx >= 0 && this.givens[idx] === 0) this.selected = idx;
  };

  private onKey = (e: KeyboardEvent): void => {
    const ev = this.world?.sudoku;
    if (!this.container.visible || ev == null || ev.resolvedTick != null) return;
    if (e.key >= '1' && e.key <= '6') {
      if (this.selected >= 0 && this.givens[this.selected] === 0) {
        this.entries[this.selected] = Number(e.key);
        playNonetPop(); // S95 — kawaii cell-place pip
        const next = this.entries.findIndex((v, i) => v === 0 && this.givens[i] === 0);
        if (next >= 0) this.selected = next;
        this.maybeSubmit();
      }
      e.preventDefault();
    } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
      if (this.selected >= 0 && this.givens[this.selected] === 0) this.entries[this.selected] = 0;
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      this.selected = Math.min(CELLS - 1, this.selected + 1);
    } else if (e.key === 'ArrowLeft') {
      this.selected = Math.max(0, this.selected - 1);
    } else if (e.key === 'ArrowDown') {
      this.selected = Math.min(CELLS - 1, this.selected + N);
    } else if (e.key === 'ArrowUp') {
      this.selected = Math.max(0, this.selected - N);
    }
  };

  /** When the grid is full, submit it; a wrong grid just flashes (host rejects, race continues). */
  private maybeSubmit(): void {
    if (this.entries.some((v) => v === 0)) return;
    const won = this.onSubmit(this.entries.slice());
    if (!won) {
      this.wrongFlash = 36;
      playNonetWrong(); // S95 — comedic "bonk" on a wrong full grid
    }
  }
}
