/**
 * SPARK — Host-side lobby + match callbacks.
 *
 * Extracted from main.ts in S50 P2 (Council Battle Ledger C2 ADOPT 4
 * extractions). Two factory-functions wired into LobbyScreen at boot:
 *   createHostStartHandler   — fires when user clicks "Host new room";
 *                              spawns NetTransport, HostSync, registers
 *                              the INTENT msg handler (host applies
 *                              client intents authoritatively per S15 P2).
 *   createBeginMatchHandler  — fires when user clicks "Begin Match";
 *                              broadcasts START_GAME_SIGNAL envelope to
 *                              joiner (S39 P1 lobby-exit decoupling) then
 *                              dispatches local START_GAME.
 *
 * PRIME-AUDIT Δ1: deps.session.* read at HANDLER-INVOCATION time, NOT
 * captured into locals at factory time. Avoids stale references on
 * disconnect/reconnect cycles.
 */

import { HostSync } from './sync.ts';
import {
  PROTOCOL_VERSION,
  buildHello,
  isClientIntentAllowed,
  type HostAttest,
  type RosterEntry,
} from './protocol.ts';
import { verifyPubkeyPop, type HostIdentity } from './hostIdentity.ts';
import { verifyMigrationClaim } from './migrationClaim.ts';
import type { MigrationClaimMsg } from './protocol.ts';
import { signWarrant, type WarrantSeat } from './successionWarrant.ts';
import { reconcileLobbySeats, buildMatchRoster } from './lobbyRoster.ts';
import { broadcastQmPresence, maybeQmAutoBegin } from './quickmatchGate.ts';
import type { NetSession } from './session.ts';
import { NetTransport, selfId } from './transport.ts';
import { dispatch, type GameAction as GameActionForIntent, type World } from '../state/world.ts';
import { stampOrReject } from './intentStamp.ts';
import { asPlayerId, type PlayerId } from '../types.ts';
import { PLAYER_COLORS, MAX_PLAYERS } from '../constants.ts';

/**
 * S53 P1 — shared helper for symmetric protocol-mismatch UX text. Both
 * host (hostHandlers.ts) and joiner (clientHandlers.ts) wire the same
 * onProtocolMismatch callback; the message advises which side needs to
 * refresh based on which has the older version.
 */
/**
 * S54 P2 (G3) — render a peer's reported protoVersion safely for the
 * diagnostic string. Primitives (number / string / undefined / null /
 * boolean) render verbatim for diagnostic value; a non-primitive from a
 * corrupt payload (object / array / function) would otherwise stringify to
 * useless noise like "[object Object]", so collapse it to a stable label.
 */
function describePeerVersion(peerVersion: unknown): string {
  if (
    peerVersion !== null &&
    (typeof peerVersion === 'object' || typeof peerVersion === 'function')
  ) {
    return Array.isArray(peerVersion) ? '(array)' : `(${typeof peerVersion})`;
  }
  return String(peerVersion);
}

export function formatProtocolMismatchMessage(peerVersion: unknown): string {
  const peerV = typeof peerVersion === 'number' ? peerVersion : NaN;
  let advice: string;
  if (Number.isFinite(peerV) && peerV < PROTOCOL_VERSION) {
    // S54 P2 (M5) — neutral phrasing ("the other player" not "your friend"):
    // forward-compatible with any future non-friend matchmaking, and accurate
    // regardless of host/joiner asymmetry (Council R1 #3, unanimous).
    advice = `The other player's version is older. Ask them to refresh their browser.`;
  } else if (Number.isFinite(peerV) && peerV > PROTOCOL_VERSION) {
    advice = `Your version is older. Please refresh your browser.`;
  } else {
    // peerVersion is missing / wrong-type / NaN. Truly-ancient or corrupt;
    // safest UX is to advise both sides to refresh.
    advice = `Versions don't match. Both peers should refresh.`;
  }
  return `Protocol mismatch (peer v${describePeerVersion(peerVersion)}, you v${PROTOCOL_VERSION}). ${advice}`;
}

/**
 * S54 P1 — register the peer-join HELLO handshake on a transport. This is the
 * producer that was missing through S53, leaving the protocol-mismatch system
 * dormant. BOTH the host (playerId 0 / crimson) and the joiner (playerId 1 /
 * cyan) call this so EACH side announces its PROTOCOL_VERSION to the other on
 * connect — required for SYMMETRIC mismatch detection: the host-side drop
 * latch needs the joiner's HELLO to close the v2-peer-INTENT-bypass desync gap
 * (S53 CONVERGENT BLOCKER), and the joiner needs the host's to detect a stale
 * host. Host-only is insufficient (Council R1 #2 — "host rejects on receipt"
 * fails for a skewed peer's semantically-valid INTENTs, the exact gap the
 * latch exists to close).
 *
 * Emission is on peer-JOIN, not at connect(): transport.send() broadcasts to
 * *currently-connected* peers, so a HELLO sent at connect() time (peerCount=0)
 * would be dropped. onPeerChange fires once per peerId (deduped across
 * strategies) when the data channel opens. onPeerChange was previously unused
 * API — main.ts polls peerCount() for the connection-lost overlay — so this
 * registration is conflict-free.
 *
 * TIMING GUARANTEE (Council R1 #1 — race/ordering resolution): a join always
 * happens in the LOBBY phase (host shares code → joiner connects → only THEN
 * does the host click "Begin Match"). No NETSNAPSHOT / INTENT /
 * START_GAME_SIGNAL flows before Begin Match, so the HELLO is provably the
 * first app message a peer receives — no separate sendQueue/readiness flag
 * needed.
 *
 * 1v1 NOTE (Council R1 #7 — broadcast vs targeted): send() broadcasts to all
 * peers, but 1v1 caps the room at one remote peer, so broadcast == targeted
 * here. A future >2-player Phase-3 transport (Colyseus / Geckos.io) must
 * switch to a per-peer targeted send keyed off the peerId onPeerChange already
 * provides. Re-sends on reconnect are harmless (HELLO is idempotent: a
 * matching version is a no-op; a mismatch latches once per peerId).
 */
export function wireHelloOnJoin(
  transport: NetTransport,
  playerId: PlayerId,
  color: number,
  // S82 P4(a) — late-bound attestation provider (HOST side passes one; clients omit).
  // Read at SEND time so the async signature computed right after host-start is
  // attached even though wiring happens earlier (PRIME-AUDIT Δ1 late-binding posture).
  getAttest?: () => HostAttest | null,
  // S118 P1 (host-migration D2) — late-bound joiner pubkey + PoP provider (CLIENT side passes one; the
  // host omits). Read at SEND time (returns null until the async PoP sign settles — the next peer-change
  // re-sends). Mutually exclusive with getAttest in practice (host attests; client proves a pubkey).
  getClientPubkey?: () => { pubkeyB64: string; popB64: string } | null,
): void {
  transport.onPeerChange((_peerId, kind) => {
    if (kind === 'join') {
      const attest = getAttest !== undefined ? getAttest() : null;
      const cp = getClientPubkey !== undefined ? getClientPubkey() : null;
      transport.send(buildHello(playerId, color, attest ?? undefined, cp?.pubkeyB64, cp?.popB64));
    }
  });
}

export interface HostStartDeps {
  session: NetSession;
  world: World;
  /**
   * S82 P4(a) — the page-session host identity (generated once at boot, awaited in
   * main()). The room code IS this key's fingerprint; the attestation binds it to our
   * transport selfId. Re-hosting from the same tab reuses it (same code — documented).
   */
  hostIdentity: HostIdentity;
  /**
   * Called when the underlying transport surfaces an error (signaling,
   * ICE, send). Forwarded to LobbyScreen.setErrorMessage in main.ts.
   * Late-bound via thunk so the lobbyScreen instance can be passed
   * after construction without circular-init pain.
   */
  onLobbyError: (errMsg: string) => void;
  /**
   * S70 P1 — late-bound sink for the live lobby seat roster (mirror of the
   * onLobbyError thunk). The host calls this LOCALLY after building + broadcasting
   * the roster on each peer join/leave: transport.send() broadcasts to PEERS only,
   * so without a local self-dispatch the host would never update its OWN seat rack
   * (Council R6 CRITICAL). main.ts wires it to lobbyScreen.updatePresence (which
   * digests RosterEntry → the render-local SeatPresence shape).
   */
  onPresence: (roster: readonly RosterEntry[]) => void;
  /**
   * S87 P4 — fired by the QUICKMATCH all-ready gate (host side) to begin the
   * match without a manual click. main.ts wires it to the begin handler,
   * gated on gameState==='LOBBY' so a late LOBBY_READY can't re-fire
   * START_GAME after the match already started. A no-op in friends lobbies
   * (session.quickmatch=false → maybeQmAutoBegin never calls it).
   */
  onAutoBegin: () => void;
  /**
   * S122 P1 (worker mode) — optional override for the authoritative apply of a validated,
   * seat-stamped remote INTENT. Absent (direct mode) → dispatch(deps.world, action) exactly
   * as before. main.ts passes a thunk that routes to the SimWorkerDriver when the sim runs
   * behind the ?worker=1 flag (the mirror world must never apply intents authoritatively).
   */
  dispatchAction?: (action: GameActionForIntent) => void;
  /**
   * S124 P1 (host-migration D4) — ZOMBIE DEMOTION sink. Fired when a VERIFIED MIGRATION_CLAIM
   * at an epoch STRICTLY ABOVE this host's current term arrives (the match migrated around a
   * frozen/partitioned "us"; the claim chains to the warrant WE signed at Begin, so it is
   * cryptographically ours to trust). main.ts wires it to the demote core (stop simulating,
   * stop the sim worker if active, route to the v1 connection-lost overlay — design §5).
   */
  onDeposed?: (claim: MigrationClaimMsg, fromPeerId: string) => void;
  /**
   * S124 P1 (host-migration D4) — anti-grief gate for onDeposed (PRIME-AUDIT addition, not in
   * the Council rounds): a HEALTHY host must never be deposable by a single malicious warranted
   * client signing a claim. A LEGITIMATE migration requires ≥ grace (~15s) of this host's
   * silence, which is only possible if this page was frozen (rAF gap ≥ starvation) or fully
   * partitioned (peer wipe-out episode). main.ts tracks that evidence; without it a verified
   * claim is logged + REFUSED (fail-closed toward staying host — survivors that migrated ignore
   * us regardless via hostAuthFilter + epoch gate, so a wrong refusal only affects our own UI).
   */
  hasPartitionEvidence?: () => boolean;
}

export function createHostStartHandler(deps: HostStartDeps): () => string {
  return () => {
    // S82 P4(a) — the room code is DERIVED from the host pubkey (30-bit fingerprint,
    // net/hostIdentity.ts) instead of Math.random: the code a friend types IS the
    // host's key commitment, which is what kills the S79 TOFU latch race client-side.
    const code = deps.hostIdentity.roomCode;
    // Kick the (cached, ~ms) attestation signature; ready long before any peer joins.
    // Read late-bound via session.hostAttest at HELLO-send / Begin time.
    deps.session.hostAttest = null;
    void deps.hostIdentity.makeAttest(selfId).then((attest) => {
      deps.session.hostAttest = attest;
    });
    const transport = new NetTransport();
    deps.session.netTransport = transport;
    deps.session.hostSync = new HostSync();
    deps.session.roomCode = code;
    deps.world.isHost = true;
    // S73 P1 (CHECK Gemini c) — a fresh Host starts with NO inherited lobby seats.
    // Defense-in-depth: every production path back to re-Host goes through teardownNet
    // (which clears lobbySeats), but resetting here makes "fresh host = empty seat-map"
    // an explicit host-start invariant independent of teardown ordering — mirrors the
    // applyStartGame start-of-match hazard-clears (S72 belt-and-suspenders posture). A
    // fresh transport has no peers yet, so this runs before any onPeerChange can fire.
    deps.session.lobbySeats = new Map();
    // S20 P0 — surface NetTransport errors to the lobby statusText so users
    // see the failure layer rather than an indefinite "Waiting for Player 2..."
    // stall (the S19 P4-unresolved BLOCKER root cause: zero error plumbing).
    transport.onError = (errMsg) => deps.onLobbyError(errMsg);
    // S53 P1 — protocol-mismatch UX (S52 CHECK Triumvirate Grok #4 + Gemini #2
    // CONVERGENT BLOCKER follow-up). Surfaces explicit refresh-prompt when an
    // old-build peer's HELLO carries a non-current protoVersion. Per-peer
    // latch in NetTransport drops ALL subsequent messages from the mismatched
    // peer (closes the v2-peer-INTENT-bypass desync gap).
    transport.onProtocolMismatch = (peerVersion) => {
      deps.onLobbyError(formatProtocolMismatchMessage(peerVersion));
    };
    transport.connect(code);
    // S54 P1 — announce our PROTOCOL_VERSION to the joiner the moment it
    // connects (host = playerId 0 / crimson). Activates the dormant S53
    // protocol-mismatch latch + UX on the joiner's receive side.
    // S82 P4(a) — the host's HELLO now carries the attestation (late-bound read).
    wireHelloOnJoin(transport, asPlayerId(0), PLAYER_COLORS[0], () => deps.session.hostAttest);
    // S70 P1 / S73 P1 — lobby presence broadcast with STABLE (non-compacting) seats.
    // On every peer join/leave, reconcile the persistent peerId→seat map (survivors
    // KEEP their seat; a departed peer leaves a HOLE; a new peer takes the lowest free
    // seat), then project the STABLE roster (holes ok) and (1) broadcast it to peers so
    // joiners paint the true per-seat rack, and (2) dispatch it LOCALLY for the host's
    // OWN rack — transport.send() goes to PEERS only, so the local call is what updates
    // the host (Council R6 CRITICAL). peerIds() is accurate at handler time: the
    // transport mutates peerSet BEFORE firing onPeerChange for both join (added) and
    // leave (removed). No debounce — lobby join/leave is human-paced and the reducer's
    // same-ref churn-guard absorbs any redundant identical roster. The map persists on
    // session.lobbySeats so Begin (buildMatchRoster) compacts the SAME assignment —
    // ONE source of truth (Council S73 Option 1b: no positional re-derivation that
    // could diverge from a back-filled hole).
    transport.onPeerChange(() => {
      // S87 P4 — broadcastQmPresence is the single host presence path: in a
      // friends lobby (session.quickmatch=false) it produces the SAME base
      // roster the pre-S87 inline reconcile+build+send+onPresence did
      // (byte-identical); a quickmatch room additionally carries roster.ready.
      // The auto-begin check also covers a peer LEAVING (if the leaver was the
      // last unready player, the remaining all-ready ≥2 start) — idempotent +
      // LOBBY-gated in main.ts.
      broadcastQmPresence(deps.session, transport, deps.onPresence);
      maybeQmAutoBegin(deps.session, deps.onAutoBegin);
    });
    transport.on((msg, peerId) => {
      // S118 P1 (host-migration D2) — a joiner's HELLO may advertise its ephemeral pubkey + a PoP
      // signature. Store peerId→pubkey in session.peerPubkeys ONLY after verifyPubkeyPop proves the
      // sender holds the matching private key (bound to roomCode + THIS transport peerId — anti-replay),
      // closing the "claim any pubkey" hole (GROK W1). Unproven / garbage → ignore the field + warn; the
      // peer still plays normally, it just isn't warrantable as a successor. The pubkey is consumed at
      // Begin (buildMatchRoster ∩ peerPubkeys). No effect on non-D2/legacy HELLOs (fields absent).
      if (
        msg.kind === 'HELLO' &&
        msg.clientPubkeyB64 !== undefined &&
        msg.clientPubkeyPopB64 !== undefined &&
        deps.session.roomCode !== null
      ) {
        const pubkeyB64 = msg.clientPubkeyB64;
        const popB64 = msg.clientPubkeyPopB64;
        const roomCode = deps.session.roomCode;
        void verifyPubkeyPop(pubkeyB64, popB64, roomCode, peerId).then((ok) => {
          if (ok) {
            deps.session.peerPubkeys.set(peerId, pubkeyB64);
          } else {
            console.warn(`[net] client pubkey PoP FAILED verification from ${peerId} — not warrantable`);
          }
        });
      }
      // S15 P2 — host applies client intent authoritatively.
      // S42 — turn-based active-player gate REMOVED (blueprint mandates
      // real-time). Shared-resource race conditions resolved by first-Intent-
      // wins host-receive order; loser's intent silently no-ops + increments
      // world.diagnostics.raceRejects (observable for tests).
      if (msg.kind === 'INTENT' && deps.session.hostSync !== null) {
        // S82 P4(c) — CLIENT-INTENT ALLOWLIST (closes the any-GameAction hole): the
        // wire validator mirrors the FULL action union, so a modified client could
        // send host-internal actions (SPAWN_*, WIN_TRIGGER, START_GAME, *_TICK …) and
        // the host would apply them. Only genuine player intents pass; everything
        // else is dropped fail-closed + counted for observability.
        if (!isClientIntentAllowed(msg.action.type)) {
          deps.world.diagnostics.raceRejects++;
          console.warn(`[net] dropped non-player INTENT '${msg.action.type}' from ${peerId}`);
          return;
        }
        // S62 — stamp the intent's playerId from the SENDER's assigned seat
        // (peerId→seat), overriding whatever the wire claimed. Anti-collision/
        // anti-spoof: a client can only act as its own seat, so two clients
        // can't both drive seat 1 and no client can move another player.
        // S124 P1 (D4) — unknown peer → DROP fail-closed (was: apply as-is, an S62
        // "legacy 2-player" leniency that let ANY swarm-joiner mid-match spoof an
        // arbitrary playerId — S124 Council R1 GEMINI "identity theft", provenance
        // corrected to pre-existing). Safe: every legitimate sender is in hostSeats
        // from Begin, and an in-page reconnect keeps its Trystero selfId, so the
        // frozen map re-binds it; there is no honest unknown-peer INTENT flow.
        const action = stampOrReject(msg.action, deps.session.hostSeats.get(peerId));
        if (action === null) {
          deps.world.diagnostics.raceRejects++;
          console.warn(`[net] dropped INTENT from unseated peer ${peerId} (no hostSeats entry)`);
          return;
        }
        // S122 P1 — worker mode routes the authoritative apply to the sim worker.
        if (deps.dispatchAction !== undefined) deps.dispatchAction(action);
        else dispatch(deps.world, action);
      }
      // S124 P1 (host-migration D4) — ZOMBIE DEMOTION receive path. If a VERIFIED claim at an
      // epoch above our term reaches us while we still think we are the PLAYING host, the match
      // has migrated around us (we were frozen/partitioned past the survivors' grace). Verify
      // against the warrant WE signed at Begin (stored in session.warrant), demand local
      // partition evidence (anti-grief — see HostStartDeps.hasPartitionEvidence), then hand off
      // to main.ts. Apply-time re-check inside the async continuation (same posture as the
      // client-side acceptance re-check).
      if (
        msg.kind === 'MIGRATION_CLAIM' &&
        deps.onDeposed !== undefined &&
        deps.world.isHost &&
        deps.world.gameState === 'PLAYING' &&
        deps.session.warrant !== null &&
        deps.session.roomCode !== null &&
        msg.epoch > deps.session.currentEpoch
      ) {
        const claim = msg;
        const warrant = deps.session.warrant;
        const roomCode = deps.session.roomCode;
        void verifyMigrationClaim(claim, warrant, roomCode, peerId).then((ok) => {
          if (!ok) {
            console.warn('[net] host received MIGRATION_CLAIM that failed verification — ignored', {
              seat: claim.seat, epoch: claim.epoch, from: peerId,
            });
            return;
          }
          if (!deps.world.isHost || claim.epoch <= deps.session.currentEpoch) return;
          if (deps.hasPartitionEvidence !== undefined && !deps.hasPartitionEvidence()) {
            console.warn(
              '[net] verified MIGRATION_CLAIM at higher epoch but NO local partition evidence — ' +
              'refusing demotion (anti-grief gate); survivors that migrated ignore us regardless',
              { seat: claim.seat, epoch: claim.epoch },
            );
            return;
          }
          deps.onDeposed?.(claim, peerId);
        });
      }
      // S87 P4 — QUICKMATCH readiness from a joiner. Recorded by TRANSPORT
      // peerId (never a wire-claimed identity — same anti-spoof posture as
      // INTENT seat-stamping); the aggregate is mirrored back via the presence
      // roster's ready flags, and the all-ready gate auto-Begins. Ignored
      // outside a quickmatch room (friends lobbies keep the manual Begin).
      if (msg.kind === 'LOBBY_READY' && deps.session.quickmatch) {
        deps.session.qmReadyPeers.set(peerId, msg.ready);
        broadcastQmPresence(deps.session, transport, deps.onPresence);
        maybeQmAutoBegin(deps.session, deps.onAutoBegin);
      }
      // S22 P3 — clients never send GODLY_TRIGGER (host-only authority,
      // Battle Ledger row 9). Defensive: drop GODLY_TRIGGER from clients silently.
    });
    return code;
  };
}

export interface BeginMatchDeps {
  session: NetSession;
  world: World;
  /**
   * S118 P1 (host-migration D2) — the page-session host identity, used to SIGN the SuccessionWarrant at
   * Begin (its key is the room-code commitment survivors chain a D3 claim back to). Same instance the
   * host-start handler used to derive the code + attest.
   */
  hostIdentity: HostIdentity;
}

export function createBeginMatchHandler(deps: BeginMatchDeps): () => void {
  return () => {
    void beginMatch(deps);
  };
}

async function beginMatch(deps: BeginMatchDeps): Promise<void> {
  {
    // Host triggers START_GAME. The first snapshot will carry gameState=
    // 'PLAYING' to the clients. S39 P1: also broadcast a dedicated
    // START_GAME_SIGNAL envelope BEFORE the local dispatch so peers' lobby-exit
    // is decoupled from snapshot delivery reliability (S38 audit added silent-
    // drop points to the snapshot apply chain). Order matters: send first while
    // world.gameState is still LOBBY so peers learn of the transition ASAP.
    //
    // S62 — mint the authoritative N-player roster: host = seat 0, remote peers
    // = seats 1..N in join order (capped at MAX_PLAYERS). Freeze peerId→seat on
    // the session FIRST so any INTENT arriving right after the signal is already
    // stamp-able (no pre-ack race), THEN ship the ORDERED roster so every client
    // builds a byte-identical initial world (Council determinism fix).
    const transport = deps.session.netTransport;
    const allPeers = transport !== null ? transport.peerIds() : [];
    // S73 P1 — final reconcile of the STABLE seat-map against the current peer set,
    // then DENSE-compact it (buildMatchRoster) for the authoritative roster: the
    // in-game radialSpawnPos(seat, total) requires CONTIGUOUS seats 0..N-1, so the
    // lobby's possibly-holed stable seats are re-densified in ascending-seat order.
    // This projects the ONE seat-map the lobby preview used (Council Option 1b — no
    // positional re-derivation that could diverge from a back-filled hole) and is
    // byte-identical to the preview when no hole persisted to Begin. hostSeats freezes
    // from the DENSE roster so anti-spoof intent stamping keys peerId→in-game seat.
    deps.session.lobbySeats = reconcileLobbySeats(deps.session.lobbySeats, allPeers);
    const roster = buildMatchRoster(deps.session.lobbySeats, selfId);
    const seatedRemotes = roster.length - 1;
    if (allPeers.length > seatedRemotes) {
      console.warn(
        `[net] Begin: ${allPeers.length} peers but seated ${seatedRemotes} (MAX_PLAYERS=${MAX_PLAYERS}); dropping ${allPeers.length - seatedRemotes}.`,
      );
    }
    deps.session.hostSeats.clear();
    for (const e of roster) {
      if (e.seat > 0) deps.session.hostSeats.set(e.peerId, asPlayerId(e.seat));
    }
    // S118 P1 (host-migration D2) — SIGN the SuccessionWarrant BEFORE broadcasting Begin. Ordering by
    // construction (GROK R1 kill-shot fix): the warrant must exist before START_GAME_SIGNAL / the
    // snapshot stream, so a client can never receive state under a term whose warrant was not yet minted
    // (async slow-sign can't race the send — we AWAIT it here first). Warrant the REMOTE seats (seat>0)
    // that PROVED a pubkey via HELLO PoP (session.peerPubkeys); the host's own seat 0 is the current
    // authority (never its own successor) and is excluded. Unproven seats are OMITTED (mixed-build
    // tolerance — GEMINI FIX 2: strictly less harm than excluding them from the match). No proven peer
    // → no warrant (nothing to authorize; the additive field is simply absent, Begin unchanged).
    deps.session.warrant = null;
    const warrantSeats: WarrantSeat[] = [];
    for (const e of roster) {
      if (e.seat === 0) continue;
      const pubkey = deps.session.peerPubkeys.get(e.peerId);
      if (pubkey !== undefined) warrantSeats.push({ seat: e.seat, spkiB64: pubkey });
    }
    const roomCode = deps.session.roomCode;
    if (warrantSeats.length > 0 && roomCode !== null) {
      try {
        deps.session.warrant = await signWarrant(
          deps.hostIdentity,
          roomCode,
          deps.session.currentEpoch,
          warrantSeats,
        );
      } catch (err) {
        // Fail-OPEN (instrument phase): a warrant-sign failure must NOT block the match starting. The
        // Begin below simply carries no warrant (successors can't be authorized this term); every other
        // path is unaffected. Signing failing at all would be catastrophic (the host identity itself
        // relies on the same crypto), so this is defense-in-depth, not an expected path.
        console.warn(
          '[net] succession warrant signing FAILED — Begin proceeds without a warrant (fail-open):',
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    if (transport !== null) {
      // S82 P4(a) — Begin carries the attestation too: a client whose HELLO was lost
      // can still verify + latch from the buffered Begin signal itself.
      const attest = deps.session.hostAttest;
      // S118 P1 — ...and the SuccessionWarrant signed above (additive-optional; absent when no peer
      // proved a pubkey). Rides the SAME Begin the attest does, so the client verifies both together.
      const warrant = deps.session.warrant;
      transport.send({
        kind: 'START_GAME_SIGNAL',
        mode: '1v1',
        roster,
        ...(attest !== null ? { hostAttest: attest } : {}),
        ...(warrant !== null ? { warrant } : {}),
      });
    }
    dispatch(deps.world, {
      type: 'START_GAME',
      mode: '1v1',
      isHost: true,
      roster: roster.map((e) => ({ seat: e.seat, color: e.color })),
    });
  }
}
