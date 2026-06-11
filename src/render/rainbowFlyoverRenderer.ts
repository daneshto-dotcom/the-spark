/**
 * SPARK — S84 P2: rainbow flyover celebration.
 *
 * When anyone clicks the rainbow pickup the host stamps world.rainbowSwitchTick
 * (synced, additive-optional). For RAINBOW_FLYOVER_DURATION_TICKS every peer
 * renders: a dumb-looking crooked-tooth rainbow character (Imagen-generated,
 * true-alpha matte — scripts/make-rainbow-flyover-sprite.py) arcing left→right
 * across the screen while the whole background pulses a trippy hue-cycling
 * wash with slow rotating light beams.
 *
 * Determinism: every value below is a pure function of
 * (world.tick - rainbowSwitchTick) — no RNG, no wall-clock (cutsceneOverlay's
 * setTimeout anti-pattern explicitly avoided). Both peers compute identical
 * frames from the synced pair, and a save/load mid-window resumes correctly.
 *
 * Photosensitivity: hue cycles at ~0.4 Hz, squash wobble at 1.25 Hz, alpha
 * envelopes are smooth sin ramps, peak background alpha 0.30 — no strobing.
 *
 * Layering: backdrop Graphics at app.stage index 0 (true background, behind
 * the board); wash + beams + character in aboveFogLayer (a global-reach
 * celebration — visible to all, same rule as the rainbow pickup itself) but
 * below the HUD/legend (added to app.stage after aboveFogLayer in main.ts).
 */

import { Assets, Container, Graphics, Sprite, type Application, type Texture } from 'pixi.js';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  RAINBOW_FLYOVER_DURATION_TICKS,
} from '../constants.ts';
import type { World } from '../state/world.ts';

const SPRITE_URL = '/godly/rainbow-flyover/rainbow-flyover.png';
/** 512px source × 0.55 ≈ 282px on the 1920×1080 canvas — big enough to be the joke. */
const CHAR_SCALE = 0.55;
/** Fully offscreen at both ends of the traverse (≥ half the scaled diagonal). */
const OFFSCREEN_MARGIN = 220;
/** Overscan so the 2px screen-shake stage offset never exposes backdrop edges. */
const OVERSCAN = 8;
const BEAM_COUNT = 4;
const BEAM_HALF_WIDTH_RAD = 0.085;
const BEAM_LENGTH = 1500;

export interface FlyoverPose {
  readonly active: boolean;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly charAlpha: number;
  /** Hue position (0..1) of the backdrop wash this frame. */
  readonly bgHue01: number;
  /** Backdrop alpha — sin envelope, peak 0.30 (the photosensitivity charter cap). */
  readonly bgAlpha: number;
  /** Base rotation of the light beams. */
  readonly beamAngle: number;
  readonly beamAlpha: number;
}

const INACTIVE_POSE: FlyoverPose = {
  active: false, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
  charAlpha: 0, bgHue01: 0, bgAlpha: 0, beamAngle: 0, beamAlpha: 0,
};

/**
 * Pure pose math — exported for unit tests (S83 currentAnimCell precedent).
 * elapsed outside [0, duration) ⇒ inactive (covers tick-rewind after a load:
 * negative elapsed must not render a ghost flyover).
 */
export function flyoverPose(
  elapsed: number,
  duration: number,
  w: number,
  h: number,
): FlyoverPose {
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= duration) return INACTIVE_POSE;
  const t = elapsed / duration;
  const wobble = Math.sin(t * Math.PI * 10) * 0.05; // 1.25 Hz squash-stretch
  return {
    active: true,
    // Parabolic dome: lifts off lower-left, peaks high mid-screen, lands lower-right.
    x: -OFFSCREEN_MARGIN + t * (w + 2 * OFFSCREEN_MARGIN),
    y: h * 0.64 - Math.sin(t * Math.PI) * h * 0.44,
    // Lean forward through the arc + a giggling wobble on top.
    rotation: (t - 0.5) * 0.5 + Math.sin(t * Math.PI * 6) * 0.07,
    scaleX: CHAR_SCALE * (1 - wobble),
    scaleY: CHAR_SCALE * (1 + wobble),
    charAlpha: Math.min(1, t / 0.08, (1 - t) / 0.12),
    bgHue01: (t * 1.6) % 1, // 1.6 cycles over the window ≈ 0.4 Hz
    bgAlpha: Math.sin(t * Math.PI) * 0.3, // peak exactly at the 0.30 charter cap

    beamAngle: t * Math.PI * 0.9,
    beamAlpha: Math.sin(t * Math.PI) * 0.2,
  };
}

/** h,s,l ∈ [0,1] → 0xRRGGBB. Small pure utility (no custom GLSL — S29 P0 lesson). */
export function hsl01ToRgb(h: number, s: number, l: number): number {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return (
    (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255)
  );
}

export class RainbowFlyoverRenderer {
  private readonly backdrop: Graphics;
  private readonly overlay: Graphics;
  private readonly char: Container;
  private readonly sprite: Sprite;
  private readonly fallback: Graphics;
  private textureReady = false;
  private fallbackDrawn = false;
  private wasActive = false;

  constructor(app: Application, aboveFogLayer: Container) {
    // True background: index 0 sits behind the spawner ring + the whole board.
    this.backdrop = new Graphics();
    this.backdrop.eventMode = 'none';
    app.stage.addChildAt(this.backdrop, 0);

    this.overlay = new Graphics();
    this.overlay.eventMode = 'none';
    aboveFogLayer.addChild(this.overlay);

    this.char = new Container();
    this.char.eventMode = 'none';
    this.char.visible = false;
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5);
    this.fallback = new Graphics();
    this.fallback.visible = false;
    this.char.addChild(this.sprite);
    this.char.addChild(this.fallback);
    aboveFogLayer.addChild(this.char);

    // Lazy preload; on failure the procedural fallback (drawn once on first
    // activation) keeps the celebration intact — yell + lights still land.
    void Assets.load<Texture>(SPRITE_URL)
      .then((tex) => {
        this.sprite.texture = tex;
        this.textureReady = true;
      })
      .catch(() => {
        this.textureReady = false;
        console.warn('[flyover] sprite load failed — procedural fallback');
      });
  }

  /** True while the celebration window is rendering (DEV/e2e probe). */
  isActive(): boolean {
    return this.wasActive;
  }

  /** Idempotent per-frame render keyed purely off (world.tick, rainbowSwitchTick). */
  sync(world: World): void {
    const switchTick = world.rainbowSwitchTick;
    const pose =
      switchTick === undefined
        ? INACTIVE_POSE
        : flyoverPose(
            world.tick - switchTick,
            RAINBOW_FLYOVER_DURATION_TICKS,
            CANVAS_WIDTH,
            CANVAS_HEIGHT,
          );

    if (!pose.active) {
      if (this.wasActive) {
        this.backdrop.clear();
        this.overlay.clear();
        this.char.visible = false;
        this.wasActive = false;
      }
      return;
    }
    this.wasActive = true;

    // ── trippy backdrop: three vertical hue bands sweeping together ──
    const bd = this.backdrop;
    bd.clear();
    const bandW = (CANVAS_WIDTH + 2 * OVERSCAN) / 3;
    for (let i = 0; i < 3; i++) {
      bd.rect(-OVERSCAN + i * bandW, -OVERSCAN, bandW, CANVAS_HEIGHT + 2 * OVERSCAN).fill({
        color: hsl01ToRgb((pose.bgHue01 + i * 0.13) % 1, 0.95, 0.66),
        alpha: pose.bgAlpha,
      });
    }

    // ── above-fog rotating beams (NO full-screen wash here: a 4th full-canvas
    // fill per frame tanked CI software-GL to seconds-per-frame and costs real
    // low-end GPUs too — the backdrop bands + beams carry the trippy look;
    // S84 CHECK round 3) ──
    const ov = this.overlay;
    ov.clear();
    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;
    for (let i = 0; i < BEAM_COUNT; i++) {
      const a = pose.beamAngle + (i * Math.PI * 2) / BEAM_COUNT;
      ov.poly([
        cx, cy,
        cx + Math.cos(a - BEAM_HALF_WIDTH_RAD) * BEAM_LENGTH,
        cy + Math.sin(a - BEAM_HALF_WIDTH_RAD) * BEAM_LENGTH,
        cx + Math.cos(a + BEAM_HALF_WIDTH_RAD) * BEAM_LENGTH,
        cy + Math.sin(a + BEAM_HALF_WIDTH_RAD) * BEAM_LENGTH,
      ]).fill({
        color: hsl01ToRgb((pose.bgHue01 + i * 0.25) % 1, 0.85, 0.8),
        alpha: pose.beamAlpha,
      });
    }

    // ── the dumb rainbow himself ──
    this.char.visible = true;
    this.char.position.set(pose.x, pose.y);
    this.char.rotation = pose.rotation;
    this.char.alpha = pose.charAlpha;
    if (this.textureReady) {
      this.sprite.visible = true;
      this.fallback.visible = false;
      this.sprite.scale.set(pose.scaleX, pose.scaleY);
    } else {
      this.sprite.visible = false;
      this.fallback.visible = true;
      if (!this.fallbackDrawn) {
        this.drawFallbackChar();
        this.fallbackDrawn = true;
      }
      this.fallback.scale.set(pose.scaleX / CHAR_SCALE, pose.scaleY / CHAR_SCALE);
    }
  }

  /**
   * Procedural stand-in mirroring rainbowRenderer's pickup style (6 ROYGBIV
   * arc bands + googly eyes + one crooked tooth) at flyover size. Drawn once.
   */
  private drawFallbackChar(): void {
    const g = this.fallback;
    const BANDS = [0xe53935, 0xfb8c00, 0xfdd835, 0x43a047, 0x1e88e5, 0x8e24aa];
    const R = 140;
    const band = R / (BANDS.length + 1.5);
    for (let i = 0; i < BANDS.length; i++) {
      const r = R - i * band - band * 0.5;
      g.arc(0, 0, r, Math.PI, Math.PI * 2).stroke({
        width: band * 0.95, color: BANDS[i], alpha: 0.95, cap: 'butt',
      });
    }
    g.poly([-band, 0, band, 0, 0, band * 2.4]).fill({ color: 0xfffde7 });
    g.circle(-R * 0.34, -band * 0.7, band * 0.5).fill({ color: 0xffffff });
    g.circle(R * 0.34, -band * 0.7, band * 0.62).fill({ color: 0xffffff });
    g.circle(-R * 0.34, -band * 0.7, band * 0.2).fill({ color: 0x222222 });
    g.circle(R * 0.34, -band * 0.62, band * 0.2).fill({ color: 0x222222 });
  }
}
