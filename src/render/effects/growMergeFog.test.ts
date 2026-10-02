/**
 * S193 audit (MED) — STRUCTURE_GROW / STRUCTURE_MERGE carry no `pos`, so `effectsRenderer`'s
 * drain-time fog cull (`'pos' in e`) never sees them, and they are host-only (`save.ts` keeps them
 * off the wire). On the HOST an enemy's (or a bot's) placement flashed its shapes through the fog —
 * and the V20 light made it brighter. REACH: through the real `EffectsRenderer.sync`, with a real
 * concealment frame, on both the fx path and the legacy Graphics path.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Application } from 'pixi.js';
import { EffectsRenderer } from '../effectsRenderer.ts';
import { beginConcealmentFrame, resetConcealmentForTest } from '../concealment.ts';
import { recordingSink, type FxEmitRecord } from '../fx/emitter.ts';
import { setFxHooks, setFxLegacyFlag } from '../fx/fxState.ts';
import { makeWorld, type World } from '../../state/world.ts';
import { STRUCTURE_FLASH_TICKS } from '../../constants.ts';
import { asPlayerId, asPrimitiveId, type PrimitiveId } from '../../types.ts';
import type { GameEffect } from '../../game/effects.ts';

const ME = asPlayerId(0);
const THEM = asPlayerId(1);
const FAR = { x: 1700, y: 950 }; // nowhere near the quarry or the cursor
const CURSOR = { x: 200, y: 200 };

function fogUpWorld(): World {
  const w = makeWorld(1);
  w.gameMode = '1v1';
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.localPlayerId = ME;
  return w;
}

/** Two bonded shapes owned by `owner` at `at`, plus a grow and a merge effect over them, born now. */
function structureAt(w: World, owner: typeof ME, at: { x: number; y: number }): void {
  const mk = (id: number, x: number): PrimitiveId => {
    const pid = asPrimitiveId(id);
    w.primitives.set(pid, {
      id: pid, type: 3, placerColor: 0x3bd7ff, placedBy: owner, createdTick: w.tick,
      pos: { x, y: at.y }, prevPos: { x, y: at.y }, bonds: new Set(),
      ownerColor: 0x3bd7ff, lastOwnershipChange: 0, radius: 9,
    } as never);
    return pid;
  };
  const a = mk(900 + w.primitives.size, at.x);
  const b = mk(900 + w.primitives.size, at.x + 30);
  const bondId = (700 + w.bonds.size) as never;
  w.bonds.set(bondId, { id: bondId, a: w.primitives.get(a), b: w.primitives.get(b) } as never);
  const grow: GameEffect = {
    kind: 'STRUCTURE_GROW', tick: w.tick, originPrimId: a,
    hopByPrimId: new Map([[a, 0], [b, 0]]), hopByBondId: new Map([[bondId, 0]]), color: 0x3bd7ff, maxHop: 0,
  } as GameEffect;
  const merge: GameEffect = { kind: 'STRUCTURE_MERGE', tick: w.tick, originPos: at, unionPrimIds: [a, b], color: 0x3bd7ff } as GameEffect;
  w.effects.push(grow, merge);
}

class G {
  calls = 0;
  clear(): this { return this; }
  circle(): this { this.calls++; return this; }
  moveTo(): this { this.calls++; return this; }
  lineTo(): this { return this; }
  fill(): this { return this; }
  stroke(): this { return this; }
  destroy(): void { /* */ }
}

function renderOnce(owner: typeof ME, at: { x: number; y: number }, fx: boolean): { top: FxEmitRecord[]; g: number } {
  const top = recordingSink();
  setFxHooks(fx ? { top, shade: recordingSink(), ground: recordingSink(), shock: { shock() { /* */ } } } : null);
  const r = new EffectsRenderer({ stage: { addChild: () => undefined } } as unknown as Application);
  const g = new G();
  (r as unknown as { graphics: G }).graphics = g;
  const w = fogUpWorld();
  structureAt(w, owner, at);
  beginConcealmentFrame(w, CURSOR);
  w.tick += Math.floor(STRUCTURE_FLASH_TICKS / 2) + 4; // inside both flash windows (merge has a 4-tick lead-in)
  r.sync(w);
  return { top: top.out, g: g.calls };
}

afterEach(() => { resetConcealmentForTest(); setFxHooks(null); setFxLegacyFlag(false); });

describe('S193 audit — grow / merge flashes obey the fog on the host', () => {
  it('⛔ an ENEMY structure growing under fog draws NOTHING (fx path)', () => {
    expect(renderOnce(THEM, FAR, true).top).toHaveLength(0);
  });
  it('⛔ … and nothing on the legacy Graphics path either', () => {
    expect(renderOnce(THEM, FAR, false).g).toBe(0);
  });
  it('NEGATIVE — your OWN structure in the same dark spot draws (fx and legacy)', () => {
    expect(renderOnce(ME, FAR, true).top.length).toBeGreaterThan(0);
    expect(renderOnce(ME, FAR, false).g).toBeGreaterThan(0);
  });
  it('NEGATIVE — an enemy structure INSIDE your vision draws', () => {
    expect(renderOnce(THEM, { x: CURSOR.x, y: CURSOR.y }, true).top.length).toBeGreaterThan(0);
  });
});
