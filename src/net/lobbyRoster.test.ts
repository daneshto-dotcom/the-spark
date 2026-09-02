import { describe, it, expect } from 'vitest';
import { reconcileLobbySeats, buildLobbyRoster, buildMatchRoster } from './lobbyRoster.ts';
import { PLAYER_COLORS, MAX_PLAYERS } from '../constants.ts';
import { RACE_COLORS, defaultRaceForSeat, type RaceId } from '../state/races.ts';

const HOST = 'host-self-id';

// Fold reconcileLobbySeats over a sequence of peerId snapshots (each = the value
// transport.peerIds() would return after one join/leave event). This exercises the
// STATEFUL accumulation in the host's presence loop using only the pure reducer
// (Council S73 — the real regression surface is the sequence, not a single call).
const fold = (snapshots: readonly string[][]): Map<string, number> => {
  let m = new Map<string, number>();
  for (const snap of snapshots) m = reconcileLobbySeats(m, snap);
  return m;
};
const norm = (m: Map<string, number>): Record<string, number> =>
  Object.fromEntries([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));

describe('reconcileLobbySeats (S73 P1 — stable, non-compacting lobby seat-map)', () => {
  it('assigns join-order seats 1..N to fresh peers (host is seat 0, not in the map)', () => {
    const m = reconcileLobbySeats(new Map(), ['p1', 'p2', 'p3']);
    expect(norm(m)).toEqual({ p1: 1, p2: 2, p3: 3 });
    expect(m.has(HOST)).toBe(false);
  });

  it('a leaving peer FREES its seat; survivors KEEP theirs (the non-compacting fix)', () => {
    const m1 = reconcileLobbySeats(new Map(), ['A', 'B', 'C']); // {A:1,B:2,C:3}
    const m2 = reconcileLobbySeats(m1, ['A', 'C']); // B leaves seat 2
    expect(m2.get('A')).toBe(1);
    expect(m2.get('C')).toBe(3); // C did NOT shift down to 2 (that was the reshuffle bug)
    expect(m2.has('B')).toBe(false);
    expect(m2.size).toBe(2);
  });

  it('a new joiner fills the LOWEST free seat (back-fills the hole, not seat N+1)', () => {
    const m = fold([['A', 'B', 'C'], ['A', 'C'], ['A', 'C', 'D']]);
    expect(m.get('A')).toBe(1);
    expect(m.get('C')).toBe(3); // unchanged incumbent
    expect(m.get('D')).toBe(2); // filled the hole B left, NOT seat 4
  });

  it('reuses a freed seat for the next joiner even after the original holder is gone', () => {
    // A,B,C → B leaves → D fills 2 → C leaves (frees 3) → E fills 3
    const m = fold([['A', 'B', 'C'], ['A', 'C'], ['A', 'C', 'D'], ['A', 'D'], ['A', 'D', 'E']]);
    expect(norm(m)).toEqual({ A: 1, D: 2, E: 3 });
    expect(m.has('C')).toBe(false);
  });

  it('fills MULTIPLE holes with MULTIPLE joiners in one reconcile — lowest holes first (CHECK Gemini f)', () => {
    // S147 R41 - re-pinned to the 3 remote seats the cap now allows. Still TWO holes filled by TWO
    // joiners in ONE reconcile, lowest hole first, which is the whole point of the test.
    const m1 = reconcileLobbySeats(new Map(), ['A', 'B', 'C']); // {A:1,B:2,C:3}
    const m2 = reconcileLobbySeats(m1, ['B']); // A,C leave → holes at 1 and 3
    expect(norm(m2)).toEqual({ B: 2 });
    const m3 = reconcileLobbySeats(m2, ['B', 'E', 'F']); // E,F join in the SAME step
    expect(m3.get('E')).toBe(1); // lowest hole
    expect(m3.get('F')).toBe(3); // next hole — NOT a 4th seat
    expect(norm(m3)).toEqual({ B: 2, E: 1, F: 3 });
  });

  it('caps at MAX_PLAYERS-1 remotes; over-cap peers are left unseated (host-authoritative)', () => {
    const peers = Array.from({ length: MAX_PLAYERS + 2 }, (_, i) => `p${i}`);
    const m = reconcileLobbySeats(new Map(), peers);
    expect(m.size).toBe(MAX_PLAYERS - 1);
    // S147 R41 — derived from the cap: remotes fill seats 1..MAX_PLAYERS-1, over-cap peers stay unseated.
    expect([...m.values()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 1),
    );
    expect(m.has(`p${MAX_PLAYERS - 2}`)).toBe(true); // last seated
    expect(m.has(`p${MAX_PLAYERS - 1}`)).toBe(false); // first dropped
  });

  it('is idempotent — re-reconciling an unchanged peer set is a fixed point', () => {
    const m1 = reconcileLobbySeats(new Map(), ['A', 'B']);
    const m2 = reconcileLobbySeats(m1, ['A', 'B']);
    expect(norm(m2)).toEqual(norm(m1));
  });

  it('INVARIANT across a churny join/leave sequence: seats unique, in [1,MAX-1], host never stored', () => {
    const seqs: string[][] = [
      ['A'],
      ['A', 'B'],
      ['A', 'B', 'C'],
      ['A', 'C'], // hole at 2
      ['A', 'C', 'D'], // D fills 2
      ['A', 'C', 'D', 'E', 'F'], // E→4, F→5
      ['C', 'D', 'E', 'F'], // A leaves, hole at 1
      ['C', 'D', 'E', 'F', 'G', 'H'], // G→1, H over-cap → unseated
    ];
    let m = new Map<string, number>();
    for (const snap of seqs) {
      m = reconcileLobbySeats(m, snap);
      const seats = [...m.values()];
      expect(new Set(seats).size).toBe(seats.length); // unique
      for (const s of seats) {
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThan(MAX_PLAYERS); // remote seats are 1..MAX-1
      }
      expect(m.has(HOST)).toBe(false); // host is seat 0, never in the remote map
      expect(m.size).toBeLessThanOrEqual(MAX_PLAYERS - 1); // cap
    }
  });
});

describe('buildLobbyRoster (S73 P1 — STABLE preview projection; holes allowed)', () => {
  it('host alone → a single seat-0 entry (selfId, PLAYER_COLORS[0])', () => {
    expect(buildLobbyRoster(new Map(), HOST)).toEqual([
      { seat: 0, peerId: HOST, color: PLAYER_COLORS[0] },
    ]);
  });

  it('projects seated peers ordered by seat with PLAYER_COLORS[seat]', () => {
    const m = reconcileLobbySeats(new Map(), ['p1', 'p2']);
    expect(buildLobbyRoster(m, HOST)).toEqual([
      { seat: 0, peerId: HOST, color: PLAYER_COLORS[0] },
      { seat: 1, peerId: 'p1', color: PLAYER_COLORS[1] },
      { seat: 2, peerId: 'p2', color: PLAYER_COLORS[2] },
    ]);
  });

  it('emits a HOLE (non-contiguous seat) after a mid-roster leave — survivor keeps seat+colour', () => {
    const m = fold([['A', 'B', 'C'], ['A', 'C']]); // hole at seat 2
    const r = buildLobbyRoster(m, HOST);
    expect(r.map((e) => e.seat)).toEqual([0, 1, 3]); // seat 2 missing → client renders empty cell
    const c = r.find((e) => e.peerId === 'C');
    expect(c?.seat).toBe(3);
    expect(c?.color).toBe(PLAYER_COLORS[3]); // C keeps its colour (was the reshuffle bug)
  });

  it('seat 0 is always the local selfId', () => {
    const m = reconcileLobbySeats(new Map(), ['x']);
    expect(buildLobbyRoster(m, 'ME')[0]).toEqual({
      seat: 0,
      peerId: 'ME',
      color: PLAYER_COLORS[0],
    });
  });
});

describe('buildMatchRoster (S73 P1 — DENSE authoritative-Begin projection)', () => {
  it('host alone → seat-0 only', () => {
    expect(buildMatchRoster(new Map(), HOST)).toEqual([
      { seat: 0, peerId: HOST, color: PLAYER_COLORS[0] },
    ]);
  });

  it('fills exactly MAX_PLAYERS seats when host + (MAX_PLAYERS-1) peers; last colour tracks seat', () => {
    const peers = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => `p${i}`);
    const m = reconcileLobbySeats(new Map(), peers);
    const r = buildMatchRoster(m, HOST);
    expect(r).toHaveLength(MAX_PLAYERS);
    expect(r.map((e) => e.seat)).toEqual(Array.from({ length: MAX_PLAYERS }, (_, i) => i));
    expect(r[MAX_PLAYERS - 1].color).toBe(PLAYER_COLORS[MAX_PLAYERS - 1]);
  });

  it('compacts a HOLED stable map to CONTIGUOUS seats 0..N-1 (the one-time Begin shift)', () => {
    const m = fold([['A', 'B', 'C'], ['A', 'C']]); // stable: A=1, C=3 (hole at 2)
    const r = buildMatchRoster(m, HOST);
    expect(r.map((e) => e.seat)).toEqual([0, 1, 2]); // dense — radialSpawnPos needs contiguity
    const c = r.find((e) => e.peerId === 'C');
    expect(c?.seat).toBe(2); // C compacts stable 3 → dense 2
    expect(c?.color).toBe(PLAYER_COLORS[2]); // colour shifts once at match start (documented tradeoff)
  });

  it('densifies in ascending stable-seat order (preserves join order across a hole)', () => {
    // S147 R41 - only MAX_PLAYERS-1 = 3 remotes fit now, so this uses 3 rather than 4. The property
    // under test is unchanged: a mid-lobby leave leaves a HOLE in stable seats, and Begin DENSIFIES
    // them in ascending stable order, preserving join order.
    const m = fold([['A', 'B', 'C'], ['A', 'C']]); // hole at 2; stable A1 C3
    expect(buildMatchRoster(m, HOST)).toEqual([
      { seat: 0, peerId: HOST, color: PLAYER_COLORS[0] },
      { seat: 1, peerId: 'A', color: PLAYER_COLORS[1] },
      { seat: 2, peerId: 'C', color: PLAYER_COLORS[2] },
    ]);
  });
});

describe('S73 P1 — no-hole canary: STABLE preview == DENSE Begin (S70 invariant preserved)', () => {
  it('with NO mid-lobby leave, previewed seats EQUAL Begin seats (peerId + seat + colour)', () => {
    for (const n of [0, 1, 2, MAX_PLAYERS - 1]) {
      const peers = Array.from({ length: n }, (_, i) => `p${i}`);
      const m = reconcileLobbySeats(new Map(), peers);
      expect(buildMatchRoster(m, HOST)).toEqual(buildLobbyRoster(m, HOST));
    }
  });

  it('a BACK-FILLED hole also yields stable==dense (contiguous again → no shift at Begin)', () => {
    const m = fold([['A', 'B', 'C'], ['A', 'C'], ['A', 'C', 'D']]); // D fills hole → {1,2,3}
    expect(buildMatchRoster(m, HOST)).toEqual(buildLobbyRoster(m, HOST));
  });
});

describe('W1-A (S160) — ⛔ B6: THE RACE FOLLOWS THE PEER, NOT THE DENSE SEAT', () => {
  /**
   * The docblock on `buildMatchRoster` accepts *"the documented one-time match-start colour shift"*
   * when an unfilled hole compacts the seats. Harmless while colour is a seat's paint. **With races
   * that same shift is a RACE change** — a player who locked vampires in the lobby would begin the
   * match as nagas.
   *
   * ⚠ AND THE FAILURE IS SILENT IN BOTH AVAILABLE DIRECTIONS, which is why these assert behaviour
   * rather than the field's presence:
   *   · leave `buildMatchRoster` building `PLAYER_COLORS[denseSeat]` and `raceId` is simply NEVER
   *     POPULATED on the authoritative Begin roster — and every case above still passes, because
   *     the lobby rack is built by the OTHER function;
   *   · "optimise" the emit to omit a race equal to the seat default, and a claimed race gets
   *     re-derived from the DENSE seat on the receiving side. S160 wrote that bug and this caught it.
   */
  const claim = (pairs: ReadonlyArray<readonly [string, RaceId]>): Map<string, RaceId> =>
    new Map(pairs.map(([p, r]) => [p, r]));

  it('⭐ a claimed race SURVIVES dense compaction, while the colour still shifts', () => {
    // The exact scenario the docblock's tradeoff describes: C is stable seat 3, compacts to dense 2.
    const m = fold([['A', 'B', 'C'], ['A', 'C']]); // hole at 2; stable A1 C3
    const r = buildMatchRoster(m, HOST, claim([['C', 'demons'], ['A', 'orcs']]), 'zombies');

    const c = r.find((e) => e.peerId === 'C');
    expect(c?.seat, 'C still compacts 3 -> 2').toBe(2);
    expect(c?.raceId, 'but its RACE is the one it claimed, not dense seat 2 default').toBe('demons');
    expect(c?.color, 'and colour is derived from the race, so it follows too').toBe(RACE_COLORS.demons);
    // The claim is what moved; the seat compaction is unchanged from the case above.
    expect(c?.raceId).not.toBe(defaultRaceForSeat(2));

    expect(r.find((e) => e.peerId === 'A')?.raceId).toBe('orcs');
    expect(r.find((e) => e.peerId === HOST)?.raceId, "the host's own claim").toBe('zombies');
  });

  it('⭐ an UNCLAIMED roster is byte-identical to the pre-W1-A one (no key at all)', () => {
    // This is the contract that keeps a v38 beacon parseable and every existing case above green.
    const m = fold([['A', 'B', 'C'], ['A', 'C']]);
    expect(buildMatchRoster(m, HOST, new Map())).toEqual([
      { seat: 0, peerId: HOST, color: PLAYER_COLORS[0] },
      { seat: 1, peerId: 'A', color: PLAYER_COLORS[1] },
      { seat: 2, peerId: 'C', color: PLAYER_COLORS[2] },
    ]);
    for (const e of buildMatchRoster(m, HOST, new Map())) {
      expect(Object.prototype.hasOwnProperty.call(e, 'raceId')).toBe(false);
    }
  });

  it('a PARTIALLY claimed roster carries the key only for the peers that chose', () => {
    const m = fold([['A', 'C']]);
    const r = buildMatchRoster(m, HOST, claim([['C', 'mummies']]));
    expect(r.find((e) => e.peerId === 'C')?.raceId).toBe('mummies');
    expect(Object.prototype.hasOwnProperty.call(r.find((e) => e.peerId === 'A')!, 'raceId')).toBe(false);
    // The unclaimed peer's colour is still exactly its seat's palette entry.
    expect(r.find((e) => e.peerId === 'A')?.color).toBe(PLAYER_COLORS[1]);
  });

  it('⚠ a claim EQUAL to the dense-seat default is STILL transmitted', () => {
    // The receiver cannot tell "claimed vampires" from "did not choose", and after a compaction the
    // default it would re-derive is a DIFFERENT race. So an explicit claim is never elided.
    const m = fold([['A', 'B', 'C'], ['A', 'C']]);
    const sameAsDense2 = defaultRaceForSeat(2);
    const r = buildMatchRoster(m, HOST, claim([['C', sameAsDense2]]));
    const c = r.find((e) => e.peerId === 'C')!;
    expect(c.seat).toBe(2);
    expect(Object.prototype.hasOwnProperty.call(c, 'raceId'), 'an explicit claim is always sent').toBe(true);
    expect(c.raceId).toBe(sameAsDense2);
  });

  it('the lobby preview carries claims too, keyed on peer', () => {
    const m = reconcileLobbySeats(new Map(), ['A', 'B']);
    const r = buildLobbyRoster(m, HOST, claim([['B', 'nagas']]), 'demons');
    expect(r.find((e) => e.peerId === HOST)?.raceId).toBe('demons');
    expect(r.find((e) => e.peerId === 'B')?.raceId).toBe('nagas');
    expect(r.find((e) => e.peerId === 'B')?.color).toBe(RACE_COLORS.nagas);
  });
});
