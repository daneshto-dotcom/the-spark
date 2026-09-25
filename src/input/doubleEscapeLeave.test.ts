/**
 * SPARK — S189 (C4, disconnect-hunt finding A1): **ESCAPE AS A CANCEL MUST NOT ARM "LEAVE THE MATCH".**
 *
 * REACH: the real `Controls` and the real leave handler (`makeDoubleEscapeLeave`, what `main.ts`
 * registers) both listen on `window` keydown, `Controls` first — exactly `main.ts`'s order — and every
 * press goes through BOTH, as one event object, the way a browser dispatches it. Before S189 a cancel
 * (dropping a held tower, putting the Ra aim away) followed by one more Escape inside
 * `TITLE_EXIT_CONFIRM_MS` abandoned the match; the other player got CONNECTION LOST.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_COLORS, TITLE_EXIT_CONFIRM_MS } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { Controls } from './controls.ts';
import { makeDoubleEscapeLeave, makeOverlayEscapeClose } from './doubleEscapeLeave.ts';
import { closeSettingsOnEscape } from '../render/settingsOverlay.ts';
import { raAimPreview, setRaAimPreview } from '../render/raAimPreview.ts';

const P0 = asPlayerId(0);
type Listener = (e: unknown) => void;
let keydown: Listener[] = [];

beforeEach(() => {
  keydown = [];
  vi.stubGlobal('window', {
    addEventListener(type: string, f: Listener) {
      if (type === 'keydown') keydown.push(f);
    },
    removeEventListener() {},
  });
  vi.stubGlobal('document', { activeElement: null });
});
afterEach(() => {
  setRaAimPreview(null);
  vi.unstubAllGlobals();
});

interface Rig {
  w: World;
  c: Controls;
  leaves: number;
  armed: { id: string } | null;
  clock: { t: number };
  /** The Codex's visibility (S189 fix round — its close handler is registered between the two). */
  codex: boolean;
  /** The settings panel's visibility (its Escape listeners are on the panel/document: they run FIRST). */
  settings: boolean;
}

/** A PLAYING solo match with the real Controls, then the leave handler — registered in main.ts's order. */
function rig(): Rig {
  keydown = [];
  // The settings panel listens on its root and on `document`, which a window listener only hears
  // AFTER — so, in dispatch order, it goes first. The real function its two handlers both call.
  const settingsFirst: Listener = (e) => {
    if (r.settings) closeSettingsOnEscape(e as { key: string }, () => { r.settings = false; });
  };
  const w = makeWorld(0xa1);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'solo', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0]!, raceId: 'mummies' }],
  });
  w.gameState = 'PLAYING';
  const canvas = {
    addEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    style: { cursor: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080, right: 1920, bottom: 1080, x: 0, y: 0 }),
  };
  const r: Rig = {
    w, c: null as unknown as Controls, leaves: 0, armed: null, clock: { t: 10_000 }, codex: false, settings: false,
  };
  r.c = new Controls({ canvas } as never, w, P0, (a) => dispatch(w, a));
  r.c.setCastlePanel({
    armedBlueprint: () => r.armed,
    disarm: () => {
      r.armed = null;
    },
  } as never);
  // main.ts order: Controls (constructed ~:618), the Codex close (~:1576), then the leave handler.
  window.addEventListener(
    'keydown',
    makeOverlayEscapeClose(() => r.codex, () => { r.codex = false; }) as Listener,
  );
  window.addEventListener(
    'keydown',
    makeDoubleEscapeLeave({
      isPlaying: () => w.gameState === 'PLAYING',
      chordBlocked: () => false,
      codexOpen: () => r.codex,
      towerArmed: () => r.armed !== null,
      confirmOpen: () => false,
      closeConfirm: () => undefined,
      leave: () => {
        r.leaves++;
      },
      now: () => r.clock.t,
    }) as Listener,
  );
  expect(keydown.length, 'Controls, the Codex close, then the leave handler — main.ts order').toBe(3);
  keydown.unshift(settingsFirst);
  return r;
}

/** One key press, dispatched to every keydown listener in registration order, as ONE event. */
function press(r: Rig, key: string, afterMs = 300, repeat = false): void {
  r.clock.t += afterMs;
  const e = {
    key,
    repeat, // ⭐ S191 SEAM-2 — `KeyboardEvent.repeat`: true on the OS auto-repeat keydowns of a HELD key
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  for (const f of keydown) f(e);
}

describe('S189 A1 — a cancel is not the first press of "leave the match"', () => {
  it('⛔ REACH: drop a held tower with Escape, press Escape again — the match is NOT abandoned', () => {
    const r = rig();
    r.armed = { id: 'laserTurret' };
    press(r, 'Escape'); // the cancel: Controls drops the tower
    expect(r.armed).toBeNull();
    press(r, 'Escape'); // a second press inside TITLE_EXIT_CONFIRM_MS
    expect(r.leaves, 'a cancel + one Escape must not leave').toBe(0);
  });

  it('⛔ REACH: put the Ra aim away with Escape, press Escape again — the match is NOT abandoned', () => {
    const r = rig();
    setRaAimPreview({ seat: P0, x: 500, y: 500 });
    press(r, 'Escape');
    expect(raAimPreview()).toBeNull();
    press(r, 'Escape');
    expect(r.leaves).toBe(0);
  });

  it('two cancels in a row never leave either — each resets the chord', () => {
    const r = rig();
    r.armed = { id: 'laserTurret' };
    press(r, 'Escape');
    r.armed = { id: 'laserTurret' };
    press(r, 'Escape');
    expect(r.leaves).toBe(0);
  });

  it('NEGATIVE: the deliberate gesture still works — after a cancel, TWO more Escapes leave', () => {
    const r = rig();
    r.armed = { id: 'laserTurret' };
    press(r, 'Escape'); // cancel (consumed)
    press(r, 'Escape'); // first press of a fresh pair
    press(r, 'Escape'); // second → leave
    expect(r.leaves).toBe(1);
  });

  it('⛔ REACH (audit NET-3): close the CODEX with Escape, press Escape again — the match is NOT abandoned', () => {
    const r = rig();
    r.codex = true;
    press(r, 'Escape'); // closes the Codex
    expect(r.codex).toBe(false);
    press(r, 'Escape');
    expect(r.leaves, 'closing the Codex must not be the first press of a leave').toBe(0);
  });

  it('⛔ REACH (audit NET-3): close SETTINGS with Escape, press Escape again — the match is NOT abandoned', () => {
    const r = rig();
    r.settings = true;
    press(r, 'Escape'); // closes the settings panel
    expect(r.settings).toBe(false);
    press(r, 'Escape');
    expect(r.leaves, 'closing settings must not be the first press of a leave').toBe(0);
  });

  it('NEGATIVE: two bare Escapes leave, and two Escapes too far apart do not', () => {
    const a = rig();
    press(a, 'Escape');
    press(a, 'Escape');
    expect(a.leaves).toBe(1);
    const b = rig();
    press(b, 'Escape');
    press(b, 'Escape', TITLE_EXIT_CONFIRM_MS + 1);
    expect(b.leaves).toBe(0);
  });
});

/**
 * ⛔ S191 SEAM-2 (audit wf_0593f6fe-d53, LOW) — HOLDING Escape LEFT THE MATCH. The OS auto-repeats a held
 * key (~30 keydowns a second, `repeat: true`), and the handler counted the first repeat as the second press.
 * A repeat is not a press: it is ignored, and it does not touch the chord.
 */
const REPEAT_MS = 33;
describe('S191 SEAM-2 — an auto-repeat keydown is not a second press', () => {
  it('⛔ REACH: put the Ra aim away with Escape and keep HOLDING it (3 repeats) — the match is NOT abandoned', () => {
    const r = rig();
    setRaAimPreview({ seat: P0, x: 500, y: 500 });
    press(r, 'Escape'); // the cancel
    for (let i = 0; i < 3; i++) press(r, 'Escape', REPEAT_MS, true);
    expect(raAimPreview()).toBeNull();
    expect(r.leaves, 'a held cancel must not leave').toBe(0);
  });

  it('⛔ REACH: one bare Escape, HELD (3 repeats) — the match is NOT abandoned', () => {
    const r = rig();
    press(r, 'Escape');
    for (let i = 0; i < 3; i++) press(r, 'Escape', REPEAT_MS, true);
    expect(r.leaves).toBe(0);
  });

  it('NEGATIVE: press, hold (repeats), release, then ONE discrete press inside the window → leaves once', () => {
    const r = rig();
    press(r, 'Escape');
    for (let i = 0; i < 3; i++) press(r, 'Escape', REPEAT_MS, true);
    press(r, 'Escape', 300); // 399 ms after the first press, inside TITLE_EXIT_CONFIRM_MS
    expect(r.leaves).toBe(1);
  });
});

describe('S189 fix round (audit NET-3) — the real handlers use the tested functions', () => {
  // A source guard proves a line EXISTS, not that it is reached — the REACH cases above do that. This
  // one only pins that the production handlers are the functions those cases drive.
  const strip = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  it('both settings Escape listeners call closeSettingsOnEscape, and no other Escape check exists there', async () => {
    const { readFileSync } = await import('node:fs');
    const src = strip(readFileSync(new URL('../render/settingsOverlay.ts', import.meta.url), 'utf8'));
    expect(src.match(/closeSettingsOnEscape\(e, hide\)/g)?.length).toBe(2);
    expect(src.match(/'Escape'/g)?.length, 'only inside closeSettingsOnEscape').toBe(1);
  });
  it('main.ts closes the Codex through makeOverlayEscapeClose and leaves through makeDoubleEscapeLeave', async () => {
    const { readFileSync } = await import('node:fs');
    const src = strip(readFileSync(new URL('../main.ts', import.meta.url), 'utf8'));
    expect(src.match(/makeOverlayEscapeClose\(/g)?.length).toBe(1);
    expect(src.match(/makeDoubleEscapeLeave\(/g)?.length).toBe(1);
    expect(src.indexOf('makeOverlayEscapeClose(')).toBeLessThan(src.indexOf('makeDoubleEscapeLeave('));
  });
});
