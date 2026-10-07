/**
 * ⭐ S196 (ui-5) — THE ONE POINTER MAPPING: arithmetic over the viewport × DPR matrix, the Pixi reach,
 * the negative (Pixi's own formula really is wrong when letterboxed), and the CENSUS that makes a new
 * pointer-conversion site that bypasses `clientToCanvas` fail this file.
 *
 * The browser-level REACH (a real hover and a real click at the visual centre of the castle panel's rows
 * and pull slots, the footer chips and the title button, at 960×1080 / 1366×768@1.25 / 1920×947@1.5) is
 * `e2e/click-offset.spec.ts`; its gating describe went RED with `installLetterboxPointerMapping(app)`
 * commented out of main.ts (mutation, S196) and green with it in.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { EventSystem } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import { mapCanvasRectToPage } from '../render/lobbyGeometry.ts';
import {
  clientToCanvas,
  installLetterboxPointerMapping,
  LETTERBOX_MAPPING_TAG,
  type ClientRectLike,
  type PointerMappedApp,
} from './pointerMapping.ts';

/**
 * The canvas' CSS box for a window, per index.html: `#app` is 100vw × 100vh, flex-centred; the canvas
 * has autoDensity's 1920×1080 CSS size capped by `max-width/max-height: 100%`. DPR does not enter: it
 * changes the BACKING store (canvas.width = 1920·dpr), never the CSS box.
 */
function canvasBox(vw: number, vh: number): ClientRectLike {
  const width = Math.min(CANVAS_WIDTH, vw);
  const height = Math.min(CANVAS_HEIGHT, vh);
  return { left: (vw - width) / 2, top: (vh - height) / 2, width, height };
}

/** Where a canvas point is DRAWN on screen (object-fit: contain) — what the player aims at. */
function drawnAt(rect: ClientRectLike, cx: number, cy: number): { x: number; y: number } {
  const p = mapCanvasRectToPage(rect, CANVAS_WIDTH, CANVAS_HEIGHT, cx, cy, 0, 0);
  return { x: p.left, y: p.top };
}

/** Pixi 8.19's stock `EventSystem.mapPositionToPoint`, transcribed — the formula the game used to get. */
function pixiStock(rect: ClientRectLike, dpr: number, x: number, y: number): { x: number; y: number } {
  const bw = CANVAS_WIDTH * dpr;
  const bh = CANVAS_HEIGHT * dpr;
  return { x: (x - rect.left) * (bw / rect.width) / dpr, y: (y - rect.top) * (bh / rect.height) / dpr };
}

const VIEWPORTS: ReadonlyArray<readonly [number, number, string]> = [
  [1920, 1080, 'full 1080p (16:9 — the only size e2e ever used)'],
  [960, 1080, 'half a 1080p screen'],
  [1366, 768, 'laptop'],
  [1920, 947, '1080p window minus a browser toolbar'],
  [2560, 1440, '1440p monitor'],
  [1280, 1024, '5:4 monitor'],
  [800, 1200, 'portrait'],
];
const DPRS = [1, 1.25, 1.5, 2] as const;
/** Targets spread over the canvas: the castle panel's side, the footer, the corners, the centre. */
const POINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [1920, 1080], [960, 540], [300, 600], [1700, 200], [500, 1040], [1500, 1040],
];

/** A fake connected canvas + a REAL Pixi EventSystem bound to it. */
function realEventSystem(rect: ClientRectLike, dpr: number): { app: PointerMappedApp; es: EventSystem } {
  const es = new EventSystem({} as never);
  const canvas = {
    isConnected: true,
    width: CANVAS_WIDTH * dpr,
    height: CANVAS_HEIGHT * dpr,
    getBoundingClientRect: () => rect,
  };
  (es as unknown as { domElement: unknown }).domElement = canvas;
  es.resolution = dpr;
  return { app: { canvas, renderer: { events: es } } as PointerMappedApp, es };
}

/** Drive Pixi's OWN normalisation path (public `normalizeWheelEvent` → `this.mapPositionToPoint`). */
function pixiGlobal(es: EventSystem, x: number, y: number): { x: number; y: number } {
  // `normalizeWheelEvent` is protected in the .d.ts and public at runtime — it is Pixi's own normalisation path.
  const ev = (es as unknown as { normalizeWheelEvent(e: WheelEvent): { global: { x: number; y: number } } }).normalizeWheelEvent({ clientX: x, clientY: y, deltaX: 0, deltaY: 0, deltaZ: 0, deltaMode: 0, type: 'wheel' } as WheelEvent);
  return { x: ev.global.x, y: ev.global.y };
}

describe('S196 clientToCanvas — the visual centre maps back to the canvas point at every size × DPR', () => {
  for (const [vw, vh, label] of VIEWPORTS) {
    it(`${vw}×${vh} (${label})`, () => {
      const rect = canvasBox(vw, vh);
      for (const [cx, cy] of POINTS) {
        const s = drawnAt(rect, cx, cy);
        const p = clientToCanvas(rect, s.x, s.y);
        expect(p.x).toBeCloseTo(cx, 6);
        expect(p.y).toBeCloseTo(cy, 6);
      }
    });
  }

  it('a zero-size rect (detached / display:none canvas) maps to the origin, never NaN', () => {
    expect(clientToCanvas({ left: 0, top: 0, width: 0, height: 0 }, 50, 50)).toEqual({ x: 0, y: 0 });
  });
});

describe('S196 installLetterboxPointerMapping — REACHED by a real Pixi EventSystem, at every size × DPR', () => {
  for (const [vw, vh] of VIEWPORTS) {
    for (const dpr of DPRS) {
      it(`${vw}×${vh} @ ${dpr}: Pixi's federated global == the drawn point`, () => {
        const rect = canvasBox(vw, vh);
        const { app, es } = realEventSystem(rect, dpr);
        installLetterboxPointerMapping(app);
        for (const [cx, cy] of POINTS) {
          const s = drawnAt(rect, cx, cy);
          const g = pixiGlobal(es, s.x, s.y);
          expect(g.x).toBeCloseTo(cx, 6);
          expect(g.y).toBeCloseTo(cy, 6);
        }
      });
    }
  }

  it('⛔ NEGATIVE — WITHOUT the install, stock Pixi misses by the letterbox bar (the owner\'s bug, measured)', () => {
    // 1920×947: the castle side of the board. Stock Pixi lands ~+82 px RIGHT of the cursor — so the
    // player had to aim LEFT. This is the BEFORE row of e2e/click-offset.spec.ts, in arithmetic.
    const rect = canvasBox(1920, 947);
    const { es } = realEventSystem(rect, 1.5);
    const s = drawnAt(rect, 300, 600);
    const g = pixiGlobal(es, s.x, s.y);
    expect(g.x - 300).toBeGreaterThan(60);
    expect(g).toEqual(pixiStock(rect, 1.5, s.x, s.y)); // our transcription IS Pixi's formula
    // …and at a 16:9 box the two formulas agree, which is why a 1920×1080-only suite never saw it.
    const full = canvasBox(1920, 1080);
    const f = drawnAt(full, 300, 600);
    expect(pixiStock(full, 2, f.x, f.y).x).toBeCloseTo(300, 6);
  });

  it('idempotent, tagged, and a detached canvas falls back to the logical identity', () => {
    const rect = canvasBox(960, 1080);
    const { app, es } = realEventSystem(rect, 1);
    installLetterboxPointerMapping(app);
    const first = es.mapPositionToPoint;
    installLetterboxPointerMapping(app);
    expect(es.mapPositionToPoint).toBe(first);
    expect((es as unknown as Record<string, unknown>)[LETTERBOX_MAPPING_TAG]).toBe(true);
    (app.canvas as { isConnected: boolean }).isConnected = false;
    expect(pixiGlobal(es, 123, 456)).toEqual({ x: 123, y: 456 });
  });
});

// ── THE CENSUS ────────────────────────────────────────────────────────────────────────────────────
/*
 * ⛔ A source-text guard proves a line EXISTS, not that it is REACHED (CLAUDE.md, S182) — the reach is
 * above and in the e2e. What THIS proves is the other half: there is no SECOND conversion. Every token
 * that turns a DOM pointer/rect into a coordinate is enumerated mechanically across `src/**` (code only,
 * comments stripped); each file that holds one is listed here with its exact count and the reason. A new
 * site fails until someone routes it through `clientToCanvas` or adds a row here and says why.
 */
const TOKEN = /\b(?:clientX|clientY|pageX|pageY|screenX|screenY|offsetX|offsetY|layerX|layerY|movementX|movementY)\b|getBoundingClientRect|getClientRects|mapPositionToPoint|devicePixelRatio/g;

const ALLOWED: Readonly<Record<string, { count: number; why: string }>> = {
  'src/input/pointerMapping.ts': { count: 8, why: 'THE conversion + the Pixi patch' },
  'src/input/controls.ts': { count: 3, why: 'updateCursor → clientToCanvas(rect, clientX, clientY), one line' },
  'src/main.ts': { count: 1, why: 'renderer resolution = devicePixelRatio (backing store, not mapping)' },
  'src/render/lobbyGeometry.ts': { count: 12, why: 'the pure letterbox fit math clientToCanvas delegates to' },
  'src/render/lobbyScreen.ts': { count: 1, why: 'places the HTML join <input> via mapCanvasRectToPage (canvas → page, not pointer)' },
  'src/render/cutsceneOverlay.ts': { count: 1, why: 'sizes the cutscene <video> to the canvas box (object-fit: contain, same box)' },
};

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/**
 * ⛔ OFF-LIMITS by owner rule (S192/S194, S196_AGENT_RULES): Pitch Masters, NONET and the arcade screens
 * are excluded from every enumeration — a session may not edit them, so a tripwire must not fire on them.
 * (Their Pixi events still get the fixed mapping: the patch is on the shared renderer.)
 */
const OFF_LIMITS = /^src\/(?:arcade\/|nonet\/|render\/arcade[^/]*\.ts$|render\/nonet[^/]*\.ts$|render\/sudokuOverlay\.ts$)/;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (OFF_LIMITS.test(relative(join(__dirname, '..', '..'), p).split(sep).join('/'))) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.endsWith('.d.ts')) out.push(p);
  }
}

describe('S196 census — no pointer-conversion site bypasses clientToCanvas', () => {
  const root = join(__dirname, '..', '..');
  const files: string[] = [];
  walk(join(root, 'src'), files);
  const found: Record<string, number> = {};
  for (const f of files) {
    const n = (stripComments(readFileSync(f, 'utf-8')).match(TOKEN) ?? []).length;
    if (n > 0) found[relative(root, f).split(sep).join('/')] = n;
  }

  it('anti-vacuity + exclusion: the walk sees src/input and src/render, and none of the off-limits trees', () => {
    const rel = files.map((f) => relative(root, f).split(sep).join('/'));
    expect(rel).toContain('src/input/controls.ts');
    expect(rel).toContain('src/render/footerBand.ts');
    expect(rel.filter((f) => OFF_LIMITS.test(f))).toEqual([]);
    expect(OFF_LIMITS.test('src/arcade/pitchMasters/x.ts') && OFF_LIMITS.test('src/render/arcadeOverlay.ts') && OFF_LIMITS.test('src/nonet/a.ts')).toBe(true);
  });

  it('every file holding a conversion token is on the list, with its exact count', () => {
    expect(found).toEqual(Object.fromEntries(Object.entries(ALLOWED).map(([k, v]) => [k, v.count])));
  });

  it('Controls reads clientX/clientY ONLY inside a clientToCanvas( call', () => {
    const code = stripComments(readFileSync(join(root, 'src/input/controls.ts'), 'utf-8'));
    const lines = code.split(/\r?\n/).filter((l) => /\bclient[XY]\b/.test(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/clientToCanvas\(this\.app\.canvas\.getBoundingClientRect\(\), e\.clientX, e\.clientY\)/);
  });

  it('main.ts installs the mapping straight after the canvas is mounted, before any input is constructed', () => {
    const code = stripComments(readFileSync(join(root, 'src/main.ts'), 'utf-8'));
    const mount = code.indexOf('root.appendChild(app.canvas);');
    const install = code.indexOf('installLetterboxPointerMapping(app);');
    const controls = code.indexOf('new Controls(');
    expect(mount).toBeGreaterThan(0);
    expect(install).toBeGreaterThan(mount);
    expect(install).toBeLessThan(controls);
    expect(code.split('installLetterboxPointerMapping(app);').length - 1).toBe(1);
  });
});
