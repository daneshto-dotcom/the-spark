/**
 * SPARK — Client-side lobby + match callbacks.
 *
 * Extracted from main.ts in S50 P2 (Council Battle Ledger C2 ADOPT 4
 * extractions). Single factory `createJoinAttemptHandler` wired into
 * LobbyScreen at boot. Fires when joiner submits a room code; spawns
 * NetTransport + ClientSync, dispatches the four client-side message
 * kinds it accepts (NETSNAPSHOT, GODLY_TRIGGER, START_GAME_SIGNAL, ENDGAME).
 *
 * PRIME-AUDIT Δ1: deps.session.* read at MSG-RECEIPT time, NOT captured
 * into locals at factory time. Avoids stale clientSync reference after
 * teardownNet + rejoin cycles.
 */

import { ClientSync } from './sync.ts';
import type { NetSession } from './session.ts';
import type { HostAttest, NetMessage, RosterEntry } from './protocol.ts';
import { verifyHostAttest, buildPubkeyPopPayload, type PeerIdentity } from './hostIdentity.ts';
import { verifyWarrant } from './successionWarrant.ts';
// S122 P2 (host-migration D3) — claim verification + the transport-grounded alive set.
import { computeAliveSeats, verifyMigrationClaim } from './migrationClaim.ts';
import { computeSuccessorSeat, isSnapshotStarved, HOST_STARVATION_MS } from './succession.ts';
import { NetTransport, selfId } from './transport.ts';
import type { Controls } from '../input/controls.ts';
import { dispatch, type World } from '../state/world.ts';
import { asPlayerId } from '../types.ts';
import { formatProtocolMismatchMessage, wireHelloOnJoin } from './hostHandlers.ts';
import { PLAYER_COLORS } from '../constants.ts';

export interface JoinAttemptDeps {
  session: NetSession;
  world: World;
  controls: Controls;
  /** Forwarded to LobbyScreen.setErrorMessage. Late-bound thunk. */
  onLobbyError: (errMsg: string) => void;
  /**
   * S70 P1 — late-bound sink for the host's lobby presence roster (mirror of the
   * host path's onPresence). The joiner forwards the received roster verbatim;
   * main.ts digests it to the render shape, computing isYou via peerId === selfId
   * — which is how this joiner finally learns WHICH seat is its own pre-Begin.
   */
  onPresence: (roster: readonly RosterEntry[]) => void;
  /**
   * S118 P1 (host-migration D2) — this joiner's ephemeral identity (generateClientIdentity, minted once
   * at boot). Its pubkey (+ a PoP signature) rides the HELLO so the host can warrant it as a potential
   * successor; the same key later signs a D3 MIGRATION_CLAIM. Late-bound like the host's identity.
   */
  clientIdentity: PeerIdentity;
}

/**
 * S79 P4 (HIGH-2, backlog #2 client half) — host sender-auth. Pre-fix, the joiner's
 * message handler trusted ANY peer in the room: a hostile 3rd peer could WEDGE a victim
 * with a spoofed high-snapshotSeq NETSNAPSHOT (ClientSync then drops the real host's
 * lower-seq snapshots forever), fake a win via ENDGAME, hijack seating via
 * START_GAME_SIGNAL, or fire bogus GODLY_TRIGGER cinematics.
 *
 * Latch (trust-on-first-use): the host's peerId is learned from the FIRST roster-bearing
 * message whose seat-0 entry NAMES THE SENDER (the genuine host always self-identifies at
 * seat 0 in buildLobbyRoster/buildMatchRoster), with a first-NETSNAPSHOT fallback for any
 * legacy flow that skips the lobby beacon. Gate: once latched, the five host-authored
 * kinds are dropped unless sent BY the latched host; before any latch they are dropped
 * too (fail-closed — in practice a beacon/snapshot always precedes the other kinds).
 *
 * S82 P4(a) — THE S79 CEILING IS LIFTED: the latch now REQUIRES cryptographic
 * verification. session.hostVerifiedPeerId is set only after verifyHostAttest proved the
 * sender holds the private key whose public-key fingerprint IS the room code the user
 * typed (see net/hostIdentity.ts). The latch precondition is verified-peer + the same
 * roster-bearing seat-0-self-naming rule as before; the WEAK first-NETSNAPSHOT fallback
 * is REMOVED (it was the raceable path). A spoofer racing the host's first message now
 * loses unconditionally: it cannot match the code's fingerprint nor sign for its peerId.
 *
 * Residual (documented): Trystero signaling-layer selfId spoofing + host-page death
 * (= host-migration, deferred carry-forward). Returns true = process, false = drop.
 * Pure w.r.t. everything except the latch write; exported for unit tests.
 */
export function hostAuthFilter(
  session: Pick<NetSession, 'hostPeerId' | 'hostVerifiedPeerId'>,
  msg: NetMessage,
  peerId: string,
): boolean {
  if (session.hostPeerId === null) {
    if (
      session.hostVerifiedPeerId === peerId &&
      (msg.kind === 'LOBBY_PRESENCE' || msg.kind === 'START_GAME_SIGNAL') &&
      msg.roster.some((e) => e.seat === 0 && e.peerId === peerId)
    ) {
      session.hostPeerId = peerId;
    }
  }
  const hostAuthored =
    msg.kind === 'NETSNAPSHOT' ||
    msg.kind === 'GODLY_TRIGGER' ||
    msg.kind === 'START_GAME_SIGNAL' ||
    msg.kind === 'ENDGAME' ||
    msg.kind === 'LOBBY_PRESENCE';
  return !hostAuthored || session.hostPeerId === peerId;
}

export function createJoinAttemptHandler(deps: JoinAttemptDeps): (code: string) => void {
  return (code: string) => connectAsClient(deps, code);
}

/**
 * S82 P4(b) — the full client connect path, extracted from createJoinAttemptHandler so
 * the auto-RECONNECT can re-run it verbatim (same room code, same page → same Trystero
 * selfId → the host's frozen peerId→seat map re-binds our intents automatically). The
 * verify/buffer closures below are PER-CONNECT (fresh on rejoin); the durable trust
 * (session.hostVerifiedPeerId + hostPeerId) lives on the session and deliberately
 * SURVIVES a reconnect — only teardownNet clears it.
 */
export function connectAsClient(deps: JoinAttemptDeps, code: string): void {
  {
    const transport = new NetTransport();
    deps.session.netTransport = transport;
    // S82 P4(b) — on RECONNECT a ClientSync already exists with a live lastSeq watermark;
    // keep it (host snapshotSeq is monotonic per HostSync instance, so later snapshots
    // still pass the seq gate). Fresh join → fresh ClientSync as before.
    if (deps.session.clientSync === null) deps.session.clientSync = new ClientSync();
    deps.session.roomCode = code;
    deps.world.isHost = false;
    // S35 P0 — break 1v1 join bootstrap deadlock. The render-loop client-
    // interpolation gate at main.ts is the only path that runs
    // clientSync.interpolateInto → applyNetSnapshot. Without setting gameMode
    // here, the gate stays false because the joiner's world.gameMode stays
    // at the makeWorld default 'solo' — so host's NETSNAPSHOT (which carries
    // gameMode='1v1' + gameState='PLAYING') is RECEIVED but never APPLIED.
    // Host avoids this trap because applyStartGame sets gameMode='1v1'
    // synchronously on onBeginMatch. Setting it here at the joiner's setup-
    // entry-point is symmetric. RETURN_TO_TITLE resets gameMode='solo' so
    // back-out remains clean. Bug pre-dates S15 commit add497f (~20 sessions).
    deps.world.gameMode = '1v1';
    // S62 — the client's seat is NO LONGER hardcoded to 1. localPlayerId +
    // controls playerId are set from the host's authoritative roster when
    // START_GAME_SIGNAL arrives (below), so a 2nd/3rd client gets its own seat
    // (1, 2, …) instead of every client claiming seat 1. gameMode is still set
    // here because the snapshot-apply gate (main.ts) reads it before PLAYING.
    // S20 P0 — same onError wiring as host path.
    transport.onError = (errMsg) => deps.onLobbyError(errMsg);
    // S53 P1 — same onProtocolMismatch wiring as host path; shared
    // formatProtocolMismatchMessage helper produces direction-aware advice
    // (which side needs to refresh based on peer vs local PROTOCOL_VERSION).
    transport.onProtocolMismatch = (peerVersion) => {
      deps.onLobbyError(formatProtocolMismatchMessage(peerVersion));
    };
    transport.connect(code);
    // S118 P1 (host-migration D2) — pre-compute this joiner's pubkey PROOF-OF-POSSESSION once per
    // connect (roomCode + selfId + our spki are all known now). The async sign settles in ~ms, long
    // before a Begin; the HELLO getter below returns null until then (host just won't warrant us yet —
    // a fresh HELLO re-sends on the next peer-change, and Begin re-carries the roster). Binds (code,
    // selfId, spki) so the host's verifyPubkeyPop proves we hold the key AND blocks cross-peer replay.
    let clientPop: { pubkeyB64: string; popB64: string } | null = null;
    const clientSpkiB64 = deps.clientIdentity.spkiB64;
    void deps.clientIdentity
      .sign(buildPubkeyPopPayload(code, selfId, clientSpkiB64))
      .then((popB64) => {
        clientPop = { pubkeyB64: clientSpkiB64, popB64 };
      })
      .catch((err: unknown) => {
        console.warn('[net] client PoP sign failed:', err instanceof Error ? err.message : String(err));
      });
    // S54 P1 — announce our PROTOCOL_VERSION to the host the moment we connect
    // (joiner = playerId 1 / cyan). Symmetric with the host path; activates
    // the dormant S53 protocol-mismatch latch + UX on the host's receive side
    // (closes the v2-peer-INTENT-bypass desync gap from the joiner direction).
    // S118 P1 — also carries the joiner pubkey + PoP (late-bound getter; null until the async sign
    // above settles). The host verifies PoP before warranting the seat.
    wireHelloOnJoin(transport, asPlayerId(1), PLAYER_COLORS[1], undefined, () => clientPop);

    // S82 P4(a) — async host verification machinery (per-connect closures).
    // verifying: single-in-flight guard per peer. pendingByPeer: the latch-bearing /
    // once-only kinds (START_GAME_SIGNAL, LOBBY_PRESENCE) received BEFORE verification
    // completes are buffered (latest per kind per peer) and REPLAYED through the normal
    // route on verify success — so a Begin that lands mid-verify is never lost (the
    // no-drop property today's sync latch has). Everything else stays fail-closed
    // dropped pre-latch exactly as before (snapshots re-arrive at 10Hz).
    const verifying = new Set<string>();
    const pendingByPeer = new Map<
      string,
      { signal?: NetMessage; presence?: NetMessage }
    >();
    const kickVerify = (attest: HostAttest, peerId: string): void => {
      if (deps.session.hostVerifiedPeerId !== null || verifying.has(peerId)) return;
      verifying.add(peerId);
      void verifyHostAttest(attest, code, peerId).then((ok) => {
        verifying.delete(peerId);
        if (!ok) {
          // Fail → stay PRE-latch and remain able to process the next attestation
          // (Council S82 Gemini R2#2 — a corrupt first attest must not wedge us).
          // console-only: a spoofer's failed attest must not scare the user with a
          // lobby error while the genuine host verifies fine.
          console.warn(`[net] host attestation FAILED verification from ${peerId}`);
          return;
        }
        if (deps.session.hostVerifiedPeerId === null) {
          deps.session.hostVerifiedPeerId = peerId;
          const buf = pendingByPeer.get(peerId);
          pendingByPeer.clear(); // spoofer buffers die with the successful latch
          if (buf !== undefined) {
            if (buf.presence !== undefined) route(buf.presence, peerId);
            if (buf.signal !== undefined) route(buf.signal, peerId);
          }
        }
      });
    };

    const route = (msg: NetMessage, peerId: string): void => {
      // S82 P4(a) — attestation-bearing kinds kick the async verify.
      if (
        (msg.kind === 'HELLO' || msg.kind === 'START_GAME_SIGNAL') &&
        msg.hostAttest !== undefined
      ) {
        kickVerify(msg.hostAttest, peerId);
      }
      // Pre-verification: buffer the once-only/latch-bearing kinds (bounded: latest per
      // kind per peer, hard cap on tracked peers), drop-fail-closed otherwise via the
      // filter below. Replayed by kickVerify on success.
      if (
        deps.session.hostVerifiedPeerId === null &&
        (msg.kind === 'START_GAME_SIGNAL' || msg.kind === 'LOBBY_PRESENCE')
      ) {
        if (!pendingByPeer.has(peerId) && pendingByPeer.size >= 12) return; // flood guard
        const slot = pendingByPeer.get(peerId) ?? {};
        if (msg.kind === 'START_GAME_SIGNAL') slot.signal = msg;
        else slot.presence = msg;
        pendingByPeer.set(peerId, slot);
        return;
      }
      // S79 P4 — host sender-auth gate (see hostAuthFilter — now crypto-preconditioned).
      // Drops the five host-authored kinds unless they come from the latched host peer.
      // INTENT/HELLO are unaffected (the host side stamps INTENT playerIds itself).
      if (!hostAuthFilter(deps.session, msg, peerId)) return;
      if (msg.kind === 'NETSNAPSHOT' && deps.session.clientSync !== null) {
        deps.session.clientSync.receive(msg, performance.now());
      }
      // S22 P3 — receive host-broadcast godly trigger; apply locally.
      // Client NEVER runs the recipe predicate itself (anti-desync,
      // Battle Ledger row 9). Predicate is host-only.
      if (msg.kind === 'GODLY_TRIGGER') {
        dispatch(deps.world, { type: 'GODLY_TRIGGER', event: msg.event });
      }
      // S39 P1 — dedicated lobby-exit signal. Pre-S39 the peer exited
      // LOBBY only when a NETSNAPSHOT arrived AND applied cleanly; after
      // S38 audit Pass-1/2 added try/catch + strict schemaVersion gate,
      // any silent drop on that path stranded the peer in lobby. This
      // signal kicks the peer's FSM to PLAYING immediately (snapshots
      // still drive authoritative state afterwards). isHost stays false
      // — the peer never claims host authority. Idempotent: only fires
      // when still in LOBBY so a late/duplicate signal can't reset
      // pendingCreatureSpawn that snapshots may have already populated.
      if (msg.kind === 'START_GAME_SIGNAL' && deps.world.gameState === 'LOBBY') {
        // S62 — adopt the seat the host assigned to THIS peer (match by selfId
        // in the authoritative roster), then seat everyone deterministically
        // from the same ordered roster. Fallback to seat 1 if (unexpectedly) not
        // found, preserving the 2-player default.
        const mine = msg.roster.find((e) => e.peerId === selfId);
        const seat = mine !== undefined ? asPlayerId(mine.seat) : asPlayerId(1);
        deps.world.localPlayerId = seat;
        deps.controls.setPlayerId(seat);
        // S122 P2 (host-migration D3) — keep the frozen seat↔peerId roster: the successor
        // rebuilds hostSeats from it and every survivor grounds its alive-seat view in it.
        deps.session.lastRoster = msg.roster;
        dispatch(deps.world, {
          type: 'START_GAME',
          mode: msg.mode,
          isHost: false,
          roster: msg.roster.map((e) => ({ seat: e.seat, color: e.color })),
        });
      }
      // S118 P1 (host-migration D2) — accept the host's SuccessionWarrant off the Begin signal. NOT
      // gated on LOBBY (a warrant may ride a re-sent/buffered Begin); only reachable AFTER hostAuthFilter
      // (so only the latched host's warrant lands here). Verify cryptographically: verifyWarrant re-checks
      // that the host pubkey's fingerprint IS the room code AND the signature binds (epoch, roster), so a
      // spoofed hostAttest.spkiB64 can't validate. Fail-OPEN (instrument phase): an absent/invalid warrant
      // just leaves session.warrant null (this client can't be a successor); the match proceeds normally.
      if (
        msg.kind === 'START_GAME_SIGNAL' &&
        msg.warrant !== undefined &&
        msg.hostAttest !== undefined &&
        deps.session.roomCode !== null
      ) {
        const warrant = msg.warrant;
        const hostSpkiB64 = msg.hostAttest.spkiB64;
        const roomCode = deps.session.roomCode;
        void Promise.resolve(verifyWarrant(warrant, roomCode, hostSpkiB64)).then((ok) => {
          if (ok) {
            deps.session.warrant = warrant;
            console.info(
              `[net] succession warrant ACCEPTED (epoch ${warrant.epoch}, ${warrant.seats.length} warranted seats)`,
            );
          } else {
            console.warn('[net] succession warrant FAILED verification — ignoring (match proceeds fail-open)');
          }
        });
      }
      // S70 P1 — host lobby presence beacon. While still in LOBBY, forward the
      // roster so the joiner's rack shows its OWN seat (peerId === selfId glow) +
      // real per-seat colours + accurate drop-on-leave instead of count-based
      // occupancy. Gated on gameState==='LOBBY' (mirrors START_GAME_SIGNAL): once
      // PLAYING the rack is gone, so a late/duplicate beacon is ignored. Cosmetic —
      // the AUTHORITATIVE seat still arrives via START_GAME_SIGNAL at Begin, so a
      // dropped beacon only delays the live rack until the next join/leave re-broadcast.
      if (msg.kind === 'LOBBY_PRESENCE' && deps.world.gameState === 'LOBBY') {
        deps.onPresence(msg.roster);
      }
      // S122 P2 (host-migration D3) — a MIGRATION_CLAIM from a warranted survivor.
      // SEAM-GATED (window.__TEST_MIGRATION__ must be present — D3 never activates in
      // production) + Council-hardened acceptance gates, ALL required:
      //   (a) a verified warrant is stored (set exclusively after verifyWarrant at Begin);
      //   (b) the claimed term is EXACTLY currentEpoch + 1 (replays at other terms drop);
      //   (c) this client is itself OBSERVING host loss (starvation or transport peer-left)
      //       — a claim arriving while the host is healthy is ignored (kills healthy-state
      //       replay, S122 Council L3);
      //   (d) the claimed seat is the lowest warranted TRANSPORT-ALIVE seat per OWN view;
      //   (e) the signature verifies under the warranted pubkey for that seat, bound to the
      //       SENDER's transport peerId (verifyMigrationClaim).
      // On accept: re-latch host identity to the claimer + raise the epoch fence. The
      // successor's +MIGRATION_SEQ_JUMP snapshots then pass the seq gate and PLAYING resumes.
      if (msg.kind === 'MIGRATION_CLAIM' && !deps.world.isHost) {
        const seam = (typeof window !== 'undefined'
          ? (window as { __TEST_MIGRATION__?: { starvationMs?: number } }).__TEST_MIGRATION__
          : undefined);
        const transport = deps.session.netTransport;
        const warrant = deps.session.warrant;
        const clientSync = deps.session.clientSync;
        if (
          seam !== undefined &&
          warrant !== null &&
          transport !== null &&
          clientSync !== null &&
          msg.epoch === deps.session.currentEpoch + 1
        ) {
          const alivePeers = new Set(transport.peerIds());
          const starvMs = seam.starvationMs ?? HOST_STARVATION_MS;
          const lastAccepted = clientSync.lastAcceptedAt();
          const hostGone =
            (deps.session.hostPeerId !== null && !alivePeers.has(deps.session.hostPeerId)) ||
            (lastAccepted > 0 && isSnapshotStarved(performance.now(), lastAccepted, starvMs));
          const roster = deps.session.lastRoster ?? [];
          const aliveSeats = computeAliveSeats(
            roster,
            alivePeers,
            deps.world.localPlayerId as number,
          );
          const expectedSuccessor = computeSuccessorSeat(warrant, aliveSeats);
          if (hostGone && expectedSuccessor === msg.seat) {
            const claim = msg;
            const roomCode = deps.session.roomCode;
            if (roomCode !== null) {
              void verifyMigrationClaim(claim, warrant, roomCode, peerId).then((ok) => {
                if (!ok) {
                  console.warn('[net] MIGRATION_CLAIM failed verification — ignored', {
                    seat: claim.seat, epoch: claim.epoch, from: peerId,
                  });
                  return;
                }
                deps.session.hostPeerId = peerId;
                deps.session.hostVerifiedPeerId = peerId;
                deps.session.currentEpoch = claim.epoch;
                deps.session.clientSync?.setEpoch(claim.epoch);
                console.info('[net] MIGRATION accepted — re-latched host', {
                  successorSeat: claim.seat, epoch: claim.epoch, peerId,
                });
              });
            }
          } else {
            console.warn('[net] MIGRATION_CLAIM rejected by acceptance gates', {
              hostGone, expectedSuccessor, claimedSeat: msg.seat,
            });
          }
        }
      }
      // S47 P1 (Sym I fix) — receive host-broadcast game-end envelope
      // and dispatch WIN_TRIGGER locally so joiner's gameState flips to
      // 'WIN' immediately. Pre-S47, the joiner had no handler for ENDGAME
      // AND host never sent it. Both halves now connected. The widened
      // snapshot gate (main.ts) means subsequent NETSNAPSHOTs will carry
      // the host's WIN→POSTGAME transition for state sync; this envelope
      // guarantees the joiner sees the result even if the very first
      // WIN-tick snapshot is dropped. Idempotent — re-dispatching
      // WIN_TRIGGER while already in WIN/POSTGAME is a noop because the
      // reducer is pure-assignment + the world is host-state-overwritten
      // by the next snapshot.
      if (msg.kind === 'ENDGAME') {
        dispatch(deps.world, { type: 'WIN_TRIGGER', winnerId: msg.winnerId });
      }
    };
    transport.on(route);
  }
}
