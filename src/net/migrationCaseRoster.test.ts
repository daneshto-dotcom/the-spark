/**
 * ⛔ S192 ROUND-2 (audit wf_de15cae4-4a8, LOW) — WIRE-3 made `migrationCase` ALWAYS false for a client with
 * no Begin roster, and every deposed original host that rejoined as a client is one: `lastRoster` is written
 * only from a START_GAME_SIGNAL received in LOBBY, which the host path never sees. So when its successor was
 * lost it tore its live mesh down every 8 s (the auditor's probe: disconnect + rejoin at 1008 / 9008 / 17008 /
 * 25008 ms) instead of waiting for the next claim, as S125 v2 did (`peerCount() > 0`).
 * The fix is the auditor's option (a): no roster → any transport peer; a roster → a SEATED survivor (WIRE-3).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isMigrationCase, planConnectionFrame, RECONNECT_GRACE_MS } from './reconnectPolicy.ts';

const rosterOf = (ids: string[]) => ids.map((peerId, seat) => ({ seat, peerId, color: 0 }));
const base = { isHost: false, hasWarrant: true, selfPeerId: 'me', hostPeerId: 'B' };

describe('S192 ROUND-2 — the migration case for a seat with no Begin roster', () => {
  it('⛔ a deposed ex-host (no roster, warrant kept) whose successor B is lost, C still connected → the migration case', () => {
    expect(isMigrationCase({ ...base, roster: null, transportPeerIds: ['C'] })).toBe(true);
  });

  it('⛔ REACH (the loop, frame by frame): that seat never tears its mesh down — no retry in 40 s', () => {
    let reconnectUntilMs = 0;
    let nextRetryMs = 0;
    const retries: number[] = [];
    for (let t = 1_000; t <= 41_000; t += 16) {
      const plan = planConnectionFrame({
        nowMs: t, zombieDeposed: false, peersGone: true, isHost: false, hasRoomCode: true,
        migrationCase: isMigrationCase({ ...base, roster: null, transportPeerIds: ['C'] }),
        peerCount: 1, reconnectUntilMs, nextRetryMs, migrationExtraMs: 11_000, claimClockSinceMs: 0,
      });
      reconnectUntilMs = plan.reconnectUntilMs;
      nextRetryMs = plan.nextRetryMs;
      if (plan.retry) retries.push(t);
      if (t < 1_000 + RECONNECT_GRACE_MS) expect(plan.overlay.kind).toBe('migrating');
    }
    expect(retries, 'every retry disconnects the live mesh the next claim would arrive on').toEqual([]);
  });

  it('NEGATIVE — no roster and nobody on the transport → not the migration case (it reconnects)', () => {
    expect(isMigrationCase({ ...base, roster: null, transportPeerIds: [] })).toBe(false);
  });

  it('NEGATIVE — WIRE-3 kept for a seat WITH a roster: a stray is nobody to wait with, a seated survivor is', () => {
    expect(isMigrationCase({ ...base, hostPeerId: 'host', roster: rosterOf(['host', 'me']), transportPeerIds: ['stray'] })).toBe(false);
    expect(isMigrationCase({ ...base, hostPeerId: 'host', roster: rosterOf(['host', 'me', 'C']), transportPeerIds: ['C', 'stray'] })).toBe(true);
  });

  it('NEGATIVE — a host, an unwarranted seat, or no transport is never the migration case', () => {
    expect(isMigrationCase({ ...base, isHost: true, roster: null, transportPeerIds: ['C'] })).toBe(false);
    expect(isMigrationCase({ ...base, hasWarrant: false, roster: null, transportPeerIds: ['C'] })).toBe(false);
    expect(isMigrationCase({ ...base, roster: null, transportPeerIds: null })).toBe(false);
  });

  it('main.ts decides migrationCase through isMigrationCase, once (mechanical)', () => {
    const src = readFileSync(new URL('../main.ts', import.meta.url), 'utf8')
      .replace(/\r\n/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(src.match(/isMigrationCase\(/g)?.length).toBe(1);
    expect(src).toMatch(/const migrationCase = isMigrationCase\(\{[^}]*roster: session\.lastRoster,/);
  });
});
