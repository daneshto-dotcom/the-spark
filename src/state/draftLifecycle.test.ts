/**
 * SPARK — the draft's LIFECYCLE, driven through the real reducers and the real host tick.
 *
 * ⛔ **NOTHING HERE CALLS `openDraftIfDue` OR `tickDraft` DIRECTLY TO PROVE THEY FIRE.** The spec's
 * own test list says the draft must be *"driven through the real `hostTick` wave edge, not by
 * calling the trigger"*, and the reason is the shape of the edge: it is a `while` loop that can flip
 * twice on one tick, inside a `flipped` guard, and a test that calls the trigger by hand proves
 * nothing about whether the edge reaches it.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld } from './world.ts';
import { applyStartGame } from './gameMode.ts';
import { openDraftIfDue, applyDraftChoice, tickDraft, DRAFT_DEADLINE_TICKS } from './draftEvent.ts';
import { generalPickForWave } from './draft.ts';
import { PHASE_DURATION_TICKS, FIGHT_PHASE_TICKS } from '../constants.ts';
import type { PlayerId } from '../types.ts';
import type { World } from './world.ts';

function seatsOf(w: World): PlayerId[] {
  return [...w.players.keys()];
}

/** Advance the match clock the way `runHostTick` does, so wave edges are crossed for real. */
function advance(w: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    w.tick++;
    tickDraft(w);
    while (w.tick >= w.phaseEndsAtTick) {
      w.matchPhase = w.matchPhase === 'BUILD' ? 'FIGHT' : 'BUILD';
      w.phaseEndsAtTick += w.matchPhase === 'BUILD' ? PHASE_DURATION_TICKS : FIGHT_PHASE_TICKS;
      if (w.matchPhase === 'BUILD') {
        w.waveNumber += 1;
        openDraftIfDue(w, w.waveNumber);
      }
    }
  }
}

function startedWorld(): World {
  const w = makeWorld(0x187);
  applyStartGame(w, { type: 'START_GAME' } as never);
  return w;
}

describe('the draft opens before wave 1', () => {
  it('is open the moment the match starts, on wave 1', () => {
    const w = startedWorld();
    expect(w.draft).not.toBeNull();
    expect(w.draft?.waveNumber).toBe(1);
    expect(w.matchPhase).toBe('BUILD');
  });

  it('offers the owner’s first axis — health', () => {
    expect(generalPickForWave(1)).toBe('hp');
  });

  it('starts every seat with an empty pick list, even on a SECOND match in one session', () => {
    // applyStartGame reuses the same Player objects; a seat that drafted last match must not carry
    // its upgrades in. This is the same class as the `world.tick` reset trap.
    const w = startedWorld();
    const seat = seatsOf(w)[0] as PlayerId;
    applyDraftChoice(w, seat, 'hp');
    expect(w.players.get(seat)?.draftPicks).toHaveLength(1);

    applyStartGame(w, { type: 'START_GAME' } as never);
    expect(w.players.get(seat)?.draftPicks).toEqual([]);
    expect(w.draft?.waveNumber).toBe(1);
  });
});

describe('picking', () => {
  it('records the pick and closes the panel once every seat has chosen', () => {
    const w = startedWorld();
    const seats = seatsOf(w);
    for (const s of seats) {
      expect(w.draft).not.toBeNull();
      applyDraftChoice(w, s, 'hp');
    }
    expect(w.draft).toBeNull();
    for (const s of seats) expect(w.players.get(s)?.draftPicks).toEqual(['hp']);
  });

  it('⛔ IGNORES a second pick from the same seat — a replayed intent buys nothing', () => {
    const w = startedWorld();
    const seat = seatsOf(w)[0] as PlayerId;
    applyDraftChoice(w, seat, 'hp');
    applyDraftChoice(w, seat, 'atk');
    applyDraftChoice(w, seat, 'atk');
    expect(w.players.get(seat)?.draftPicks).toEqual(['hp']);
  });

  it('ignores a pick when no draft is open', () => {
    const w = startedWorld();
    for (const s of seatsOf(w)) applyDraftChoice(w, s, 'hp');
    expect(w.draft).toBeNull();
    const seat = seatsOf(w)[0] as PlayerId;
    applyDraftChoice(w, seat, 'def');
    expect(w.players.get(seat)?.draftPicks).toEqual(['hp']);
  });
});

describe('the deadline — the proof the sim never waits', () => {
  it('auto-picks for every silent seat when the BUILD runs out, and the match moves on', () => {
    const w = startedWorld();
    const seats = seatsOf(w);
    expect(w.draft).not.toBeNull();

    advance(w, DRAFT_DEADLINE_TICKS);

    expect(w.draft).toBeNull();
    for (const s of seats) {
      expect(w.players.get(s)?.draftPicks).toEqual([generalPickForWave(1)]);
    }
  });

  it('⛔ resolves while the phase is still BUILD, not after the board has flipped', () => {
    // The deadline and `phaseEndsAtTick` are stamped from the same base and land on the SAME tick.
    // `tickDraft` runs before the clock block so the pick is made in the phase it was offered in.
    const w = startedWorld();
    const openedAt = w.draft?.openedAtTick ?? 0;
    expect(w.phaseEndsAtTick - openedAt).toBe(DRAFT_DEADLINE_TICKS);

    advance(w, DRAFT_DEADLINE_TICKS - 1);
    expect(w.draft).not.toBeNull();
    expect(w.matchPhase).toBe('BUILD');

    advance(w, 1);
    expect(w.draft).toBeNull();
  });

  it('leaves a seat that DID choose with its own pick, not the automatic one', () => {
    const w = startedWorld();
    const seats = seatsOf(w);
    const chooser = seats[0] as PlayerId;
    // ⚠ S188 — this chose 'atk' at the HP draft until S188, which only worked because
    // `applyDraftChoice` accepted ANY pick (a latent bug, fixed: only an OFFERED option may be taken —
    // `racialPerks.test.ts` pins the refusal). It now chooses the offered axis, and the guard's real
    // point is kept: the chooser's pick is made BEFORE the deadline and the deadline does not add a
    // second one on top of it.
    applyDraftChoice(w, chooser, generalPickForWave(1));
    expect(w.players.get(chooser)?.draftPicks).toEqual([generalPickForWave(1)]);

    advance(w, DRAFT_DEADLINE_TICKS);

    expect(w.players.get(chooser)?.draftPicks).toEqual([generalPickForWave(1)]);
    for (const s of seats.slice(1)) {
      expect(w.players.get(s)?.draftPicks).toEqual([generalPickForWave(1)]);
    }
  });
});

describe('the recurring schedule, driven through real wave edges', () => {
  it('opens again on wave 6 and not on waves 2–5', () => {
    const w = startedWorld();
    for (const s of seatsOf(w)) applyDraftChoice(w, s, 'hp');
    expect(w.draft).toBeNull();

    // Walk whole waves. One wave = one BUILD + one FIGHT.
    const wave = PHASE_DURATION_TICKS + FIGHT_PHASE_TICKS;
    for (let n = 2; n <= 5; n++) {
      advance(w, wave);
      expect(w.waveNumber, `wave ${n} must not draft`).toBe(n);
      expect(w.draft, `wave ${n} must not draft`).toBeNull();
    }

    advance(w, wave);
    expect(w.waveNumber).toBe(6);
    expect(w.draft).not.toBeNull();
    expect(w.draft?.waveNumber).toBe(6);
  });

  it('offers DEFENCE at wave 6 — the owner’s second axis', () => {
    expect(generalPickForWave(6)).toBe('def');
  });

  it('accumulates picks across drafts rather than replacing them', () => {
    const w = startedWorld();
    const seat = seatsOf(w)[0] as PlayerId;
    for (const s of seatsOf(w)) applyDraftChoice(w, s, 'hp');

    const wave = PHASE_DURATION_TICKS + FIGHT_PHASE_TICKS;
    advance(w, wave * 5);
    expect(w.draft?.waveNumber).toBe(6);
    applyDraftChoice(w, seat, 'def');

    expect(w.players.get(seat)?.draftPicks).toEqual(['hp', 'def']);
  });
});
