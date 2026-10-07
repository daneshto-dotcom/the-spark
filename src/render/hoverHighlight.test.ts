/**
 * ⭐ S196 (ui-5) — the hover-highlight PROTOTYPE: it ships OFF, it draws only what a click would open, and
 * the highlight sits on its target. See `hoverHighlight.ts`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('./audioManager.ts', () => ({ playUiClickSFX: vi.fn(async () => {}), playUiRefusedSFX: vi.fn(async () => {}) }));

import { PLAYER_COLORS } from '../constants.ts';
import { asCreatureId, asPlayerId, asSpawnerId, type PlayerId } from '../types.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { makeCreature } from '../state/creatures/creature.ts';
import { GOBLIN_MELEE_CONFIG } from '../state/creatures/voltkin-config.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { Controls, type CharacterSheetLike, type SheetSelectable } from '../input/controls.ts';
import type { FxSink } from './fx/emitter.ts';
import {
  drawHoverHighlight, HOVER_HIGHLIGHT_DEFAULT_ON, HOVER_TONE_COLOR, hoverHighlightEnabled, hoverHighlightFx, hoverTargetAt,
} from './hoverHighlight.ts';

beforeAll(() => {
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('document', { activeElement: null });
});
afterAll(() => { vi.unstubAllGlobals(); });

function world(): World {
  const w = makeWorld(0x196);
  w.gameState = 'TITLE';
  dispatch(w, { type: 'START_GAME', mode: 'bots', isHost: true, roster: [0, 1].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })), botSeats: [1] });
  w.draft = null;
  return w;
}
function goblin(w: World, owner: PlayerId, p: { x: number; y: number }, id: number): void {
  const g = makeCreature(GOBLIN_MELEE_CONFIG, {
    id: asCreatureId(id), ownerPlayerId: owner, pos: { ...p }, targetPos: { ...p },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(9950), clock: w,
  });
  w.creatures.set(g.id, g);
}
class Rec implements FxSink {
  readonly out: Array<{ tex: string; x: number; y: number; w: number; h: number; tint: number }> = [];
  emit(tex: string, x: number, y: number, w: number, h: number, _rot: number, _a: number, tint: number): void { this.out.push({ tex, x, y, w, h, tint }); }
}

describe('S196 hover highlight — SHIPS OFF', () => {
  it('the default is OFF; only ?hover=1 opts a viewer in, ?hover=0 forces it off', () => {
    expect(HOVER_HIGHLIGHT_DEFAULT_ON).toBe(false);
    expect(hoverHighlightEnabled('')).toBe(false);
    expect(hoverHighlightEnabled('?fx=legacy')).toBe(false);
    expect(hoverHighlightEnabled('?hover=1')).toBe(true);
    expect(hoverHighlightEnabled('?hover=0', true)).toBe(false);
  });

  it('disabled: draws nothing, even with the pointer on a castle', () => {
    const w = world();
    const a = castleAnchor(0, w.layout);
    const rec = new Rec();
    expect(drawHoverHighlight(w, a, false, rec)).toBeNull();
    expect(rec.out).toEqual([]);
  });

  it('main.ts reads the flag ONCE from the URL and passes it to the per-frame call between the fx frame marks', () => {
    const main = readFileSync(join(__dirname, '..', 'main.ts'), 'utf-8');
    expect(main).toMatch(/const HOVER_HIGHLIGHT_ON = hoverHighlightEnabled\(window\.location\.search\);/);
    const call = main.indexOf('drawHoverHighlight(world, controls.cursor, HOVER_HIGHLIGHT_ON);');
    expect(call).toBeGreaterThan(main.indexOf('fxBeginFrame();'));
    expect(call).toBeLessThan(main.indexOf('fxEndFrame();', call));
  });
});

describe('S196 hover highlight — on its target, in the right tone', () => {
  it('own castle → cyan ring on the keep; enemy castle → red; empty sky → nothing', () => {
    const w = world();
    for (const [seat, tone] of [[0, 'friendly'], [1, 'hostile']] as const) {
      const a = castleAnchor(seat, w.layout);
      const rec = new Rec();
      const t = drawHoverHighlight(w, a, true, rec);
      expect(t?.kind).toBe('castle');
      expect(t?.tone).toBe(tone);
      expect(rec.out.map((e) => e.tex)).toEqual(['soft', 'ring']);
      for (const e of rec.out) {
        expect(e.tint).toBe(HOVER_TONE_COLOR[tone]);
        expect(Math.abs(e.x - a.x)).toBeLessThan(1);
        expect(e.h).toBeLessThan(e.w); // a ground ellipse, not a disc floating over the art
      }
    }
    expect(hoverTargetAt(w, 960, 60)).toBeNull();
  });

  it('a creature: the ring is centred on it; the pulse never changes the centre', () => {
    const w = world();
    goblin(w, asPlayerId(1), { x: 900, y: 300 }, 9601);
    const t = hoverTargetAt(w, 905, 302)!;
    expect(t.kind).toBe('creature');
    for (const tick of [0, 12, 24, 36]) {
      const rec = new Rec();
      hoverHighlightFx(rec, t, tick);
      for (const e of rec.out) expect([e.x, e.y]).toEqual([900, 300]);
    }
  });
});

describe('⛔ S196 hover highlight — what it lights is what a CLICK opens (real Controls pick)', () => {
  function clickSelects(w: World, p: { x: number; y: number }): SheetSelectable | null | 'none' {
    let last: SheetSelectable | null | 'none' = 'none';
    const sheet: CharacterSheetLike = {
      select(t) { last = t; }, selection: () => null, ownedRowAt: () => null, isOver: () => false,
      actionAt: () => null, isOverAnyAction: () => false, actionPrimitiveId: () => null, actionFeedSpawnerId: () => null, setHover() {},
    };
    const canvas = {
      addEventListener() {}, setPointerCapture() {}, releasePointerCapture() {}, style: { cursor: '' },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
    };
    const c = new Controls({ canvas } as never, w, asPlayerId(0), (a) => dispatch(w, a));
    c.setCharacterSheet(sheet);
    const ev = { button: 0, clientX: p.x, clientY: p.y, pointerId: 1 };
    (c as unknown as { onMove(e: unknown): void }).onMove(ev);
    (c as unknown as { onDown(e: unknown): void }).onDown(ev);
    (c as unknown as { onUp(e: unknown): void }).onUp(ev);
    return last;
  }

  it('enemy castle, enemy goblin, own goblin, and a goblin standing ON a keep (castle wins both)', () => {
    const w = world();
    const enemyKeep = castleAnchor(1, w.layout);
    goblin(w, asPlayerId(1), { x: 900, y: 300 }, 9701);
    goblin(w, asPlayerId(0), { x: 1100, y: 700 }, 9702);
    goblin(w, asPlayerId(0), { x: enemyKeep.x + 5, y: enemyKeep.y }, 9703);
    const cases = [enemyKeep, { x: 902, y: 301 }, { x: 1098, y: 702 }, { x: 960, y: 60 }];
    const kinds: Array<string | null> = [];
    for (const p of cases) {
      const hover = hoverTargetAt(w, p.x, p.y);
      const sel = clickSelects(w, p);
      const clickKind = sel === 'none' || sel === null ? null : sel.kind;
      expect(hover?.kind ?? null, `at (${p.x},${p.y}) hover ${hover?.kind} vs click ${clickKind}`).toBe(clickKind);
      kinds.push(clickKind);
    }
    // anti-vacuity: the clicks really did open these (a rig where every click selected nothing would pass above)
    expect(kinds).toEqual(['castle', 'creature', 'creature', null]);
  });
});
