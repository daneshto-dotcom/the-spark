/**
 * SPARK — S188 — the racial-upgrade SUBSTRATE: the registry, the offer, the refusal of an unoffered
 * pick, the round-trip of the `'racial'` literal, and the post-sweep spawn queue.
 *
 * ⚠ These tests hold whatever `RACIAL_PERK_BUILT` says — they never assert that a perk is or is not
 * built, because six branches flip those entries independently. They assert that the OFFER always
 * follows the table, which is the contract every branch relies on.
 */

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeWorld, type World } from './world.ts';
import { applyStartGame } from './gameMode.ts';
import { snapshot, restore } from './save.ts';
import {
  RACIAL_PERK_BUILT,
  RACIAL_PERK_COPY,
  RACIAL_PERK_IDS,
  RACIAL_PERK_REQUIRES,
  RACIAL_PERKS_BY_RACE,
  LEVELS_PER_DRAFT,
  perkDraftIndex,
  perkRace,
  racialPerkFor,
  seatHoldsPerk,
} from './racialPerks.ts';
import {
  DRAFT_PICKS,
  DRAFT_WAVE_INTERVAL,
  GENERAL_PICKS,
  draftIndexForWave,
  generalPickForWave,
  isDamagePick,
  isPoolPick,
} from './draft.ts';
import {
  applyDraftChoice,
  autoPickFor,
  draftOptionsFor,
  pickIsOffered,
  playerHoldsPerk,
  tickDraft,
  DRAFT_DEADLINE_TICKS,
} from './draftEvent.ts';
import { ALL_RACES } from './races.ts';
import { drainRacialSpawnQueue, pendingRacialSpawns, queueAfterStrike } from './racial/racialTick.ts';
import type { PlayerId } from '../types.ts';

function startedWorld(): World {
  const w = makeWorld(0x188);
  applyStartGame(w, { type: 'START_GAME' } as never);
  return w;
}
const firstSeat = (w: World): PlayerId => [...w.players.keys()][0] as PlayerId;

describe('the registry', () => {
  it('names exactly fourteen perks: every race at level 0 and 5, and vampires + mummies at level 10', () => {
    // ⭐ S190 MERGE — 12 + WRATH OF RA (`s188/wrath`, S188 P11) + THE SWARM (`s188/swarm`) = 14. Each
    // branch pinned 13 against master; the union is the truth.
    expect(RACIAL_PERK_IDS).toHaveLength(14);
    expect(new Set(RACIAL_PERK_IDS).size).toBe(RACIAL_PERK_IDS.length);
    for (const race of ALL_RACES) {
      // The two designed level-10 perks; every other row stops at 5.
      const row = race === 'vampires' || race === 'mummies'
        ? [`${race}.l0`, `${race}.l5`, `${race}.l10`]
        : [`${race}.l0`, `${race}.l5`];
      expect(RACIAL_PERKS_BY_RACE[race]).toEqual(row);
    }
    // Every id in a row is in the id list, and vice versa.
    expect(new Set(Object.values(RACIAL_PERKS_BY_RACE).flat())).toEqual(new Set(RACIAL_PERK_IDS));
  });

  it('⭐ the draft index is DERIVED from the level in the id (level / 5), one level per draft', () => {
    expect(LEVELS_PER_DRAFT).toBe(DRAFT_WAVE_INTERVAL);
    expect(perkDraftIndex('vampires.l0')).toBe(0);
    expect(perkDraftIndex('vampires.l5')).toBe(1);
    // ⛔ the old body (`endsWith('.l0') ? 0 : 1`) returned 1 here — THE SWARM would have been a
    // second level-5 perk, held by every vampire seat that took CRIMSON TIDE.
    expect(perkDraftIndex('vampires.l10')).toBe(2);
    expect(draftIndexForWave(11)).toBe(perkDraftIndex('vampires.l10'));
  });

  it('agrees with itself: a perk id’s race and draft index are the row and column it sits in', () => {
    for (const race of ALL_RACES) {
      RACIAL_PERKS_BY_RACE[race].forEach((perk, index) => {
        expect(perkRace(perk)).toBe(race);
        expect(perkDraftIndex(perk)).toBe(index);
      });
    }
  });

  it('gives every perk a card that EXISTS in the art source folder', () => {
    // ⭐ S190 — the S188 P11 PENDING_ART skip for `l10-mummies` is gone: ra-vfx shipped the art.
    for (const perk of RACIAL_PERK_IDS) {
      const card = RACIAL_PERK_COPY[perk].card;
      expect(existsSync(`assets-source/upgrade-cards/${card}.png`), `${perk} -> ${card}.png`).toBe(true);
    }
  });

  it('offers a perk ONLY when it is built, and nothing past the end of a row (undesigned levels)', () => {
    for (const race of ALL_RACES) {
      for (const [index, perk] of RACIAL_PERKS_BY_RACE[race].entries()) {
        // ⭐ S188 P11 — a perk with a REQUIREMENT is not offered without the seat's picks (the safe
        // default); the conditional offer itself is pinned in `racial/wrathOfRa.test.ts`.
        const unconditional = RACIAL_PERK_REQUIRES[perk] === undefined;
        expect(racialPerkFor(race, index)).toBe(RACIAL_PERK_BUILT[perk] && unconditional ? perk : null);
      }
      // Level 10: vampires' THE SWARM is unconditional, so it IS offered with no picks; mummies' WRATH OF
      // RA requires POWER OF RA, so with no picks it is null here (its offer is pinned in
      // `racial/wrathOfRa.test.ts`); every other race is COMING SOON there.
      if (race !== 'vampires') expect(racialPerkFor(race, 2)).toBeNull();
      expect(racialPerkFor(race, 3)).toBeNull();
      expect(racialPerkFor(race, 9)).toBeNull();
    }
  });
});

describe('seatHoldsPerk — the one question every mechanic asks', () => {
  it('is true only for the RIGHT RACE with a racial pick at the RIGHT INDEX', () => {
    const vamp = { raceId: 'vampires' as const, draftPicks: ['racial' as const, 'def' as const] };
    expect(seatHoldsPerk(vamp, 'vampires.l0')).toBe(true);
    expect(seatHoldsPerk(vamp, 'vampires.l5')).toBe(false); // took the general at level 5
    // ⛔ a seat of ANOTHER race that picked racial holds its OWN race's perk, never this one
    expect(seatHoldsPerk(vamp, 'zombies.l0')).toBe(false);
    expect(seatHoldsPerk({ raceId: 'vampires', draftPicks: [] }, 'vampires.l0')).toBe(false);
  });

  it('S188 — level 10 is its OWN index: CRIMSON TIDE does not grant THE SWARM, nor the reverse', () => {
    const tide = { raceId: 'vampires' as const, draftPicks: ['racial' as const, 'racial' as const] };
    expect(seatHoldsPerk(tide, 'vampires.l5')).toBe(true);
    expect(seatHoldsPerk(tide, 'vampires.l10')).toBe(false); // no wave-11 pick yet
    const swarm = { raceId: 'vampires' as const, draftPicks: ['hp' as const, 'def' as const, 'racial' as const] };
    expect(seatHoldsPerk(swarm, 'vampires.l10')).toBe(true);
    expect(seatHoldsPerk(swarm, 'vampires.l5')).toBe(false);
    expect(seatHoldsPerk({ raceId: 'vampires', draftPicks: ['racial', 'racial', 'atk'] }, 'vampires.l10')).toBe(false);
    expect(seatHoldsPerk({ raceId: 'nagas', draftPicks: ['racial', 'racial', 'racial'] }, 'vampires.l10')).toBe(false);
  });

  it('the racial literal buffs no stat — R104 held by the type system', () => {
    expect(isPoolPick('racial')).toBe(false);
    expect(isDamagePick('racial')).toBe(false);
    expect(DRAFT_PICKS).toEqual([...GENERAL_PICKS, 'racial']);
  });
});

describe('⛔ only an offered option may be taken (S188 — it used to accept ANY pick)', () => {
  it('refuses a general axis that is not this wave’s', () => {
    const w = startedWorld();
    const seat = firstSeat(w);
    expect(generalPickForWave(1)).toBe('hp');
    applyDraftChoice(w, seat, 'atk');
    expect(w.players.get(seat)?.draftPicks).toEqual([]);
    applyDraftChoice(w, seat, 'hp');
    expect(w.players.get(seat)?.draftPicks).toEqual(['hp']);
  });

  it('refuses "racial" when the seat’s race has no BUILT perk at this draft, and takes it when it has', () => {
    const w = startedWorld();
    const seat = firstSeat(w);
    const race = w.players.get(seat)!.raceId;
    const offered = draftOptionsFor(1, race).racial !== null;
    expect(pickIsOffered(w, seat, 1, 'racial')).toBe(offered);
    applyDraftChoice(w, seat, 'racial');
    expect(w.players.get(seat)?.draftPicks).toEqual(offered ? ['racial'] : []);
  });

  it('the deadline takes the racial exactly when one is offered, else the general', () => {
    const w = startedWorld();
    const seat = firstSeat(w);
    const race = w.players.get(seat)!.raceId;
    const expected = draftOptionsFor(1, race).racial !== null ? 'racial' : 'hp';
    expect(autoPickFor(w, seat, 1)).toBe(expected);
    w.tick += DRAFT_DEADLINE_TICKS;
    tickDraft(w);
    expect(w.players.get(seat)?.draftPicks).toEqual([expected]);
    expect(playerHoldsPerk(w, seat, `${race}.l0`)).toBe(expected === 'racial');
  });
});

describe('the racial literal crosses save/load and the wire', () => {
  it('round-trips a pick list holding "racial", in order', () => {
    const w = makeWorld(0x188);
    const seat = firstSeat(w);
    w.players.get(seat)!.draftPicks.push('racial', 'def');
    const fresh = makeWorld(0x188);
    restore(snapshot(w), fresh);
    expect(fresh.players.get(seat)?.draftPicks).toEqual(['racial', 'def']);
  });
});

describe('the post-sweep spawn queue (Council A5)', () => {
  it('runs queued work FIFO, once, and empties', () => {
    const w = makeWorld(0x188);
    const order: number[] = [];
    queueAfterStrike(w, () => order.push(1));
    queueAfterStrike(w, () => order.push(2));
    expect(pendingRacialSpawns(w)).toBe(2);
    drainRacialSpawnQueue(w);
    expect(order).toEqual([1, 2]);
    expect(pendingRacialSpawns(w)).toBe(0);
    drainRacialSpawnQueue(w);
    expect(order).toEqual([1, 2]);
  });

  it('defers work queued BY a drained job to the next drain — a chain cannot recurse in one tick', () => {
    const w = makeWorld(0x188);
    const order: string[] = [];
    queueAfterStrike(w, () => {
      order.push('parent');
      queueAfterStrike(w, () => order.push('child'));
    });
    drainRacialSpawnQueue(w);
    expect(order).toEqual(['parent']);
    expect(pendingRacialSpawns(w)).toBe(1);
    drainRacialSpawnQueue(w);
    expect(order).toEqual(['parent', 'child']);
  });

  it('keeps two worlds apart (host and worker mirror in one process)', () => {
    const a = makeWorld(1);
    const b = makeWorld(2);
    queueAfterStrike(a, () => undefined);
    expect(pendingRacialSpawns(b)).toBe(0);
    drainRacialSpawnQueue(b);
    expect(pendingRacialSpawns(a)).toBe(1);
  });
});
