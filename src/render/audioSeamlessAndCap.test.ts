/**
 * SPARK — S192 T15: the seamless loop and the voice cap, driven through the REAL `audioManager`
 * entry points on a fake bus (`audioFakeContext.fixtures.ts`).
 *
 * > Owner: *"At wave eight, the music and sound stopped for a few seconds."*
 *
 * H1 — every music path must start its source with `loopStart`/`loopEnd` on the audible region and
 *      the start offset at `loopStart`. Proven per path (base track, NONET, HELGA) on a buffer with
 *      real PCM and silent edges, because a path that skipped the helper would still "play".
 * H2 — a wave-8 burst in ONE tick (many bonds, severs, booms, charges) must not build unbounded
 *      graphs. Counted at the node level, so the number is the audio thread's load, not ours.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { GameEffect } from '../game/effects.ts';
import {
  _resetAudioForTest,
  drainAudioEffects,
  enterNonetRealm,
  exitNonetRealm,
  getAudioDebugApi,
  initAudio,
  inspectAudioChain,
  playMusic,
  stopMusic,
  updateHelgaTheme,
} from './audioManager.ts';
import { installFakeAudio, flushAudio, silentEdgedPcm, type FakeAudioEnv } from './audioFakeContext.fixtures.ts';
import { DEFAULT_MUSIC_SRC } from './raceMusic.ts';
import { SFX_KIND_MAX_VOICES, SFX_MAX_VOICES } from './sfxVoices.ts';

const SR = 1000;
/** Every music URL gets a 1.5 s silent head, 100 s of music and a 2.5 s silent tail. */
const pcmFor = (url: string) => (url.endsWith('.ogg')
  ? { url, pcm: { sampleRate: SR, channels: silentEdgedPcm(SR, 1.5, 100, 2.5) } }
  : { url });

let env: FakeAudioEnv;

beforeEach(() => {
  _resetAudioForTest();
  env?.restore();
  env = installFakeAudio(pcmFor);
});

afterAll(() => {
  _resetAudioForTest();
  env?.restore();
});

const musicStarts = () => env.sources.filter((s) => s.kind === 'buffer' && s.url.endsWith('.ogg') && s.startArgs !== null);

describe('S192 T15 H1 — every music path loops the AUDIBLE region only', () => {
  it('the base track: loopStart/loopEnd on the music, first lap starts at loopStart', async () => {
    initAudio();
    await playMusic();
    const [m] = musicStarts();
    expect(m?.url).toBe(DEFAULT_MUSIC_SRC);
    expect(m!.loop).toBe(true);
    expect(m!.loopStart).toBeCloseTo(1.5, 6);
    expect(m!.loopEnd).toBeCloseTo(101.5, 6);
    expect(m!.startArgs).toEqual([0, m!.loopStart]);
    expect(inspectAudioChain().musicLoopsTrimmed).toBe(1);
    expect(inspectAudioChain().musicLoopRegion?.loopEnd).toBeCloseTo(101.5, 6);
  });

  it('the NONET theme goes through the same path', async () => {
    initAudio();
    await enterNonetRealm();
    const nonet = musicStarts().find((s) => s.url.includes('nonet'));
    expect(nonet).toBeDefined();
    expect(nonet!.loopStart).toBeCloseTo(1.5, 6);
    expect(nonet!.loopEnd).toBeCloseTo(101.5, 6);
    exitNonetRealm();
  });

  it('HELGA’s theme goes through the same path', async () => {
    initAudio();
    updateHelgaTheme({ tick: 10, defenders: new Map([[1, { kind: 'princess', state: 'WALK', targetCreatureId: 7 }]]) });
    await flushAudio();
    const helga = musicStarts().find((s) => s.url.includes('helga-theme'));
    expect(helga).toBeDefined();
    expect(helga!.loopEnd).toBeCloseTo(101.5, 6);
  });

  it('a buffer with NO PCM (a broken decode) still loops, WHOLE — the pre-S192 behaviour', async () => {
    env.restore();
    env = installFakeAudio((url) => ({ url }));
    initAudio();
    await playMusic();
    const [m] = musicStarts();
    expect(m!.loop).toBe(true);
    expect(m!.loopEnd).toBe(0); // untouched = whole buffer
    expect(m!.startArgs).toEqual([0, 0]);
    expect(inspectAudioChain().musicLoopRegion).toBeNull();
  });

  it('DEV seekMusic restarts the base track inside the region (the browser seam check)', async () => {
    initAudio();
    await playMusic();
    expect(getAudioDebugApi().seekMusic(99)).toBe(true);
    const last = musicStarts().at(-1)!;
    expect(last.startArgs).toEqual([0, 99]);
    // Past the end is clamped inside the loop, never into the dead tail.
    expect(getAudioDebugApi().seekMusic(103)).toBe(true);
    expect(musicStarts().at(-1)!.startArgs![1]).toBeLessThan(101.5);
    stopMusic();
  });
});

/** A wave-8-sized tick: `n` of each burst-prone effect, all on one tick. */
function burst(tick: number, n: number): GameEffect[] {
  const out: GameEffect[] = [];
  for (let i = 0; i < n; i++) {
    const pos = { x: 100 + i, y: 200 };
    out.push({ kind: 'BOND_FORMED', tick, pos, bondCount: 1 });
    out.push({ kind: 'BOND_SEVERED', tick, pos, cause: 'raid' });
    out.push({ kind: 'BOMB_EXPLODE', tick, pos, radius: 80 });
    out.push({ kind: 'CREATURE_CHARGE', tick, pos });
  }
  return out;
}

describe('S192 T15 H2 — the voice cap holds under a one-tick burst', () => {
  it('200 of each kind in one tick builds at most the capped voices; the rest are counted as dropped', async () => {
    initAudio();
    drainAudioEffects(burst(5, 200), 5);
    await flushAudio();
    const sfx = env.sources.filter((s) => !s.url.endsWith('.ogg'));
    const stats = inspectAudioChain().sfxVoices;
    // clave = 2 oscillators per voice; fart, boom, charge = 1 each.
    const cap = SFX_KIND_MAX_VOICES;
    expect(stats.admitted).toBe(cap.clave + cap.fart + cap.boom + cap.charge);
    expect(sfx.length).toBe(2 * cap.clave + cap.fart + cap.boom + cap.charge);
    expect(stats.peakLive).toBeLessThanOrEqual(SFX_MAX_VOICES);
    expect(stats.droppedByKind.clave).toBe(200 - cap.clave);
    expect(inspectAudioChain().liveSourceNodes).toBe(sfx.length);
  });

  it('voices FREE UP as context time passes — a cap, not a mute', async () => {
    initAudio();
    drainAudioEffects(burst(5, 50), 5);
    await flushAudio();
    const first = inspectAudioChain().sfxVoices.admitted;
    env.setTime(1); // every SFX here is < 0.5 s long
    drainAudioEffects(burst(6, 50), 6);
    await flushAudio();
    expect(inspectAudioChain().sfxVoices.admitted).toBe(2 * first);
  });

  it('MUTATION: with the cap off (the pre-S192 build), the same burst builds every graph', async () => {
    initAudio();
    getAudioDebugApi().setVoiceCap(false);
    drainAudioEffects(burst(5, 200), 5);
    await flushAudio();
    const sfx = env.sources.filter((s) => !s.url.endsWith('.ogg'));
    expect(sfx.length).toBe(200 * (2 + 1 + 1 + 1));
  });
});
