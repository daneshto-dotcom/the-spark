/**
 * SPARK — S158 B1: **THE HALF OF THE CONNECTION TEST THAT ANSWERS THE OWNER'S ACTUAL PUZZLE.**
 *
 * ## The report
 *
 * Owner, playing across countries: *"im in france and he's in israel. when i was trying to join him
 * from the other workstation (the computer across the table). it wasnt able to find his quick match
 * (stuck on connect) and it didnt connect to his server when putting the code. HOWEVER, this
 * workstation (the one im working from now) did connect... why?"*
 *
 * ## Why that rules out the thing everyone assumes
 *
 * Two machines, one room, one router, one public address. If TURN or NAT were the differentiator
 * **both would fail**, because they share every network property that ICE cares about. So whatever
 * is different lives on the machine, not on the route.
 *
 * And the two symptoms name the layer between them. Quickmatch *discovery* advertises the room over
 * the Nostr relays; a code join exchanges its offer over the same relays. **They are the only thing
 * both paths share before a peer connection exists** — so a machine that cannot reach the relays
 * fails at discovery AND at code-join, in exactly the way described, while a machine that can reach
 * them connects normally. That is the shape of the report, and ICE is not in it.
 *
 * ⛔ THE S158 P1 SELF-TEST COULD NOT SEE THIS. It gathers ICE candidates, which is the *second* half
 * of connecting. Run on both machines it would have printed the same thing twice and taught nothing.
 * This module is the first half.
 *
 * ## Shape
 *
 * Same split as `iceProbe.ts`, for the same reason: `summarizeRelays` is PURE and carries every
 * judgement, so the judgement is unit-tested without a network. `probeRelays` opens sockets and
 * counts, with an injectable factory so the tests never touch the wire.
 */

/** Raw result of one reachability sweep. No interpretation — that is `summarizeRelays`' job. */
export interface RelayProbeResult {
  /** How many relays answered inside the timeout. */
  readonly reachable: number;
  /** How many were attempted. */
  readonly attempted: number;
  /** The urls that did NOT answer, in the order attempted. Verbatim, for the report. */
  readonly unreachable: readonly string[];
}

/** A verdict a human can act on. `ok` gates the colour; `headline` is the line worth reading. */
export interface RelayVerdict {
  readonly ok: boolean;
  readonly headline: string;
  readonly detail: string;
}

/** Exported so a canary can pin the wording (the `JOIN_STALL` / `ICE_VERDICT` precedent). */
export const RELAY_VERDICT = {
  OK: 'Matchmaking servers reachable',
  DEGRADED: 'Only some matchmaking servers are reachable',
  NONE: 'Cannot reach ANY matchmaking server — this is why nothing connects',
} as const;

/**
 * ⭐ THE PURE HALF.
 *
 * ⚠ ONE reachable relay is enough to play, and saying so matters: a player who sees "3 of 7" should
 * not go looking for a problem they do not have. The relays are a deliberately redundant set across
 * independent operators precisely so that most of them can be down.
 */
export function summarizeRelays(r: RelayProbeResult): RelayVerdict {
  if (r.reachable === 0) {
    return {
      ok: false,
      headline: RELAY_VERDICT.NONE,
      detail:
        'Before two players can connect, they have to find each other through a public matchmaking ' +
        'server. This machine could not reach a single one, so BOTH quickmatch and joining with a ' +
        'code will sit on "Connecting" forever — the game never gets far enough to try the actual ' +
        'connection. This is almost always a firewall, a VPN, a browser extension, or a network ' +
        'that blocks WebSocket traffic. ⭐ If another computer on the SAME network connects fine, ' +
        'this is the difference between them.',
    };
  }
  if (r.reachable < r.attempted) {
    return {
      ok: true,
      headline: RELAY_VERDICT.DEGRADED,
      detail:
        `${r.reachable} of ${r.attempted} answered, which is enough to play — the list is ` +
        'deliberately spread across independent operators so most of them can be down without ' +
        `affecting you. Not reachable: ${r.unreachable.join(', ')}.`,
    };
  }
  return {
    ok: true,
    headline: RELAY_VERDICT.OK,
    detail: `All ${r.attempted} answered. Finding and joining games should work from this machine.`,
  };
}

/** Injectable so tests never open a socket, and so a hostile environment cannot hang the button. */
export type SocketFactory = (url: string) => Pick<WebSocket, 'close' | 'onopen' | 'onerror'>;

/**
 * How long to wait for a relay to answer. 5 s is well past a healthy WebSocket handshake to a public
 * relay and short enough that the button feels answered rather than broken.
 */
export const RELAY_PROBE_TIMEOUT_MS = 5_000;

/**
 * ⛔ THE IMPURE HALF — open one socket per relay, count who answers, close them all.
 *
 * Every socket is closed in a `finally`-equivalent sweep, and the timer is always cleared: this runs
 * on a button the owner will press repeatedly while comparing two machines, and a leaked WebSocket
 * per press is a real leak on the machine already suspected of network trouble.
 *
 * ⚠ Resolves with PARTIAL counts on timeout rather than rejecting. "Two answered and three did not"
 * is exactly as diagnostic as a complete sweep, and a rejection would print nothing at all.
 */
export async function probeRelays(
  urls: readonly string[],
  makeSocket: SocketFactory = (u) => new WebSocket(u),
  timeoutMs: number = RELAY_PROBE_TIMEOUT_MS,
): Promise<RelayProbeResult> {
  const sockets: Array<Pick<WebSocket, 'close' | 'onopen' | 'onerror'>> = [];
  const answered = new Set<string>();

  await new Promise<void>((resolve) => {
    let settled = 0;
    const done = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    const settle = (): void => {
      settled++;
      if (settled >= urls.length) done();
    };
    for (const url of urls) {
      try {
        const ws = makeSocket(url);
        sockets.push(ws);
        ws.onopen = (): void => {
          answered.add(url);
          settle();
        };
        ws.onerror = (): void => {
          settle();
        };
      } catch {
        // A constructor that throws (a blocked scheme, a policy) is an unreachable relay, not a crash.
        settle();
      }
    }
    if (urls.length === 0) done();
  });

  for (const ws of sockets) {
    try {
      ws.close();
    } catch {
      // Already closed or never opened — nothing to do, and nothing worth reporting.
    }
  }

  return {
    reachable: answered.size,
    attempted: urls.length,
    unreachable: urls.filter((u) => !answered.has(u)),
  };
}
