/**
 * ⛔⛔ S189 C1 (owner) — HIS CRUISER DRAWS ABOVE THE UPGRADE DRAFT PANEL.
 *
 * > *"the upgrades that you have in level zero, level five, level 10, the spark should be one layer
 * > above … it gets highlighted when you mouse over it, but the mouse is under it"* — owner, S189
 *
 * "The spark" is his POINTER — the local avatar `AvatarRenderer` draws at `controls.cursor` in its own
 * `avatarRendererLocal` layer (S153 A1), with the OS cursor hidden during PLAYING (S86 P4). main.ts
 * stages that layer LAST (`bringLocalToFront`) so no HUD surface covers it. The draft panel still did,
 * and NOT because of construction order: `draftOverlay.ts` carried `zIndex = 900`, and
 * `exitButton.ts` sets `app.stage.sortableChildren = true`, so Pixi re-sorted the stage by zIndex
 * every frame and the panel landed above every zIndex-0 sibling — the cruiser included.
 *
 * WHAT THIS FILE PROVES, AND HOW FAR EACH PROOF REACHES:
 *   1. THE REAL CLASSES, SORTED THE WAY THE RENDERER SORTS. A real `AvatarRenderer` (synced against a
 *      started `World`, so its cruiser Graphics is actually drawn), a real `DraftOverlay` (rendered
 *      open), and the real `makeExitButton` (which is what makes the stage sortable), staged in
 *      main.ts's order, then `stage.sortChildren()` — the exact call `RenderGroupSystem` makes before
 *      it collects renderables. Restoring the zIndex turns this red (mutation-tested, see progress).
 *   2. THE INPUT SIDE, THROUGH PIXI'S OWN `EventBoundary`. With the cruiser on top, a hit-test at a
 *      tile still resolves to the panel — the cruiser is passive and cannot swallow the pick.
 *   3. ⚠ THE main.ts ORDER ITSELF, BY SOURCE TEXT — AND THIS IS THE LIMIT OF THE FILE. No renderer
 *      runs under vitest and main.ts is never imported here (canon §7b R183-G), so (1) stages a MODEL
 *      of main.ts's sequence. The source-text guard below proves the three lines EXIST in that order;
 *      it cannot prove they are REACHED at runtime. `e2e/fog.spec.ts` reads the live stage index of
 *      `avatarRendererLocal` and is the runtime half.
 */

import { afterAll, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Container, EventBoundary, type Application } from 'pixi.js';
// The federated-event mixin (`isInteractive` & co.). The browser build loads it through
// `browserAll` when the Application boots; Node never boots one, so it is loaded here by hand.
import 'pixi.js/events';
import { AvatarRenderer } from './avatarRenderer.ts';
import { DraftOverlay, generalTileRect, racialTileRect, type DraftOptions } from './draftOverlay.ts';
import { makeExitButton } from './exitButton.ts';
import { makeWorld, type World } from '../state/world.ts';
import { applyStartGame } from '../state/gameMode.ts';
import type { Controls } from '../input/controls.ts';
import type { PlayerId } from '../types.ts';

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

function centre(r: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function startedWorld(): { w: World; seat: PlayerId } {
  const w = makeWorld(0x189);
  applyStartGame(w, { type: 'START_GAME' } as never);
  return { w, seat: w.localPlayerId };
}

/** The three fields `AvatarRenderer.sync` reads off `Controls`. */
function fakeControls(seat: PlayerId, at: { x: number; y: number }): Controls {
  return { getPlayerId: () => seat, cursor: { x: at.x, y: at.y }, state: { kind: 'Idle' } } as unknown as Controls;
}

/**
 * main.ts's stage sequence for the surfaces involved, in its order:
 *   AvatarRenderer (both layers) … footer + character sheet lifted … DRAFT STAGED … cruiser lifted …
 *   exit button (the call that makes the stage sortable, with its own zIndex-900 root).
 * `hud` stands in for every zIndex-0 HUD surface staged before the draft (footer, sheet, castle panel).
 */
function buildStage(draftStagedBeforeLift = true, onPick: (p: string) => void = () => {}): {
  stage: Container;
  avatar: AvatarRenderer;
  draft: DraftOverlay;
  hud: Container;
  exitRoot: Container;
  w: World;
  seat: PlayerId;
} {
  const stage = new Container();
  const app = { stage } as unknown as Application;
  const avatar = new AvatarRenderer(app);
  const draft = new DraftOverlay(onPick, { optionsFor: () => LIVE, loadCard: () => new Promise(() => {}) });
  const hud = new Container({ label: 'hud-stand-in' });
  stage.addChild(hud);
  if (draftStagedBeforeLift) {
    stage.addChild(draft.container);
    avatar.bringLocalToFront();
  } else {
    avatar.bringLocalToFront();
    stage.addChild(draft.container);
  }
  const before = new Set(stage.children);
  makeExitButton(app, () => {});
  const exitRoot = stage.children.find((c) => !before.has(c))!;

  const { w, seat } = startedWorld();
  draft.render(w, seat);
  avatar.sync(w, fakeControls(seat, centre(generalTileRect())));
  return { stage, avatar, draft, hud, exitRoot, w, seat };
}

function localLayerOf(stage: Container): Container {
  const l = stage.children.find((c) => c.label === 'avatarRendererLocal');
  if (l === undefined) throw new Error('no avatarRendererLocal layer on the stage');
  return l;
}

describe('⛔ S189 C1 — the cruiser sorts ABOVE the draft panel on the real (sortable) stage', () => {
  it('the stage IS sortable — the premise that made a zIndex outrank child order', () => {
    const { stage } = buildStage();
    expect(stage.sortableChildren, 'exitButton.ts sets it; without it this whole file is moot').toBe(true);
  });

  it('REACH — the panel is open, the cruiser is drawn, and after the renderer\'s sort the cruiser is on top', () => {
    const { stage, avatar, draft } = buildStage();
    expect(draft.container.visible, 'the pre-wave-1 draft is open on a started match').toBe(true);
    const local = localLayerOf(stage);
    // The cruiser really was drawn into the local layer (not an empty container that sorts well).
    expect(local.children.length).toBeGreaterThan(0);
    expect(local.getLocalBounds().width).toBeGreaterThan(0);

    stage.sortChildren(); // what RenderGroupSystem._buildInstructions calls every frame
    const iDraft = stage.children.indexOf(draft.container);
    const iLocal = stage.children.indexOf(local);
    expect(iDraft).toBeGreaterThanOrEqual(0);
    expect(iLocal, 'his cruiser must draw above the draft panel').toBeGreaterThan(iDraft);
    // The remote-avatar container stays where it was — under the fog, under the panel (S153 A1:
    // lifting the whole renderer would show enemy cruisers through fog of war).
    expect(stage.children.indexOf(avatar.layer)).toBeLessThan(iDraft);
  });

  it('the panel still covers every zIndex-0 HUD surface staged before it (footer, sheet, castle panel)', () => {
    const { stage, draft, hud } = buildStage();
    stage.sortChildren();
    expect(stage.children.indexOf(draft.container)).toBeGreaterThan(stage.children.indexOf(hud));
  });

  it('⚠ STATED, NOT CHANGED — the exit confirm modal (zIndex 900) still draws over the cruiser', () => {
    // Pre-existing and untouched by C1. Recorded so a later session sees it is known, not missed.
    const { stage, exitRoot } = buildStage();
    stage.sortChildren();
    expect(exitRoot.zIndex).toBe(900);
    expect(stage.children.indexOf(exitRoot)).toBeGreaterThan(stage.children.indexOf(localLayerOf(stage)));
  });

  it('NEGATIVE — staged AFTER the lift, the panel covers the cruiser again: the order is the mechanism', () => {
    const { stage, draft } = buildStage(false);
    stage.sortChildren();
    expect(stage.children.indexOf(localLayerOf(stage))).toBeLessThan(stage.children.indexOf(draft.container));
  });

  it('⛔ the panel carries no zIndex — any positive one outranks the cruiser on this stage', () => {
    const { draft } = buildStage();
    expect(draft.container.zIndex).toBe(0);
  });
});

describe('⭐ the INPUT side — a draft tile still takes the pick with the cruiser drawn over it', () => {
  it('Pixi\'s EventBoundary resolves a hit on either tile to the PANEL, never to the cruiser', () => {
    const { stage, draft } = buildStage();
    stage.sortChildren();
    const boundary = new EventBoundary(stage);
    for (const p of [centre(generalTileRect()), centre(racialTileRect())]) {
      expect(boundary.hitTest(p.x, p.y), `hit at ${p.x},${p.y}`).toBe(draft.container);
    }
  });

  it('and a tap delivered to what the boundary hit still sends the pick the panel always sent', () => {
    const picks: string[] = [];
    const { stage, draft } = buildStage(true, (p) => picks.push(p));
    stage.sortChildren();
    const boundary = new EventBoundary(stage);
    const at = centre(racialTileRect());
    const hit = boundary.hitTest(at.x, at.y);
    expect(hit).toBe(draft.container);
    hit!.emit('pointertap', { global: at, button: 0 } as never);
    expect(picks).toEqual(['racial']);
  });

  it('NEGATIVE — with the panel closed, the same point hits nothing: the cruiser is never a target', () => {
    const { stage, draft, w, seat } = buildStage();
    w.draft = null;
    draft.render(w, seat);
    expect(draft.container.visible).toBe(false);
    stage.sortChildren();
    const at = centre(generalTileRect());
    expect(new EventBoundary(stage).hitTest(at.x, at.y)).toBeNull();
  });
});

/* ── ⚠ THE SOURCE-TEXT HALF. It proves the lines EXIST in this order; it cannot prove they RUN. ── */

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

describe('⛔ main.ts stages the panel between the HUD lifts and the cruiser lift (source text — limit stated above)', () => {
  const main = codeOnly(readFileSync(join(__dirname, '..', 'main.ts'), 'utf8'));
  const once = (needle: string): number => {
    const first = main.indexOf(needle);
    expect(first, `${needle} must appear in main.ts code`).toBeGreaterThanOrEqual(0);
    expect(main.indexOf(needle, first + 1), `${needle} must appear exactly once`).toBe(-1);
    return first;
  };

  it('footer lift < sheet lift < DRAFT STAGED < cruiser lift', () => {
    const footer = once('footerBand.bringToFront();');
    const sheet = once('characterSheet.bringToFront();');
    const draft = once('app.stage.addChild(draftOverlay.container);');
    const cruiser = once('avatarRenderer.bringLocalToFront();');
    expect(footer).toBeLessThan(sheet);
    expect(sheet).toBeLessThan(draft);
    expect(draft).toBeLessThan(cruiser);
  });
});

describe('⛔ ENUMERATED — every code-level zIndex on a Pixi object in src/ (a positive one escapes child order)', () => {
  /*
   * The mechanical half, per S182 lesson 2: rather than trusting that nobody adds one, COUNT them. On
   * a sortable stage a positive zIndex puts a container above the cruiser's layer no matter where
   * main.ts stages it. A new one fails here until someone proves the cruiser still sorts above it,
   * or records why it must not.
   */
  const ALLOWED: ReadonlyArray<{ file: string; why: string }> = [
    { file: 'render/exitButton.ts', why: 'the leave-match modal root; pre-existing, draws over the cruiser (stated above, unchanged by C1)' },
  ];
  const srcRoot = join(__dirname, '..');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) return walk(p);
      return /\.ts$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : [];
    });

  it('the list is exactly the allowed one', () => {
    const found = walk(srcRoot)
      .filter((p) => /(?<!style)\.zIndex\s*=(?!=)/.test(codeOnly(readFileSync(p, 'utf8'))))
      .map((p) => relative(srcRoot, p).replace(/\\/g, '/'))
      .sort();
    expect(found).toEqual(ALLOWED.map((a) => a.file));
  });
});
