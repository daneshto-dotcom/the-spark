/**
 * SPARK — W1-A (S160): A RACE CHOICE MUST SURVIVE THE WIRE, A SAVE, AND A HOST MIGRATION.
 *
 * ⚠ WHY THIS FILE EXISTS, and it is not "coverage for its own sake". It is modelled on
 * `state/layoutWire.test.ts`, which exists because the same class of gap had been READ rather than
 * PROVEN — `netSnapshot` derives from `snapshot()` by destructure-and-drop, and whether a new
 * `Player` field rides through that `...rest` is a property of the code, not of anyone's reading.
 *
 * The existing gates cannot see a race that fails to transmit:
 *   · `workerSim.differential` compares netSnapshot JSON between two rigs that BOTH adopt the world
 *     from the same disk `snapshot()`. A field missing from the wire is missing from both sides
 *     equally, so they agree and the gate stays green.
 *   · The wide oracle is no help either, and this is the sharp part: `FIELD_COVERAGE` marks
 *     `players: 'acknowledged'` (`state/stateHashFull.ts`), and it is keyed on `keyof World`, not
 *     `keyof Player`. So adding `raceId` to `Player` compiles clean, escapes the oracle, and fires
 *     NO tsc tripwire. That is the spec's B5, and it is why these assertions are hand-written.
 *   · Colour is not hashed, so a host and a joiner disagreeing about every castle's race would
 *     produce no desync report at all — just two players looking at differently coloured boards.
 */
import { describe, expect, it } from 'vitest';

import { applyNetSnapshot, netSnapshot, snapshot, restore } from '../state/save.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asPlayerId } from '../types.ts';
import { defaultRaceForSeat, type RaceId } from '../state/races.ts';
import { PLAYER_COLORS } from '../constants.ts';
import { RACE_COLORS } from '../state/races.ts';

/** A PLAYING world seated for `seats`, with an explicit race per seat. */
function seated(races: readonly RaceId[]): World {
  const world = makeWorld(0x9ace);
  world.gameState = 'TITLE';
  const roster = races.map((raceId, seat) => ({ seat, color: RACE_COLORS[raceId], raceId }));
  dispatch(world, { type: 'START_GAME', mode: '1v1', isHost: true, roster });
  return world;
}

const raceOf = (w: World, seat: number): RaceId | undefined =>
  w.players.get(asPlayerId(seat))?.raceId;

describe('W1-A — the race reaches every peer', () => {
  it('⭐ START_GAME stamps the chosen race on EVERY seat, host included (B7)', () => {
    // ⛔ Seat 0 is the one that matters. `makeWorld` already built it, so `applyStartGame`'s
    // idempotent arm skips the insert — before the `else` arm existed, the host's own chosen race
    // was silently discarded while every joiner saw it correctly.
    const host = seated(['demons', 'mummies']);
    expect(raceOf(host, 0), "the HOST's own race must survive the idempotent arm").toBe('demons');
    expect(raceOf(host, 1)).toBe('mummies');
    // And the derived colour came along with it.
    expect(host.players.get(asPlayerId(0))!.color).toBe(RACE_COLORS.demons);
  });

  it('⭐ netSnapshot EMITS the race — not merely defaulted on the far side', () => {
    const host = seated(['demons', 'mummies']);
    const snap = netSnapshot(host);
    const wire = snap.players.find((p) => p.id === 0);
    expect(wire, 'seat 0 is on the wire').toBeDefined();
    // Non-default, so it must be PRESENT as a key rather than reconstructed by the receiver.
    expect(wire!.raceId, 'a non-default race must be emitted explicitly').toBe('demons');
  });

  it('⭐ a JOINER adopts the host races — the desync this guards against', () => {
    const host = seated(['demons', 'mummies']);
    // A fresh client starts on its own seat defaults, which are deliberately DIFFERENT from the
    // host's choices — so a silent failure to transmit shows as a wrong value, not a lucky match.
    const client = makeWorld(0xc0ffee);
    expect(raceOf(client, 0)).toBe(defaultRaceForSeat(0));
    expect(raceOf(client, 0)).not.toBe('demons');

    applyNetSnapshot(netSnapshot(host), client);
    expect(raceOf(client, 0)).toBe('demons');
    expect(raceOf(client, 1)).toBe('mummies');
  });

  it('survives a DISK round-trip (save/load), which is a different function from the wire', () => {
    const host = seated(['orcs', 'zombies']);
    const restored = makeWorld(0xdead);
    restore(snapshot(host), restored);
    expect(raceOf(restored, 0)).toBe('orcs');
    expect(raceOf(restored, 1)).toBe('zombies');
  });

  it('⭐ survives a HOST MIGRATION — the leg layoutWire.test.ts exists because it had been assumed', () => {
    // A migration is a successor adopting the departing host's snapshot and continuing as authority.
    // Modelled the same way: full snapshot out, applied into a world that did not choose these races.
    const host = seated(['nagas', 'vampires']);
    const successor = makeWorld(0x50cc);
    applyNetSnapshot(netSnapshot(host), successor);
    expect(raceOf(successor, 0)).toBe('nagas');
    // And it survives being re-emitted BY the successor, which is what makes it a migration rather
    // than a one-way copy: the new authority must serialize what it adopted.
    const rejoiner = makeWorld(0x5eed);
    applyNetSnapshot(netSnapshot(successor), rejoiner);
    expect(raceOf(rejoiner, 0)).toBe('nagas');
    expect(raceOf(rejoiner, 1)).toBe('vampires');
  });
});

describe('W1-A — the additive-optional contract, in both directions', () => {
  it('⭐ an ALL-DEFAULT board is BYTE-IDENTICAL on the wire to a pre-W1-A one', () => {
    // The field is emitted only when it differs from the seat default, so a board where nobody chose
    // must carry no `raceId` key at all. This is what keeps every pre-existing save loadable and
    // what makes the bump about the STALE PEER rather than about our own serializer.
    const world = seated([defaultRaceForSeat(0), defaultRaceForSeat(1)]);
    for (const p of netSnapshot(world).players) {
      expect(
        Object.prototype.hasOwnProperty.call(p, 'raceId'),
        `seat ${p.id} is on its default, so raceId must be ABSENT from the payload`,
      ).toBe(false);
    }
    // Sanity: the default really is what the palette says, or the assertion above is vacuous.
    expect(RACE_COLORS[defaultRaceForSeat(0)]).toBe(PLAYER_COLORS[0]);
  });

  it('an ABSENT race rehydrates to the seat default, never to a hardcoded one', () => {
    const host = seated(['demons', 'mummies']);
    const snap = netSnapshot(host);
    // Simulate a v38 peer's payload: the key is simply not there. Deleting it off a clone is more
    // faithful than never setting it — `hasOwnProperty` must be false, not just the value undefined.
    const stripped = {
      ...snap,
      players: snap.players.map((p) => {
        const clone: Record<string, unknown> = { ...p };
        delete clone.raceId;
        return clone as unknown as (typeof snap.players)[number];
      }),
    };
    const client = makeWorld(0xf00d);
    applyNetSnapshot(stripped, client);
    expect(raceOf(client, 0)).toBe(defaultRaceForSeat(0));
    expect(raceOf(client, 1)).toBe(defaultRaceForSeat(1));
  });

  it('⭐ GARBAGE rehydrates to the seat default — isRaceId runs before the assignment', () => {
    // The value crosses a trust boundary as a bare string. Unvalidated, it would reach
    // `RACE_COLORS[...]` and paint `undefined`.
    const host = seated(['demons', 'mummies']);
    const snap = netSnapshot(host);
    const poisoned = {
      ...snap,
      players: snap.players.map((p) => ({ ...p, raceId: 'ELVES' as unknown as RaceId })),
    };
    const client = makeWorld(0xbad0);
    applyNetSnapshot(poisoned, client);
    expect(raceOf(client, 0)).toBe(defaultRaceForSeat(0));
    expect(RACE_COLORS[raceOf(client, 0)!]).toBeTypeOf('number');
  });
});
