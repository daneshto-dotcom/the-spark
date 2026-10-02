/**
 * SPARK — S194 T9 (coherence) — **ONE ANSWER TO "DID THAT UNIT DIE?"**, asserted through the real consumers.
 *
 * Measured on master `18560cd8` before the fix (the probe that found it is this file's first two cases):
 *  · a Voltkin whose lifetime ran out (last seen DESPAWNING) printed a red **"40"** — a kill nobody made;
 *  · a match reset with five goblins on the board printed **five "30"s** — the S182 "mass clear is not a
 *    massacre" fix had reached the STRUCTURE watch and not the creature watch beside it;
 *  · a hit inside the fog printed through it, while the health bar over the same unit was hidden.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Container { children: unknown[] = []; addChild(c: unknown): void { this.children.push(c); } removeChild(): void {} }
  class TextStyle { constructor(public o?: unknown) {} }
  class Text {
    text = ''; style: unknown = null; visible = true; alpha = 1;
    anchor = { set: (): void => {} }; position = { set: (): void => {} }; scale = { set: (): void => {} };
    constructor(o?: { text?: string; style?: unknown }) { this.text = o?.text ?? ''; this.style = o?.style; }
    destroy(): void {}
  }
  return { Container, Text, TextStyle };
});

// The fog is a networked BUILD-phase state; a switch stands in for it so each case can say what it means.
let fogged = false;
vi.mock('../concealment.ts', () => ({
  isConcealed: () => fogged,
  beginConcealmentFrame: () => {},
  concealmentContext: () => ({ active: fogged, localPlayerId: null, sources: [] }),
  resetConcealmentForTest: () => {},
}));

const { makeWorld, dispatch } = await import('../../state/world.ts');
const { asPlayerId } = await import('../../types.ts');
const { DamageNumbers } = await import('../damageNumbers.ts');
const { classifyCreatureDeparture, CreatureWatchEpoch } = await import('./unitDeparture.ts');

const printed = (dn: unknown): string[] =>
  ((dn as { live: { text: { text: string } }[] }).live ?? []).map((f) => f.text.text);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function board(): any {
  const w = makeWorld(0x7e9);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true } as never);
  w.gameState = 'PLAYING';
  w.creatures.clear();
  return w;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function put(w: any, id: number, type: string, state: string, ehp: number, x = 400): void {
  w.creatures.set(id, { id, type, ownerPlayerId: asPlayerId(1), pos: { x, y: 400 }, ehp, state, ticksInState: 0 });
}

beforeEach(() => { fogged = false; });

describe('S194 T9 — the shared departure rule, through DamageNumbers', () => {
  it('⛔ an EXPIRY (last seen DESPAWNING) prints nothing — it was a red "40" on 18560cd8', () => {
    const w = board();
    put(w, 7, 'voltkin', 'DESPAWNING', 40);
    const dn = new DamageNumbers();
    dn.sync(w);
    w.creatures.delete(7); w.tick += 1;
    dn.sync(w);
    expect(printed(dn)).toEqual([]);
  });

  it('⛔ a MASS CLEAR prints nothing — it was five "30"s on 18560cd8', () => {
    const w = board();
    for (let i = 0; i < 5; i++) put(w, 100 + i, 'goblinMelee', 'SEEKING', 30, 100 + i * 60);
    const dn = new DamageNumbers();
    dn.sync(w);
    w.creatures.clear(); w.structureWatchEpoch += 1; w.tick += 1;
    dn.sync(w);
    expect(printed(dn)).toEqual([]);
  });

  it('✅ NOT VACUOUS — a unit that vanishes from a LIVE state is a kill, and prints', () => {
    const w = board();
    put(w, 9, 'goblinMelee', 'SEEKING', 30);
    const dn = new DamageNumbers();
    dn.sync(w);
    w.creatures.delete(9); w.tick += 1;
    dn.sync(w);
    expect(printed(dn).length).toBe(1);
  });

  it('⛔ the fog: a hit, and a kill, on a concealed spot print nothing — the health bar there is hidden too', () => {
    const w = board();
    put(w, 11, 'goblinMelee', 'SEEKING', 30);
    put(w, 12, 'goblinMelee', 'SEEKING', 30, 600);
    const dn = new DamageNumbers();
    dn.sync(w);
    fogged = true;
    w.creatures.get(11).ehp = 18; // a hit
    w.creatures.delete(12); // a kill
    w.tick += 1;
    dn.sync(w);
    expect(printed(dn)).toEqual([]);
    // …and the same hit in the open prints (negative control for the switch itself).
    fogged = false;
    w.creatures.get(11).ehp = 6;
    w.tick += 1;
    dn.sync(w);
    expect(printed(dn)).toEqual(['12']);
  });

  it('⭐ the keep is the one exception: an enemy castle hit still prints under the fog (S169 "only their castle")', () => {
    const w = board();
    const dn = new DamageNumbers();
    dn.sync(w);
    fogged = true;
    const enemy = [...w.players.values()][1];
    enemy.castleHp -= 40;
    w.tick += 1;
    dn.sync(w);
    expect(printed(dn)).toContain('40');
  });
});

describe('S194 T9 — classifyCreatureDeparture itself', () => {
  const at = { x: 1, y: 1, owner: asPlayerId(0) };
  it('names all four outcomes, in priority order', () => {
    const w = board();
    expect(classifyCreatureDeparture(w, { ...at, state: 'DESPAWNING' })).toBe('expired');
    expect(classifyCreatureDeparture(w, { ...at, state: 'ATTACKING' })).toBe('killed');
    fogged = true;
    expect(classifyCreatureDeparture(w, { ...at, state: 'SEEKING' })).toBe('concealed');
    w.gameState = 'TITLE';
    expect(classifyCreatureDeparture(w, { ...at, state: 'SEEKING' })).toBe('offstage');
    // expiry outranks everything: a fade is never a death, wherever it happens
    expect(classifyCreatureDeparture(w, { ...at, state: 'DESPAWNING' })).toBe('expired');
  });

  it('the epoch latch fires exactly once per bump, and never on its first look', () => {
    const w = board();
    const e = new CreatureWatchEpoch();
    expect(e.moved(w)).toBe(false);
    expect(e.moved(w)).toBe(false);
    w.structureWatchEpoch += 1;
    expect(e.moved(w)).toBe(true);
    expect(e.moved(w)).toBe(false);
  });
});
