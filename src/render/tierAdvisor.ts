/**
 * SPARK — S195 N17 — THE "TRY A LOWER GRAPHICS TIER" HINT. ⚠ MINE (the brief's, owner not asked).
 *
 * When a match has been running slowly for a few seconds, ONE line appears suggesting the next tier down.
 * ⛔ IT NEVER SWITCHES. The owner's complaint was a switch that did nothing; the cure is not a switch that
 * flips itself. The player reads the line, opens Settings, chooses. Shown at most once per tier per page
 * load, only while PLAYING, and hides itself after `TIER_HINT_SHOW_MS`.
 *
 * Render-only: it reads the real frame interval (requestAnimationFrame cadence) and the stored tier.
 */
import type { GraphicsTier } from './displayPrefs.ts';

/** ⚠ MINE — a frame slower than this counts as slow (25 fps). */
export const TIER_HINT_SLOW_FRAME_MS = 40;
/** ⚠ MINE — the window the slow share is judged over. */
export const TIER_HINT_WINDOW_MS = 5000;
/** ⚠ MINE — share of the window's TIME spent in slow frames that triggers the hint. */
export const TIER_HINT_SLOW_SHARE = 0.7;
/** ⚠ MINE — how long the line stays up. */
export const TIER_HINT_SHOW_MS = 12000;

const NEXT_TIER: Readonly<Record<GraphicsTier, GraphicsTier | null>> = { HIGH: 'LOW', LOW: 'MINIMAL', MINIMAL: null };

/**
 * The decision, pure: feed it every frame's interval; it answers the tier to suggest, once, when the last
 * `TIER_HINT_WINDOW_MS` of PLAYING time was mostly slow frames. A frame interval over 1 s (a hidden tab, a
 * breakpoint) resets the window instead of counting — it is not the game being slow.
 */
export class TierAdvisor {
  private readonly frames: number[] = [];
  private total = 0;
  private slow = 0;
  private readonly suggested = new Set<GraphicsTier>();

  note(dtMs: number, playing: boolean, tier: GraphicsTier): GraphicsTier | null {
    if (!playing || dtMs <= 0 || dtMs > 1000) { this.reset(); return null; }
    this.frames.push(dtMs);
    this.total += dtMs;
    if (dtMs > TIER_HINT_SLOW_FRAME_MS) this.slow += dtMs;
    while (this.total - this.frames[0]! >= TIER_HINT_WINDOW_MS) {
      const old = this.frames.shift()!;
      this.total -= old;
      if (old > TIER_HINT_SLOW_FRAME_MS) this.slow -= old;
    }
    const next = NEXT_TIER[tier];
    if (next === null || this.suggested.has(tier)) return null;
    if (this.total < TIER_HINT_WINDOW_MS * 0.95) return null;
    if (this.slow / this.total < TIER_HINT_SLOW_SHARE) return null;
    this.suggested.add(tier);
    this.reset();
    return next;
  }

  private reset(): void {
    this.frames.length = 0;
    this.total = 0;
    this.slow = 0;
  }
}

/** The one-line DOM hint. Created lazily, so a fast machine never builds it. */
let hintEl: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function tierHintText(next: GraphicsTier): string {
  return `The game is running slowly. Try Graphics: ${next} in Settings (top right).`;
}

export function showTierHint(next: GraphicsTier): void {
  if (typeof document === 'undefined') return;
  if (hintEl === null) {
    hintEl = document.createElement('div');
    hintEl.id = 'tier-hint';
    hintEl.setAttribute('role', 'status');
    const st = hintEl.style;
    st.position = 'fixed';
    st.top = '48px';
    st.right = '16px';
    st.padding = '6px 10px';
    st.background = 'rgba(8, 12, 24, 0.88)';
    st.border = '1px solid rgba(59, 215, 255, 0.5)';
    st.borderRadius = '4px';
    st.color = 'rgba(255, 255, 255, 0.9)';
    st.font = '12px sans-serif';
    st.zIndex = '20';
    st.pointerEvents = 'none';
    document.body.appendChild(hintEl);
  }
  hintEl.textContent = tierHintText(next);
  hintEl.style.display = 'block';
  if (hideTimer !== null) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (hintEl !== null) hintEl.style.display = 'none'; }, TIER_HINT_SHOW_MS);
}

const advisor = new TierAdvisor();
let lastFrameMs = -1;

/** Called once per frame by `main.ts`. */
export function noteFrameForTierHint(nowMs: number, playing: boolean, tier: GraphicsTier): void {
  const dt = lastFrameMs < 0 ? 0 : nowMs - lastFrameMs;
  lastFrameMs = nowMs;
  const next = advisor.note(dt, playing, tier);
  if (next !== null) showTierHint(next);
}
