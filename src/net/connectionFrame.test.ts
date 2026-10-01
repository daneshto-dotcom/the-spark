/**
 * SPARK — S189 fix round (audit NET-5/NET-6): the per-frame CONNECTION decision — the overlay state, the
 * reconnect retry, and the claim — is a pure function `main.ts` calls, so it is tested here rather than
 * only through a non-gating quarantine e2e.
 *
 * The first half drives `planConnectionFrame` frame by frame (16 ms), the way main.ts's ticker does. The
 * second half pins, mechanically, that main.ts's ONLY overlay/retry and claim decisions ARE these
 * functions: one call site each, and the retry is driven by the plan (so it cannot quietly move back
 * under the grace). A source guard proves a call exists; the first half proves what it decides.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  connectionEdge,
  planConnectionFrame,
  RECONNECT_FIRST_RETRY_DELAY_MS,
  RECONNECT_GRACE_MS,
  RECONNECT_RETRY_MS,
  type ConnectionFrameInput,
  type ConnectionFramePlan,
} from './reconnectPolicy.ts';

const MIGRATION_EXTRA_MS = 1500 * 4 + 5000; // CLAIM_LADDER_MS × MAX_PLAYERS + 5000, as main.ts passes

/** Run frames from 0 to `toMs`; `lost(t)` says whether peers are gone at t. Returns every plan. */
function run(o: {
  toMs: number;
  lost: (t: number) => boolean;
  isHost?: boolean;
  migrationCase?: (t: number) => boolean;
  peerCount?: number;
  /** ⭐ S191 — `stepMigrationClaim`'s claim clock as main.ts carries it (0 = not running). */
  claimSince?: (t: number) => number;
}): Array<{ t: number; plan: ConnectionFramePlan }> {
  const out: Array<{ t: number; plan: ConnectionFramePlan }> = [];
  let reconnectUntilMs = 0;
  let nextRetryMs = 0;
  for (let t = 1_000; t <= o.toMs; t += 16) {
    const input: ConnectionFrameInput = {
      nowMs: t,
      zombieDeposed: false,
      peersGone: o.lost(t),
      isHost: o.isHost ?? false,
      hasRoomCode: true,
      migrationCase: o.migrationCase?.(t) ?? false,
      peerCount: o.peerCount ?? 0,
      reconnectUntilMs,
      nextRetryMs,
      migrationExtraMs: MIGRATION_EXTRA_MS,
      claimClockSinceMs: o.claimSince?.(t) ?? 0,
    };
    const plan = planConnectionFrame(input);
    reconnectUntilMs = plan.reconnectUntilMs;
    nextRetryMs = plan.nextRetryMs;
    out.push({ t, plan });
  }
  return out;
}

describe('S189 fix round — planConnectionFrame, frame by frame', () => {
  it('a client that loses its peers: RECONNECTING through the grace, then TERMINAL — and retries on both sides of it', () => {
    const frames = run({ toMs: 60_000, lost: (t) => t >= 5_000 });
    const lossAt = frames.find((f) => f.t >= 5_000)!.t;
    const retries = frames.filter((f) => f.plan.retry).map((f) => f.t - lossAt);
    expect(retries[0]).toBeGreaterThanOrEqual(RECONNECT_FIRST_RETRY_DELAY_MS);
    expect(retries[1]! - retries[0]!).toBeGreaterThanOrEqual(RECONNECT_RETRY_MS);
    expect(retries.some((d) => d > RECONNECT_GRACE_MS), 'the loop keeps trying past the grace (C4)').toBe(true);
    const at = (d: number) => frames.find((f) => f.t >= lossAt + d)!.plan.overlay.kind;
    expect(at(1_000)).toBe('reconnecting');
    expect(at(RECONNECT_GRACE_MS + 100)).toBe('terminal');
  });

  it('peers come back → the overlay hides and the next loss starts a FRESH grace', () => {
    const frames = run({ toMs: 80_000, lost: (t) => (t >= 5_000 && t < 25_000) || t >= 40_000 });
    expect(frames.find((f) => f.t >= 26_000)!.plan.overlay.kind).toBe('hidden');
    expect(frames.find((f) => f.t >= 41_000)!.plan.overlay.kind).toBe('reconnecting');
  });

  it('NEGATIVE — a HOST never retries (its clients rejoin it); it only waits, then shows terminal', () => {
    const frames = run({ toMs: 40_000, lost: (t) => t >= 5_000, isHost: true });
    expect(frames.some((f) => f.plan.retry)).toBe(false);
    expect(frames[frames.length - 1]!.plan.overlay.kind).toBe('terminal');
  });

  it('NEGATIVE — the MIGRATION case never tears the mesh down and shows MIGRATING until its deadline', () => {
    const frames = run({ toMs: 60_000, lost: (t) => t >= 5_000, migrationCase: () => true, peerCount: 2 });
    expect(frames.some((f) => f.plan.retry)).toBe(false);
    const lossAt = frames.find((f) => f.t >= 5_000)!.t;
    expect(frames.find((f) => f.t >= lossAt + RECONNECT_GRACE_MS + 1_000)!.plan.overlay.kind).toBe('migrating');
    const end = frames.find((f) => f.t >= lossAt + RECONNECT_GRACE_MS + MIGRATION_EXTRA_MS + 100)!.plan.overlay;
    expect(end).toEqual({ kind: 'terminal', cause: 'migrationDeadline', retrying: false, waitingForPeers: false });
  });

  /*
   * ⭐ S191 NETFR-3 (a) — the MIGRATING window is anchored on the CLAIM CLOCK when that starts later than the
   * loss. After our own transport loss the claim clock now starts only when a survivor is visible without
   * the host (B's leg lands at 25 s), so a window anchored on the loss (10 s → 25 + 11 = 36 s) went TERMINAL
   * at 36 s and then flipped to hidden when the claim landed at 41.5 s. Anchored on the claim clock it
   * stays MIGRATING through the claim.
   */
  it('⛔ NETFR-3 — B lands at 25 s after our loss at 10 s: MIGRATING (never terminal) right through the claim at 25 + grace + rung', () => {
    const B = 25_000;
    const frames = run({
      toMs: 60_000,
      lost: (t) => t >= 10_000,
      migrationCase: (t) => t >= B,
      peerCount: 1,
      claimSince: (t) => (t >= B ? B : 0),
    });
    const claimAt = B + RECONNECT_GRACE_MS + 1500; // rung 1
    const between = frames.filter((f) => f.t >= B && f.t <= claimAt + 100);
    expect(between.length).toBeGreaterThan(0);
    for (const f of between) expect(f.plan.overlay.kind, `frame at ${f.t} ms`).toBe('migrating');
    expect(frames.some((f) => f.plan.retry && f.t >= B)).toBe(false); // still never tears the mesh down
    const end = frames.find((f) => f.t >= B + RECONNECT_GRACE_MS + MIGRATION_EXTRA_MS + 100)!.plan.overlay;
    expect(end).toEqual({ kind: 'terminal', cause: 'migrationDeadline', retrying: false, waitingForPeers: false });
  });

  it('NEGATIVE — a claim clock that started WITH the loss (or earlier) leaves the window exactly as it was', () => {
    for (const since of [5_000, 3_000]) {
      const frames = run({ toMs: 60_000, lost: (t) => t >= 5_000, migrationCase: () => true, peerCount: 2, claimSince: (t) => (t >= since ? since : 0) });
      const lossAt = frames.find((f) => f.t >= 5_000)!.t;
      expect(frames.find((f) => f.t >= lossAt + RECONNECT_GRACE_MS + MIGRATION_EXTRA_MS - 100)!.plan.overlay.kind).toBe('migrating');
      expect(frames.find((f) => f.t >= lossAt + RECONNECT_GRACE_MS + MIGRATION_EXTRA_MS + 100)!.plan.overlay.kind).toBe('terminal');
    }
  });
});

describe('S189 fix round — main.ts decides through these functions (mechanical)', () => {
  const src = readFileSync(new URL('../main.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('ONE planConnectionFrame( call, and the reconnect happens only when the plan says retry', () => {
    expect(src.match(/planConnectionFrame\(/g)?.length).toBe(1);
    expect(src, 'the retry decision must come from the plan, not a direct call').not.toMatch(/reconnectRetryDue\(/);
    const at = src.indexOf('if (connectionPlan.retry');
    expect(at, 'main.ts must branch on the plan').toBeGreaterThan(-1);
    const block = src.slice(at, at + 400);
    expect(block).toContain('connectAsClient(clientJoinDeps, session.roomCode)');
  });

  it('ONE stepMigrationClaim( call, and the claim body runs only when the step says claim', () => {
    expect(src.match(/stepMigrationClaim\(/g)?.length).toBe(1);
    expect(src).toContain('if (claimStep.claim)');
    expect(src, 'the old inline gate must not survive beside the step').not.toMatch(/hasSurvivorToHostFor\(/);
  });

  it('⛔ S191 WIRE-3 — BOTH sites count SEATED survivors: the claim input and migrationCase', () => {
    // S192 ROUND-2 — the migrationCase site now goes through `isMigrationCase` (which calls seatedSurvivors
    // whenever a roster exists; migrationCaseRoster.test.ts pins both branches), so main.ts has ONE direct call.
    expect(src.match(/seatedSurvivors\(/g)?.length, 'the claim input calls it directly').toBe(1);
    const step = src.indexOf('stepMigrationClaim(');
    expect(src.slice(step, step + 300)).toMatch(/seatedSurvivorIds: seatedSurvivors\(session\.lastRoster, alivePeers, trysteroSelfId, session\.hostPeerId\),/);
    const mc = src.indexOf('const migrationCase =');
    const expr = src.slice(mc, src.indexOf(';', mc));
    expect(expr).toContain('isMigrationCase({');
    expect(expr).toContain('roster: session.lastRoster,');
    expect(expr, 'a stray must not keep migrationCase true').not.toContain('peerCount()');
  });

  it('⭐ S191 NETFR-3 — the plan reads the claim clock the step wrote THIS frame (the step runs first)', () => {
    const step = src.indexOf('migrationLossObservedAtMs = claimStep.lossObservedAtMs;');
    const plan = src.indexOf('planConnectionFrame(');
    expect(step).toBeGreaterThan(-1);
    expect(plan, 'the claim step must run before the connection plan in the frame').toBeGreaterThan(step);
    expect(src.slice(plan, plan + 900)).toMatch(/claimClockSinceMs: migrationLossObservedAtMs,/);
  });
});

describe('S189 fix round (audit NET-5) — the overlay edge says what actually happened', () => {
  const src = readFileSync(new URL('../main.ts', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  it('terminal → hidden while still in the networked match = RESTORED (a peer is back)', () => {
    expect(connectionEdge({ wasLost: true, isLost: false, stillInMatch: true })).toBe('restored');
  });
  it('⛔ terminal → hidden because the player pressed Return to Title = DISMISSED, never "restored"', () => {
    expect(connectionEdge({ wasLost: true, isLost: false, stillInMatch: false })).toBe('dismissed');
  });
  it('the LOST edge, and NEGATIVE — no edge, no line', () => {
    expect(connectionEdge({ wasLost: false, isLost: true, stillInMatch: true })).toBe('lost');
    expect(connectionEdge({ wasLost: true, isLost: true, stillInMatch: true })).toBeNull();
    expect(connectionEdge({ wasLost: false, isLost: false, stillInMatch: false })).toBeNull();
  });
  it('main.ts logs through it: RESTORED only on the restored edge, a dismissal has its own line', () => {
    expect(src.match(/connectionEdge\(/g)?.length).toBe(1);
    const restored = src.indexOf("CONNECTION RESTORED after the terminal overlay");
    expect(restored).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, restored - 120), restored)).toContain("edge === 'restored'");
    expect(src).toContain('[net] terminal overlay dismissed');
    // The one-line stillInMatch input is the networked-PLAYING-with-a-transport test, not peer presence.
    expect(src).toMatch(/stillInMatch:\s*isNetworked\(world\)\s*&&\s*world\.gameState === 'PLAYING'\s*&&\s*session\.netTransport !== null/);
  });
});

/*
 * ⛔ S192 SEAM-1 (audit wf_0593f6fe-d53, MED) — THE TERMINAL OVERLAY SAID "return to title to retry" WHILE THE
 * C4 LOOP KEPT RETRYING BEHIND IT FOR 180 s. A player who did what the screen said pressed Return to Title,
 * which tears the session down and ends the retry — and 4 of 7 measured hard-blip recoveries landed AFTER the
 * terminal overlay showed (21.0 / 29.1 / 29.2 / 30.7 s). The terminal plan now says whether this seat is still
 * retrying (a client) or still waiting for its peers to come back (a host), and the overlay picks its line.
 */
describe('S192 SEAM-1 — the terminal plan says whether the loop is still working', () => {
  const GIVE_UP_MS = 180_000;
  it('⛔ a client past the grace: terminal, retrying=true until the give-up, then false', () => {
    const frames = run({ toMs: 5_000 + GIVE_UP_MS + 2_000, lost: (t) => t >= 5_000 });
    const lossAt = frames.find((f) => f.t >= 5_000)!.t;
    const at = (d: number) => frames.find((f) => f.t >= lossAt + d)!.plan.overlay;
    expect(at(RECONNECT_GRACE_MS + 100)).toEqual({ kind: 'terminal', cause: 'peerCount0', retrying: true, waitingForPeers: false });
    expect(at(GIVE_UP_MS - 100)).toMatchObject({ kind: 'terminal', retrying: true });
    expect(at(GIVE_UP_MS + 100)).toEqual({ kind: 'terminal', cause: 'peerCount0', retrying: false, waitingForPeers: false });
    // The flag agrees with the loop: no retry fires once it says false.
    expect(frames.some((f) => f.t >= lossAt + GIVE_UP_MS + 100 && f.plan.retry)).toBe(false);
  });

  it('⛔ a host: terminal, waitingForPeers=true until the give-up (its clients are still retrying), then false', () => {
    const frames = run({ toMs: 5_000 + GIVE_UP_MS + 2_000, lost: (t) => t >= 5_000, isHost: true });
    const lossAt = frames.find((f) => f.t >= 5_000)!.t;
    const at = (d: number) => frames.find((f) => f.t >= lossAt + d)!.plan.overlay;
    expect(at(RECONNECT_GRACE_MS + 100)).toEqual({ kind: 'terminal', cause: 'peerCount0', retrying: false, waitingForPeers: true });
    expect(at(GIVE_UP_MS + 100)).toEqual({ kind: 'terminal', cause: 'peerCount0', retrying: false, waitingForPeers: false });
  });

  it('NEGATIVE — the migration deadline and a zombie-deposed seat are terminal with neither flag (nothing is retrying)', () => {
    const frames = run({ toMs: 60_000, lost: (t) => t >= 5_000, migrationCase: () => true, peerCount: 2 });
    expect(frames[frames.length - 1]!.plan.overlay).toEqual({ kind: 'terminal', cause: 'migrationDeadline', retrying: false, waitingForPeers: false });
    const z = planConnectionFrame({
      nowMs: 10_000, zombieDeposed: true, peersGone: true, isHost: false, hasRoomCode: false, migrationCase: false,
      peerCount: 0, reconnectUntilMs: 0, nextRetryMs: 0, migrationExtraMs: MIGRATION_EXTRA_MS, claimClockSinceMs: 0,
    });
    expect(z.overlay).toEqual({ kind: 'terminal', cause: 'zombieDeposed', retrying: false, waitingForPeers: false });
  });

  it('main.ts hands the terminal plan to the overlay (not the old setReconnecting(false) path)', () => {
    const src = readFileSync(new URL('../main.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(src).toContain('lobbyScreen.setConnectionLostTerminal(overlay.retrying, overlay.waitingForPeers);');
    expect(src).not.toContain('setConnectionLostReconnecting(false)');
  });
});
