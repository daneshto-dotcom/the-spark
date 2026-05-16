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

import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import type { GodlyRecipe } from '../state/godlyRecipes/types.ts';
import { CinematicLumaKeyFilter } from './cinematicLumaKey.ts';

/**
 * S31 P0-1 — EXPORTED so main.ts can include FADE_MS in the
 * `pendingCreatureSpawn.fireAtTick` math. Pre-S31 fireAtTick was
 * `world.tick + cinematicMsToTicks(cinematicMs)` which dispatches
 * SPAWN_CREATURE the moment the mp4 cinematic ends — but the overlay
 * `bg` is still opaque (`alpha=1`) for another `sustainedEffectMs` ms
 * and then fades to alpha=0 over FADE_MS ms. The creature was rendered
 * for ~48 of its 60 SPAWNING-state ticks UNDER the still-opaque overlay,
 * hiding the entry pulse the spawn-fix is meant to expose. Including
 * FADE_MS in the spawn-delay math means the creature spawns at the
 * exact tick `bg.alpha` reaches 0 — full SPAWNING animation visible.
 */
export const FADE_MS = 300;
const VIDEO_LOAD_TIMEOUT_MS = 5000;

export interface CutsceneContext {
  readonly targetPos: { readonly x: number; readonly y: number };
  /** Called when the cinematic completes naturally OR aborts. */
  onComplete(): void;
  /** Plays the recipe's voice clip at the scripted offset. audioManager hook. */
  playVoice(assetUrl: string): void;
  // S28 P0 — `onCinematicHandoff` DELETED (Council Q2 UNANIMOUS A). Wall-clock
  // setTimeout(handoff, cinematicMs) violated replay determinism (S25 reflexion
  // #6). Replaced by `world.pendingCreatureSpawn` schedule polled in the
  // physics tick loop (see main.ts startCinematicIfNeeded + tick Step 0).
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
  // S30 P0a — per-tick texture update ticker hook reference. Set in
  // mountVideoViaShader after loadeddata fires (when texture is bound to a
  // valid first frame). Removed in cleanup() to prevent leaks across cinematics.
  private videoTickerFn: (() => void) | null = null;

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
    // S30 P0a — REMOVED `video.crossOrigin = 'anonymous'`. Same-origin GH Pages
    // serves the mp4; CORS preflight was not required and was potentially
    // causing silent WebGL texture-taint where Pixi's VideoSource would
    // degrade to a black/empty frame despite the shader compiling cleanly
    // (S29 P0a shader fix verified at engine level but user saw static voltkin
    // in real Chrome — Grok pre-mortem H3 hypothesis).
    video.playsInline = true;
    // S30 P0a — muted=true for Chrome autoplay-policy compliance. The cinematic
    // voice clip is delegated to audioManager.playOneShot via recipe.voiceAsset
    // (.ogg) at voiceOffsetMs; the mp4 audio track is unused. Pre-S30
    // `muted=false` caused video.play() to silently reject in real Chrome when
    // the gesture-to-play latency exceeded the user-activation window, leaving
    // Pixi's texture bound to a never-advanced first frame.
    video.muted = true;
    // S30 P0a — explicit preload hint so metadata + first frame fetch starts
    // immediately, not deferred until play() is called.
    video.preload = 'auto';
    // S30 P0a — diagnostic event logger gated by ?debug=1 URL param. Surfaces
    // every video pipeline event (load, decode, play, error) so the next bug
    // report has actionable signal not just "black screen". Removed automatically
    // when the video element is destroyed by cleanup().
    const isDebug = typeof window !== 'undefined'
      && window.location.search.includes('debug=1');
    const debugLog = (event: string): void => {
      if (!isDebug) return;
      console.log(`[cinematic] video.${event}`, {
        readyState: video.readyState,
        currentTime: video.currentTime,
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        paused: video.paused,
        muted: video.muted,
        error: video.error?.message ?? null,
      });
    };
    const videoEvents = [
      'loadstart', 'loadedmetadata', 'loadeddata',
      'canplay', 'canplaythrough', 'play', 'playing',
      'pause', 'ended', 'error', 'stalled', 'suspend', 'waiting',
    ] as const;
    for (const evt of videoEvents) {
      video.addEventListener(evt, () => debugLog(evt));
    }
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

    // S30 P0a — explicit video.load() to kick off metadata + initial-frame
    // fetch BEFORE the texture binding. GH Pages serves mp4 with content-type
    // video/mp4, but without explicit load() Chrome can defer the fetch until
    // play() is called, leaving the first frame undecoded when Pixi tries to
    // bind. Per Grok pre-mortem DG1, explicit load() ensures readyState
    // progression begins immediately.
    video.load();

    // Load timeout (Battle Ledger row 7 mitigation).
    const loadTimeout = setTimeout(() => {
      console.warn('[cutscene] video load timeout — falling back to instant SEVER_BOND');
      this.cleanup(video);
      ctx.onComplete();
    }, VIDEO_LOAD_TIMEOUT_MS);
    this.timers.push(loadTimeout);

    // S30 P0a — switched event from `canplay` to `loadeddata`. loadeddata fires
    // when the first frame has been decoded (readyState>=HAVE_CURRENT_DATA),
    // giving Pixi's Texture.from(video) a real frame to bind to GPU. `canplay`
    // (readyState>=HAVE_FUTURE_DATA) can fire before the actual current frame
    // is GPU-uploadable on some Chrome versions, which silently produces a
    // black/empty texture under the luma-key shader (lum < 0.88 threshold →
    // opaque-black instead of transparent). Per Grok pre-mortem DG1, also
    // nudge currentTime to 0.001 to force the decoder to actually extract a
    // visible first frame (browsers sometimes lazy-extract until seek).
    video.addEventListener('loadeddata', () => {
      clearTimeout(loadTimeout);
      if (video.currentTime < 0.001) {
        video.currentTime = 0.001;
      }
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

    // S30 P0b — REMOVED character sprite crossfade. Pre-S30 a static voltkin-zap
    // PNG was mounted at targetPos at t=cinematicMs and held for the entire
    // sustainedEffectMs window (8 sec). This was the "static voltkin stamp" the
    // user reported seeing instead of motion/attack — the actual creature
    // spawned at the same targetPos at t=cinematicMs and lived for 8 sec UNDER
    // the opaque-black bg overlay. The static sprite was the only voltkin the
    // user could see, and it never moved. Removing this mount + reducing
    // recipe.sustainedEffectMs (voltkin.ts) from 8000→500 means the overlay
    // clears within 800 ms of mp4 end, revealing the play area + the actual
    // creature (creatureRenderer's voltkin-zap.png at creature.pos). The
    // gameplay creature IS the visual handoff — no separate cutscene sprite
    // needed.
    // Original code (preserved for reference / restore-via-revert):
    //   const spriteTimer = setTimeout(() => {
    //     void this.crossfadeCharacterSprite(recipe.characterSprite, ctx.targetPos);
    //   }, recipe.cinematicMs);
    //   this.timers.push(spriteTimer);

    // S28 P0 — wall-clock setTimeout for creature spawn handoff REMOVED
    // (Council Q2 UNANIMOUS A). Spawn scheduling is now tick-deterministic via
    // `world.pendingCreatureSpawn` set in main.ts startCinematicIfNeeded and
    // polled in the physics tick loop. Replay-safe + 1v1 determinism preserved.

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
   * overlay. S28 P0 — the S25 onCinematicHandoff wall-clock setTimeout was
   * REMOVED in S28 (replaced by tick-deterministic `world.pendingCreatureSpawn`
   * — see Council Q2 UNANIMOUS A + Δ5 GODLY_ABORT clear in world.ts). This
   * abort() now only tears down DOM/video timers + RAF; the GODLY_ABORT
   * reducer body handles the pending-spawn cancellation independently.
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
    // S30 P0a — remove per-tick texture update ticker hook (added in
    // mountVideoViaShader.setup after loadeddata fires). Must run before video
    // teardown so the ticker doesn't briefly point at a removed texture.
    if (this.videoTickerFn !== null) {
      this.app.ticker.remove(this.videoTickerFn);
      this.videoTickerFn = null;
    }
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
    // Render the video as a Pixi Sprite-from-texture with our custom
    // CinematicLumaKeyFilter. Video lives off-DOM (left:-9999px) so the DOM
    // compositor doesn't paint it; only the Pixi-rendered luma-keyed sprite
    // is visible to the user.
    video.style.position = 'absolute';
    video.style.left = '-9999px';
    document.body.appendChild(video);

    // S30 P0a — defer Texture.from(video) until first frame is decoded.
    // Previously this fired immediately, binding the texture to a pre-load
    // video element with videoWidth/Height === 0. Pixi's VideoSource
    // autoUpdate should pump frames after binding, but if the binding happens
    // BEFORE there's any frame data, the texture caches an empty/black source
    // and rVFC (requestVideoFrameCallback) may never refresh it properly
    // (Pixi v8 autoUpdate fires on video-frame-callback NOT on tick, so a
    // video that "plays" but never produces a frame for the GPU stays black).
    //
    // After loadeddata: video.videoWidth/Height are known, first frame is
    // GPU-uploadable, autoUpdate has something real to update. This addresses
    // the core failure of S29 P0a — shader fix was correct but useless if the
    // texture is bound to nothing.
    const setup = (): void => {
      if (typeof window !== 'undefined'
        && window.location.search.includes('debug=1')) {
        console.log('[cinematic] mountVideoViaShader.setup', {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState,
        });
      }
      const texture = Texture.from(video);
      // S30 P0a — defensively pin autoUpdate=true on the VideoSource (default
      // should be true in Pixi v8, but explicit-set protects against future
      // API drift + makes intent visible in diff review).
      const src = texture.source as unknown as { autoUpdate?: boolean };
      if ('autoUpdate' in src) src.autoUpdate = true;
      const sprite = new Sprite(texture);
      sprite.width = CANVAS_WIDTH;
      sprite.height = CANVAS_HEIGHT;
      sprite.filters = [new CinematicLumaKeyFilter({ threshold })];
      this.container.addChild(sprite);
      this.characterSprite = sprite;

      // S30 P0a — defensive per-tick texture.source.update() via Pixi
      // app.ticker. Belt-and-suspenders for VideoSource autoUpdate. If
      // autoUpdate misses a frame (tab visibility, rVFC not firing, browser
      // throttling), this manual update() call pulls the latest video frame
      // to the GPU every render tick. Removed in cleanup().
      const tickerFn = (): void => {
        const s = texture.source as unknown as { update?: () => void };
        if (typeof s.update === 'function') {
          try { s.update(); } catch { /* defensive — never throw on ticker */ }
        }
      };
      this.app.ticker.add(tickerFn);
      this.videoTickerFn = tickerFn;
    };
    // S33 P1-9 — readyState>=2 fast-path removed (was always false here).
    // Caller order: play() invokes mountVideoViaShader at line 164 BEFORE
    // video.load() at line 175, so readyState is HAVE_NOTHING (0) at this
    // point — the fast-path branch was provably unreachable (S30 audit
    // finding #9).
    video.addEventListener('loadeddata', setup, { once: true });
  }

  // S30 P0b — DELETED `crossfadeCharacterSprite` method. Was the static voltkin
  // sprite mount at targetPos during the sustainedEffect window — exactly the
  // "static stamp" the user reported instead of motion/attack. The actual
  // gameplay creature (creatureRenderer) renders at the same targetPos with
  // FSM-driven motion + ARC_FLASH lightning; it's the rightful visual handoff.
  // Removed alongside reducing recipe.sustainedEffectMs from 8000ms → 500ms so
  // the overlay clears within 800 ms of mp4 end, revealing the creature for
  // ~7 sec of visible gameplay before despawn.
}
