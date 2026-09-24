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
import { makeDoubleEscapeLeave } from './doubleEscapeLeave.ts';
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
}

/** A PLAYING solo match with the real Controls, then the leave handler — registered in main.ts's order. */
function rig(): Rig {
  keydown = [];
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
  const r: Rig = { w, c: null as unknown as Controls, leaves: 0, armed: null, clock: { t: 10_000 } };
  r.c = new Controls({ canvas } as never, w, P0, (a) => dispatch(w, a));
  r.c.setCastlePanel({
    armedBlueprint: () => r.armed,
    disarm: () => {
      r.armed = null;
    },
  } as never);
  window.addEventListener(
    'keydown',
    makeDoubleEscapeLeave({
      isPlaying: () => w.gameState === 'PLAYING',
      chordBlocked: () => false,
      codexOpen: () => false,
      towerArmed: () => r.armed !== null,
      confirmOpen: () => false,
      closeConfirm: () => undefined,
      leave: () => {
        r.leaves++;
      },
      now: () => r.clock.t,
    }) as Listener,
  );
  expect(keydown.length, 'Controls first, then the leave handler — main.ts order').toBe(2);
  return r;
}

/** One key press, dispatched to every keydown listener in registration order, as ONE event. */
function press(r: Rig, key: string, afterMs = 300): void {
  r.clock.t += afterMs;
  const e = {
    key,
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
