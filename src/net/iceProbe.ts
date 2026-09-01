/**
 * SPARK — S158 P1: **THE CONNECTION SELF-TEST, BECAUSE THE OWNER SHOULD NOT NEED DEVTOOLS.**
 *
 * ## Why this module exists
 *
 * S157 found the multiplayer root cause by pasting an `RTCPeerConnection` snippet into the browser
 * console on the live site and reading three numbers back: `host:1 srflx:1 relay:0`. That single
 * measurement ended a hunt that had survived ~100 sessions of reading the handshake, the attestation
 * and the lobby state machine.
 *
 * ⛔ **AND THEN IT WAS WRITTEN DOWN AS A CONSOLE SNIPPET IN A MARKDOWN FILE.** `TURN_SETUP.md`'s
 * "How to confirm it worked" step asks the owner to open F12, paste JavaScript, and count lines. That
 * is a fine tool for the person who wrote it and a bad one for the person who has to use it — and it
 * is the ONLY way, today, to tell these three states apart:
 *
 *   | what the player sees | what is actually true |
 *   |---|---|
 *   | "Connecting…" forever | no relay is available and this pair needs one |
 *   | "Connecting…" forever | a relay IS configured but its credentials are rejected |
 *   | "Connecting…" forever | the relay is fine; the other player never arrived |
 *
 * All three look identical from the lobby. This module makes them one button-press apart.
 *
 * ## The split, and why it is the split
 *
 * `probeIce` is impure — it opens a real `RTCPeerConnection`, gathers, and counts. `summarizeIce` is
 * PURE: counts in, plain-language verdict out. Every judgement this module makes lives in the pure
 * half, so the judgement is unit-tested without a WebRTC stack, exactly the way `joinDiagnosis.ts`
 * and `lobbyStateMachine.ts` earn their coverage. The impure half has no branching worth testing —
 * it counts candidate types and hands them over.
 *
 * ## What the verdicts are for
 *
 * Not debugging output. Each one names the layer in plain language and then says what to DO, because
 * the person reading it is the person who has to fix it: provision a relay, check the credentials, or
 * stop blaming the network and go find their brother.
 */

/** Raw counts from one ICE gathering round. No interpretation — that is `summarizeIce`'s job. */
export interface IceProbeResult {
  /** Candidates of `typ host` — this machine's own LAN addresses. Zero means the browser is boxed in. */
  readonly host: number;
  /** Candidates of `typ srflx` — our public address, discovered via STUN. */
  readonly srflx: number;
  /** ⭐ Candidates of `typ relay` — a TURN server willing to relay for us. THE number that mattered. */
  readonly relay: number;
  /** Errors surfaced on `icecandidateerror` (e.g. `401`/`400 TURN allocate error`). Verbatim, deduped. */
  readonly errors: readonly string[];
  /** Whether the build shipped ANY TURN config at all — lets the verdict distinguish two failures. */
  readonly turnConfigured: boolean;
  /** True when gathering finished on its own; false when we stopped it on the timeout. */
  readonly complete: boolean;
}

/** A verdict a human can act on. `ok` gates the colour; `headline` is the one line worth reading. */
export interface IceVerdict {
  readonly ok: boolean;
  readonly headline: string;
  readonly detail: string;
}

/**
 * Exported so a canary test can pin the exact wording (the `LOBBY_STATUS` / `JOIN_STALL` precedent).
 * These are the only player-facing strings in the module.
 */
export const ICE_VERDICT = {
  RELAY_OK: 'Connection test passed — you can play with anyone',
  NO_TURN_CONFIGURED: 'No relay server — you can only reach players on friendly networks',
  TURN_REJECTED: 'The relay server refused us — the credentials are wrong or expired',
  NO_STUN: 'Your public address could not be found — something is blocking UDP',
  NO_ROUTES: 'The browser found no network routes at all',
} as const;

/**
 * ⭐ THE PURE HALF. Counts in, plain-language verdict out.
 *
 * ⚠ ORDER IS THE DESIGN, and it is worth stating because the obvious order is wrong. The checks run
 * WORST-FIRST rather than most-specific-first: a browser that gathered nothing at all (`host:0`) has
 * a problem that makes every later question meaningless, so it must be answered before we go on to
 * ask whether a relay answered. Reversing this would report "no relay" — technically true, uselessly
 * so — to someone whose WebRTC is disabled outright.
 */
export function summarizeIce(r: IceProbeResult): IceVerdict {
  // Worst first: no routes at all. WebRTC is disabled, or a policy/extension is blocking it.
  if (r.host === 0 && r.srflx === 0 && r.relay === 0) {
    return {
      ok: false,
      headline: ICE_VERDICT.NO_ROUTES,
      detail:
        'This browser produced no connection routes whatsoever, which usually means WebRTC is ' +
        'switched off — a privacy extension, a hardened browser profile, or a corporate policy. ' +
        'Try a normal window in Chrome, Edge or Firefox.',
    };
  }

  // ⭐ A relay answered. This is the only fully-good outcome, and it is the one the owner is buying.
  if (r.relay > 0) {
    return {
      ok: true,
      headline: ICE_VERDICT.RELAY_OK,
      detail:
        `Found ${r.relay} relay route${r.relay === 1 ? '' : 's'} (plus ${r.srflx} public and ` +
        `${r.host} local). A relay is the fallback that makes strict networks — mobile data, and ` +
        'most connections between different countries — work. You should be able to play with anyone.',
    };
  }

  // No relay. WHICH no-relay this is decides what the owner has to do next, so they are split.
  if (r.turnConfigured) {
    const why = r.errors.length > 0 ? ` The server said: ${r.errors.join('; ')}.` : '';
    return {
      ok: false,
      headline: ICE_VERDICT.TURN_REJECTED,
      detail:
        'A relay server IS configured in this build, but it handed back nothing — which means the ' +
        `username/password are being rejected, or the service is down.${why} Check the credentials ` +
        'in the GitHub repository secrets and redeploy. See TURN_SETUP.md.',
    };
  }

  // STUN itself failed too — worth saying, because it is a different fix (a firewall, not an account).
  if (r.srflx === 0) {
    return {
      ok: false,
      headline: ICE_VERDICT.NO_STUN,
      detail:
        'We could not even discover this machine\'s public address, so something is blocking UDP ' +
        'traffic — usually a strict firewall or a VPN. Multiplayer will not work from this network ' +
        'until that changes, and no relay server can rescue it either.',
    };
  }

  // The S157 diagnosis, stated as a verdict: STUN works, no relay exists, so friendly pairs only.
  return {
    ok: false,
    headline: ICE_VERDICT.NO_TURN_CONFIGURED,
    detail:
      'Your public address was found, but there is no relay server set up for this game. That is ' +
      'enough to connect two players on ordinary home networks, and NOT enough when either side is ' +
      'on mobile data or behind a strict router — which is the usual case between two countries. ' +
      'This is the known blocker: see TURN_SETUP.md, it takes about five minutes.',
  };
}

/** Injectable so tests never need a real WebRTC stack, and so a headless build cannot crash on it. */
export type PeerConnectionFactory = (config: RTCConfiguration) => RTCPeerConnection;

/**
 * How long to gather before calling it. 8 s is comfortably past a healthy relay allocation (tens of
 * ms to low hundreds) and short enough that the owner does not think the button is broken. We resolve
 * with whatever we have rather than failing — partial counts are exactly as diagnostic as complete
 * ones, and `complete:false` records which it was.
 */
export const ICE_PROBE_TIMEOUT_MS = 8_000;

/**
 * ⛔ THE IMPURE HALF — opens a real peer connection, gathers, counts, tears down.
 *
 * `iceCandidatePoolSize: 0` and a throwaway data channel are the minimum needed to make a browser
 * actually gather; without the channel (or a track) `createOffer` produces an offer with no media
 * section and Chrome gathers nothing, which would report a false `NO_ROUTES` on a healthy machine.
 *
 * ⚠ The teardown is in a `finally` and the timer is always cleared: this runs on a button the owner
 * may press repeatedly while diagnosing, and a leaked `RTCPeerConnection` per press is a real leak.
 */
export async function probeIce(
  iceServers: readonly RTCIceServer[],
  turnConfigured: boolean,
  makePc: PeerConnectionFactory = (c) => new RTCPeerConnection(c),
  timeoutMs: number = ICE_PROBE_TIMEOUT_MS,
): Promise<IceProbeResult> {
  let host = 0;
  let srflx = 0;
  let relay = 0;
  const errors = new Set<string>();
  let complete = false;

  const pc = makePc({ iceServers: [...iceServers], iceCandidatePoolSize: 0 });
  try {
    await new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);

      pc.onicecandidate = (ev): void => {
        const c = ev.candidate;
        if (c === null) {
          // End-of-candidates. Gathering finished on its own — the good path.
          complete = true;
          done();
          return;
        }
        // `type` is the parsed field; the raw string is the fallback for engines that omit it.
        const kind = c.type ?? /\btyp (\w+)/.exec(c.candidate)?.[1] ?? '';
        if (kind === 'host') host++;
        else if (kind === 'srflx') srflx++;
        else if (kind === 'relay') relay++;
      };

      pc.onicecandidateerror = (ev): void => {
        // ⭐ THIS is where `400 TURN allocate error` surfaced in S157. Capturing it verbatim is what
        // lets the verdict say WHY a configured relay produced nothing instead of guessing.
        const e = ev as RTCPeerConnectionIceErrorEvent;
        const code = typeof e.errorCode === 'number' ? e.errorCode : 0;
        // 701 is "could not reach the server" and fires for every unreachable STUN url on a normal
        // healthy machine; reporting it would cry wolf. Allocation/auth failures are the signal.
        if (code !== 0 && code !== 701) errors.add(`${code} ${e.errorText ?? ''}`.trim());
      };

      pc.createDataChannel('spark-ice-probe');
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => done());
    });
  } finally {
    pc.onicecandidate = null;
    pc.onicecandidateerror = null;
    pc.close();
  }

  return { host, srflx, relay, errors: [...errors], turnConfigured, complete };
}
