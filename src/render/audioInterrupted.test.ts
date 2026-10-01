/**
 * ⭐ S193 (audio A3) — iOS PARKS AN AudioContext IN 'interrupted', AND IT NOW GETS THE SAME RESUME AS
 * 'suspended'.
 *
 * Safari moves a running context to `'interrupted'` on a phone call, Siri, another app taking the audio
 * session or a screen lock. `resumeIfSuspended` (the music path) and `ensureSfxBus` tested
 * `=== 'suspended'` and skipped it, and the only gesture listener (`initAudioOnGesture`) is `once`, so
 * nothing resumed inside a gesture again — which is the only place iOS honours `resume()`.
 *
 * Driven through the real module singleton with a fake context (only the Web Audio objects are faked).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  _resetAudioForTest, contextNeedsResume, ensureSfxBus, initAudio, playMusic, resumeAudioOnGesture,
} from './audioManager.ts';

const realWindow = (globalThis as { window?: unknown }).window;
const realFetch = (globalThis as { fetch?: unknown }).fetch;

let resumes = 0;
const ctx = {
  state: 'running' as string,
  currentTime: 0,
  destination: {},
  resume: async (): Promise<void> => { resumes += 1; ctx.state = 'running'; },
  close: async (): Promise<void> => {},
  createGain: (): unknown => ({
    gain: { value: 1, setTargetAtTime: (): void => {}, cancelScheduledValues: (): void => {} },
    connect: (): void => {}, disconnect: (): void => {},
  }),
  createBufferSource: (): unknown => ({
    buffer: null, loop: false, connect: (): void => {}, disconnect: (): void => {}, start: (): void => {}, stop: (): void => {},
  }),
  decodeAudioData: async (): Promise<unknown> => ({}),
};

beforeEach(() => {
  _resetAudioForTest();
  resumes = 0;
  ctx.state = 'running';
  (globalThis as { window?: unknown }).window = {
    AudioContext: function FakeAudioContext(): unknown { return ctx; },
    localStorage: { getItem: (): string | null => null, setItem: (): void => {} },
  };
  (globalThis as { fetch?: unknown }).fetch = async (): Promise<unknown> => ({
    ok: true, status: 200, arrayBuffer: async (): Promise<unknown> => ({}),
  });
  initAudio();
});

afterAll(() => {
  _resetAudioForTest();
  (globalThis as { window?: unknown }).window = realWindow;
  (globalThis as { fetch?: unknown }).fetch = realFetch;
});

const settle = async (): Promise<void> => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

describe('⭐ S193 A3 — an interrupted context is resumed like a suspended one', () => {
  it('contextNeedsResume: suspended and interrupted — never running or closed', () => {
    expect(contextNeedsResume('suspended')).toBe(true);
    expect(contextNeedsResume('interrupted')).toBe(true);
    expect(contextNeedsResume('running')).toBe(false);
    expect(contextNeedsResume('closed')).toBe(false);
  });

  it('⭐ a gesture after an iOS interruption resumes the context', async () => {
    ctx.state = 'interrupted';
    resumeAudioOnGesture();
    await settle();
    expect(resumes).toBe(1);
    expect(ctx.state).toBe('running');
  });

  it('⭐ the music path (playMusic → resumeIfSuspended) resumes an interrupted context', async () => {
    ctx.state = 'interrupted';
    await playMusic();
    expect(resumes).toBeGreaterThanOrEqual(1);
  });

  it('⭐ the SFX bus (ensureSfxBus) resumes an interrupted context', async () => {
    ctx.state = 'interrupted';
    expect(ensureSfxBus()).not.toBeNull();
    await settle();
    expect(resumes).toBe(1);
  });

  it('negative: a running or closed context is left alone', async () => {
    resumeAudioOnGesture();
    ctx.state = 'closed';
    resumeAudioOnGesture();
    await settle();
    expect(resumes).toBe(0);
  });
});

describe('S193 A3 — main.ts re-tries on every gesture and on return to the tab (mechanical)', () => {
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  it('pointerdown / keydown / touchend are wired to resumeAudioOnGesture WITHOUT once', () => {
    const at = main.indexOf("for (const kind of ['pointerdown', 'keydown', 'touchend'] as const) {");
    expect(at, 'the gesture loop').toBeGreaterThan(-1);
    const body = main.slice(at, main.indexOf('\n  }', at));
    expect(body).toContain('window.addEventListener(kind, resumeAudioOnGesture, { passive: true });');
    expect(body).not.toContain('once');
  });
  it('visibilitychange back to visible resumes too', () => {
    expect(main).toContain("document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeAudioOnGesture(); });");
  });
});
