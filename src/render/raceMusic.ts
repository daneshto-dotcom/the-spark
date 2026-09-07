/**
 * SPARK — S165: EACH RACE'S OWN MUSIC, and the one pure decision behind it.
 *
 * > Owner, 2026-09-07: *"i want each race to have his own race music which will be a cover of the
 * > original one. and they will be also able to toggle off their race music and have the original
 * > one."*
 *
 * Pure, Pixi-free and DOM-free — the `raceBanners.ts` shape — so `raceMusic.test.ts` drives the
 * whole of the feature's LOGIC without an `AudioContext`. That matters more than usual here: the
 * unit suite runs in plain node with no `window` and no WebAudio, and `audioManager.test.ts` says so
 * in its own header. Anything decided in this file is testable; anything decided inside
 * `audioManager` is not.
 *
 * ⚠ THE URL MAP LIVES HERE, NOT IN `state/races.ts`. That module's header states it is deliberately
 * asset-free because it reaches every reducer and the serializer; a `/audio/...` string has no
 * business crossing into the sim layer.
 *
 * ⛔ A `Record<RaceId, string>`, NEVER AN ARRAY — the standing rule at `races.ts`. A seventh race
 * must fail `tsc` here rather than fall through to silence.
 */
import { type RaceId } from '../state/races.ts';

/**
 * The original track, and still the fallback for every "no" answer.
 *
 * ⚠ ONE DEFINITION, SHARED. `audioManager.ts` imports this rather than keeping its own
 * `MUSIC_URL` string, so the default track cannot drift between the resolver that chooses it and
 * the player that fetches it.
 */
export const DEFAULT_MUSIC_SRC = '/audio/blue-steppe-orbit.ogg';

/**
 * One cover per race, transcoded to ~78–82 kbps to sit alongside the original's 73 kbps rather than
 * above it — the six files arrived at ~125 kbps, which would have been the only assets in the game
 * mixed hotter than the track they are covering.
 */
export const RACE_MUSIC_SRC: Readonly<Record<RaceId, string>> = {
  vampires: '/audio/races/vampires.ogg',
  nagas: '/audio/races/nagas.ogg',
  mummies: '/audio/races/mummies.ogg',
  zombies: '/audio/races/zombies.ogg',
  orcs: '/audio/races/orcs.ogg',
  demons: '/audio/races/demons.ogg',
};

/**
 * WHICH TRACK SHOULD BE PLAYING — the entire decision, as one pure function.
 *
 * ⭐ `raceId` IS NULLABLE ON PURPOSE, AND IT IS THE INTERESTING HALF. Before a match starts there is
 * no honest answer: `makeWorld` seats exactly one player and `makeIdlePlayer` defaults its race, so
 * `world.players.get(world.localPlayerId)?.raceId` reads a confident **'vampires'** for every player
 * on the title screen and in the lobby — host and joiner alike, until the roster reassigns
 * `localPlayerId`. Passing `null` is how a caller says "I do not know yet", and it gets the original
 * track rather than a wrong race's.
 *
 * ⚠ The toggle is checked FIRST, so "off" is off even for a known race. Default is ON: the owner's
 * framing is that the race cover is the new normal and the original is the opt-out.
 */
export function resolveMusicTrack(raceId: RaceId | null, raceMusicEnabled: boolean): string {
  if (!raceMusicEnabled) return DEFAULT_MUSIC_SRC;
  if (raceId === null) return DEFAULT_MUSIC_SRC;
  return RACE_MUSIC_SRC[raceId];
}
