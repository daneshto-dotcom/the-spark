/**
 * ⛔ S189 (audit R2-1) — AN OVERLAY DRAWN OVER AN OPEN DRAFT PANEL MUST NOT LET A CLICK REACH IT.
 *
 * C1 took the draft panel's `zIndex = 900` away so his cruiser could draw above it. That was right —
 * and it also meant every surface staged LATER now draws over the panel: the codex (G+C) and the
 * lobby's CONNECTION LOST overlay among them. Both backdrops were `passive`, and Pixi's EventBoundary
 * hit-tests straight THROUGH a passive display object, so a click on the codex's black backdrop, or on
 * the connection-lost text sitting over a tile, reached the draft container underneath and COMMITTED A
 * PICK THE PLAYER COULD NOT SEE. A pick is permanent.
 *
 * The fix is the house pattern (`exitButton.ts`, `sudokuOverlay.ts`, `botSetupOverlay.ts`): the
 * backdrop is `eventMode: 'static'`, so it is the hit. Each overlay's own controls are later children
 * and still win — asserted below too, so the fix cannot "work" by swallowing its own buttons.
 *
 * DRIVEN FOR REAL: the real `DraftOverlay` rendered open on a started match, the real overlay
 * constructors staged after it on the same stage (sorted as the renderer sorts), and Pixi's own
 * `EventBoundary`. Mutation-tested: reverting either backdrop to passive turns its case red.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Container, EventBoundary, type Application } from 'pixi.js';
import 'pixi.js/events'; // the federated-event mixin; the browser loads it via `browserAll`
import { DraftOverlay, racialTileRect, generalTileRect, type DraftOptions } from './draftOverlay.ts';
import { makeConnectionLostOverlay } from './connectionLostOverlay.ts';
import { CodexOverlay } from './codexOverlay.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import { makeWorld } from '../state/world.ts';
import { applyStartGame } from '../state/gameMode.ts';

/* ── Node has no canvas; Pixi measures text through one. Same stand-in as draftOverlay.test.ts. ── */
class FakeContext2D {
  font = '10px sans-serif';
  letterSpacing = '0px';
  textLetterSpacing = '0px';
  measureText(s: string): { width: number; actualBoundingBoxLeft: number; actualBoundingBoxRight: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
    const px = Number(/(\d+)px/.exec(this.font)?.[1] ?? 10);
    const w = s.length * px * 0.6;
    return { width: w, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w, actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2 };
  }
}
class FakeOffscreenCanvas {
  constructor(public width: number, public height: number) {}
  getContext(): FakeContext2D {
    return new FakeContext2D();
  }
}
vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
vi.stubGlobal('CanvasRenderingContext2D', FakeContext2D);
afterAll(() => {
  vi.unstubAllGlobals();
});

const LIVE: DraftOptions = { general: 'hp', racial: 'vampires.l0' };
const centre = (r: { x: number; y: number; w: number; h: number }): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** A stage with an OPEN draft panel on it, and a fake app exposing just what the overlays touch. */
function stageWithOpenDraft(): { stage: Container; app: Application; draft: DraftOverlay; picks: string[] } {
  const stage = new Container();
  stage.sortableChildren = true; // exitButton.ts makes the real stage sortable
  const app = { stage, ticker: { add: () => {} }, canvas: { addEventListener: () => {} } } as unknown as Application;
  const picks: string[] = [];
  const draft = new DraftOverlay((p) => picks.push(p), { optionsFor: () => LIVE, loadCard: () => new Promise(() => {}) });
  stage.addChild(draft.container);
  const w = makeWorld(0x189e);
  applyStartGame(w, { type: 'START_GAME' } as never);
  draft.render(w, w.localPlayerId);
  if (!draft.container.visible) throw new Error('fixture: the draft panel is open');
  return { stage, app, draft, picks };
}

function hit(stage: Container, p: { x: number; y: number }): Container | null {
  stage.sortChildren(); // what RenderGroupSystem does before each frame
  return new EventBoundary(stage).hitTest(p.x, p.y);
}

/** True when the hit target is the draft container or anything inside it. */
function isDraft(target: Container | null, draft: DraftOverlay): boolean {
  for (let t: Container | null = target; t !== null; t = t.parent) if (t === draft.container) return true;
  return false;
}

describe('⛔ S189 R2-1 — the CONNECTION LOST overlay swallows clicks over an open draft panel', () => {
  it('a click over either tile hits the overlay, never the draft panel', () => {
    const { stage, app, draft } = stageWithOpenDraft();
    const lost = makeConnectionLostOverlay(app, () => {});
    lost.setVisible(true);
    for (const p of [centre(racialTileRect()), centre(generalTileRect())]) {
      expect(isDraft(hit(stage, p), draft), `click at ${p.x},${p.y} reached the hidden draft panel`).toBe(false);
    }
  });

  it('its Return to Title button still wins: a LATER interactive child than the backdrop', () => {
    /*
     * ⚠ LIMIT, STATED: with no renderer, Pixi never computes a world transform for a child that has
     * been MOVED (the button sits at (W/2 − 110, H/2 + 70)), so `EventBoundary` cannot hit-test it
     * here — it can only hit things drawn at their own origin, like the backdrop and the draft panel.
     * What it would use is exactly what is asserted: the boundary walks children LAST-FIRST, so an
     * interactive child after the backdrop is tested before it. And the button's handler still fires.
     */
    const { app } = stageWithOpenDraft();
    let returned = 0;
    const lost = makeConnectionLostOverlay(app, () => { returned++; });
    const kids = lost.container.children;
    const backdrop = kids[0]!;
    expect(backdrop.eventMode).toBe('static');
    const buttons = kids.filter((c, i) => i > 0 && c.eventMode === 'static');
    expect(buttons, 'exactly one interactive child after the backdrop — the Return button').toHaveLength(1);
    expect(buttons[0]!.x).toBeCloseTo(CANVAS_WIDTH / 2 - 110, 5);
    expect(buttons[0]!.y).toBeCloseTo(CANVAS_HEIGHT / 2 + 70, 5);
    buttons[0]!.emit('pointertap', {} as never);
    expect(returned).toBe(1);
  });

  it('NEGATIVE — with the overlay hidden, the draft panel takes the click as before', () => {
    const { stage, app, draft } = stageWithOpenDraft();
    makeConnectionLostOverlay(app, () => {}).setVisible(false);
    expect(isDraft(hit(stage, centre(racialTileRect())), draft)).toBe(true);
  });
});

describe('⛔ S189 R2-1 — the CODEX swallows clicks over an open draft panel', () => {
  it('a click over either tile hits the codex, never the draft panel', () => {
    const { stage, app, draft } = stageWithOpenDraft();
    const codex = new CodexOverlay(app, { towers: [] }, () => {});
    codex.setVisible(true);
    for (const p of [centre(racialTileRect()), centre(generalTileRect())]) {
      expect(isDraft(hit(stage, p), draft), `click at ${p.x},${p.y} reached the hidden draft panel`).toBe(false);
    }
  });

  it('NEGATIVE — with the codex closed, the draft panel takes the click as before', () => {
    const { stage, app, draft } = stageWithOpenDraft();
    const codex = new CodexOverlay(app, { towers: [] }, () => {});
    codex.setVisible(false);
    expect(isDraft(hit(stage, centre(racialTileRect())), draft)).toBe(true);
  });
});
