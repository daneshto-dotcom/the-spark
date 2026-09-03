/**
 * SPARK — S161 P6: the lobby's RACE BANNERS, and the display name that sits on top of one.
 *
 * > Owner, 2026-09-03: *"the popup menue should have a color with an artistic background that shows
 * > the race and color. so instead of P1 Host (you) its going to be background that has a cool art
 * > that defines the race and color … and it will say P1 HOST (Race name) without the \"(you)\"
 * > because only your own will be clickable so players will know its them."*
 *
 * Pure and Pixi-free, so `raceBanners.test.ts` drives all of it: the seat rack and the race picker
 * both consume these, which is the point — two surfaces showing the same race must show the same
 * name and the same art, and the only way to guarantee that is to have one place to change.
 *
 * ⛔ `.jpg`, WHICH IS THE ONLY ASSET IN THIS PROJECT THAT IS NOT A PNG, AND DELIBERATELY SO. A
 * banner is FULL-BLEED painterly art with no alpha channel and no matte — nothing about it needs
 * lossless encoding, and the six of them come to 524 KiB as JPEG against 2,089 KiB as PNG. This is
 * the LOBBY, the one screen a player sits and waits on, so a 1.5 MB saving there is worth breaking
 * the file-extension habit for. Every sprite atlas stays PNG because a matte without an alpha
 * channel is not a matte.
 */

import type { RaceId } from '../state/races.ts';

/**
 * Where each race's banner lives. `public/art/banners/` → `/art/banners/` in the browser, the same
 * mapping `CASTLE_ATLAS_BASE` uses.
 *
 * ⚠ An exhaustive `Record<RaceId, …>`, per `races.ts`'s standing rule: a seventh race fails `tsc`
 * here until someone draws its banner, rather than falling through to a blank tile.
 */
export const RACE_BANNER_SRC: Readonly<Record<RaceId, string>> = {
  vampires: '/art/banners/banner-vampires.jpg',
  nagas: '/art/banners/banner-nagas.jpg',
  mummies: '/art/banners/banner-mummies.jpg',
  zombies: '/art/banners/banner-zombies.jpg',
  orcs: '/art/banners/banner-orcs.jpg',
  demons: '/art/banners/banner-demons.jpg',
};

/**
 * The race's name as the lobby prints it. Derived by upper-casing the id rather than held in a
 * second table: a hand-written display map is one more thing that can disagree with `RaceId`, and
 * every id in this game is already a plain lowercase English plural.
 *
 * ⚠ If a race ever needs a name that is not its id in capitals, this becomes a Record and
 * `raceBanners.test.ts`'s exhaustiveness check is what will make that a deliberate change.
 */
export function raceDisplayName(raceId: RaceId): string {
  return raceId.toUpperCase();
}

/**
 * ⭐ THE SEAT LABEL — *"P1  HOST  (VAMPIRES)"*.
 *
 * ⛔ `(you)` IS GONE, AND ITS ABSENCE IS A FEATURE OF THE NEW INTERACTION RATHER THAN A DELETION.
 * The owner's reasoning: *"without the \"(you)\" because only your own will be clickable so players
 * will know its them."* The marker existed to answer "which one am I?"; now the answer is that
 * yours is the one that highlights and responds to a click, and the freed space carries the race
 * name instead. The white own-seat glow from S69 P2 stays and does the identifying.
 *
 * Kept in the same shape as the `seatLabelText` it replaces — pure, double-space joined — so the
 * seat-rack test file's label contract is a rename rather than a rewrite.
 */
export function seatRaceLabel(seatIndex: number, isHost: boolean, raceId: RaceId | undefined): string {
  const parts = [`P${seatIndex + 1}`];
  if (isHost) parts.push('HOST');
  if (raceId !== undefined) parts.push(`(${raceDisplayName(raceId)})`);
  return parts.join('  ');
}
