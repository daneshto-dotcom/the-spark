/**
 * ⭐ S196 (ui-5) — REACH for the LOBBY's two SKINNED census rows: the grammar buttons (`attachButtonFeedback`:
 * Host New Room, QUICK MATCH, Back to Title, TEST CONNECTION, Begin Match, READY) and the JOIN pane's
 * Connect chip (`this.joinButton.`). NOT DONE in S195 because the teams tree owned `lobby*.ts`; this file
 * only READS it — it constructs the REAL `LobbyScreen` and clicks it.
 *
 * ⭐ THROUGH PIXI'S OWN HIT-TEST, not `emit`. Every click here is a `pointermove → pointerdown → pointerup`
 * fed to a real `EventBoundary` over the real stage, at a GLOBAL canvas point taken from the screen's own
 * `getUiPoints` (the e2e seam). So it proves what the e2e harness relies on: the point the screen REPORTS
 * is the point Pixi HITS, and the hit reaches the callback. Per button:
 *   · the centre is taken (the callback fires exactly once); 3 px inside each edge of the plate still hits
 *     the button; 3 px outside does not;
 *   · its sheen rect is its hit rect (the skin moved no target) and the sheen sweeps only while hovered;
 *   · NEGATIVE: a hidden button (Begin / READY in the select view) takes nothing, and the Connect chip with
 *     an incomplete code is reached but does not join (its own guard, not a dead pixel).
 */
// ⭐ S196 — census pairing (read by uiSkinCensus.reach.test.ts): the SKINNED rows this file REACHES.
// CENSUS-REACH src/render/lobbyScreen.ts :: this.joinButton.
// CENSUS-REACH src/render/lobbyScreen.ts :: attachButtonFeedback(
import { describe, expect, it, vi } from 'vitest';
import { Container, EventBoundary, FederatedPointerEvent, Graphics, Ticker, updateRenderGroupTransforms } from 'pixi.js';
import 'pixi.js/events';
import { installFakeTextCanvas } from './fakeTextCanvas.fixtures.ts';
import { sheenRectOf } from './uiSkinButton.ts';

vi.mock('./audioManager.ts', () => ({ playUiClickSFX: vi.fn(async () => {}), playUiRefusedSFX: vi.fn(async () => {}) }));
installFakeTextCanvas();
vi.stubGlobal('requestAnimationFrame', () => 0);
vi.stubGlobal('cancelAnimationFrame', () => {});
vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {}, innerWidth: 1920, innerHeight: 1080 });
/** The one DOM node the lobby creates: the room-code <input>. */
const inputListeners = new Map<string, (e: unknown) => void>();
const inputEl = {
  style: {} as Record<string, string>, value: '', type: '', maxLength: 0, pattern: '', placeholder: '', autocomplete: '', spellcheck: true,
  setAttribute() {}, focus() {}, blur() {}, remove() {},
  addEventListener(t: string, f: (e: unknown) => void) { inputListeners.set(t, f); },
  removeEventListener() {},
};
/**
 * Pixi's DOM adapter also asks `document` for a <canvas> (text measuring, gradient fills in the title
 * style). A PERMISSIVE 2D context: `measureText` from the fixture's fake (so layout is deterministic), and
 * any other method a no-op returning another permissive object (gradients, patterns). Nothing here is
 * rendered — only geometry and listeners are under test.
 */
const permissive = (): unknown => new Proxy(() => permissive(), { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : permissive()) });
function fakeCanvas(): unknown {
  const base = new (globalThis as unknown as { OffscreenCanvas: new (w: number, h: number) => { getContext(): object } }).OffscreenCanvas(1, 1);
  const ctx = base.getContext() as Record<string | symbol, unknown>;
  const proxied = new Proxy(ctx, { get: (t, k) => (k in t ? t[k] : permissive()), set: (t, k, v) => { t[k] = v; return true; } });
  return { width: 1, height: 1, style: {}, getContext: () => proxied };
}
vi.stubGlobal('document', {
  createElement: (tag: string) => (tag === 'input' ? inputEl : fakeCanvas()),
  body: { appendChild() {} },
});

const { LobbyScreen } = await import('./lobbyScreen.ts');

/** Real stage + real EventBoundary; transforms refreshed before every event (a hover RESCALES a button). */
function harness(): { stage: Container; click(x: number, y: number): void; hover(x: number, y: number): void; hit(x: number, y: number): Container | null } {
  const stage = new Container({ isRenderGroup: true });
  stage.eventMode = 'static';
  const eb = new EventBoundary(stage);
  const sync = (): void => updateRenderGroupTransforms(stage.renderGroup!, true);
  const ev = (type: string, x: number, y: number): FederatedPointerEvent => {
    const e = new FederatedPointerEvent(eb);
    e.type = type; e.pointerId = 1; e.pointerType = 'mouse'; e.isPrimary = true; e.button = 0;
    e.buttons = type === 'pointerdown' ? 1 : 0;
    e.global.set(x, y); e.screen.set(x, y);
    return e;
  };
  return {
    stage,
    hover(x, y) { sync(); eb.mapEvent(ev('pointermove', x, y)); },
    click(x, y) {
      sync(); eb.mapEvent(ev('pointermove', x, y));
      sync(); eb.mapEvent(ev('pointerdown', x, y));
      sync(); eb.mapEvent(ev('pointerup', x, y));
      sync(); eb.mapEvent(ev('pointermove', 1, 1)); // leave: un-hover so the next button starts at rest
    },
    hit(x, y) { sync(); return eb.hitTest(x, y) as Container | null; },
  };
}

function makeLobby() {
  const h = harness();
  const cb = {
    onHostStart: vi.fn(() => 'ABC234'), onJoinAttempt: vi.fn(), onBeginMatch: vi.fn(), onBackToTitle: vi.fn(),
    onReturnFromConnectionLost: vi.fn(), onQuickMatch: vi.fn(), onToggleReady: vi.fn(), onTestConnection: vi.fn(),
    onPickRace: vi.fn(), onPickTeam: vi.fn(), onMoveSeat: vi.fn(),
  };
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }) };
  const lobby = new LobbyScreen({ stage: h.stage, canvas, screen: { width: 1920, height: 1080 } } as never, cb as never);
  lobby.setVisible(true);
  return { h, cb, lobby, pts: () => lobby.getUiPoints!() };
}

/** Is `n` the button or inside it? */
const within = (n: Container | null, b: Container): boolean => { for (let p = n; p !== null; p = p.parent) if (p === b) return true; return false; };

/** The button whose plate holds the reported centre — found by walking the stage for a sheened static container. */
function buttonAt(stage: Container, x: number, y: number): Container {
  const all: Container[] = [];
  const walk = (n: Container): void => { if (sheenRectOf(n) !== undefined && n.eventMode === 'static') all.push(n); for (const c of n.children) walk(c as Container); };
  walk(stage);
  updateRenderGroupTransforms(stage.renderGroup!, true);
  const shown = (b: Container): boolean => { for (let n: Container | null = b; n !== null; n = n.parent) if (!n.visible) return false; return true; };
  const hits = all.filter(shown).filter((b) => {
    const r = sheenRectOf(b)!;
    const p = b.worldTransform.applyInverse({ x, y });
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  });
  expect(hits.length, `one VISIBLE sheened button at (${x},${y})`).toBe(1);
  return hits[0]!;
}

/** Inside/outside via Pixi's hit-test, in GLOBAL space, around the button's own world-space plate. */
function checkEdges(h: ReturnType<typeof harness>, b: Container, label: string): void {
  const r = sheenRectOf(b)!;
  const ha = b.hitArea as { x: number; y: number; width: number; height: number } | null;
  if (ha != null) expect([r.x, r.y, r.w, r.h], `${label}: sheen rect = hit rect`).toEqual([ha.x, ha.y, ha.width, ha.height]);
  const tl = b.worldTransform.apply({ x: r.x, y: r.y });
  const br = b.worldTransform.apply({ x: r.x + r.w, y: r.y + r.h });
  const cx = (tl.x + br.x) / 2;
  const cy = (tl.y + br.y) / 2;
  for (const [x, y] of [[tl.x + 3, cy], [br.x - 3, cy], [cx, tl.y + 3], [cx, br.y - 3]] as const) {
    expect(within(h.hit(x, y), b), `${label}: inside at (${x},${y})`).toBe(true);
  }
  for (const [x, y] of [[tl.x - 3, cy], [br.x + 3, cy], [cx, tl.y - 3], [cx, br.y + 3]] as const) {
    expect(within(h.hit(x, y), b), `${label}: outside at (${x},${y})`).toBe(false);
  }
}

function checkSheen(h: ReturnType<typeof harness>, b: Container, x: number, y: number, label: string): void {
  const r = sheenRectOf(b)!;
  const sheen = b.getChildByLabel('sheen') as Graphics;
  h.hover(x, y);
  let drew = 0;
  for (let k = 0; k < 40; k++) {
    Ticker.shared.update(Ticker.shared.lastTime + 50);
    if (sheen.context.instructions.length === 0) continue;
    drew++;
    const s = sheen.bounds;
    expect(s.minX >= r.x && s.minY >= r.y && s.maxX <= r.x + r.w && s.maxY <= r.y + r.h, `${label}: sheen inside`).toBe(true);
  }
  expect(drew, `${label}: the sheen swept while hovered`).toBeGreaterThan(5);
  h.hover(1, 1);
  expect(sheen.context.instructions.length, `${label}: sheen cleared on out`).toBe(0);
}

describe('S196 — the lobby grammar buttons: reported centre → Pixi hit → callback, skinned on the hit rect', () => {
  it('SELECT view: QUICK MATCH, Back to Title, TEST CONNECTION, Host New Room', () => {
    const { h, cb, pts } = makeLobby();
    const p = pts();
    const cases: Array<[string, { x: number; y: number }, () => number]> = [
      ['QUICK MATCH', p.quickMatchButton, () => cb.onQuickMatch.mock.calls.length],
      ['TEST CONNECTION', p.testConnectionButton, () => cb.onTestConnection.mock.calls.length],
      ['Host New Room', p.hostButton, () => cb.onHostStart.mock.calls.length],
    ];
    for (const [label, c, calls] of cases) {
      const b = buttonAt(h.stage, c.x, c.y);
      checkEdges(h, b, label);
      checkSheen(h, b, c.x, c.y, label);
      expect(calls(), `${label}: not yet clicked`).toBe(0);
      h.click(c.x, c.y);
      expect(calls(), `${label}: one click at the reported centre reached the callback`).toBe(1);
    }
    // Back last: it resets the screen.
    const back = buttonAt(h.stage, p.backButton.x, p.backButton.y);
    checkEdges(h, back, 'Back to Title');
    h.click(p.backButton.x, p.backButton.y);
    expect(cb.onBackToTitle).toHaveBeenCalledTimes(1);
  });

  it('⛔ NEGATIVE: Begin and READY are hidden in SELECT — their reported centres take no click', () => {
    const { h, cb, pts } = makeLobby();
    const p = pts();
    h.click(p.beginButton.x, p.beginButton.y);
    h.click(p.readyButton.x, p.readyButton.y);
    expect(cb.onBeginMatch).not.toHaveBeenCalled();
    expect(cb.onToggleReady).not.toHaveBeenCalled();
  });

  it('HOSTING with a peer: Begin Match is reached at its reported centre', () => {
    const { h, cb, lobby, pts } = makeLobby();
    h.click(pts().hostButton.x, pts().hostButton.y);
    lobby.updatePeerStatus(1);
    const c = pts().beginButton;
    const b = buttonAt(h.stage, c.x, c.y);
    expect(b.visible, 'Begin revealed once a peer joined').toBe(true);
    checkEdges(h, b, 'Begin Match');
    h.click(c.x, c.y);
    expect(cb.onBeginMatch).toHaveBeenCalledTimes(1);
  });

  it('QUICK MATCH room: READY toggles at its reported centre (and toggles back)', () => {
    const { h, cb, lobby, pts } = makeLobby();
    lobby.setQuickmatch(true);
    lobby.applyQuickmatchHosting('ABC234');
    const c = pts().readyButton;
    const b = buttonAt(h.stage, c.x, c.y);
    checkEdges(h, b, 'READY');
    h.click(c.x, c.y);
    h.click(c.x, c.y);
    expect(cb.onToggleReady.mock.calls.map((a) => a[0])).toEqual([true, false]);
  });
});

describe('S196 — the JOIN pane Connect chip: reached through Pixi, lit only with a complete code', () => {
  it('a complete code: the chip at its reported centre joins with that code; edges in/out', () => {
    const { h, cb, pts } = makeLobby();
    inputEl.value = 'ABC234';
    inputListeners.get('input')!({});
    const c = pts().joinButton;
    const b = buttonAt(h.stage, c.x, c.y);
    expect(b.alpha, 'lit with six valid characters').toBe(1);
    checkEdges(h, b, 'Connect');
    checkSheen(h, b, c.x, c.y, 'Connect');
    h.click(c.x, c.y);
    expect(cb.onJoinAttempt).toHaveBeenCalledWith('ABC234');
  });

  it('⛔ NEGATIVE: an incomplete code — the chip is reached (it is the hit) but does not join, and its sheen stays dark', () => {
    const { h, cb, pts } = makeLobby();
    inputEl.value = 'AB';
    inputListeners.get('input')!({});
    const c = pts().joinButton;
    const b = buttonAt(h.stage, c.x, c.y);
    expect(b.alpha).toBeLessThan(1);
    expect(within(h.hit(c.x, c.y), b), 'still the hit target (a guard, not a dead pixel)').toBe(true);
    h.click(c.x, c.y);
    expect(cb.onJoinAttempt).not.toHaveBeenCalled();
    const sheen = b.getChildByLabel('sheen') as Graphics;
    h.hover(c.x, c.y);
    for (let k = 0; k < 20; k++) Ticker.shared.update(Ticker.shared.lastTime + 50);
    expect(sheen.context.instructions.length).toBe(0);
    h.hover(1, 1);
  });
});
