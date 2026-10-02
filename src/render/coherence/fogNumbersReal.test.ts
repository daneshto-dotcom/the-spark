/**
 * SPARK — S194 T9 audit item 4 — **THE FOG RULE ON DAMAGE NUMBERS, WITH THE REAL `concealment.ts`.**
 *
 * The other coherence tests stub concealment with a switch. This one runs the real vision model (a networked
 * 1v1 in BUILD, the state in which fog is up, `fogActive`), so it proves the gate asks the right question
 * with the right OWNER: your own unit standing in enemy fog is yours to see, and prints; an enemy unit at
 * the same spot is not, and does not — until a vision source (the cursor) is on it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Container { children: unknown[] = []; addChild(c: unknown): void { this.children.push(c); } removeChild(): void {} }
  class TextStyle { constructor(public o?: unknown) {} }
  class Text {
    text = ''; style: unknown = null; visible = true; alpha = 1; x = 0; y = 0;
    anchor = { set: (): void => {} }; position = { set: (): void => {} }; scale = { set: (): void => {} };
    constructor(o?: { text?: string; style?: unknown }) { this.text = o?.text ?? ''; this.style = o?.style; }
    destroy(): void {}
  }
  return { Container, Text, TextStyle };
});

const { makeWorld, dispatch } = await import('../../state/world.ts');
const { asPlayerId } = await import('../../types.ts');
const { DamageNumbers } = await import('../damageNumbers.ts');
const { beginConcealmentFrame, isConcealed, resetConcealmentForTest } = await import('../concealment.ts');

const printed = (dn: unknown): string[] =>
  ((dn as { live: { text: { text: string } }[] }).live ?? []).map((f) => f.text.text);

const SPOT = { x: 1850, y: 1000 }; // deep in the other seat's quarter (the S178 chewer test's spot)
const FAR_CURSOR = { x: 20, y: 20 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fogWorld(): any {
  const w = makeWorld(0xf09);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true } as never);
  w.gameMode = '1v1';
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.localPlayerId = asPlayerId(0);
  w.creatures.clear();
  return w;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function put(w: any, id: number, seat: number): any {
  const c = { id, type: 'goblinMelee', ownerPlayerId: asPlayerId(seat), pos: { ...SPOT }, ehp: 300, state: 'SEEKING', ticksInState: 0, despawnAtTick: 1e9 };
  w.creatures.set(id, c);
  return c;
}
/** One hit on `c`, observed under a concealment frame computed from `cursor`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hitUnder(w: any, c: any, cursor: { x: number; y: number }): string[] {
  const dn = new DamageNumbers();
  beginConcealmentFrame(w, cursor);
  dn.sync(w);
  c.ehp -= 12;
  w.tick += 1;
  beginConcealmentFrame(w, cursor);
  dn.sync(w);
  return printed(dn);
}

beforeEach(() => { resetConcealmentForTest(); });
afterEach(() => { resetConcealmentForTest(); });

describe('S194 T9 audit — damage numbers obey the REAL fog, by owner', () => {
  it('anti-vacuity: the spot really is fogged for an enemy and not for the local seat', () => {
    const w = fogWorld();
    beginConcealmentFrame(w, FAR_CURSOR);
    expect(isConcealed(SPOT.x, SPOT.y, asPlayerId(1))).toBe(true);
    expect(isConcealed(SPOT.x, SPOT.y, asPlayerId(0))).toBe(false);
  });

  it('YOUR OWN unit standing in enemy fog prints its hit', () => {
    const w = fogWorld();
    expect(hitUnder(w, put(w, 1, 0), FAR_CURSOR)).toEqual(['12']);
  });

  it('⛔ an ENEMY unit in fog does not', () => {
    const w = fogWorld();
    expect(hitUnder(w, put(w, 1, 1), FAR_CURSOR)).toEqual([]);
  });

  it('…and the same enemy hit prints once a vision source (the cursor) is on it', () => {
    const w = fogWorld();
    expect(hitUnder(w, put(w, 1, 1), SPOT)).toEqual(['12']);
  });
});
