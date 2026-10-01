/**
 * ⛔ S192 (audit UIGATES-4) — **THE SCORCHED EARTH "SENT, NOT YET SYNCED" RECORD MUST SURVIVE A SNAPSHOT
 * THAT MOVES `world.tick` BACK** — the scorch twin of s191/carry's C-2 (WRATH-F5) for Ra.
 *
 * A joiner runs `world.tick++` itself between snapshots and each snapshot sets `world.tick = snap.tick`
 * (`applySnapshotCore`), so a clock that ran ahead steps BACK right after the send. `age < 0 → expired`
 * made the record inert exactly then: the square re-lit inside the round trip and a second press re-aimed.
 * Driven through the real `netSnapshot` → `applyNetSnapshot` round trip that moves the clock.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { applyNetSnapshot, netSnapshot } from '../state/save.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import {
  clearScorchedEarthPending,
  noteScorchedEarthCastSent,
  scorchedEarthChargesLeftLocal,
  scorchedEarthLocalRefusal,
} from './scorchedEarthAim.ts';
import { RA_PENDING_TIMEOUT_TICKS } from './raAimPreview.ts';

const P0 = asPlayerId(0);
afterEach(() => clearScorchedEarthPending());

function joiner(): World {
  const w = makeWorld(0x192c);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0]!, raceId: 'demons' }, { seat: 1, color: PLAYER_COLORS[1]! }],
  } as never);
  w.gameState = 'PLAYING';
  w.draft = null;
  w.players.get(P0)!.raceId = 'demons';
  w.players.get(P0)!.draftPicks = ['racial'];
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  return w;
}

/** The host's snapshot from `ahead` ticks BEFORE the joiner's cast; `land()` moves world.tick back by `ahead`. */
function hostSnapshotBehind(w: World, ahead: number): () => void {
  const snap = netSnapshot(w);
  w.tick += ahead;
  return () => applyNetSnapshot(snap, w);
}

describe('S192 UIGATES-4 — a snapshot that moves world.tick BACK keeps the unsynced scorch cast counted', () => {
  it('⛔ REACH: the square stays USED (no second aim) after the clock steps back below the send tick', () => {
    const w = joiner();
    expect(scorchedEarthLocalRefusal(w, P0), 'fixture: the square is live').toBeNull();
    const land = hostSnapshotBehind(w, 2);
    noteScorchedEarthCastSent(w, P0);
    expect(scorchedEarthLocalRefusal(w, P0)).toBe('USED');
    land(); // world.tick steps back 2, the host has not shown the cast yet
    expect(w.players.get(P0)!.scorchedEarth, 'the host has not echoed it').toBeNull();
    expect(scorchedEarthLocalRefusal(w, P0), 'square must not re-light').toBe('USED');
    expect(scorchedEarthChargesLeftLocal(w, P0)).toBe(0);
  });

  it('⛔ NEGATIVE: the window still EXPIRES on the synced clock — and an expired record is dropped, never revived', () => {
    const w = joiner();
    noteScorchedEarthCastSent(w, P0);
    w.tick += RA_PENDING_TIMEOUT_TICKS + 1; // the host refused it: nothing ever came back
    expect(scorchedEarthLocalRefusal(w, P0), 'expired').toBeNull();
    w.tick -= RA_PENDING_TIMEOUT_TICKS + 5; // a later step back below the send tick
    expect(scorchedEarthLocalRefusal(w, P0), 'a dropped record does not come back').toBeNull();
  });
});
