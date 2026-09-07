/**
 * SPARK — S165: the per-race music decision, pinned.
 *
 * ⚠ THIS IS WHERE THE FEATURE'S LOGIC IS TESTABLE AND NOWHERE ELSE. The unit suite runs in plain
 * node — no `window`, no `localStorage`, no `AudioContext` — so `setMusicTrack`, `playMusic` and
 * `applyMusicGain` all take their null-guard early return in a test and can only be asserted as
 * "did not throw". `audioManager.test.ts` states that limitation in its own header. Keeping the
 * choice of track in a pure resolver is what buys real coverage instead of another `not.toThrow`.
 *
 * ⭐ EXHAUSTIVE OVER `ALL_RACES`, not over a hand-written list: a seventh race must fail here rather
 * than pass by omission.
 */
import { describe, expect, it } from 'vitest';

import { ALL_RACES, type RaceId } from '../state/races.ts';
import { DEFAULT_MUSIC_SRC, RACE_MUSIC_SRC, resolveMusicTrack } from './raceMusic.ts';

describe('RACE_MUSIC_SRC — one real, distinct track per race', () => {
  it('covers every race in ALL_RACES', () => {
    // Anti-vacuity: an empty roster would satisfy every per-race assertion below.
    expect(ALL_RACES.length).toBe(6);
    for (const r of ALL_RACES) {
      expect(RACE_MUSIC_SRC[r], `${r} has no track`).toBeTruthy();
    }
  });

  it('has no shared or duplicated track', () => {
    /*
     * The failure this catches is a copy-paste in the map — two races pointing at one file. It is
     * invisible in play (you hear music, it is just not yours) and invisible to every other test.
     */
    const urls = ALL_RACES.map((r) => RACE_MUSIC_SRC[r]);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('every race track lives under /audio/races/ and none IS the default', () => {
    for (const r of ALL_RACES) {
      expect(RACE_MUSIC_SRC[r]).toMatch(/^\/audio\/races\/[a-z]+\.ogg$/);
      expect(RACE_MUSIC_SRC[r], 'a race track must not alias the original').not.toBe(DEFAULT_MUSIC_SRC);
    }
  });

  it('the file name matches the race id — the mapping cannot be silently transposed', () => {
    /*
     * ⭐ THIS IS THE ONE THAT CATCHES A SWAP. Two races whose entries are exchanged pass every
     * assertion above: both are present, both distinct, both well-formed. Only tying the id to the
     * basename notices that the naga is playing the orc's cover.
     */
    for (const r of ALL_RACES) {
      expect(RACE_MUSIC_SRC[r]).toBe(`/audio/races/${r}.ogg`);
    }
  });
});

describe('resolveMusicTrack — the whole decision', () => {
  it('a known race with the toggle ON gets its own cover', () => {
    for (const r of ALL_RACES) {
      expect(resolveMusicTrack(r, true)).toBe(RACE_MUSIC_SRC[r]);
    }
  });

  it('the toggle OFF returns the original, for every race', () => {
    // The owner's opt-out, and it must hold for all six rather than for the one someone tested.
    for (const r of ALL_RACES) {
      expect(resolveMusicTrack(r, false)).toBe(DEFAULT_MUSIC_SRC);
    }
  });

  it('⛔ a NULL race returns the original — the title-screen case', () => {
    /*
     * Not a defensive nicety. Before a match starts, `world.players.get(localPlayerId)?.raceId`
     * reads a confident 'vampires' for EVERY player — `makeWorld` seats one player and
     * `makeIdlePlayer` defaults the race, and `localPlayerId` is seat 0 for host and joiner alike
     * until the roster reassigns it. `null` is how a caller says "not known yet", and the correct
     * answer to that is the original track, never a guess.
     */
    expect(resolveMusicTrack(null, true)).toBe(DEFAULT_MUSIC_SRC);
    expect(resolveMusicTrack(null, false)).toBe(DEFAULT_MUSIC_SRC);
  });

  it('is pure — same inputs, same answer, no hidden state', () => {
    const a = resolveMusicTrack('orcs', true);
    const b = resolveMusicTrack('orcs', true);
    expect(a).toBe(b);
    // ...and the toggle genuinely discriminates, so the two branches are not both the default.
    expect(resolveMusicTrack('orcs', true)).not.toBe(resolveMusicTrack('orcs', false));
  });

  it('rejects nothing and invents nothing — the return is always one of the seven known urls', () => {
    const known = new Set<string>([DEFAULT_MUSIC_SRC, ...ALL_RACES.map((r) => RACE_MUSIC_SRC[r])]);
    expect(known.size).toBe(7);
    for (const r of [...ALL_RACES, null] as ReadonlyArray<RaceId | null>) {
      for (const on of [true, false]) {
        expect(known.has(resolveMusicTrack(r, on))).toBe(true);
      }
    }
  });
});
