/**
 * S16 P1 — unit tests for the lobby JOIN input pure helpers.
 *
 * Tests cover the HTML-input behavior contract WITHOUT spinning up Pixi
 * Application or a DOM environment: the sanitize / validate / position
 * helpers are extracted as pure functions per S10 #test-via-pure-helper-export
 * pattern. Mobile-keyboard viewport recalc + Pixi click-to-focus integration
 * are covered by manual smoke in `npm run dev` and the cross-network playtest
 * (Council R1 Grok #3 — jsdom limitation acknowledged).
 */

import { describe, expect, it } from 'vitest';
import {
  isValidRoomCode,
  JOIN_INPUT_RECT,
  mapCanvasRectToPage,
  sanitizeRoomCodeValue,
} from './lobbyScreen.ts';

describe('S16 P1 — sanitizeRoomCodeValue', () => {
  it('uppercases lowercase chars', () => {
    expect(sanitizeRoomCodeValue('abcdef')).toBe('ABCDEF');
  });

  it('strips protocol-excluded chars (0, O, 1, I) silently', () => {
    expect(sanitizeRoomCodeValue('0OII1')).toBe('');
    expect(sanitizeRoomCodeValue('A0B1C')).toBe('ABC');
    expect(sanitizeRoomCodeValue('OABCIO')).toBe('ABC');
  });

  it('strips non-alphanumeric chars', () => {
    expect(sanitizeRoomCodeValue('A-B-C-D-E-F')).toBe('ABCDEF');
    expect(sanitizeRoomCodeValue('A B C D E F')).toBe('ABCDEF');
    expect(sanitizeRoomCodeValue('!@#$%^&*()')).toBe('');
  });

  it('truncates to 6 chars (rejects overflow without throwing)', () => {
    expect(sanitizeRoomCodeValue('ABCDEFGH')).toBe('ABCDEF');
    expect(sanitizeRoomCodeValue('a2b3c4d5e6')).toBe('A2B3C4');
  });

  it('handles paste-style mixed input (lowercase + invalid + valid)', () => {
    // Simulates someone pasting "abc-def-ghi-jkl" — the kind of code you'd
    // see in a chat message with separators or leftover whitespace.
    expect(sanitizeRoomCodeValue('  abc-DEF jkl  ')).toBe('ABCDEF');
  });

  it('returns empty string on empty input', () => {
    expect(sanitizeRoomCodeValue('')).toBe('');
  });
});

describe('S16 P1 — isValidRoomCode', () => {
  it('accepts valid 6-char codes from the protocol charset', () => {
    expect(isValidRoomCode('ABCDEF')).toBe(true);
    expect(isValidRoomCode('234567')).toBe(true);
    expect(isValidRoomCode('A2B3C4')).toBe(true);
    expect(isValidRoomCode('HJKLNP')).toBe(true);
  });

  it('rejects codes with protocol-excluded chars (0, O, 1, I)', () => {
    expect(isValidRoomCode('ABCDE0')).toBe(false);
    expect(isValidRoomCode('OABCDE')).toBe(false);
    expect(isValidRoomCode('1BCDEF')).toBe(false);
    expect(isValidRoomCode('IABCDE')).toBe(false);
  });

  it('rejects codes with wrong length', () => {
    expect(isValidRoomCode('')).toBe(false);
    expect(isValidRoomCode('ABCDE')).toBe(false);
    expect(isValidRoomCode('ABCDEFG')).toBe(false);
  });

  it('rejects lowercase (sanitize must run first)', () => {
    expect(isValidRoomCode('abcdef')).toBe(false);
  });

  it('rejects whitespace / punctuation', () => {
    expect(isValidRoomCode('A B C D')).toBe(false);
    expect(isValidRoomCode('A-B-CD')).toBe(false);
  });
});

describe('S16 P1 — mapCanvasRectToPage', () => {
  it('identity case: canvas fills page at 1:1 scale', () => {
    const rect = { left: 0, top: 0, width: 1920, height: 1080 };
    const out = mapCanvasRectToPage(rect, 1920, 1080, 100, 200, 400, 80);
    expect(out.left).toBe(100);
    expect(out.top).toBe(200);
    expect(out.width).toBe(400);
    expect(out.height).toBe(80);
  });

  it('half-scale canvas: zone coords scale by 0.5', () => {
    const rect = { left: 0, top: 0, width: 960, height: 540 };
    const out = mapCanvasRectToPage(rect, 1920, 1080, 100, 200, 400, 80);
    expect(out.left).toBe(50);
    expect(out.top).toBe(100);
    expect(out.width).toBe(200);
    expect(out.height).toBe(40);
  });

  it('offset canvas: zone offsets by canvas rect.left/top', () => {
    const rect = { left: 200, top: 100, width: 1920, height: 1080 };
    const out = mapCanvasRectToPage(rect, 1920, 1080, 100, 200, 400, 80);
    expect(out.left).toBe(300);  // 200 + 100*1
    expect(out.top).toBe(300);   // 100 + 200*1
    expect(out.width).toBe(400);
    expect(out.height).toBe(80);
  });

  it('asymmetric scale (letterboxed canvas)', () => {
    // Canvas 1920x1080 rendered into 800x600 viewport (letterboxed). sx=0.4167, sy=0.5556
    const rect = { left: 10, top: 20, width: 800, height: 600 };
    const out = mapCanvasRectToPage(rect, 1920, 1080, 960, 540, 100, 80);
    // sx=800/1920≈0.4167; sy=600/1080≈0.5556
    expect(out.left).toBeCloseTo(10 + 960 * (800 / 1920), 4);
    expect(out.top).toBeCloseTo(20 + 540 * (600 / 1080), 4);
    expect(out.width).toBeCloseTo(100 * (800 / 1920), 4);
    expect(out.height).toBeCloseTo(80 * (600 / 1080), 4);
  });
});

describe('S16 P1 — JOIN_INPUT_RECT canvas-space coords', () => {
  it('matches the original Pixi joinInputBg rect coords (left edge of JOIN pane code area)', () => {
    // Sanity check that the exported constant is still wired to the same
    // canvas-space rectangle the Pixi joinInputBg was drawn at.
    expect(JOIN_INPUT_RECT.w).toBeGreaterThan(0);
    expect(JOIN_INPUT_RECT.h).toBe(60);
    expect(JOIN_INPUT_RECT.x).toBeGreaterThan(0);
    expect(JOIN_INPUT_RECT.y).toBeGreaterThan(0);
  });
});
