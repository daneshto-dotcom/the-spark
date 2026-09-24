/**
 * SPARK — S189 (C4): the reconnect schedule and the lone-survivor claim gate.
 *
 * The end-to-end reproduction is `e2e/reconnect-hard-blip.spec.ts` (real WebRTC): a hard blip, retries
 * at 1.45 / 5.5 / 9.5 / 13.7 s, and a match that never came back. These tests pin the two decisions
 * that turned that recoverable blip into a lost match, against the REAL constants.
 */
import { describe, expect, it } from 'vitest';
import {
  hasSurvivorToHostFor,
  reconnectRetryDue,
  RECONNECT_FIRST_RETRY_DELAY_MS,
  RECONNECT_GRACE_MS,
  RECONNECT_RETRY_MS,
  terminalLossCause,
} from './reconnectPolicy.ts';
import { JOIN_STALL_WARN_MS } from './joinDiagnosis.ts';

/** A fresh join (signalling + ICE + DTLS + SCTP), measured S189 on this machine over live relays. */
const MEASURED_FRESH_JOIN_MS = 6_300;

/**
 * The main.ts loop, frame by frame: from the blip, attempts start when `reconnectRetryDue` says so;
 * an attempt LANDS `joinMs` after it starts unless a newer attempt replaces it first. Returns when
 * the first attempt lands, or null if none lands inside `horizonMs`.
 */
function firstLanding(opts: {
  retryMs: number;
  retryPastGrace: boolean;
  joinMs: number;
  horizonMs: number;
  /** Attempts starting before this are refused (e.g. the other side still holds the dead connection). */
  refusedBeforeMs?: number;
}): { landedAtMs: number | null; attemptsAt: number[] } {
  const attemptsAt: number[] = [];
  let next = RECONNECT_FIRST_RETRY_DELAY_MS;
  let inFlight: { startedAt: number; ok: boolean } | null = null;
  for (let now = 0; now <= opts.horizonMs; now += 16) {
    if (inFlight !== null && inFlight.ok && now - inFlight.startedAt >= opts.joinMs) {
      return { landedAtMs: now, attemptsAt };
    }
    const due = reconnectRetryDue({ nowMs: now, nextRetryMs: next, isHost: false, hasRoomCode: true, migrationCase: false });
    const allowed = opts.retryPastGrace || now < RECONNECT_GRACE_MS;
    if (due && allowed) {
      next = now + opts.retryMs;
      attemptsAt.push(now);
      inFlight = { startedAt: now, ok: now >= (opts.refusedBeforeMs ?? 0) };
    }
  }
  return { landedAtMs: null, attemptsAt };
}

describe('S189 C4 — the reconnect schedule lets a join LAND', () => {
  it('⭐ the retry cadence is the repo\'s own healthy-join budget, and it outlasts a measured fresh join', () => {
    expect(RECONNECT_RETRY_MS).toBe(JOIN_STALL_WARN_MS);
    expect(RECONNECT_RETRY_MS, 'a retry must not tear down a join that is still healthy').toBeGreaterThan(MEASURED_FRESH_JOIN_MS);
  });

  it('⭐ REACH (the loop, frame by frame): a hard blip rejoins INSIDE the grace', () => {
    const r = firstLanding({ retryMs: RECONNECT_RETRY_MS, retryPastGrace: true, joinMs: MEASURED_FRESH_JOIN_MS, horizonMs: 60_000 });
    expect(r.landedAtMs).not.toBeNull();
    expect(r.landedAtMs!).toBeLessThan(RECONNECT_GRACE_MS); // no terminal overlay at all
    expect(r.attemptsAt).toEqual([1008]); // one attempt, left alone
  });

  it('⛔ NEGATIVE — the pre-S189 cadence (4 s) tears down every attempt that could have landed in the grace', () => {
    // The reproduction's attempts were 1.45 / 5.5 / 9.5 / 13.7 s: this is that loop.
    const r = firstLanding({ retryMs: 4_000, retryPastGrace: false, joinMs: MEASURED_FRESH_JOIN_MS, horizonMs: RECONNECT_GRACE_MS });
    expect(r.attemptsAt.length).toBe(4);
    expect(r.landedAtMs, 'no attempt can land before the grace ends').toBeNull();
  });

  it('⭐ past the grace the loop KEEPS TRYING — a peer that is refused for 20 s still comes back', () => {
    // E.g. the other side has not yet noticed the old connection died, so it refuses the new one.
    const r = firstLanding({
      retryMs: RECONNECT_RETRY_MS,
      retryPastGrace: true,
      joinMs: MEASURED_FRESH_JOIN_MS,
      horizonMs: 90_000,
      refusedBeforeMs: 20_000,
    });
    expect(r.landedAtMs).not.toBeNull();
    expect(r.landedAtMs!).toBeGreaterThan(RECONNECT_GRACE_MS);
    // …whereas a loop that stops at the grace never does.
    const old = firstLanding({ retryMs: RECONNECT_RETRY_MS, retryPastGrace: false, joinMs: MEASURED_FRESH_JOIN_MS, horizonMs: 90_000, refusedBeforeMs: 20_000 });
    expect(old.landedAtMs).toBeNull();
  });

  it('reconnectRetryDue is NOT gated on the grace, and never retries for a host, a codeless session or a live mesh', () => {
    const base = { nowMs: RECONNECT_GRACE_MS * 3, nextRetryMs: 0, isHost: false, hasRoomCode: true, migrationCase: false };
    expect(reconnectRetryDue(base)).toBe(true);
    expect(reconnectRetryDue({ ...base, isHost: true })).toBe(false);
    expect(reconnectRetryDue({ ...base, hasRoomCode: false })).toBe(false);
    expect(reconnectRetryDue({ ...base, migrationCase: true })).toBe(false);
    expect(reconnectRetryDue({ ...base, nextRetryMs: base.nowMs + 1 })).toBe(false);
  });
});

describe('S189 C4 — a claim needs a survivor to host for', () => {
  it('⛔ the 1v1 lone survivor never claims — it keeps reconnecting instead', () => {
    // Its transport lost everyone: the reproduction's joiner claimed here and ended isHost:true, alone.
    expect(hasSurvivorToHostFor(new Set(), 'host-peer')).toBe(false);
    // The host is still connected but silent (a frozen host tab): still nobody ELSE to host for.
    expect(hasSurvivorToHostFor(new Set(['host-peer']), 'host-peer')).toBe(false);
  });

  it('NEGATIVE — a 3-seat survivor with another survivor connected still claims (the D3/D4 design)', () => {
    expect(hasSurvivorToHostFor(new Set(['host-peer', 'seat-2']), 'host-peer')).toBe(true);
    expect(hasSurvivorToHostFor(new Set(['seat-2']), 'host-peer')).toBe(true);
    expect(hasSurvivorToHostFor(new Set(['seat-2']), null)).toBe(true);
  });
});

describe('S189 E3 — the terminal line names its cause', () => {
  it('maps each terminal branch of the overlay to one word', () => {
    expect(terminalLossCause({ zombieDeposed: true, migrationCase: false, peerCount: 1 })).toBe('zombieDeposed');
    expect(terminalLossCause({ zombieDeposed: false, migrationCase: true, peerCount: 1 })).toBe('migrationDeadline');
    expect(terminalLossCause({ zombieDeposed: false, migrationCase: false, peerCount: 0 })).toBe('peerCount0');
    // A 3+-seat client that lost only the host: peers remain, but not the one it follows.
    expect(terminalLossCause({ zombieDeposed: false, migrationCase: false, peerCount: 2 })).toBe('hostLost');
  });
});
