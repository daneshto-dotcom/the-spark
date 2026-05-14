/**
 * SPARK — godly cinematic overlay (S22 P3 D3 from S21 Council).
 *
 * Wall-clock-animated full-screen overlay that plays a recipe's cinematic
 * (HTML <video>), overlays voice + character sprite at scripted offsets,
 * then fades out. Skippable via Space / Esc. Physics keeps ticking (D5).
 *
 * Lifecycle (wall-clock ms):
 *   t=0       — fade-in 300 ms (black overlay alpha 0 → 1)
 *   t=300     — video.play() — visible, luma-keyed if recipe.lumaKey.enabled
 *   t=cinematicMs+300 — video paused; characterSprite crossfades over targetPos
 *   t=cinematicMs+sustainedEffectMs+300 — fade-out 300 ms → onComplete()
 *
 * Aborts cleanly via abort() — used by main.ts on peer-drop (PRIME-AUDIT Δ3).
 *
 * Failure paths (Battle Ledger row 7 mp4 hardening):
 *   - video.play().catch() → onLoadFailed() → onComplete() immediately
 *   - 5s load-timeout if video never reports canplay → same fallback
 *
 * Voice playback is delegated to audioManager via a passed-in `playVoice` hook.
 */

import { Application, Container, Graphics, Sprite, Assets, Texture } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import type { GodlyRecipe } from '../state/godlyRecipes/types.ts';
import { CinematicLumaKeyFilter } from './cinematicLumaKey.ts';

const FADE_MS = 300;
const VIDEO_LOAD_TIMEOUT_MS = 5000;

export interface CutsceneContext {
  readonly targetPos: { readonly x: number; readonly y: number };
  /** Called when the cinematic completes naturally OR aborts. */
  onComplete(): void;
  /** Plays the recipe's voice clip at the scripted offset. audioManager hook. */
  playVoice(assetUrl: string): void;
  /**
   * S25 P0 — fires at `recipe.cinematicMs` after `play()` starts (the same moment the
   * static character sprite would crossfade in). Main.ts dispatches SPAWN_CREATURE here
   * gated on `world.isHost`. Optional for back-compat with pre-S25 callers. Cleared by
   * `abort()` (timer is pushed onto `this.timers`, inherits free cleanup).
   */
  onCinematicHandoff?(): void;
}

export class CutsceneOverlay {
  readonly container: Container;
  private readonly bg: Graphics;
  private readonly app: Application;
  private videoEl: HTMLVideoElement | null = null;
  private characterSprite: Sprite | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private rafId: number | null = null;
  private active = false;

  constructor(app: Application) {
    this.app = app;
    this.container = new Container();
    this.bg = new Graphics();
    this.bg.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x000000, alpha: 1 });
    this.container.addChild(this.bg);
    this.container.visible = false;
    app.stage.addChild(this.container);
  }

  isActive(): boolean {
    return this.active;
  }

  async play(recipe: GodlyRecipe, ctx: CutsceneContext): Promise<void> {
    if (this.active) {
      // Concurrent call — shouldn't happen given world.activeCinematicPlayerId
      // single-slot serialization, but be defensive.
      this.abort();
    }
    this.active = true;
    this.container.visible = true;
    this.bg.alpha = 0;

    // Fade-in (wall-clock).
    this.fade(0, 1, FADE_MS);

    // Build + mount video DOM element on top of canvas.
    const video = document.createElement('video');
    video.src = recipe.cinematicAsset;
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    video.muted = false;
    video.style.position = 'fixed';
    video.style.zIndex = '2000';
    // Match canvas pixel rect for cinematic-fills-game-area feel.
    const rect = this.app.canvas.getBoundingClientRect();
    video.style.left = `${rect.left}px`;
    video.style.top = `${rect.top}px`;
    video.style.width = `${rect.width}px`;
    video.style.height = `${rect.height}px`;
    video.style.objectFit = 'contain';
    video.style.background = 'transparent';
    if (recipe.lumaKey.enabled) {
      video.style.mixBlendMode = 'screen';
      // mix-blend-mode 'screen' on the DOM <video> over black canvas
      // effectively keys whites by additive blending: black canvas + white
      // video pixel = white (visible). Black video pixel + black canvas = black.
      // That's the OPPOSITE of what we want. Switch to 'multiply':
      // black canvas × white = black (no effect — bad), black × dark = black.
      // Right answer: use a Pixi Sprite-from-video texture path with the
      // CinematicLumaKeyFilter applied (proper alpha keying via shader).
      // Toggle: leave mixBlendMode unset; mount the shader-keyed sprite path.
      video.style.mixBlendMode = '';
      this.mountVideoViaShader(video, recipe.lumaKey.threshold);
    } else {
      document.body.appendChild(video);
    }

    // Load timeout (Battle Ledger row 7 mitigation).
    const loadTimeout = setTimeout(() => {
      console.warn('[cutscene] video load timeout — falling back to instant SEVER_BOND');
      this.cleanup(video);
      ctx.onComplete();
    }, VIDEO_LOAD_TIMEOUT_MS);
    this.timers.push(loadTimeout);

    // canplay clears the load-timeout + starts playback.
    video.addEventListener('canplay', () => {
      clearTimeout(loadTimeout);
      void video.play().catch((err: unknown) => {
        console.warn('[cutscene] video.play() rejected:', err);
        this.cleanup(video);
        ctx.onComplete();
      });
    }, { once: true });

    this.videoEl = video;

    // Voice at scripted offset.
    const voiceTimer = setTimeout(() => {
      ctx.playVoice(recipe.voiceAsset);
    }, recipe.voiceOffsetMs);
    this.timers.push(voiceTimer);

    // Character sprite crossfade at cinematicMs (just before sustained window opens).
    const spriteTimer = setTimeout(() => {
      void this.crossfadeCharacterSprite(recipe.characterSprite, ctx.targetPos);
    }, recipe.cinematicMs);
    this.timers.push(spriteTimer);

    // S25 P0 — creature spawn handoff at cinematicMs. Parallel to spriteTimer so the
    // handoff fires regardless of the static-sprite texture load result. Main.ts
    // host-gates the SPAWN_CREATURE dispatch (1v1 client receives a no-op callback so
    // the per-side world.creatures Maps don't diverge — Council R1 Gap A fix).
    if (ctx.onCinematicHandoff !== undefined) {
      const handoffTimer = setTimeout(() => {
        ctx.onCinematicHandoff?.();
      }, recipe.cinematicMs);
      this.timers.push(handoffTimer);
    }

    // Final fade-out + onComplete after cinematicMs + sustainedEffectMs.
    const totalMs = recipe.cinematicMs + recipe.sustainedEffectMs;
    const completeTimer = setTimeout(() => {
      this.fade(1, 0, FADE_MS, () => {
        this.cleanup(video);
        ctx.onComplete();
      });
    }, totalMs);
    this.timers.push(completeTimer);
  }

  /**
   * Cancel all wall-clock timers and tear down DOM/video. Idempotent on inactive
   * overlay. CRITICAL contract: any code path that dispatches GODLY_ABORT MUST
   * also call this so the S25 P0 onCinematicHandoff timer (which would dispatch
   * SPAWN_CREATURE post-abort, violating world state) is cleared. Existing
   * main.ts connection-lost handler honors this contract.
   */
  abort(): void {
    if (!this.active) return;
    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.videoEl !== null) this.cleanup(this.videoEl);
  }

  /**
   * Skippable lifecycle hook — call from a window keydown (Space/Esc) listener.
   * Treats skip as immediate completion: ends the cinematic + fires onComplete.
   */
  skipIfActive(onComplete: () => void): boolean {
    if (!this.active) return false;
    this.abort();
    onComplete();
    return true;
  }

  private cleanup(video: HTMLVideoElement): void {
    try {
      video.pause();
      video.src = '';
      video.load();
      video.remove();
    } catch {
      // best-effort
    }
    if (this.characterSprite !== null) {
      this.container.removeChild(this.characterSprite);
      this.characterSprite.destroy();
      this.characterSprite = null;
    }
    this.container.visible = false;
    this.videoEl = null;
    this.active = false;
  }

  private fade(from: number, to: number, durMs: number, done?: () => void): void {
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / durMs);
      this.bg.alpha = from + (to - from) * t;
      if (t < 1) {
        this.rafId = requestAnimationFrame(step);
      } else {
        this.rafId = null;
        if (done) done();
      }
    };
    this.rafId = requestAnimationFrame(step);
  }

  private mountVideoViaShader(video: HTMLVideoElement, threshold: number): void {
    // For v1 simplicity: append the video to body with a luma-key CSS approach
    // is not supported (no native CSS chroma-key). Instead, render the video
    // as a Pixi Sprite-from-texture with our custom CinematicLumaKeyFilter.
    // This requires the video to be off-DOM (hidden) and updated via texture.
    video.style.position = 'absolute';
    video.style.left = '-9999px';
    document.body.appendChild(video);
    // PixiJS v8 supports Texture.from(HTMLVideoElement) for live video textures.
    const texture = Texture.from(video);
    const sprite = new Sprite(texture);
    sprite.width = CANVAS_WIDTH;
    sprite.height = CANVAS_HEIGHT;
    sprite.filters = [new CinematicLumaKeyFilter({ threshold })];
    this.container.addChild(sprite);
    this.characterSprite = sprite; // tracked for cleanup, even though it's the video not character
  }

  private async crossfadeCharacterSprite(
    assetUrl: string,
    targetPos: { x: number; y: number },
  ): Promise<void> {
    try {
      const texture = await Assets.load(assetUrl);
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(targetPos.x, targetPos.y);
      sprite.alpha = 0;
      // Scale: zap sprite is 512×512; render at ~128 px on screen (1/4 size).
      sprite.scale.set(0.25);
      this.container.addChild(sprite);
      // Fade-in over 200 ms (wall-clock).
      const start = performance.now();
      const step = (now: number): void => {
        const t = Math.min(1, (now - start) / 200);
        sprite.alpha = t;
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    } catch (err) {
      console.warn('[cutscene] character sprite load failed:', err);
    }
  }
}
