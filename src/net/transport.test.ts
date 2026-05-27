/**
 * Unit tests for NetTransport pure helpers + onError wiring.
 *
 * S20 P0 introduced two surfaces worth unit-testing without spinning up a
 * real Trystero room:
 *   1. `classifyJoinError(raw)` — pure substring classifier mapping
 *      Trystero's `onJoinError.details.error` to a user-friendly UX hint.
 *   2. `NetTransport.onError` plumbing — public field defaults to null,
 *      emitError dispatches to the handler when set.
 *
 * No Trystero room is constructed in these tests; the `send()`/`connect()`
 * happy paths require a live network and are validated via production
 * playtest (Council R1 CHECK phase).
 */

import { describe, it, expect } from 'vitest';
import { classifyJoinError, detectProtocolMismatch, NetTransport } from './transport.ts';
import { formatProtocolMismatchMessage } from './hostHandlers.ts';
import { PROTOCOL_VERSION } from './protocol.ts';
import { asPlayerId } from '../types.ts';

describe('classifyJoinError', () => {
  it('maps timeout-flavored errors to the "try again" hint', () => {
    expect(classifyJoinError('handshake timeout after 30000ms')).toMatch(/Signaling timeout/);
    expect(classifyJoinError('TIMEOUT')).toMatch(/Signaling timeout/);
    expect(classifyJoinError('relay timeout')).toMatch(/Signaling timeout/);
  });

  it('maps rejection-flavored errors to the "check room code" hint', () => {
    expect(classifyJoinError('peer rejected handshake')).toMatch(/Connection rejected/);
    expect(classifyJoinError('Invalid room')).toMatch(/Connection rejected/);
    expect(classifyJoinError('denied by relay')).toMatch(/Connection rejected/);
  });

  it('falls back to raw "Signaling: ${err}" for unrecognized errors', () => {
    expect(classifyJoinError('unexpected network error')).toBe('Signaling: unexpected network error');
    expect(classifyJoinError('')).toBe('Signaling: ');
  });

  it('always embeds the raw error text for diagnostic value', () => {
    const raw = 'WebSocket close code 1006';
    expect(classifyJoinError(raw)).toContain(raw);
  });
});

describe('NetTransport.onError plumbing', () => {
  it('defaults onError to null after construction', () => {
    const t = new NetTransport();
    expect(t.onError).toBeNull();
  });

  it('peerCount() returns 0 on a fresh, unconnected transport', () => {
    const t = new NetTransport();
    expect(t.peerCount()).toBe(0);
  });

  it('isConnected() returns false on a fresh, unconnected transport', () => {
    const t = new NetTransport();
    expect(t.isConnected()).toBe(false);
  });

  it('send() throws if called before connect()', () => {
    const t = new NetTransport();
    expect(() => t.send({ kind: 'ENDGAME', winnerId: asPlayerId(0) })).toThrowError(/not connected/);
  });

  it('disconnect() is a no-op on a fresh transport (idempotent)', () => {
    const t = new NetTransport();
    expect(() => t.disconnect()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// S53 P1 — Protocol-mismatch detection + UX
// ─────────────────────────────────────────────────────────────────────────

describe('detectProtocolMismatch (S53 P1 pure helper)', () => {
  it('returns {mismatch:false} for a HELLO with matching protoVersion', () => {
    const result = detectProtocolMismatch({
      kind: 'HELLO',
      playerId: 0,
      color: 0xff0000,
      protoVersion: PROTOCOL_VERSION,
    });
    expect(result).toEqual({ mismatch: false });
  });

  it('returns {mismatch:true, version:2} for a HELLO with older protoVersion', () => {
    const result = detectProtocolMismatch({
      kind: 'HELLO',
      playerId: 0,
      color: 0xff0000,
      protoVersion: 2,
    });
    expect(result).toEqual({ mismatch: true, version: 2 });
  });

  it('returns {mismatch:true, version:99} for a HELLO with newer protoVersion', () => {
    const result = detectProtocolMismatch({
      kind: 'HELLO',
      playerId: 0,
      color: 0xff0000,
      protoVersion: 99,
    });
    expect(result).toEqual({ mismatch: true, version: 99 });
  });

  it('returns {mismatch:true, version:undefined} for HELLO with missing protoVersion (Gemini #4 loosened predicate)', () => {
    const result = detectProtocolMismatch({
      kind: 'HELLO',
      playerId: 0,
      color: 0xff0000,
    });
    expect(result.mismatch).toBe(true);
    if (result.mismatch) expect(result.version).toBeUndefined();
  });

  it('returns {mismatch:true, version:"2"} for HELLO with wrong-type protoVersion (loosened predicate)', () => {
    const result = detectProtocolMismatch({
      kind: 'HELLO',
      protoVersion: '2',
    });
    expect(result).toEqual({ mismatch: true, version: '2' });
  });

  it('returns {mismatch:false} for non-HELLO messages (INTENT/NETSNAPSHOT/etc)', () => {
    expect(
      detectProtocolMismatch({ kind: 'INTENT', intentSeq: 1, action: { type: 'SPAWN_SPARK' } }),
    ).toEqual({ mismatch: false });
    expect(
      detectProtocolMismatch({ kind: 'NETSNAPSHOT', snapshotSeq: 1, snapshot: {} }),
    ).toEqual({ mismatch: false });
    expect(detectProtocolMismatch({ kind: 'ENDGAME', winnerId: 0 })).toEqual({
      mismatch: false,
    });
  });

  it('returns {mismatch:false} for null, primitives, arrays (non-object payloads)', () => {
    expect(detectProtocolMismatch(null)).toEqual({ mismatch: false });
    expect(detectProtocolMismatch(42)).toEqual({ mismatch: false });
    expect(detectProtocolMismatch('HELLO')).toEqual({ mismatch: false });
    // Arrays are objects but lack `kind` — still mismatch:false.
    expect(detectProtocolMismatch([])).toEqual({ mismatch: false });
  });
});

describe('NetTransport.onProtocolMismatch field (S53 P1)', () => {
  it('defaults to null after construction', () => {
    const t = new NetTransport();
    expect(t.onProtocolMismatch).toBeNull();
  });

  it('accepts a callback assignment without throwing', () => {
    const t = new NetTransport();
    expect(() => {
      t.onProtocolMismatch = () => {};
    }).not.toThrow();
    expect(typeof t.onProtocolMismatch).toBe('function');
  });
});

describe('formatProtocolMismatchMessage (S53 P1 symmetric UX text)', () => {
  it('advises peer to refresh when peer version is OLDER than local', () => {
    const msg = formatProtocolMismatchMessage(PROTOCOL_VERSION - 1);
    expect(msg).toMatch(/peer v\d+/);
    expect(msg).toMatch(new RegExp(`you v${PROTOCOL_VERSION}`));
    expect(msg).toMatch(/Your friend's version is older/i);
    expect(msg).toMatch(/refresh/i);
  });

  it('advises local to refresh when peer version is NEWER than local', () => {
    const msg = formatProtocolMismatchMessage(PROTOCOL_VERSION + 1);
    expect(msg).toMatch(/Your version is older/i);
    expect(msg).toMatch(/refresh your browser/i);
  });

  it('advises both peers to refresh when peer version is missing/non-numeric', () => {
    expect(formatProtocolMismatchMessage(undefined)).toMatch(/Both peers should refresh/i);
    expect(formatProtocolMismatchMessage(null)).toMatch(/Both peers should refresh/i);
    expect(formatProtocolMismatchMessage('garbage')).toMatch(/Both peers should refresh/i);
    expect(formatProtocolMismatchMessage(NaN)).toMatch(/Both peers should refresh/i);
  });

  it('embeds the verbatim peer version in the message for diagnostic value', () => {
    expect(formatProtocolMismatchMessage(2)).toContain('peer v2');
    expect(formatProtocolMismatchMessage('weird')).toContain('peer vweird');
    expect(formatProtocolMismatchMessage(undefined)).toContain('peer vundefined');
  });
});
