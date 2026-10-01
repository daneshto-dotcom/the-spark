/**
 * SPARK — ⭐ S193 (owner, R193-M): THE PANTS MUSIC. Song 1 on waves 27 / 29 / 31, song 2 on 28 / 30, the
 * endless final fight keeps 31's. Selection is pure (`raceMusic.ts`); this file proves it through the
 * real host tick (the wave and phase the sim actually reaches), through the real `audioManager` swap on
 * the fake bus (the source that actually starts, with its seamless loop region), and that BOTH
 * `main.ts` call sites ask the pants-aware resolver.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PLAYER_COLORS } from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { mulberry32 } from '../state/rng.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { isMonsterFightHeld } from '../state/endgame.ts';
import {
  PANTS_MUSIC_SRC, RACE_MUSIC_SRC, DEFAULT_MUSIC_SRC, pantsMusicForWave, resolveMatchMusicTrack,
} from './raceMusic.ts';
import { _resetAudioForTest, currentMusicTrack, initAudio, playMusic, setMusicTrack } from './audioManager.ts';
import { installFakeAudio, flushAudio, silentEdgedPcm, type FakeAudioEnv } from './audioFakeContext.fixtures.ts';

const [SONG1, SONG2] = PANTS_MUSIC_SRC;

describe('S193 R193-M — which song plays, waves 26–31', () => {
  it('⭐ HIS alternation: 27 song 1 · 28 song 2 · 29 song 1 · 30 song 2 · 31 song 1; nothing on 26 or 32', () => {
    expect([26, 27, 28, 29, 30, 31, 32].map((w) => pantsMusicForWave(w, 'FIGHT')))
      .toEqual([null, SONG1, SONG2, SONG1, SONG2, SONG1, null]);
  });

  it('⚠ MINE: FIGHT only — the fix-only BUILD before a pants round keeps the seat\'s own track', () => {
    for (const w of [26, 27, 28, 29, 30, 31]) expect(pantsMusicForWave(w, 'BUILD')).toBe(null);
    expect(resolveMatchMusicTrack('orcs', true, 27, 'BUILD')).toBe(RACE_MUSIC_SRC.orcs);
    expect(resolveMatchMusicTrack('orcs', true, 26, 'FIGHT')).toBe(RACE_MUSIC_SRC.orcs);
  });

  it('⚠ MINE: the pants song overrides the race-music toggle and every race; outside it the old rule stands', () => {
    for (const race of ['vampires', 'nagas', 'mummies', 'zombies', 'orcs', 'demons'] as const) {
      expect(resolveMatchMusicTrack(race, true, 28, 'FIGHT')).toBe(SONG2);
      expect(resolveMatchMusicTrack(race, false, 29, 'FIGHT')).toBe(SONG1);
    }
    expect(resolveMatchMusicTrack(null, true, 30, 'FIGHT')).toBe(SONG2);
    expect(resolveMatchMusicTrack('demons', false, 25, 'FIGHT')).toBe(DEFAULT_MUSIC_SRC);
  });

  it('both songs exist on disk, in the race tracks\' format (.ogg), and are distinct from every other track', () => {
    expect(new Set(PANTS_MUSIC_SRC).size).toBe(2);
    for (const src of PANTS_MUSIC_SRC) {
      const p = join(process.cwd(), 'public', src.slice(1));
      expect(existsSync(p), src).toBe(true);
      expect(statSync(p).size).toBeGreaterThan(1_000_000);
      expect(readFileSync(p).subarray(0, 4).toString('latin1'), `${src} is an Ogg stream`).toBe('OggS');
      expect(Object.values(RACE_MUSIC_SRC)).not.toContain(src);
      expect(src).not.toBe(DEFAULT_MUSIC_SRC);
    }
  });
});

/* ──────────────────────────── REACH: the wave and phase the sim actually reaches ──────────────────────────── */

function board(): World {
  const world = makeWorld(0x193);
  world.gameState = 'TITLE';
  dispatch(world, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [0, 1].map((seat) => ({ seat, color: PLAYER_COLORS[seat]! })),
  });
  world.gameState = 'PLAYING';
  world.draft = null;
  for (const p of world.players.values()) p.castleHp = 1_000_000_000;
  return world;
}
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)),
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} },
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}
const track = (w: World): string =>
  resolveMatchMusicTrack(w.players.get(w.localPlayerId)?.raceId ?? null, true, w.waveNumber, w.matchPhase);

describe('S193 R193-M — REACH through the real host tick', () => {
  it('crossing BUILD→FIGHT of waves 26–31 through the real edge selects his song for each; the held final fight keeps 31\'s', () => {
    const seen: Array<[number, string, boolean]> = [];
    for (const wave of [26, 27, 28, 29, 30, 31]) {
      const w = board();
      const own = track(w); // the seat's own track, in the BUILD before
      w.waveNumber = wave;
      w.matchPhase = 'BUILD';
      w.phaseEndsAtTick = w.tick + 1;
      expect(track(w), `BUILD of ${wave}`).toBe(own);
      const d = deps();
      const st = makeHostTickState(w);
      runHostTick(w, d, st);
      expect(w.matchPhase).toBe('FIGHT');
      seen.push([wave, track(w), track(w) === own]);
      if (wave === 31) {
        // the final fight never ends on the clock with two seats alive — and its song never changes
        w.monsterWaveSpawned = 500;
        w.phaseEndsAtTick = w.tick + 1;
        for (let t = 0; t < 900; t++) runHostTick(w, d, st);
        expect(w.matchPhase).toBe('FIGHT');
        expect(isMonsterFightHeld(w)).toBe(true);
        expect(track(w)).toBe(SONG1);
      }
    }
    expect(seen.map(([w, t]) => [w, t === SONG1 ? 1 : t === SONG2 ? 2 : 0])).toEqual([
      [26, 0], [27, 1], [28, 2], [29, 1], [30, 2], [31, 1],
    ]);
  });
});

/* ───────────── REACH: the real audioManager swap — the source that starts, with its loop region ───────────── */

let env: FakeAudioEnv;
beforeEach(() => {
  _resetAudioForTest();
  env?.restore();
  env = installFakeAudio((url: string) => (url.endsWith('.ogg')
    ? { url, pcm: { sampleRate: 1000, channels: silentEdgedPcm(1000, 0, 100, 0) } }
    : { url }));
});
afterAll(() => {
  _resetAudioForTest();
  env?.restore();
});

describe('S193 R193-M — the swap reaches the audio bus', () => {
  it('a playing race track swaps to song 2 on a pants round, through the shared seamless-loop helper', async () => {
    initAudio();
    setMusicTrack(RACE_MUSIC_SRC.orcs);
    await playMusic();
    setMusicTrack(resolveMatchMusicTrack('orcs', true, 28, 'FIGHT'));
    await flushAudio();
    expect(currentMusicTrack()).toBe(SONG2);
    const started = env.sources.filter((s) => s.kind === 'buffer' && s.startArgs !== null && s.url === SONG2);
    expect(started).toHaveLength(1);
    expect(started[0]!.loop).toBe(true);
    // edge-silence-free PCM (as both songs measure) loops whole: no trimmed region, start at 0
    expect(started[0]!.startArgs).toEqual([0, 0]);
  });
});

describe('S193 R193-M — both main.ts call sites ask the pants-aware resolver (paired with the REACH tests above)', () => {
  it('two calls of resolveMatchMusicTrack, each passed waveNumber and matchPhase; no bare resolveMusicTrack( call left', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8').replace(/\r\n/g, '\n');
    const calls = src.match(/setMusicTrack\(resolveMatchMusicTrack\([^;]*?world\.waveNumber[^;]*?world\.matchPhase,?\s*\)\);/g) ?? [];
    expect(calls).toHaveLength(2);
    expect(src.match(/[^.\w]resolveMusicTrack\(/g) ?? []).toHaveLength(0);
  });
});
