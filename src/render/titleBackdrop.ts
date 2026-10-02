/**
 * SPARK — S194 T5: THE HOME SCREEN'S LIVING BACKDROP. Lazy chunk (`titleScreen.ts` imports it on first
 * show), so the entry bundle pays only for the import site.
 *
 * Owner, S193: *"Also in the home screen … can be improved upon too."* S194, about the Pixi fx work:
 * *"looks a lot better … let's keep that up."* So it is built ON the fx substrate (`render/fx/*`):
 *   · a breathing halo behind the SPARK logo and a slow ring pulse (soft textures, additive);
 *   · embers rising across the screen in the six race colours — the stateless `forEachLive` emitter,
 *     every mote a pure function of (birth frame, index), so nothing is stored between frames;
 *   · the six spark shapes orbiting the logo on a tilted ellipse, each in the colour of the race that
 *     owns it (the S169 R153 mapping the footer palette uses).
 *
 * ⛔ NOT CLICKABLE AND NEVER IN THE WAY: every child is `eventMode = 'none'`, and the whole thing sits
 * UNDER the title's buttons (child 0 of the title container). Render-only: the clock is the ticker's
 * elapsed ms turned into a frame index — never the sim, never `Math.random`.
 */
import { Container, Graphics, Sprite, Ticker } from 'pixi.js';
import { ALL_SPARK_TYPES, CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_COLORS } from '../constants.ts';
import { raceColorForShape } from '../state/races.ts';
import { FxLayer } from './fx/fxLayer.ts';
import { forEachLive, fxHash, envelope, mixColor } from './fx/emitter.ts';
import { softTexture } from './fx/softTextures.ts';
import { drawSparkGlyph } from './sparkGlyph.ts';

/** Where the logo sits (matches `titleScreen.ts`: centre x, 160 px above centre). */
const LOGO_X = CANVAS_WIDTH / 2;
const LOGO_Y = CANVAS_HEIGHT / 2 - 160;
const SEED = 0x5a7c;
/** Embers: a new pair every 3 frames, each living 6 s. */
const EMBER_PERIOD = 3;
const EMBER_LIFE = 360;
const EMBER_PER_BIRTH = 2;
/** The orbit: radii, tilt, and one revolution every ~40 s. */
const ORBIT_RX = 420;
const ORBIT_RY = 120;
const ORBIT_PERIOD_FRAMES = 2400;

export class TitleBackdrop {
  readonly container = new Container();
  private readonly halo = new Sprite(softTexture('soft'));
  private readonly ring = new Sprite(softTexture('ring'));
  private readonly embers = new FxLayer('title-embers');
  private readonly orbit = new Graphics();
  private elapsedMs = 0;
  private running = false;
  private readonly tick = (t: Ticker): void => this.step(t.deltaMS);

  /** ⭐ S194 R194-24 — the arcade menu reuses this behind its own title, so the logo centre is a parameter. */
  private readonly cx: number;
  private readonly cy: number;

  constructor(opts: { readonly logoX?: number; readonly logoY?: number } = {}) {
    this.cx = opts.logoX ?? LOGO_X;
    this.cy = opts.logoY ?? LOGO_Y;
    this.container.eventMode = 'none';
    this.container.label = 'title-backdrop';
    for (const s of [this.halo, this.ring]) {
      s.anchor.set(0.5);
      s.position.set(this.cx, this.cy);
      s.blendMode = 'add';
      s.eventMode = 'none';
    }
    this.halo.tint = 0x3b8cff;
    this.ring.tint = 0x9fd8ff;
    this.orbit.eventMode = 'none';
    this.container.addChild(this.halo, this.ring, this.embers.container, this.orbit);
    this.draw(0);
  }

  /** Start / stop animating with the title's visibility. */
  setRunning(on: boolean): void {
    if (on === this.running) return;
    this.running = on;
    if (on) Ticker.shared.add(this.tick);
    else Ticker.shared.remove(this.tick);
  }

  destroy(): void {
    this.setRunning(false);
    this.container.destroy({ children: true });
  }

  private step(dtMs: number): void {
    this.elapsedMs += Math.min(dtMs, 100);
    this.draw(Math.floor(this.elapsedMs / (1000 / 60)));
  }

  /** Draw frame `f`. Pure in `f` (exported through the class for the test). */
  draw(f: number): void {
    // The halo breathes (period 4 s), the ring swells outward and fades (period 3 s).
    const breath = 0.5 + 0.5 * Math.sin((f / 240) * Math.PI * 2);
    this.halo.width = 900 + 80 * breath;
    this.halo.height = 380 + 40 * breath;
    this.halo.alpha = 0.22 + 0.1 * breath;
    const ringT = (f % 180) / 180;
    const ringSize = 260 + 520 * ringT;
    this.ring.width = ringSize * 1.9;
    this.ring.height = ringSize * 0.62;
    this.ring.alpha = 0.22 * (1 - ringT);

    // Embers: born along the bottom edge, rising with a sideways sway, fading in and out.
    this.embers.begin();
    forEachLive(f, EMBER_PERIOD, EMBER_LIFE, EMBER_PER_BIRTH, 0, (b, k, t) => {
      const h0 = fxHash(SEED, b, k);
      const h1 = fxHash(SEED + 1, b, k);
      const h2 = fxHash(SEED + 2, b, k);
      const x0 = h0 * CANVAS_WIDTH;
      const rise = CANVAS_HEIGHT * (0.55 + 0.5 * h1);
      const x = x0 + Math.sin(t * Math.PI * 2 * (0.6 + h2) + h0 * 6.283) * 40;
      const y = CANVAS_HEIGHT + 20 - rise * t;
      const color = PLAYER_COLORS[Math.floor(h2 * PLAYER_COLORS.length) % PLAYER_COLORS.length]!;
      const size = 5 + 9 * h1;
      const a = envelope(t, 0.15) * (0.35 + 0.4 * h0);
      this.embers.emit('soft', x, y, size * 3, size * 3, 0, a * 0.5, color, 'add');
      this.embers.emit('core', x, y, size, size, 0, a, 0xffffff, 'add');
    });
    this.embers.end();

    // The six shapes, orbiting the logo. Back half dimmer and smaller, so the ellipse reads as depth.
    const o = this.orbit;
    o.clear();
    const n = ALL_SPARK_TYPES.length;
    for (let i = 0; i < n; i++) {
      const a = ((f % ORBIT_PERIOD_FRAMES) / ORBIT_PERIOD_FRAMES) * Math.PI * 2 + (i / n) * Math.PI * 2;
      const depth = 0.5 + 0.5 * Math.sin(a); // 1 = front
      const x = this.cx + Math.cos(a) * ORBIT_RX;
      const y = this.cy + 10 + Math.sin(a) * ORBIT_RY;
      const type = ALL_SPARK_TYPES[i]!;
      const color = mixColor(raceColorForShape(type) ?? 0xffffff, 0x0a0f18, 0.6 * (1 - depth));
      drawSparkGlyph(o, x, y, 10 + 8 * depth, type, color);
    }
  }
}
