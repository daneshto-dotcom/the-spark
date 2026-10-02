/**
 * SPARK — S194 T9 (coherence) — **EVERY RED NUMBER LANDS A POP ON ITS VICTIM, AND NOTHING ELSE POPS.**
 *
 * REACH through the real `DamageNumbers` (the one consumer that derives every hit in the game), for every
 * family that can be hit — a unit, a boss, a connector, the keep — plus the pairing invariant that makes it
 * a census rather than a list: in any frame, damage floaters printed == hit pops born. A future hit path that
 * prints without popping (or pops without printing) breaks that equality.
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
const { recordingSink } = await import('./emitter.ts');
const { setFxHooks, setFxLegacyFlag } = await import('./fxState.ts');
const { HIT_POP_CORE, HIT_POP_TICKS, HIT_POP_SIZE } = await import('./hitPopFx.ts');

let top = recordingSink();
beforeEach(() => {
  fogged = false;
  top = recordingSink();
  setFxHooks({ top, shade: recordingSink(), ground: recordingSink(), shock: { shock() { /* none */ } } });
});
afterEach(() => { setFxHooks(null); setFxLegacyFlag(false); });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function board(): any {
  const w = makeWorld(0x417);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true } as never);
  w.gameState = 'PLAYING';
  w.creatures.clear();
  return w;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function put(w: any, id: number, type: string, x = 500, y = 500): any {
  const c = { id, type, ownerPlayerId: asPlayerId(1), pos: { x, y }, ehp: 300, state: 'SEEKING', ticksInState: 0, despawnAtTick: w.tick };
  w.creatures.set(id, c);
  return c;
}
const cores = (): { x: number; y: number; w: number }[] => // the pop's CORE sprite, one per pop
  top.out.filter((e) => e.tex === 'core' && e.tint === HIT_POP_CORE);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const damageFloaters = (dn: any): number => dn.live.filter((f: any) => !f.heal && f.text.text !== 'RESIST').length;

describe('S194 T9 — the hit pop lands on the victim, for every family that can be hit', () => {
  it('a unit hit pops AT THE VICTIM (not at the drifted number)', () => {
    const w = board();
    const c = put(w, 1, 'goblinMelee');
    const dn = new DamageNumbers();
    dn.sync(w);
    c.ehp -= 12;
    dn.sync(w);
    expect(dn.hitPopCount()).toBe(1);
    expect(cores().length).toBe(1);
    expect(cores()[0]!.x).toBe(500);
    expect(cores()[0]!.y).toBe(500);
  });

  it('a boss pops bigger than a goblin (keyed by the unit\'s own sprite scale)', () => {
    const w = board();
    const g = put(w, 1, 'goblinMelee', 300);
    const b = put(w, 2, 't9BossZombies', 700);
    const dn = new DamageNumbers();
    dn.sync(w);
    g.ehp -= 12; b.ehp -= 12;
    dn.sync(w);
    const [cg, cb] = [cores().find((e) => e.x === 300)!, cores().find((e) => e.x === 700)!];
    expect(cb.w).toBeGreaterThan(cg.w);
  });

  it('a KILL pops at the last position it was seen', () => {
    const w = board();
    put(w, 1, 'goblinMelee', 420, 380);
    const dn = new DamageNumbers();
    dn.sync(w);
    w.creatures.delete(1); w.tick += 1;
    dn.sync(w);
    expect(cores().some((e) => e.x === 420 && e.y === 380)).toBe(true);
  });

  it('the KEEP pops at keep size, and a hit on it still pops under the fog (the keep is always in view)', () => {
    const w = board();
    const dn = new DamageNumbers();
    dn.sync(w);
    fogged = true;
    const enemy = [...w.players.values()][1];
    enemy.castleHp -= 40;
    w.tick += 1;
    dn.sync(w);
    expect(dn.hitPopCount()).toBe(1);
    expect(cores()[0]!.w).toBeGreaterThan(HIT_POP_SIZE.unit * 2.2);
  });

  it('⛔ a heal, a resist, a concealed hit and an expiry pop NOTHING', () => {
    const w = board();
    const c = put(w, 1, 'goblinMelee');
    put(w, 2, 'voltkin', 700);
    w.creatures.get(2).state = 'DESPAWNING';
    const dn = new DamageNumbers();
    dn.sync(w);
    c.ehp += 5; c.healedFifths = 5; // a heal
    w.creatures.delete(2); // an expiry
    w.tick += 1;
    dn.sync(w);
    fogged = true;
    c.ehp -= 9; // concealed
    w.tick += 1;
    dn.sync(w);
    expect(dn.hitPopCount()).toBe(0);
    expect(cores()).toEqual([]);
  });

  it('a pop ages by world.tick: it holds while the tick holds, and is gone HIT_POP_TICKS later', () => {
    const w = board();
    const c = put(w, 1, 'goblinMelee');
    const dn = new DamageNumbers();
    dn.sync(w);
    c.ehp -= 12;
    dn.sync(w);
    for (let i = 0; i < 30; i++) dn.sync(w); // 30 render frames, same tick (the browser pane / a paused sim)
    expect(dn.hitPopCount(), 'render frames alone do not age it').toBe(1);
    w.tick += HIT_POP_TICKS;
    dn.sync(w);
    expect(dn.hitPopCount()).toBe(0);
  });

  it('?fx=legacy draws no pop (the old hit drew nothing at the victim)', () => {
    setFxLegacyFlag(true);
    const w = board();
    const c = put(w, 1, 'goblinMelee');
    const dn = new DamageNumbers();
    dn.sync(w);
    c.ehp -= 12;
    dn.sync(w);
    expect(top.out).toEqual([]);
  });
});

describe('S194 T9 — the pairing census: damage floaters printed == hit pops born', () => {
  it('holds over a mixed frame of hits, kills, heals and a keep hit', () => {
    const w = board();
    const a = put(w, 1, 'goblinMelee', 200);
    const b = put(w, 2, 't3Warband', 300);
    put(w, 3, 'goblinArcher', 400);
    const d = put(w, 4, 'raceUnit', 500);
    const dn = new DamageNumbers();
    dn.sync(w);
    a.ehp -= 6;
    b.ehp -= 14;
    w.creatures.delete(3);
    d.ehp += 4; d.healedFifths = 4;
    [...w.players.values()][0].castleHp -= 30;
    w.tick += 1;
    dn.sync(w);
    expect(damageFloaters(dn)).toBe(4);
    expect(dn.hitPopCount()).toBe(damageFloaters(dn));
  });
});
