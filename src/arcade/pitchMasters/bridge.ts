/**
 * PITCH MASTERS (arcade) — `window.PitchNet`, the bridge the Godot web build talks to through
 * `JavaScriptBridge` (Pitch Masters `src/net/WebBridge.gd` + `TrysteroPeer.gd`).
 *
 * Source of truth: the Pitch Masters repo, `web/spark/src/arcade/pitchMasters/` (copied here by
 * `tools/build_web.py`). The pairing rules live in `matchmaker.ts`; this file only plugs them into
 * Trystero with SPARK's own relays and ICE/TURN servers, imported read-only from `net/iceConfig.ts`
 * so this page inherits the TURN relay that SPARK's CI build injects. Separate room names
 * (`pitchmasters-*`), so it never meets a SPARK lobby.
 *
 * Contract (strings only: JavaScriptBridge passes strings reliably, binary travels as base64):
 *   quickMatch()                  search for a stranger (1v1)
 *   friendHost() -> string        host a private game, returns the code the friend types
 *   friendJoin(code)              join a friend's game
 *   cancel()                      leave everything, back to idle
 *   status() -> string            JSON {state: idle|seeking|connecting|matched|closed|error,
 *                                       role: host|client|'', mode: quick|friend|'', code, detail, elapsed}
 *   send(b64, reliable) -> bool   one packet to the partner: reliable = the ordered, reliable lane (sequenced,
 *                                 re-sent after a blip); reliable === false (PM-S5 lag-research: the game's
 *                                 snapshots) = the 1v1 fast lane (unordered, no retransmits; may be lost or
 *                                 overtaken), the reliable lane when it is not open. `?nofast=1`: always reliable.
 *   poll() -> string              JSON array of base64 packets received since the last poll, in order
 *   goArcade()                    back to the SPARK arcade
 *   setBuild(id)                  the game build id; only identical builds are paired
 * PM-S4 three-sided (`lobby3.ts`, a separate class: the 1v1 matchmaker is untouched):
 *   friendHost3() -> string       host a three-sided room (6-letter code; friendJoin(code) routes by length)
 *   quickMatch3()                 three-sided quick match (pairs, then a 20 s open lobby for a third seeker)
 *   lock()                        host: the match starts, the room takes nobody else
 *   send(b64, reliable, to)       host: `to` = the client's Godot peer id (2 / 3), 0 = every client
 *   poll()                        in a three-sided room each packet is `<from peer id>:<b64>`
 *   status()                      in a three-sided room also {seats: 3, slot, partners[], lobby, startIn}
 * PM-S2 online2: status() also carries rtt (ms, -1 unknown), stalled, stalledFor (s), partnerHidden,
 * seekers (quick match head count incl. us). `blip(ms)` (only with ?netdebug=1) drops off the match room
 * for ms and rejoins: the reconnect test. `setHidden(bool)` is called by the page's keep-alive when the tab
 * goes to the background (the partner's status shows partnerHidden).
 * PM-S5 net-reconnect (`src/net/NetResume.gd`): the page keeps the match record in localStorage (RESUME_KEY).
 *   rejoin() -> bool              re-enter the saved match with its seat token (status: seeking -> matched / error)
 *   resumeInfo() -> string        the live record as JSON, '' when there is none
 *   clearResume()                 forget it
 *   setGame(json)                 the game's standing, kept with the record
 * A closing tab no longer says bye (pagehide -> suspend): the partner waits SILENCE_MS for a rejoin.
 */

import { joinRoom, selfId } from '@trystero-p2p/nostr';
import { APP_ID, ICE_SERVERS, NOSTR_RELAYS } from '../../net/iceConfig.ts';
import { Lobby3, isThreeCode } from './lobby3.ts';
import { HANDSHAKE_MS, Matchmaker, RESUME_KEY, serialRooms, type Channel, type MatchmakerDeps, type ResumeStore, type RoomHandlers, type RoomLike } from './matchmaker.ts';

export interface PitchNetApi {
  quickMatch(): void;
  friendHost(): string;
  friendJoin(code: string): void;
  cancel(): void;
  status(): string;
  send(b64: string, reliable?: boolean, to?: number): boolean;
  poll(): string;
  goArcade(): void;
  setBuild(id: string): void;
  blip?(ms: number): boolean;
  setHidden?(hidden: boolean): void;
  friendHost3(): string;
  quickMatch3(): void;
  lock(): void;
  rejoin(): boolean;
  resumeInfo(): string;
  clearResume(): void;
  setGame(json: string): void;
  readonly selfId: string;
}

declare global {
  interface Window {
    PitchNet?: PitchNetApi;
  }
}

const TICK_MS = 250;
/** PM-S5 lag-research: the fast lane's SCTP stream id (Trystero's in-band channel takes 0 / 1). */
const FAST_LANE_ID = 517;
/** Past this many bytes queued on the fast lane a snapshot goes the reliable way (a congested link). */
const FAST_LANE_MAX_BUFFER = 64 * 1024;
/** The fast lane of each live connection (see `fast` in trysteroRoom). */
const FAST_BY_PC = new WeakMap<RTCPeerConnection, RTCDataChannel>();

/**
 * PM-S3: relays from SPARK's pinned list that are dead for us. `relay.mostr.pub` answered EVERY WebSocket
 * handshake with HTTP 301 in the live harness runs of 2026-09-29/30 (93 of 96 failed relay connections;
 * `relay.primal.net` gave 3 transient 524s and stays). A dead relay costs a reconnect loop per room and gets
 * no signaling through, so the page leaves it out. SPARK's own list (`net/iceConfig.ts`) is not touched.
 * PM-S3 live audit: `offchain.pub` ("not in our web of trust", 346 refusals) and `nostr-pub.wellorder.net`
 * ("spam not permitted", 287) reject every event we publish, so they carry no signaling either; 4 of
 * SPARK's 7 relays remain (nos.lol, purplerelay.com, nostr.mom, relay.primal.net).
 */
export const DEAD_RELAYS: readonly string[] = [
  'wss://relay.mostr.pub',
  'wss://offchain.pub',
  'wss://nostr-pub.wellorder.net',
];
export const PM_RELAYS: readonly string[] = NOSTR_RELAYS.filter((u) => !DEAD_RELAYS.includes(u));
const ARCADE_URL = '/';

function trysteroRoom(roomId: string, h: RoomHandlers): RoomLike {
  const room = joinRoom(
    {
      appId: APP_ID,
      relayConfig: { urls: [...PM_RELAYS], redundancy: PM_RELAYS.length },
      rtcConfig: { iceServers: ICE_SERVERS, iceTransportPolicy: 'all' },
      trickleIce: true,
    },
    roomId,
    {
      // PM-S4 net-blip: 5 s, not SPARK's 30 s (matchmaker.ts HANDSHAKE_MS: a stuck handshake after a blip).
      handshakeTimeoutMs: HANDSHAKE_MS,
      onJoinError: (e) => {
        console.warn('[pitchnet] join error', e.error);
        if (e.peerId) h.onPeerError?.(e.peerId, String(e.error));
      },
    },
  );
  const ctl = room.makeAction<string>('ctl');
  const pk = room.makeAction<string>('pk');
  ctl.onMessage = (data, ctx) => h.onMessage('ctl', String(data), ctx.peerId);
  pk.onMessage = (data, ctx) => h.onMessage('pk', String(data), ctx.peerId);
  room.onPeerJoin = (peer) => h.onPeerJoin(peer);
  room.onPeerLeave = (peer) => h.onPeerLeave(peer);
  const actions: Record<Channel, typeof ctl> = { ctl, pk };
  // PM-S5 lag-research: the fast lane, one unordered no-retransmit data channel per partner connection, next to
  // Trystero's own (ordered, reliable) channel on the same RTCPeerConnection. Negotiated (both sides create it with
  // the same id, no extra signalling), so it opens as soon as both pages have bound each other.
  const fast = new Map<string, { pc: RTCPeerConnection; ch: RTCDataChannel }>();
  const fastWarned = new WeakSet<RTCPeerConnection>();
  return {
    send: (channel, data, to) => {
      void actions[channel].send(data, to === undefined ? undefined : { target: to }).catch(() => undefined);
    },
    fast: (to, onData) => {
      const pc = room.getPeers()[to];
      // a connection on its way out (a blip: Trystero replaces it) cannot take a channel; the next hi retries
      if (pc === undefined || pc.signalingState === 'closed' || pc.connectionState === 'closed' || pc.connectionState === 'failed') return false;
      const had = fast.get(to);
      if (had !== undefined && had.pc === pc && had.ch.readyState !== 'closed' && had.ch.readyState !== 'closing') return true;
      // Trystero keeps a partner's RTCPeerConnection across rooms (a blip re-joins the room on the same connection):
      // its lane already exists there (a second channel with the same id is refused), so take it over.
      const old = FAST_BY_PC.get(pc);
      if (old !== undefined && old.readyState !== 'closed' && old.readyState !== 'closing') {
        old.onmessage = (e) => onData(String(e.data));
        fast.set(to, { pc, ch: old });
        return true;
      }
      try {
        const ch = pc.createDataChannel('pm-fast', { negotiated: true, id: FAST_LANE_ID, ordered: false, maxRetransmits: 0 });
        ch.onmessage = (e) => onData(String(e.data));
        FAST_BY_PC.set(pc, ch);
        fast.set(to, { pc, ch });
        return true;
      } catch (e) {
        if (!fastWarned.has(pc)) console.warn('[pitchnet] fast lane unavailable on this connection (snapshots go the reliable way)', e);
        fastWarned.add(pc);
        return false;
      }
    },
    sendFast: (to, data) => {
      const f = fast.get(to);
      if (f === undefined || f.ch.readyState !== 'open' || f.ch.bufferedAmount > FAST_LANE_MAX_BUFFER) return false;
      try {
        f.ch.send(data);
        return true;
      } catch {
        return false;
      }
    },
    leave: () => room.leave().catch(() => undefined),
  };
}

/** PM-S5 net-reconnect: the match record in localStorage (a private window, or storage denied, = no rejoin). */
function localStore(): ResumeStore {
  return {
    get: () => {
      try {
        return localStorage.getItem(RESUME_KEY);
      } catch {
        return null;
      }
    },
    set: (v) => {
      try {
        if (v === null) localStorage.removeItem(RESUME_KEY);
        else localStorage.setItem(RESUME_KEY, v);
      } catch {
        // storage denied: the match still plays, it just cannot be rejoined after a restart
      }
    },
  };
}

/** Installs `window.PitchNet` once and starts its timer. */
export function installPitchNet(): PitchNetApi {
  if (window.PitchNet !== undefined) return window.PitchNet;
  const debug = new URLSearchParams(location.search).has('netdebug');
  const deps: MatchmakerDeps = {
    selfId,
    // PM-S4 net-blip: a re-join of a room id waits for its leave to finish (matchmaker.ts serialRooms).
    join: serialRooms(trysteroRoom),
    store: localStore(), // PM-S5 net-reconnect
    now: () => performance.now(),
    wallNow: () => Date.now(),
    random: () => {
      const b = new Uint32Array(1);
      crypto.getRandomValues(b);
      return b[0] / 4294967296;
    },
    log: (msg) => {
      if (debug) console.log(`[pitchnet] ${msg}`);
    },
  };
  const mm = new Matchmaker(deps);
  mm.fastLane = !new URLSearchParams(location.search).has('nofast'); // PM-S5 lag-research: A/B
  // PM-S4: the three-sided room. Exactly one of the two is active; starting one cancels the other.
  const m3 = new Lobby3(deps);
  const three = (): boolean => m3.active();
  setInterval(() => {
    mm.tick();
    m3.tick();
  }, TICK_MS);
  // PM-S5 net-reconnect: a closing tab leaves WITHOUT a bye (it may be back inside the window: the partner's game
  // shows WAITING FOR <name> and this page's record lets a fresh tab rejoin). A leave on purpose goes through
  // cancel() (BACK TO MENU, LEAVE, the arcade button), which does say bye.
  addEventListener('pagehide', () => {
    mm.suspend();
    m3.suspend();
  });
  const api: PitchNetApi = {
    selfId,
    quickMatch: () => {
      m3.cancel();
      mm.quickMatch();
    },
    friendHost: () => {
      m3.cancel();
      return mm.friendHost();
    },
    friendJoin: (code) => {
      if (isThreeCode(String(code))) {
        mm.cancel();
        m3.friendJoin(String(code));
      } else {
        m3.cancel();
        mm.friendJoin(String(code));
      }
    },
    cancel: () => {
      mm.cancel();
      m3.cancel();
    },
    status: () => JSON.stringify(three() ? m3.status() : mm.status()),
    // PM-S5 lag-research: an unreliable packet (the game's snapshots) takes the 1v1 fast lane
    send: (b64, reliable, to) =>
      three() ? m3.send(String(b64), Number(to) || 0) : reliable === false ? mm.sendUnreliable(String(b64)) : mm.send(String(b64)),
    poll: () => JSON.stringify(three() ? m3.poll() : mm.poll()),
    goArcade: () => {
      mm.cancel();
      m3.cancel();
      location.href = ARCADE_URL;
    },
    setBuild: (id) => {
      mm.build = String(id);
      m3.build = String(id);
    },
    friendHost3: () => {
      mm.cancel();
      return m3.friendHost();
    },
    quickMatch3: () => {
      mm.cancel();
      m3.quickMatch();
    },
    lock: () => m3.lock(),
    // PM-S5 net-reconnect (1v1; a three-sided room has no record yet)
    rejoin: () => {
      m3.cancel();
      return mm.rejoin();
    },
    resumeInfo: () => mm.resumeInfo(),
    clearResume: () => mm.clearResume(),
    setGame: (json) => mm.setGame(String(json)),
  };
  if (debug) api.blip = (ms) => (three() ? m3.blip(Number(ms) || 0) : mm.blip(Number(ms) || 0));
  // PM-S2 online2: the page (keepAlive.ts) says when this tab is in the background; the partner is told.
  api.setHidden = (hidden) => {
    mm.setHidden(Boolean(hidden));
    m3.setHidden(Boolean(hidden));
  };
  window.PitchNet = api;
  return api;
}
