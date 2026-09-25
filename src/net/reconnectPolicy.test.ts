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
  stepMigrationClaim,
  stepHostPresence,
  seatedSurvivors,
  planConnectionFrame,
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
    // Only the host is connected: nobody ELSE to host for. ⚠ S189 fix round — `stepMigrationClaim` asks
    // this ONLY on transport loss; a connected-but-frozen host is D4's case (the NET-4 block below).
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

import { HOST_STARVATION_MS, CLAIM_LADDER_MS } from './succession.ts';

/**
 * Drive `stepMigrationClaim` frame by frame (16 ms) the way main.ts does, from `fromMs` to `toMs`.
 * `host(t)` says whether the host is on our transport at time t; `others` are the other survivors;
 * `lastSnapshotAt(t)` is the last accepted snapshot as of t; `presentSince(t)` the host's presence stamp.
 * Returns the time of the first claim, or null.
 */
function firstClaim(o: {
  fromMs: number;
  toMs: number;
  host: (t: number) => boolean;
  others?: string[];
  /** ⭐ S191 — survivors that come and go (overrides `others`). */
  othersAt?: (t: number) => string[];
  lastSnapshotAt: (t: number) => number;
  presentSince?: (t: number) => number;
  ladderDelayMs?: number;
  /** ⭐ S191 WIRE-3 — the frozen Begin roster's peer ids ('me' = this seat). Absent: every other peer is seated. */
  roster?: string[];
}): number | null {
  let obs = 0;
  for (let t = o.fromMs; t <= o.toMs; t += 16) {
    const alive = new Set([...(o.othersAt?.(t) ?? o.others ?? []), ...(o.host(t) ? ['host'] : [])]);
    const seated = o.roster !== undefined
      ? seatedSurvivors(o.roster.map((peerId, seat) => ({ seat, peerId, color: 0 })), alive, 'me', 'host')
      : new Set([...alive].filter((p) => p !== 'host'));
    const r = stepMigrationClaim({
      nowMs: t, hostPeerId: 'host', alivePeerIds: alive, seatedSurvivorIds: seated,
      lastAcceptedAtMs: o.lastSnapshotAt(t), hostPresentSinceMs: o.presentSince?.(t) ?? 0,
      starvationMs: HOST_STARVATION_MS, graceMs: RECONNECT_GRACE_MS,
      ladderDelayMs: o.ladderDelayMs ?? 0, lossObservedAtMs: obs,
    });
    obs = r.lossObservedAtMs;
    if (r.claim) return t;
  }
  return null;
}

describe('S189 fix round (audit NET-4) — the claim: D4 kept for a FROZEN host, gated only on TRANSPORT loss', () => {
  const D4_DEADLINE_AFTER_LAST_SNAPSHOT = HOST_STARVATION_MS + RECONNECT_GRACE_MS; // rank 0: + 0 ladder

  it('⛔ 1v1 FROZEN HOST (still connected, silent): the client TAKES OVER at the S124 D4 deadline', () => {
    // The host tab is backgrounded: its transport stays up, its snapshots stop at t = 10 s.
    const at = firstClaim({ fromMs: 10_000, toMs: 60_000, host: () => true, lastSnapshotAt: () => 10_000 });
    expect(at, 'the D4 takeover of a silent-but-connected host must survive the C4 fix').not.toBeNull();
    expect(at! - 10_000).toBeGreaterThanOrEqual(D4_DEADLINE_AFTER_LAST_SNAPSHOT);
    expect(at! - 10_000).toBeLessThan(D4_DEADLINE_AFTER_LAST_SNAPSHOT + 32);
  });

  it('⛔ 1v1 TRANSPORT LOSS (the host is gone from our transport, nobody else): NEVER claims — it reconnects (C4)', () => {
    const at = firstClaim({ fromMs: 10_000, toMs: 90_000, host: () => false, lastSnapshotAt: () => 10_000 });
    expect(at).toBeNull();
  });

  it('after a transport loss, a RECONNECT that lands does not trigger an instant takeover before the first snapshot', () => {
    // Host gone 10-25 s, back at 25 s (a late rejoin, past the grace); its first snapshot arrives at 25.4 s.
    const at = firstClaim({
      fromMs: 10_000, toMs: 60_000,
      host: (t) => t < 10_000 || t >= 25_000,
      lastSnapshotAt: (t) => (t >= 25_400 ? t : 10_000),
      presentSince: (t) => (t >= 25_000 ? 25_000 : 0),
    });
    expect(at).toBeNull();
  });

  it('…but a host that comes back and is THEN frozen is taken over at D4, counted from its return', () => {
    const at = firstClaim({
      fromMs: 10_000, toMs: 90_000,
      host: (t) => t < 10_000 || t >= 25_000,
      lastSnapshotAt: () => 10_000, // nothing after the return
      presentSince: (t) => (t >= 25_000 ? 25_000 : 0),
    });
    expect(at).not.toBeNull();
    expect(at! - 25_000).toBeGreaterThanOrEqual(D4_DEADLINE_AFTER_LAST_SNAPSHOT);
  });

  it('NEGATIVE — 3-seat, host lost, another survivor connected: claims at the grace + its ladder rung (D3/D4)', () => {
    const at = firstClaim({
      fromMs: 10_000, toMs: 60_000, host: (t) => t < 12_000, others: ['seat-2'],
      lastSnapshotAt: () => 11_900, ladderDelayMs: CLAIM_LADDER_MS,
    });
    expect(at).not.toBeNull();
    expect(at! - 12_000).toBeGreaterThanOrEqual(RECONNECT_GRACE_MS + CLAIM_LADDER_MS);
    expect(at! - 12_000).toBeLessThan(RECONNECT_GRACE_MS + CLAIM_LADDER_MS + 32);
  });

  it('NEGATIVE — a seat that is not warranted-alive (ladder null) never claims', () => {
    const at = firstClaim({ fromMs: 10_000, toMs: 60_000, host: () => true, lastSnapshotAt: () => 10_000, ladderDelayMs: undefined });
    expect(at).not.toBeNull(); // sanity: with a rung it would
    let obs = 0;
    for (let t = 10_000; t < 60_000; t += 16) {
      const r = stepMigrationClaim({
        nowMs: t, hostPeerId: 'host', alivePeerIds: new Set(['host']), seatedSurvivorIds: new Set(), lastAcceptedAtMs: 10_000, hostPresentSinceMs: 0,
        starvationMs: HOST_STARVATION_MS, graceMs: RECONNECT_GRACE_MS, ladderDelayMs: null, lossObservedAtMs: obs,
      });
      obs = r.lossObservedAtMs;
      expect(r.claim).toBe(false);
    }
  });
});

describe('S189 fix round — the host-presence stamp the claim counts starvation from', () => {
  it('stamps the moment the host (re)appears, keeps it while present, and resets for a new host', () => {
    let h = { hostPeerId: null as string | null, present: false, presentSinceMs: 0 };
    h = stepHostPresence(h, 'host', true, 1_000);
    expect(h.presentSinceMs).toBe(1_000);
    h = stepHostPresence(h, 'host', true, 5_000);
    expect(h.presentSinceMs).toBe(1_000); // still the same appearance
    h = stepHostPresence(h, 'host', false, 9_000);
    h = stepHostPresence(h, 'host', true, 25_000);
    expect(h.presentSinceMs).toBe(25_000); // back after a loss: a fresh stamp
    h = stepHostPresence(h, 'successor', true, 30_000);
    expect(h.presentSinceMs).toBe(30_000); // a different host (after a migration): its own stamp
  });
});

/**
 * ⛔ S191 NETFR-3 (MED) — A PARTIAL RECONNECT CLAIMED THE HOST SEAT.
 *
 * Our OWN transport dies in a 3-seat match (host H + another client B). While nobody is visible the
 * survivor gate blocks the claim — but the claim clock was BANKED from the first frame of the loss. The
 * reconnect then lands B's leg before H's (Trystero holds a same-selfId answer ~23.3 s, measured S189), so
 * on the first frame B is visible without H the banked clock is already past grace + rung and we claim AT
 * ONCE. B rejects it (B sees a healthy H), H refuses it (no partition evidence), and this seat is a lone
 * host that stops reconnecting (hosts never retry). The minimal fix: no survivor visible → no clock.
 */
describe('S191 NETFR-3 — the claim clock starts the first frame a survivor is visible WITHOUT the host', () => {
  const B_LANDS = 25_000;
  const survivorsAt = (t: number): string[] => (t >= B_LANDS ? ['seat-2'] : []);

  it('⛔ host absent from 10 s, B absent until 25 s then present, host back at 27 s → NO claim', () => {
    const at = firstClaim({
      fromMs: 10_000, toMs: 90_000,
      host: (t) => t < 10_000 || t >= 27_000,
      othersAt: survivorsAt,
      lastSnapshotAt: (t) => (t >= 27_400 ? t : 10_000),
      presentSince: (t) => (t >= 27_000 ? 27_000 : 0),
      ladderDelayMs: CLAIM_LADDER_MS,
    });
    expect(at, 'a claim here makes this seat a lone host that B and H both ignore').toBeNull();
  });

  it('host never back → claims at 25 s + grace + ladder (a real host death is still migrated)', () => {
    const at = firstClaim({
      fromMs: 10_000, toMs: 90_000,
      host: (t) => t < 10_000,
      othersAt: survivorsAt,
      lastSnapshotAt: () => 10_000,
      ladderDelayMs: CLAIM_LADDER_MS,
    });
    expect(at).not.toBeNull();
    expect(at! - B_LANDS).toBeGreaterThanOrEqual(RECONNECT_GRACE_MS + CLAIM_LADDER_MS);
    expect(at! - B_LANDS).toBeLessThan(RECONNECT_GRACE_MS + CLAIM_LADDER_MS + 32);
  });

  it('NEGATIVE — while nobody is visible the step reports NO loss episode (so nothing is banked)', () => {
    const r = stepMigrationClaim({
      nowMs: 20_000, hostPeerId: 'host', alivePeerIds: new Set(), seatedSurvivorIds: new Set(), lastAcceptedAtMs: 10_000, hostPresentSinceMs: 0,
      starvationMs: HOST_STARVATION_MS, graceMs: RECONNECT_GRACE_MS, ladderDelayMs: 0, lossObservedAtMs: 12_000,
    });
    expect(r).toEqual({ lossObservedAtMs: 0, claim: false });
  });

  /**
   * ⚠ RESIDUAL — AN OWNER QUESTION, NOT BUILT (S191 brief). The minimal fix narrows the window, it does
   * not close it: B's leg is an ordinary fresh join (~6.3–7 s, measured S189) while H's can sit behind
   * Trystero's 23.3 s answering TTL (landing ~L+26–29 s in the S189 traces). Then the clock starts at
   * ~L+7 s and the claim fires at ~L+22 s + rung, BEFORE H is back — the same lone-host outcome. The
   * verifier's stronger shape (a seat whose loss began with its OWN transport empty never claims, keeps
   * reconnecting, and accepts B's claim as 'advance') would close it, and changes C4/D4 behaviour. This
   * test pins the residual so a decision either way turns something red rather than passing silently.
   */
  it('⚠ RESIDUAL (owner question): B lands at L+7 s, H is held to L+29 s → the minimal fix still claims at ~L+22 s + rung', () => {
    const L = 10_000;
    const at = firstClaim({
      fromMs: L, toMs: 90_000,
      host: (t) => t < L || t >= L + 29_000,
      othersAt: (t) => (t >= L + 7_000 ? ['seat-2'] : []),
      lastSnapshotAt: (t) => (t >= L + 29_400 ? t : L),
      presentSince: (t) => (t >= L + 29_000 ? L + 29_000 : 0),
      ladderDelayMs: CLAIM_LADDER_MS,
    });
    expect(at).not.toBeNull();
    expect(at! - L).toBeGreaterThanOrEqual(7_000 + RECONNECT_GRACE_MS + CLAIM_LADDER_MS);
    expect(at! - L).toBeLessThan(29_000);
  });
});

/**
 * ⛔ S191 WIRE-3 (audit wf_0593f6fe-d53, LOW) — THE SURVIVOR GATE COUNTED ANY TRANSPORT PEER. A non-seated
 * peer on the room (a late joiner, a viewer who typed the code) in a 1v1 made the client claim the host
 * seat for nobody — and, through `migrationCase` (`peerCount() > 0`), stopped it retrying a host that was
 * reachable. A SEATED survivor is a Begin-roster entry that is not us, not the lost host, and is on our
 * transport now (`seatedSurvivors`); main.ts uses it at BOTH sites.
 */
describe('S191 WIRE-3 — only a SEATED survivor is someone to host for', () => {
  const R1V1 = ['host', 'me'];
  const R3 = ['host', 'me', 'seat-2'];
  const rosterOf = (ids: string[]) => ids.map((peerId, seat) => ({ seat, peerId, color: 0 }));

  it('seatedSurvivors = the frozen roster ∩ our transport, minus us and the lost host', () => {
    expect([...seatedSurvivors(rosterOf(R1V1), ['host', 'stray'], 'me', 'host')]).toEqual([]);
    expect([...seatedSurvivors(rosterOf(R3), ['seat-2', 'stray'], 'me', 'host')]).toEqual(['seat-2']);
    expect([...seatedSurvivors(rosterOf(R3), ['stray'], 'me', 'host')]).toEqual([]);
    expect([...seatedSurvivors(null, ['stray'], 'me', 'host')]).toEqual([]);
  });

  it('⛔ 1v1 + a STRAY on our transport, the host gone → NO claim', () => {
    const at = firstClaim({
      fromMs: 10_000, toMs: 90_000, host: (t) => t < 10_000, others: ['stray'],
      lastSnapshotAt: () => 10_000, ladderDelayMs: CLAIM_LADDER_MS, roster: R1V1,
    });
    expect(at, 'a stray is nobody to host for').toBeNull();
  });

  it('⛔ …and the loop keeps RETRYING the host: with only a stray, it is not the migration case', () => {
    const migrationCase = seatedSurvivors(rosterOf(R1V1), ['stray'], 'me', 'host').size > 0;
    expect(migrationCase).toBe(false);
    let reconnectUntilMs = 0;
    let nextRetryMs = 0;
    let retries = 0;
    for (let t = 10_000; t <= 60_000; t += 16) {
      const p = planConnectionFrame({
        nowMs: t, zombieDeposed: false, peersGone: true, isHost: false, hasRoomCode: true, migrationCase,
        peerCount: 1, reconnectUntilMs, nextRetryMs, migrationExtraMs: 11_000, claimClockSinceMs: 0,
      });
      reconnectUntilMs = p.reconnectUntilMs;
      nextRetryMs = p.nextRetryMs;
      if (p.retry) retries++;
    }
    expect(retries, 'a reachable host must still be rejoined').toBeGreaterThan(3);
  });

  it('NEGATIVE — 3-seat with a SEATED survivor (and a stray) claims as before, at the grace + its rung', () => {
    const at = firstClaim({
      fromMs: 10_000, toMs: 60_000, host: (t) => t < 12_000, others: ['seat-2', 'stray'],
      lastSnapshotAt: () => 11_900, ladderDelayMs: CLAIM_LADDER_MS, roster: R3,
    });
    expect(at).not.toBeNull();
    expect(at! - 12_000).toBeGreaterThanOrEqual(RECONNECT_GRACE_MS + CLAIM_LADDER_MS);
    expect(at! - 12_000).toBeLessThan(RECONNECT_GRACE_MS + CLAIM_LADDER_MS + 32);
    expect(seatedSurvivors(rosterOf(R3), ['seat-2', 'stray'], 'me', 'host').size > 0, 'migrationCase').toBe(true);
  });
});
