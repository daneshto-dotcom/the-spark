/**
 * SPARK — S194 T9 (coherence) — **THE UNIT FAMILY CENSUS, WITH TEETH.**
 *
 * The S182 lesson: *"a source-text guard proves a line EXISTS. It cannot prove the line is REACHED."* So
 * this file does both, and the census half is mechanical rather than a list someone remembers:
 *
 *  1. REACH, for EVERY creature type: a real `UnitDeathRenderer` watches a real world, the unit is killed
 *     (removed from a live state), and the shared beat must land on the fx layer in that unit's seat
 *     colour. The type list is `Object.keys(UNIT_FAMILY)`, and `UNIT_FAMILY` is a
 *     `Record<CreatureType, …>`, so a new creature type fails `tsc` until it is given a family — and then
 *     fails HERE until a kill of it actually draws.
 *  2. NEGATIVES: an expiry, a mass clear, a concealed spot, a title return and `?fx=legacy` all draw nothing.
 *  3. The consumer census: every production caller of the shared departure rule is counted, and a render
 *     file that grows its own private `wasState !== 'DESPAWNING'` vanish test goes red unless it is one of
 *     the T2-owned files routed to the merge owner (named below).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let fogged = false;
vi.mock('../concealment.ts', () => ({
  isConcealed: () => fogged,
  beginConcealmentFrame: () => {},
  concealmentContext: () => ({ active: fogged, localPlayerId: null, sources: [] }),
  resetConcealmentForTest: () => {},
}));

const { makeWorld, dispatch } = await import('../../state/world.ts');
const { asPlayerId } = await import('../../types.ts');
const { recordingSink } = await import('../fx/emitter.ts');
const { setFxHooks, setFxLegacyFlag } = await import('../fx/fxState.ts');
const { UNIT_FAMILY, UNIT_DEATH_LIFE_TICKS } = await import('../fx/unitDeathFx.ts');
const { UnitDeathRenderer, UNIT_DEATH_MAX_LIVE } = await import('./unitDeathRenderer.ts');

let top = recordingSink();
let shade = recordingSink();
beforeEach(() => {
  fogged = false;
  top = recordingSink();
  shade = recordingSink();
  setFxHooks({ top, shade, ground: recordingSink(), shock: { shock() { /* none */ } } });
});
afterEach(() => { setFxHooks(null); setFxLegacyFlag(false); });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function board(): any {
  const w = makeWorld(0xdea7);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true } as never);
  w.gameState = 'PLAYING';
  w.creatures.clear();
  return w;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function put(w: any, id: number, type: string, state = 'SEEKING', x = 400): void {
  w.creatures.set(id, { id, type, ownerPlayerId: asPlayerId(1), pos: { x, y: 400 }, ehp: 30, state, ticksInState: 0 });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function killAndLook(w: any, r: InstanceType<typeof UnitDeathRenderer>, id: number): void {
  r.sync(w);
  w.creatures.delete(id);
  w.tick += 1;
  r.sync(w); // the beat is born and drawn this frame
}

describe('S194 T9 — every creature type gets the shared death beat (REACH, per type)', () => {
  const types = Object.keys(UNIT_FAMILY);
  it('the census is the whole union — 28 types at S194 (a new one must be given a family)', () => {
    expect(types.length).toBe(28);
  });

  it.each(types)("%s — a kill draws the beat, in the dead unit's seat colour", (type) => {
    const w = board();
    const seat = w.players.get(asPlayerId(1)).color as number;
    const r = new UnitDeathRenderer();
    put(w, 5, type);
    killAndLook(w, r, 5);
    expect(r.liveCount()).toBe(1);
    expect(top.out.length, 'light on the top layer').toBeGreaterThan(0);
    expect(top.out.some((e) => e.tint === seat), 'the flash is the SEAT colour').toBe(true);
  });

  it('the beat ends on time and leaves nothing behind', () => {
    const w = board();
    const r = new UnitDeathRenderer();
    put(w, 5, 'goblinMelee');
    killAndLook(w, r, 5);
    w.tick += UNIT_DEATH_LIFE_TICKS;
    r.sync(w);
    expect(r.liveCount()).toBe(0);
  });

  it('a wave wipe is capped, oldest first', () => {
    const w = board();
    const r = new UnitDeathRenderer();
    for (let i = 0; i < 60; i++) put(w, 100 + i, 'goblinMelee', 'SEEKING', 100 + i * 10);
    r.sync(w);
    for (let i = 0; i < 60; i++) w.creatures.delete(100 + i);
    w.tick += 1;
    r.sync(w);
    expect(r.liveCount()).toBe(UNIT_DEATH_MAX_LIVE);
  });
});

describe('S194 T9 — what is NOT a death draws nothing (NEGATIVE)', () => {
  it('an expiry (last seen DESPAWNING) — it already faded out', () => {
    const w = board();
    const r = new UnitDeathRenderer();
    put(w, 5, 'voltkin', 'DESPAWNING');
    killAndLook(w, r, 5);
    expect(r.liveCount()).toBe(0);
    expect(top.out.length).toBe(0);
  });
  it('a mass clear (match reset) — S182 "a mass clear is not a massacre"', () => {
    const w = board();
    const r = new UnitDeathRenderer();
    for (let i = 0; i < 5; i++) put(w, 10 + i, 'goblinMelee');
    r.sync(w);
    w.creatures.clear(); w.structureWatchEpoch += 1; w.tick += 1;
    r.sync(w);
    expect(r.liveCount()).toBe(0);
  });
  it("a concealed spot — owner S170 \"You shouldn't see anything in their zone\"", () => {
    const w = board();
    const r = new UnitDeathRenderer();
    put(w, 5, 'goblinMelee');
    r.sync(w);
    fogged = true;
    w.creatures.delete(5); w.tick += 1;
    r.sync(w);
    expect(r.liveCount()).toBe(0);
  });
  it('off the match (title return) — and clear() forgets every beat', () => {
    const w = board();
    const r = new UnitDeathRenderer();
    put(w, 5, 'goblinMelee');
    r.sync(w);
    w.gameState = 'TITLE';
    w.creatures.delete(5); w.tick += 1;
    r.sync(w);
    expect(r.liveCount()).toBe(0);
    put(w, 6, 'goblinMelee');
    w.gameState = 'PLAYING';
    killAndLook(w, r, 6);
    expect(r.liveCount()).toBe(1);
    r.clear();
    expect(r.liveCount()).toBe(0);
  });
  it('?fx=legacy draws nothing (the old look of a goblin death was nothing)', () => {
    setFxLegacyFlag(true);
    const w = board();
    const r = new UnitDeathRenderer();
    put(w, 5, 'goblinMelee');
    killAndLook(w, r, 5);
    expect(top.out.length + shade.out.length).toBe(0);
  });
});

// ── the consumer census ─────────────────────────────────────────────────────────────────────────
const RENDER = join(__dirname, '..');
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.includes('fixtures')) out.push(p);
  }
  return out;
}
const rel = (p: string): string => p.slice(RENDER.length + 1).replace(/\\/g, '/');
/** ⛔ The arcade is off-limits (S194 rules) — never enumerated. */
const ARCADE = /^(arcade|nonet|sudokuOverlay)/;
const files = walk(RENDER).filter((p) => !ARCADE.test(rel(p)));

describe('S194 T9 — the shared departure rule is the ONLY one (consumer census)', () => {
  it('exactly three production consumers call classifyCreatureDeparture', () => {
    const callers = files
      .filter((p) => /classifyCreatureDeparture\(world,/.test(readFileSync(p, 'utf8'))) // a CALL, not the definition
      .map(rel)
      .sort();
    expect(callers).toEqual(['coherence/unitDeathRenderer.ts', 'creatureRenderer.ts', 'damageNumbers.ts']);
  });

  it('⛔ no render file grows its own vanish test — except the T2-owned chewer copy, routed to the merge owner', () => {
    const own = files
      .filter((p) => /wasState !== 'DESPAWNING'/.test(readFileSync(p, 'utf8')))
      .map(rel);
    // ⚠ ROUTED, NOT FIXED HERE: `chewerRenderer.ts` is T2 (visuals-3)'s file in S194. When it switches to
    // `classifyCreatureDeparture`, delete it from this list and add it to the three above.
    expect(own).toEqual(['chewerRenderer.ts']);
  });

  it('main.ts syncs the watcher every frame and clears it on title return', () => {
    const main = readFileSync(join(RENDER, '..', 'main.ts'), 'utf8');
    expect(main.match(/unitDeathRenderer\.sync\(world\)/g)?.length).toBe(1);
    expect(main.match(/unitDeathRenderer\.clear\(\)/g)?.length).toBe(1);
  });
});
