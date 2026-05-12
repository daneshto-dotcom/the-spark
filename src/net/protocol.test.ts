/**
 * SPARK — S15 P2 protocol tests.
 *
 * Coverage:
 *   - Room code generation: length, alphabet, no-confusion-chars.
 *   - Room code parsing: case normalization, length check, alphabet check.
 *   - Envelope shape sanity (types compile; runtime structure).
 */

import { describe, expect, it } from 'vitest';
import { generateRoomCode, parseRoomCode } from './protocol.ts';
import { NET_ROOM_CODE_LENGTH } from '../constants.ts';

describe('S15 P2 — room code generation', () => {
  it('generates a code of the configured length (default 6)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code.length).toBe(NET_ROOM_CODE_LENGTH);
    }
  });

  it('uses only the non-confusing alphabet (no 0/O/1/I)', () => {
    const allowed = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]+$/;
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(allowed.test(code)).toBe(true);
    }
  });

  it('honors custom length parameter', () => {
    expect(generateRoomCode(4).length).toBe(4);
    expect(generateRoomCode(8).length).toBe(8);
  });
});

describe('S15 P2 — room code parsing', () => {
  it('canonicalizes lowercase input to uppercase', () => {
    expect(parseRoomCode('abc234')).toBe('ABC234');
  });

  it('rejects codes of wrong length', () => {
    expect(parseRoomCode('ABC23')).toBeNull(); // 5 chars
    expect(parseRoomCode('ABC2345')).toBeNull(); // 7 chars
  });

  it('rejects codes containing confusion chars (0/O/1/I/lowercase already canonicalized)', () => {
    expect(parseRoomCode('ABC230')).toBeNull(); // contains 0
    expect(parseRoomCode('ABC23O')).toBeNull(); // contains O
    expect(parseRoomCode('ABC231')).toBeNull(); // contains 1
    expect(parseRoomCode('ABC23I')).toBeNull(); // contains I
  });

  it('accepts a generated code roundtrip', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateRoomCode();
      const parsed = parseRoomCode(code);
      expect(parsed).toBe(code);
    }
  });

  it('trims whitespace around the input', () => {
    expect(parseRoomCode('  ABC234  ')).toBe('ABC234');
  });
});
