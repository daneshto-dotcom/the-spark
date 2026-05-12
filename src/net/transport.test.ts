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
import { classifyJoinError, NetTransport } from './transport.ts';
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
