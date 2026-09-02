/**
 * SPARK — S158 B1: the matchmaking-relay half of the connection self-test.
 *
 * The owner's puzzle in one line: two machines, one room, one router — one reached Israel and one
 * could neither FIND a quickmatch nor JOIN with a code. Same NAT, so it is not TURN. The layer both
 * symptoms share is the matchmaking relays, and the S158 P1 self-test could not see them.
 *
 * As with `iceProbe`, the pure half carries every judgement and therefore every test; the impure
 * half is driven through an injected fake socket, so nothing here touches the network.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  probeRelays,
  RELAY_VERDICT,
  type RelayProbeResult,
  type SocketFactory,
  summarizeRelays,
} from './relayProbe.ts';

function result(over: Partial<RelayProbeResult> = {}): RelayProbeResult {
  return { reachable: 3, attempted: 3, unreachable: [], ...over };
}

describe('summarizeRelays — the verdict', () => {
  it('all answered ⇒ OK', () => {
    const v = summarizeRelays(result());
    expect(v.ok).toBe(true);
    expect(v.headline).toBe(RELAY_VERDICT.OK);
  });

  it('⭐ ZERO answered ⇒ the loud one, and it names the two-machine case explicitly', () => {
    const v = summarizeRelays(result({ reachable: 0, unreachable: ['wss://a', 'wss://b', 'wss://c'] }));
    expect(v.ok).toBe(false);
    expect(v.headline).toBe(RELAY_VERDICT.NONE);
    // The sentence that turns this from a diagnostic into an answer for the owner's actual question.
    expect(v.detail).toContain('SAME network');
  });

  it('⭐ SOME answered is still OK — one relay is enough, and saying so avoids a false alarm', () => {
    const v = summarizeRelays(result({ reachable: 1, attempted: 7, unreachable: ['wss://x'] }));
    expect(v.ok, 'a player with one working relay has no problem to hunt').toBe(true);
    expect(v.headline).toBe(RELAY_VERDICT.DEGRADED);
    expect(v.detail).toContain('1 of 7');
  });

  it('lists WHICH relays did not answer, so two machines can be compared line by line', () => {
    const v = summarizeRelays(result({ reachable: 1, attempted: 3, unreachable: ['wss://a', 'wss://b'] }));
    expect(v.detail).toContain('wss://a, wss://b');
  });

  it('CONTROL — the three verdicts are three distinct strings', () => {
    const seen = new Set([
      summarizeRelays(result()).headline,
      summarizeRelays(result({ reachable: 1, attempted: 3, unreachable: ['x'] })).headline,
      summarizeRelays(result({ reachable: 0, unreachable: ['x'] })).headline,
    ]);
    expect(seen.size).toBe(3);
  });
});

// ── the impure half, driven through fake sockets ─────────────────────────────────────────────────

interface FakeWs {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  close: () => void;
  closed: boolean;
}

/** `behave` decides, per url, whether that socket opens, errors, or stays silent. */
function fakeFactory(behave: (url: string) => 'open' | 'error' | 'silent') {
  const made: FakeWs[] = [];
  const factory = ((url: string) => {
    const ws: FakeWs = {
      onopen: null,
      onerror: null,
      close: () => {
        ws.closed = true;
      },
      closed: false,
    };
    made.push(ws);
    queueMicrotask(() => {
      const how = behave(url);
      if (how === 'open') ws.onopen?.();
      else if (how === 'error') ws.onerror?.();
    });
    return ws as unknown as WebSocket;
  }) as SocketFactory;
  return { factory, made };
}

describe('probeRelays — counting, without a network', () => {
  it('counts the ones that answer and names the ones that do not', async () => {
    const { factory } = fakeFactory((u) => (u === 'wss://good' ? 'open' : 'error'));
    const r = await probeRelays(['wss://good', 'wss://bad'], factory);
    expect(r.reachable).toBe(1);
    expect(r.attempted).toBe(2);
    expect(r.unreachable).toEqual(['wss://bad']);
  });

  it('⭐ resolves with PARTIAL counts when a relay never answers at all', async () => {
    vi.useFakeTimers();
    try {
      const { factory } = fakeFactory((u) => (u === 'wss://good' ? 'open' : 'silent'));
      const p = probeRelays(['wss://good', 'wss://hangs'], factory, 50);
      await vi.advanceTimersByTimeAsync(60);
      const r = await p;
      expect(r.reachable).toBe(1);
      expect(r.unreachable).toEqual(['wss://hangs']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('⛔ ALWAYS closes every socket — the button gets pressed repeatedly while comparing machines', async () => {
    const { factory, made } = fakeFactory(() => 'open');
    await probeRelays(['wss://a', 'wss://b', 'wss://c'], factory);
    expect(made).toHaveLength(3);
    expect(made.every((w) => w.closed)).toBe(true);
  });

  it('a constructor that THROWS is an unreachable relay, not a crash', async () => {
    const factory = ((url: string) => {
      if (url === 'wss://blocked') throw new Error('policy');
      const ws: FakeWs = { onopen: null, onerror: null, close: () => {}, closed: false };
      queueMicrotask(() => ws.onopen?.());
      return ws as unknown as WebSocket;
    }) as SocketFactory;
    const r = await probeRelays(['wss://blocked', 'wss://fine'], factory);
    expect(r.reachable).toBe(1);
    expect(r.unreachable).toEqual(['wss://blocked']);
  });

  it('an empty list resolves rather than hanging on a promise nobody settles', async () => {
    const { factory } = fakeFactory(() => 'open');
    const r = await probeRelays([], factory);
    expect(r).toEqual({ reachable: 0, attempted: 0, unreachable: [] });
  });
});
