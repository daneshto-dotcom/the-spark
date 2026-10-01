/**
 * ⭐ S192 FIX-2 — OWNER RULING (S191 PDR §0): *"if a host quits, then the next player who … was in line
 * becomes the hosts … if the same player rejoins the game, he's not player one anymore. He's like player
 * three … It should be dynamic like that."*
 *
 * The audit case (S191 FIX-2, wf_0593f6fe-d53): a 3-seat match, host H, clients A and B. H quits (exit →
 * teardownNet → title → Host). His room code is fixed per page load, so he re-hosts the SAME room within
 * ~15 s + rung — and his new transport joins the room A and B are still meshed in. `hostLost` went false,
 * the MIGRATING overlay hid, the claim clock reset, and A and B sat on a frozen board with no overlay while
 * H's lobby presence (phase LOBBY) was stamped and ignored (only a PENDING rejoin consults it).
 *
 * Now a followed host that PROVES it left our match — a LOBBY_PRESENCE in phase LOBBY, or a presence /
 * snapshot of another match (`classifyHostMessage` → 'lobby' | 'new-match') — is latched as DEPARTED
 * (`NetSession.hostDepartedPeerId`) and is not "here" for this match any more: not for the claim
 * (`stepMigrationClaim`), not for the overlay, not for a survivor's acceptance of the successor's claim.
 * The next in line claims at the ordinary ladder time. Only with nobody to host for (a 1v1) does the
 * proof still send a pending rejoiner to title, as before.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CLAIM_LADDER_MS, HOST_STARVATION_MS } from './succession.ts';
import {
  RECONNECT_GRACE_MS,
  isMigrationCase,
  matchPeerIds,
  observesHostLoss,
  seatedSurvivors,
  stepMigrationClaim,
} from './reconnectPolicy.ts';

const ROSTER = [
  { seat: 0, peerId: 'H', color: 0 },
  { seat: 1, peerId: 'me', color: 0 },
  { seat: 2, peerId: 'B', color: 0 },
];

/** A's view, frame by frame: H quits at `quitAt`, re-hosts the same room at `backAt` (in a LOBBY). */
function firstClaim(o: { quitAt: number; backAt: number; departedFrom: number | null; ladderDelayMs: number }): number | null {
  let obs = 0;
  let hostAbsentStart = false;
  for (let t = 10_000; t <= 120_000; t += 16) {
    const transport = ['B', ...(t < o.quitAt || t >= o.backAt ? ['H'] : [])];
    const departed = o.departedFrom !== null && t >= o.departedFrom ? 'H' : null;
    const alive = new Set(matchPeerIds(transport, departed));
    const r = stepMigrationClaim({
      nowMs: t, hostPeerId: 'H', alivePeerIds: alive,
      seatedSurvivorIds: seatedSurvivors(ROSTER, alive, 'me', 'H'),
      // H's lobby sends no snapshots: the last one is from just before the quit.
      lastAcceptedAtMs: o.quitAt - 50,
      hostPresentSinceMs: t >= o.backAt ? o.backAt : 0,
      starvationMs: HOST_STARVATION_MS, graceMs: RECONNECT_GRACE_MS,
      ladderDelayMs: o.ladderDelayMs, lossObservedAtMs: obs, clockStartedHostAbsent: hostAbsentStart,
    });
    obs = r.lossObservedAtMs;
    hostAbsentStart = r.clockStartedHostAbsent;
    if (r.claim) return t;
  }
  return null;
}

describe('S192 FIX-2 — a host that quits is replaced by the next in line, even if he re-hosts the same room', () => {
  const QUIT = 20_000;
  const BACK = 28_000; // H's new lobby transport lands inside the 15 s grace
  const PRESENCE = 28_200; // …and says phase LOBBY on the peer join

  it('BEFORE (documents the audit case): without the latch the returning lobby host RESETS the clock', () => {
    const at = firstClaim({ quitAt: QUIT, backAt: BACK, departedFrom: null, ladderDelayMs: 0 });
    // The claim only comes from D4 starvation counted from H's RETURN: back + 6 s + grace — not from the quit.
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThanOrEqual(BACK + HOST_STARVATION_MS + RECONNECT_GRACE_MS);
  });

  /*
   * ⚠ MINE (timing) — the frames between H's transport landing and his presence arriving see a host that
   * is back and not yet starved, so the clock resets there (the NET-4 rule: a returning host is not taken
   * over before it can speak). The proof then restarts it, so the claim lands at PROOF + grace + rung —
   * the ordinary ladder from the moment the host said he left. Skipping the grace on a positive proof
   * would be faster; it is not built (an unruled timing change, and the grace is what lets every
   * survivor's proof arrive before the ladder fires).
   */
  it('⛔ the next in line (rank 0) claims at proof + grace — H back in a lobby no longer stalls it on D4', () => {
    const at = firstClaim({ quitAt: QUIT, backAt: BACK, departedFrom: PRESENCE, ladderDelayMs: 0 });
    expect(at).not.toBeNull();
    expect(at! - PRESENCE).toBeGreaterThanOrEqual(RECONNECT_GRACE_MS);
    expect(at! - PRESENCE).toBeLessThan(RECONNECT_GRACE_MS + 32);
    expect(at!, 'earlier than the D4 path it used to wait for').toBeLessThan(BACK + HOST_STARVATION_MS + RECONNECT_GRACE_MS);
  });

  it('…and rank 1 keeps its rung behind it (the line order is unchanged)', () => {
    const at = firstClaim({ quitAt: QUIT, backAt: BACK, departedFrom: PRESENCE, ladderDelayMs: CLAIM_LADDER_MS });
    expect(at! - PRESENCE).toBeGreaterThanOrEqual(RECONNECT_GRACE_MS + CLAIM_LADDER_MS);
    expect(at! - PRESENCE).toBeLessThan(RECONNECT_GRACE_MS + CLAIM_LADDER_MS + 32);
  });

  it('a proof that arrives while H is still GONE from our transport keeps the clock from the quit', () => {
    // The latch lands before H's transport does here (control messages ride every strategy, so one can beat
    // the other): the excluded host never "returns", and the clock that started at the quit runs on.
    const at = firstClaim({ quitAt: QUIT, backAt: BACK, departedFrom: BACK - 500, ladderDelayMs: 0 });
    expect(at! - QUIT).toBeGreaterThanOrEqual(RECONNECT_GRACE_MS);
    expect(at! - QUIT).toBeLessThan(RECONNECT_GRACE_MS + 32);
  });

  it('matchPeerIds drops ONLY the departed followed host', () => {
    expect(matchPeerIds(['H', 'B', 'x'], 'H')).toEqual(['B', 'x']);
    expect(matchPeerIds(['H', 'B'], null)).toEqual(['H', 'B']);
  });

  it('⛔ a survivor ACCEPTS the successor\'s claim while H sits in his lobby on our transport (fed, not starved)', () => {
    const base = { hostPeerId: 'H', alivePeerIds: new Set(['H', 'A']), lastAcceptedAtMs: 29_000, nowMs: 30_000, starvationMs: HOST_STARVATION_MS };
    expect(observesHostLoss({ ...base, hostDepartedPeerId: null }), 'without the latch the claim is rejected').toBe(false);
    expect(observesHostLoss({ ...base, hostDepartedPeerId: 'H' })).toBe(true);
    // The pre-existing two reasons are unchanged.
    expect(observesHostLoss({ ...base, alivePeerIds: new Set(['A']), hostDepartedPeerId: null })).toBe(true);
    expect(observesHostLoss({ ...base, lastAcceptedAtMs: 20_000, hostDepartedPeerId: null })).toBe(true);
    // A latch for a host we no longer follow (we accepted a successor) proves nothing about the new one.
    expect(observesHostLoss({ ...base, hostPeerId: 'A', hostDepartedPeerId: 'H' })).toBe(false);
  });

  it('a PENDING rejoiner with a seated survivor follows the migration instead of going to title; with none, title as before', () => {
    const view = (ids: string[]) => isMigrationCase({
      isHost: false, hasWarrant: true, roster: ROSTER, transportPeerIds: matchPeerIds(ids, 'H'), selfPeerId: 'me', hostPeerId: 'H',
    });
    expect(view(['H', 'B'])).toBe(true);
    expect(view(['H'])).toBe(false);
  });
});

describe('S192 FIX-2 — main.ts and clientHandlers wire the latch (mechanical)', () => {
  const strip = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const main = strip('../main.ts');
  const ch = strip('./clientHandlers.ts');

  // ⛔ S192 audit A1 — the latch moved from main.ts's onHostSignal (every signal) into clientHandlers, gated
  // by departureProofOf + shouldLatchDeparture (departureLatch.test.ts drives it through the real route).
  it('a departure proof latches the followed host as departed (clientHandlers, gated)', () => {
    expect(ch).toMatch(/departureProofOf\(hostMsg\) &&[\s\S]{0,200}shouldLatchDeparture\(/);
    expect(ch).toContain('deps.session.hostDepartedPeerId = deps.session.hostPeerId;');
  });

  it('every host-presence read in the frame goes through matchPeerIds (claim, presence stamp, hostLost, migrationCase)', () => {
    expect(main).toContain('const matchPeers = matchPeerIds(session.netTransport?.peerIds() ?? [], session.hostDepartedPeerId);');
    expect(main).toMatch(/const alivePeers = new Set\(matchPeerIds\(session\.netTransport\.peerIds\(\), session\.hostDepartedPeerId\)\);/);
    expect(main).toMatch(/hostPresence = stepHostPresence\([\s\S]{0,200}matchPeerIds\(session\.netTransport\.peerIds\(\), session\.hostDepartedPeerId\)\.includes\(session\.hostPeerId\)/);
    expect(main).toMatch(/const hostLost = [\s\S]{0,160}!matchPeers\.includes\(session\.hostPeerId\);/);
    expect(main).toMatch(/\(matchPeers\.length === 0 \|\| hostLost\)/);
    expect(main).toMatch(/transportPeerIds: session\.netTransport === null \? null : matchPeers,/);
  });

  it('the moved-on verdict sends to title only when there is nobody to wait with', () => {
    const at = main.indexOf('if (movedOn !== null');
    expect(at).toBeGreaterThan(-1);
    expect(main.slice(at, at + 200)).toContain('!movedOnHasSuccessor');
  });

  it('the latch dies with the match (cleared outside PLAYING) and with the session (teardownNet)', () => {
    const at = main.indexOf("if (!(isNetworked(world) && !world.isHost && world.gameState === 'PLAYING')) {");
    expect(main.slice(at, at + 300)).toContain('session.hostDepartedPeerId = null;');
    expect(strip('./session.ts')).toMatch(/session\.hostDepartedPeerId = null;/);
  });

  it("clientHandlers' claim gate decides host loss through observesHostLoss", () => {
    expect(ch).toMatch(/const hostGone = observesHostLoss\(\{[\s\S]{0,300}hostDepartedPeerId: sess\.hostDepartedPeerId,/);
  });
});
