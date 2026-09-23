/**
 * SPARK — THE RACIAL UPGRADES: which perk a race is offered at which draft, what it is called, and
 * whether it is BUILT yet.
 *
 * ⭐⭐ S188 (owner) — *"Make sure the racial mechanics work … let's do zero and five, okay? Because all
 * of those are designed and spec'd. You just need to build and wire them."*
 *
 * The draft (`draft.ts` / `draftEvent.ts`, S187) offers each seat a GENERAL option on the left and its
 * RACE's option on the right. S187 shipped the right-hand tile as COMING SOON because none of the
 * mechanics existed. This module is the one place that says, per race and per draft, which mechanic
 * is on offer — and whether it is real.
 *
 * ## ⛔ A RACIAL PICK IS ONE LITERAL, AND THE RACE + THE INDEX SAY WHICH PERK IT IS
 *
 * A seat's picks are `player.draftPicks`, one entry per draft, in order. A racial choice is stored as
 * the literal `'racial'`, not as a perk id: a seat's race never changes mid-match (R-owner, S164) and
 * its Nth pick is by construction its pick for the Nth draft, so `(raceId, index)` already names the
 * perk exactly. Storing the id as well would be a second copy of one fact on the wire and in the hash,
 * and two copies of one fact is how they drift apart — the reasoning `draftEvent.ts` already gives for
 * not storing a per-event pick map. So: **`seatHoldsPerk` is the only question a mechanic ever asks.**
 *
 * ## ⛔ `RACIAL_PERK_BUILT` IS WHAT MAKES A TILE CHOOSABLE, AND IT STARTS ALL FALSE
 *
 * A perk whose mechanic does not exist must stay COMING SOON and absent from the hit-test — the
 * owner's S187 instruction — so `racialPerkFor` returns null for it, and `applyDraftChoice` refuses a
 * `'racial'` pick that was not offered. Each S188 branch flips ONLY its own entries, in its own block
 * below; a branch that fails to land leaves its perks false, and the game behaves exactly as it did.
 *
 * Pure leaf: no `World`, no Pixi, no recipe import (the S144 / S151 side-effect trap — `SPARK_RACES_SPEC`
 * §10 trap 3). `draft.ts`'s `DraftPick` is a TYPE import only.
 */

import type { RaceId } from './races.ts';
import type { DraftPick } from './draft.ts';

/** Every racial perk that is designed. Twelve: six races × level 0 and level 5. */
export type RacialPerkId =
  | 'vampires.l0'
  | 'vampires.l5'
  | 'zombies.l0'
  | 'zombies.l5'
  | 'mummies.l0'
  | 'mummies.l5'
  | 'orcs.l0'
  | 'orcs.l5'
  | 'demons.l0'
  | 'demons.l5'
  | 'nagas.l0'
  | 'nagas.l5';

export const RACIAL_PERK_IDS: readonly RacialPerkId[] = [
  'vampires.l0', 'vampires.l5', 'zombies.l0', 'zombies.l5', 'mummies.l0', 'mummies.l5',
  'orcs.l0', 'orcs.l5', 'demons.l0', 'demons.l5', 'nagas.l0', 'nagas.l5',
] as const;

/**
 * The perk each race is offered, by DRAFT INDEX: 0 = the pre-wave-1 draft ("level 0"), 1 = the draft
 * that opens on wave 6, after wave 5's fight ("level 5"). An index past the end of a row is
 * undesigned — levels 10–20 have 16 slots the owner has not ruled (vampires L10 THE SWARM is designed
 * and deliberately out of S188's scope, so it is not listed).
 */
export const RACIAL_PERKS_BY_RACE: Readonly<Record<RaceId, readonly RacialPerkId[]>> = {
  vampires: ['vampires.l0', 'vampires.l5'],
  zombies: ['zombies.l0', 'zombies.l5'],
  mummies: ['mummies.l0', 'mummies.l5'],
  orcs: ['orcs.l0', 'orcs.l5'],
  demons: ['demons.l0', 'demons.l5'],
  nagas: ['nagas.l0', 'nagas.l5'],
};

/** The race a perk belongs to, and the draft index it is offered at. */
export function perkRace(perk: RacialPerkId): RaceId {
  return perk.slice(0, perk.indexOf('.')) as RaceId;
}

export function perkDraftIndex(perk: RacialPerkId): number {
  return perk.endsWith('.l0') ? 0 : 1;
}

/**
 * ⛔ WHETHER EACH MECHANIC EXISTS. One BLOCK per S188 branch, each separated by a comment line so two
 * branches never edit adjacent lines and every merge is clean (Council A4). A branch flips ONLY the
 * entries in its own block, in the same commit as the mechanic and the tests that prove it REACHES
 * the thing it changes.
 */
export const RACIAL_PERK_BUILT: Readonly<Record<RacialPerkId, boolean>> = {
  // ── s188/racial-a ─────────────────────────────────────────────────────────────────────────────
  'vampires.l0': false,
  'vampires.l5': false,
  'orcs.l0': false,
  'orcs.l5': false,
  'demons.l0': false,
  'nagas.l0': false,
  // ── s188/racial-b ─────────────────────────────────────────────────────────────────────────────
  'zombies.l0': true, // THE RISEN — racial/theRisen.ts
  'demons.l5': true, // HELLSPAWN — racial/hellspawn.ts
  'mummies.l5': true, // ENDLESS DYNASTY — racial/endlessDynasty.ts
  // ── s188/racial-c ─────────────────────────────────────────────────────────────────────────────
  'mummies.l0': true,
  // ── s188/racial-d ─────────────────────────────────────────────────────────────────────────────
  'zombies.l5': false,
  'nagas.l5': false,
  // ── end ───────────────────────────────────────────────────────────────────────────────────────
};

/**
 * The racial perk offered to `race` at `draftIndex`, or null when there is none to choose — either
 * undesigned (levels 10+) or designed but not built. Null renders as the COMING SOON tile.
 */
export function racialPerkFor(race: RaceId, draftIndex: number): RacialPerkId | null {
  const perk = RACIAL_PERKS_BY_RACE[race][draftIndex];
  if (perk === undefined) return null;
  return RACIAL_PERK_BUILT[perk] ? perk : null;
}

/**
 * ⭐ THE ONE QUESTION EVERY MECHANIC ASKS: does this seat hold this perk?
 *
 * True iff the seat is of the perk's race AND its pick at the perk's draft index is `'racial'`. A
 * seat of another race that picked racial holds ITS OWN race's perk, never this one — which is why
 * the race is checked here and not left to each caller.
 */
export function seatHoldsPerk(
  player: { readonly raceId: RaceId; readonly draftPicks: readonly DraftPick[] },
  perk: RacialPerkId,
): boolean {
  return player.raceId === perkRace(perk) && player.draftPicks[perkDraftIndex(perk)] === 'racial';
}

/** The player-facing words, and the card art the draft tile draws. */
export interface RacialPerkCopy {
  readonly title: string;
  readonly line: string;
  readonly detail: string;
  /** Basename of the card under `public/art/upgrade-cards/` (see `assets-source/upgrade-cards/MANIFEST.md`). */
  readonly card: string;
}

/**
 * ⚠ THE COPY SAYS WHAT HE SEES, NOT WHAT THE CODE DOES (S180's rule, and `draftOverlay.ts`'s). The
 * titles are the names baked into his cards; the lines and details are written from his own words
 * for each mechanic (canon §3d, the S188 PDR §2).
 */
export const RACIAL_PERK_COPY: Readonly<Record<RacialPerkId, RacialPerkCopy>> = {
  'vampires.l0': {
    title: 'BLOOD DEBT',
    line: 'LIFESTEAL 20%',
    detail: 'Every unit you own heals for 20% of the damage it deals, every time it hits.',
    card: 'l0-vampires',
  },
  'vampires.l5': {
    title: 'CRIMSON TIDE',
    line: 'LIFESTEAL 50%',
    detail: 'Your lifesteal rises to 50%: every unit you own heals for half of every hit it lands.',
    card: 'l5-vampires',
  },
  'zombies.l0': {
    title: 'THE RISEN',
    line: 'KILLS RISE AGAIN',
    detail: 'Every enemy your zombies kill rises as a new zombie at your castle.',
    card: 'l0-zombies',
  },
  'zombies.l5': {
    title: 'CORPSE EATER',
    line: 'BOSS FEEDS',
    detail: 'Your zombie boss gains a third skill: at 20% health it feeds on everything around it for 8 seconds, healing for every bite.',
    card: 'l5-zombies',
  },
  'mummies.l0': {
    title: 'POWER OF RA',
    line: 'CALL DOWN RA',
    detail: 'Once every fight, call Ra: pillars of burning light strike wherever you choose.',
    card: 'l0-mummies',
  },
  'mummies.l5': {
    title: 'ENDLESS DYNASTY',
    line: 'A PHARAOH RISES',
    detail: 'For every 1,000 health your castle loses, a Pharaoh rises to defend it — for the rest of the match.',
    card: 'l5-mummies',
  },
  'orcs.l0': {
    title: 'BLOOD FRENZY',
    line: 'THE HORDE RAGES',
    detail: 'When your warlord rages, every orc you own rages with him: twice as fast, twice the attacks. Goblins do not rage.',
    card: 'l0-orcs',
  },
  'orcs.l5': {
    title: 'THE HORDE GROWS',
    line: 'MORE GOBLINS',
    detail: 'Your goblin towers hold 20 goblins instead of 10, and your castle sends out its soldiers twice as fast.',
    card: 'l5-orcs',
  },
  'demons.l0': {
    title: 'SCORCHED GROUND',
    line: 'YOUR LAND BURNS',
    detail: 'Your whole territory burns: every enemy standing in it loses 2% of its health every second.',
    card: 'l0-demons',
  },
  'demons.l5': {
    title: 'HELLSPAWN',
    line: 'CHEWERS SPLIT',
    detail: 'Your pencil chewers turn demonic: each one splits into two at half strength when it dies, and those split again.',
    card: 'l5-demons',
  },
  'nagas.l0': {
    title: 'DEEP CURRENT',
    line: 'GATHERERS TELEPORT',
    detail: 'Your gatherers teleport home with their shape instead of walking back.',
    card: 'l0-nagas',
  },
  'nagas.l5': {
    title: 'APEX PREDATOR',
    line: 'ELITE PIRANHA',
    detail: 'Your piranha tower spawns the elite piranha from now on: twice the size, three times the stats.',
    card: 'l5-nagas',
  },
};
