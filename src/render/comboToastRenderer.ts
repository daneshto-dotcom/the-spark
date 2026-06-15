/**
 * SPARK — S88 G3a: in-match "NEW COMBO — <name>!" discovery toast.
 *
 * The host stamps world.comboToastTick (+ world.lastDiscoveredComboNames) the
 * first time a magic combo forms in a match (state/comboDiscovery.ts). For
 * COMBO_TOAST_DURATION_TICKS every peer renders a transient center-band Text,
 * keyed PURELY off (world.tick - comboToastTick) — no RNG, no wall-clock — so
 * host + 10Hz client render identically (the rainbowSwitchTick pattern; a one-
 * shot world.effects entry would miss the client ~5/6 of the time).
 *
 * Layering: HUD/main-stage (NOT aboveFogLayer) — a screen-space notification, so
 * the fog.spec aboveFogChildren contract is untouched (PRIME-AUDIT R4). Visual
 * only (no audio). Photosensitivity: one smooth sin alpha ramp, peak 0.95, no
 * strobe. Overwrite = restart (a fresh discovery retargets the window); a late
 * joiner whose window already elapsed sees the synced counter but not the toast.
 */
import { Container, Text, TextStyle, type Application } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, COMBO_TOAST_DURATION_TICKS } from '../constants.ts';
import type { World } from '../state/world.ts';

export interface ComboToastPose {
  readonly active: boolean;
  readonly alpha: number;
  readonly scale: number;
  readonly y: number;
}

const INACTIVE_POSE: ComboToastPose = { active: false, alpha: 0, scale: 1, y: 0 };

/**
 * Upper-center band — clear of the top-left leaderboard rows AND the center win
 * banner (PRIME-AUDIT R4). 0.28 × 1080 ≈ 302 px.
 */
const TOAST_Y_FRAC = 0.28;
/** Peak alpha (text, not a full-screen fill — kept < 1 for a soft, smooth ramp). */
const PEAK_ALPHA = 0.95;

/**
 * Pure pose math — exported for unit tests (flyoverPose precedent). elapsed
 * outside [0, duration) ⇒ inactive (covers tick-rewind after a load: a negative
 * or past-window elapsed must not render a ghost toast).
 */
export function comboToastPose(elapsed: number, duration: number, h: number): ComboToastPose {
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= duration) return INACTIVE_POSE;
  const t = elapsed / duration;
  return {
    active: true,
    // fade in over the first 12%, hold at PEAK_ALPHA, fade out over the last 22%.
    alpha: Math.min(PEAK_ALPHA, t / 0.12, (1 - t) / 0.22),
    // gentle pop-in: 0.7 → 1.0 over the first 15%, then steady.
    scale: 0.7 + 0.3 * Math.min(1, t / 0.15),
    y: h * TOAST_Y_FRAC,
  };
}

export class ComboToastRenderer {
  private readonly container: Container;
  private readonly text: Text;
  private wasActive = false;
  private shownTick: number | undefined = undefined;

  constructor(app: Application) {
    this.container = new Container();
    this.container.eventMode = 'none';
    this.container.visible = false;
    this.text = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 40,
        fontWeight: 'bold',
        fill: 0xffe066, // gold — reads as "magic" vs the white HUD
        stroke: { color: 0x000000, width: 4 },
        align: 'center',
      }),
    });
    this.text.anchor.set(0.5);
    this.text.position.set(CANVAS_WIDTH / 2, 0);
    this.container.addChild(this.text);
    app.stage.addChild(this.container);
  }

  /** True while the toast window is rendering (DEV/e2e probe). */
  isActive(): boolean {
    return this.wasActive;
  }

  /** Idempotent per-frame render keyed purely off (world.tick, comboToastTick). */
  sync(world: World): void {
    const toastTick = world.comboToastTick;
    const pose =
      toastTick === undefined
        ? INACTIVE_POSE
        : comboToastPose(world.tick - toastTick, COMBO_TOAST_DURATION_TICKS, CANVAS_HEIGHT);

    if (!pose.active) {
      if (this.wasActive) {
        this.container.visible = false;
        this.wasActive = false;
        this.shownTick = undefined;
      }
      return;
    }

    // Refresh the label only when the window (re)starts. Names ride the synced
    // array; same-tick multi-discoveries join with " + " (PRIME-AUDIT R1).
    if (this.shownTick !== toastTick) {
      const names = world.lastDiscoveredComboNames ?? [];
      this.text.text =
        names.length > 0 ? `NEW COMBO — ${names.join(' + ')}!` : 'NEW COMBO!';
      this.shownTick = toastTick;
    }

    this.wasActive = true;
    this.container.visible = true;
    this.container.alpha = pose.alpha;
    this.text.position.set(CANVAS_WIDTH / 2, pose.y);
    this.text.scale.set(pose.scale);
  }
}
