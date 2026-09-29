/**
 * PITCH MASTERS (arcade) — the `/pitch-masters/` page: installs `window.PitchNet`, then boots the
 * Godot web build from `/pitch-masters/game/` behind a loading screen with a progress bar.
 *
 * Source of truth: the Pitch Masters repo, `web/spark/src/arcade/pitchMasters/` (copied here by
 * `tools/build_web.py`, which also writes `game/build.json`: the Pitch Masters commit + the export's
 * engine config). Built as its own Vite pass (`vitePlugin.ts`), so SPARK's index chunk never changes.
 *
 * URL flags (tests / debugging), passed to the game after `--`:
 *   ?netlog=1  ?autoplay=1  ?quickmatch=1  ?host=1 (friend host)  ?join=CODE  ?seed=N  ?timescale=X
 *   ?nogame=1  bridge only, no engine (the two-context bridge harness)   ?netdebug=1  bridge logs
 *   ?name=X    player name shown to the opponent   ?nokeepalive=1  a hidden tab freezes the game again
 */

import { installPitchNet } from './bridge.ts';
import { installKeepAlive } from './keepAlive.ts';

interface BuildInfo {
  readonly commit: string;
  readonly label: string;
  readonly config: Record<string, unknown> & { fileSizes?: Record<string, number>; executable?: string };
}

interface GodotEngine {
  startGame(override: Record<string, unknown>): Promise<void>;
}

declare global {
  interface Window {
    Engine?: {
      new (config: Record<string, unknown>): GodotEngine;
      getMissingFeatures(opts: Record<string, unknown>): string[];
    };
  }
}

const GAME_DIR = '/pitch-masters/game/';

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// Both are no-ops once the loading screen is gone: the engine's preloader can still report progress
// on a later animation frame.
function setStatus(text: string): void {
  const s = document.getElementById('pm-status');
  if (s !== null) s.textContent = text;
}

function setProgress(frac: number | null): void {
  const bar = document.getElementById('pm-bar-fill');
  if (bar === null) return;
  if (frac === null) {
    bar.classList.add('pm-indeterminate');
    bar.style.width = '35%';
  } else {
    bar.classList.remove('pm-indeterminate');
    bar.style.width = `${Math.round(Math.min(1, Math.max(0, frac)) * 100)}%`;
  }
}

function fail(msg: string): void {
  setStatus(msg);
  document.getElementById('pm-loading')?.classList.add('pm-failed');
  console.error(`[pitch-masters] ${msg}`);
}

function gameArgs(p: URLSearchParams): string[] {
  const args: string[] = [];
  const flag = (key: string, arg: string): void => {
    if (p.get(key) === '1') args.push(arg);
  };
  flag('netlog', '--netlog');
  flag('autoplay', '--autoplay');
  flag('quickmatch', '--quickmatch');
  flag('host', '--friend-host');
  const join = p.get('join');
  if (join !== null && /^[A-Za-z0-9]{4,8}$/.test(join)) args.push(`--friend-join=${join}`);
  const seed = p.get('seed');
  if (seed !== null && /^\d{1,9}$/.test(seed)) args.push(`--seed=${seed}`);
  const ts = p.get('timescale');
  if (ts !== null && /^\d{1,2}(\.\d{1,3})?$/.test(ts)) args.push(`--timescale=${ts}`);
  const name = p.get('name');
  if (name !== null && /^[A-Za-z0-9 _-]{1,16}$/.test(name)) args.push(`--name=${name}`);
  const fg = p.get('forcegoal');
  if (fg !== null && /^\d{1,3}(\.\d)?$/.test(fg)) args.push(`--force-goal=${fg}`);
  return args.length > 0 ? ['--', ...args] : [];
}

/**
 * The match theme on the web. Godot 4.3's web build plays audio as pre-decoded "samples" and never
 * turned the 3:34 MP3 into one (measured live: Music.gd said "playing", every SFX reached Web Audio as a
 * buffer, the theme never did), so the page plays it with the browser's own audio element.
 * `src/autoload/Music.gd` drives it through JavaScriptBridge: play(from) / fade(ms) / stop() /
 * setVolume(0..1, the Music x Master bus volumes) / position() / playing(). Desktop keeps Godot's player.
 */
function installPitchMusic(src: string): void {
  const audio = new Audio();
  audio.src = src;
  audio.loop = true;
  audio.preload = 'auto';
  let base = 0.5;
  let fade = 1;
  let fadeTimer: number | undefined;
  const apply = (): void => {
    audio.volume = Math.min(1, Math.max(0, base * fade));
  };
  const stopFade = (): void => {
    if (fadeTimer !== undefined) window.clearInterval(fadeTimer);
    fadeTimer = undefined;
  };
  (window as unknown as Record<string, unknown>).PitchMusic = {
    play(from: number): boolean {
      stopFade();
      fade = 1;
      apply();
      try {
        audio.currentTime = Math.max(0, Number(from) || 0);
      } catch {
        // not seekable yet; it starts from 0:00
      }
      void audio.play().catch((e: unknown) => console.warn('[music] the browser blocked play()', e));
      return true;
    },
    fade(ms: number): void {
      stopFade();
      const steps = Math.max(1, Math.round((Number(ms) || 1000) / 50));
      let i = 0;
      fadeTimer = window.setInterval(() => {
        i += 1;
        fade = Math.max(0, 1 - i / steps);
        apply();
        if (i >= steps) {
          stopFade();
          audio.pause();
          fade = 1;
          apply();
        }
      }, 50);
    },
    stop(): void {
      stopFade();
      audio.pause();
    },
    setVolume(v: number): void {
      base = Math.min(1, Math.max(0, Number(v) || 0));
      apply();
    },
    position(): number {
      return audio.currentTime;
    },
    playing(): boolean {
      return !audio.paused;
    },
  };
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(s);
  });
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const net = installPitchNet();
  installPitchMusic(`${GAME_DIR}music.mp3`);
  // PM-S2 online2: a hidden tab keeps an online match running (?nokeepalive=1 shows the old freeze).
  if (params.get('nokeepalive') !== '1') {
    installKeepAlive(
      () => {
        try {
          return (JSON.parse(net.status()) as { state?: string }).state === 'matched';
        } catch {
          return false;
        }
      },
      (bg) => net.setHidden?.(bg),
    );
  }
  el('pm-back').addEventListener('click', (e) => {
    e.preventDefault();
    net.goArcade();
  });

  let build: BuildInfo;
  try {
    const r = await fetch(`${GAME_DIR}build.json`, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    build = (await r.json()) as BuildInfo;
  } catch {
    fail('The game files are missing from this site. (build.json not found)');
    return;
  }
  net.setBuild(build.commit);
  el('pm-build').textContent = `build ${build.label}`;

  if (params.get('nogame') === '1') {
    setStatus('Bridge only (nogame=1)');
    setProgress(1);
    return;
  }

  setStatus('Loading…');
  setProgress(null);
  try {
    await loadScript(`${GAME_DIR}index.js`);
  } catch (e) {
    fail(`Could not load the game engine. ${(e as Error).message}`);
    return;
  }
  const Engine = window.Engine;
  if (Engine === undefined) {
    fail('Could not start the game engine.');
    return;
  }
  const missing = Engine.getMissingFeatures({ threads: false });
  if (missing.length > 0) {
    fail(`This browser cannot run the game: ${missing.join(', ')}. Try a recent Chrome, Edge or Firefox.`);
    return;
  }

  // The export's config names files relative to its own folder; the page lives one level up.
  const exe = `${GAME_DIR}${String(build.config.executable ?? 'index')}`;
  const fileSizes: Record<string, number> = {};
  for (const [name, size] of Object.entries(build.config.fileSizes ?? {})) fileSizes[`${GAME_DIR}${name}`] = size;
  const canvas = el<HTMLCanvasElement>('canvas');
  const engine = new Engine({
    ...build.config,
    executable: exe,
    mainPack: `${exe}.pck`,
    fileSizes,
    canvas,
    args: gameArgs(params),
  });
  try {
    await engine.startGame({
      onProgress: (current: number, total: number) => {
        if (current > 0 && total > 0) {
          setProgress(current / total);
          setStatus(`Loading… ${Math.round((current / 1048576) * 10) / 10} / ${Math.round((total / 1048576) * 10) / 10} MB`);
        } else {
          setProgress(null);
        }
      },
    });
  } catch (e) {
    fail(`The game failed to start. ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  el('pm-loading').remove();
  canvas.focus();
}

void boot();
