/**
 * SPARK — 2-browser baseline smoke. The canonical E2E test.
 *
 * S46 P1 (BUG-CRITICAL-5) — this single spec drives the entire 1v1
 * regression-protection surface. Runs against `npm run dev` (DEV-mode
 * __SPARK__ accessor required). Each describe-block maps to one Sym.
 *
 * TDD protocol (Council C11/Δ2): per-Sym assertions ship initially as
 *   - `test()` (expected PASS today) for things confirmed working
 *   - `test.fixme()` for assertions blocked by an upcoming priority
 * As each priority (P2-P6) lands, the corresponding `fixme` flips to
 * `test`, and CI gate flips from RED→GREEN.
 *
 * Bundle impact: ZERO. e2e/ is excluded from vite build (devOnly).
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  canvasToCss,
  hostNewRoom,
  joinRoom,
  dragSparkTo,
  readWorldState,
  waitForWorld,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from './helpers';

/**
 * Open 2 independent browser contexts so each is its own WebRTC peer.
 * Helper returns { hostCtx, hostPage, joinerCtx, joinerPage }.
 */
async function open2Peers(browser: import('@playwright/test').Browser): Promise<{
  hostCtx: BrowserContext; hostPage: Page;
  joinerCtx: BrowserContext; joinerPage: Page;
}> {
  const hostCtx = await browser.newContext();
  const joinerCtx = await browser.newContext();
  const hostPage = await hostCtx.newPage();
  const joinerPage = await joinerCtx.newPage();
  return { hostCtx, hostPage, joinerCtx, joinerPage };
}

test.describe('S46 Baseline — lobby + match start (must pass after S46 P1 Phase A.0)', () => {
  test('Both peers reach PLAYING after host hosts + joiner joins + Begin Match', async ({ browser }) => {
    const { hostCtx, hostPage, joinerCtx, joinerPage } = await open2Peers(browser);
    try {
      // Phase 1: host opens lobby + gets code.
      const code = await hostNewRoom(hostPage);
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);

      // Phase 2: joiner joins.
      await joinRoom(joinerPage, code);

      // Phase 3: both peers see peerCount=1 (the other peer connected).
      await waitForWorld(hostPage, (w) => w.peerCount >= 1, 'host sees joiner connected', 60_000);
      await waitForWorld(joinerPage, (w) => w.peerCount >= 1, 'joiner sees host connected', 60_000);

      // Phase 4: host clicks Begin Match (button revealed by updatePeerStatus).
      // Begin Match button at (CANVAS_W/2 - BUTTON_W/2, paneY+PANE_HEIGHT+70)
      // = (960 - 110, 360 + 360 + 70) = (850, 790) — but anchor.set so center at 960, 814.
      const beginBtn = await canvasToCss(hostPage, CANVAS_WIDTH / 2, 814);
      await hostPage.mouse.click(beginBtn.x, beginBtn.y);

      // Phase 5: both peers transition to PLAYING + 1v1 + both players present.
      await waitForWorld(hostPage, (w) => w.gameState === 'PLAYING' && w.gameMode === '1v1' && w.players.length === 2, 'host PLAYING + 1v1 + 2 players');
      await waitForWorld(joinerPage, (w) => w.gameState === 'PLAYING' && w.gameMode === '1v1' && w.players.length === 2, 'joiner PLAYING + 1v1 + 2 players');

      // State convergence assertion: both peers have same player color codes.
      const hostState = await readWorldState(hostPage);
      const joinerState = await readWorldState(joinerPage);
      const hostColors = hostState.players.map((p) => p.color).sort();
      const joinerColors = joinerState.players.map((p) => p.color).sort();
      expect(hostColors).toEqual(joinerColors);
    } finally {
      await hostCtx.close();
      await joinerCtx.close();
    }
  });
});

test.describe('Sym A — joiner single-action LMB-place (GREEN post-S46 P2)', () => {
  test('Joiner LMB-drag-release places primitive at release position', async ({ browser }) => {
    const { hostCtx, hostPage, joinerCtx, joinerPage } = await open2Peers(browser);
    try {
      const code = await hostNewRoom(hostPage);
      await joinRoom(joinerPage, code);
      await waitForWorld(hostPage, (w) => w.peerCount >= 1, 'peers connected');
      const beginBtn = await canvasToCss(hostPage, CANVAS_WIDTH / 2, 814);
      await hostPage.mouse.click(beginBtn.x, beginBtn.y);
      await waitForWorld(hostPage, (w) => w.gameState === 'PLAYING', 'PLAYING on host');
      await waitForWorld(joinerPage, (w) => w.gameState === 'PLAYING', 'PLAYING on joiner');

      // Wait for free sparks to be present (spawner has been running).
      await waitForWorld(joinerPage, (w) => w.freeSparks.length >= 3, 'sparks spawned on joiner', 10_000);

      const beforeCount = (await readWorldState(joinerPage)).primitives.length;

      // Joiner drags a spark from the spawner zone to (1500, 400).
      const sparkId = await dragSparkTo(joinerPage, 1500, 400);
      expect(sparkId).not.toBeNull();

      // After LMB-up, joiner snapshot should show a new BLUE primitive at ~(1500, 400).
      await waitForWorld(
        joinerPage,
        (w) => w.primitives.length === beforeCount + 1
          && w.primitives.some((p) => p.placerColor === 0x3bd7ff && Math.abs(p.pos.x - 1500) < 50 && Math.abs(p.pos.y - 400) < 50),
        'joiner placed primitive at ~(1500, 400) in BLUE',
        15_000,
      );
    } finally {
      await hostCtx.close();
      await joinerCtx.close();
    }
  });
});

test.describe('Sym C — joiner self-bond (GREEN post-S46 P2+P3+P4)', () => {
  test('Joiner can bond own primitives', async ({ browser }) => {
    const { hostCtx, hostPage, joinerCtx, joinerPage } = await open2Peers(browser);
    try {
      const code = await hostNewRoom(hostPage);
      await joinRoom(joinerPage, code);
      await waitForWorld(hostPage, (w) => w.peerCount >= 1, 'peers connected');
      const beginBtn = await canvasToCss(hostPage, CANVAS_WIDTH / 2, 814);
      await hostPage.mouse.click(beginBtn.x, beginBtn.y);
      await waitForWorld(hostPage, (w) => w.gameState === 'PLAYING', 'PLAYING on host');
      await waitForWorld(joinerPage, (w) => w.gameState === 'PLAYING', 'PLAYING on joiner');
      await waitForWorld(joinerPage, (w) => w.freeSparks.length >= 5, 'sparks spawned');

      // Place 1st blue prim at (1500, 400).
      await dragSparkTo(joinerPage, 1500, 400);
      await waitForWorld(joinerPage, (w) => w.primitives.some((p) => p.placerColor === 0x3bd7ff), 'joiner placed 1st blue prim');
      // Place 2nd blue prim at (1530, 410) — should bond to 1st (within AUTO_BOND_RADIUS=60).
      await dragSparkTo(joinerPage, 1530, 410);
      // Assert: a bond exists between two BLUE prims.
      await waitForWorld(
        joinerPage,
        (w) => {
          const bluePrims = new Set(w.primitives.filter((p) => p.placerColor === 0x3bd7ff).map((p) => p.id));
          return w.bonds.some((b) => bluePrims.has(b.aId) && bluePrims.has(b.bId));
        },
        'joiner has blue-to-blue bond',
        15_000,
      );
    } finally {
      await hostCtx.close();
      await joinerCtx.close();
    }
  });
});

test.describe('Sym D — color-segregated bonds (GREEN post-S46 P3)', () => {
  test('Cross-color bond attempt is silently rejected', async ({ browser }) => {
    const { hostCtx, hostPage, joinerCtx, joinerPage } = await open2Peers(browser);
    try {
      const code = await hostNewRoom(hostPage);
      await joinRoom(joinerPage, code);
      await waitForWorld(hostPage, (w) => w.peerCount >= 1, 'peers connected');
      const beginBtn = await canvasToCss(hostPage, CANVAS_WIDTH / 2, 814);
      await hostPage.mouse.click(beginBtn.x, beginBtn.y);
      await waitForWorld(hostPage, (w) => w.gameState === 'PLAYING', 'PLAYING on host');
      await waitForWorld(joinerPage, (w) => w.gameState === 'PLAYING', 'PLAYING on joiner');
      await waitForWorld(joinerPage, (w) => w.freeSparks.length >= 5, 'sparks spawned');

      // Joiner places a blue prim at (1500, 400).
      await dragSparkTo(joinerPage, 1500, 400);
      await waitForWorld(joinerPage, (w) => w.primitives.some((p) => p.placerColor === 0x3bd7ff && Math.abs(p.pos.x - 1500) < 50), 'blue prim placed');
      // Host attempts to place red prim at (1520, 410) — close enough to bond.
      // After P3 (color-segregation), should place anchor (no bond) instead of cross-color bond.
      await dragSparkTo(hostPage, 1520, 410);
      await waitForWorld(hostPage, (w) => w.primitives.some((p) => p.placerColor === 0xff3b6b && Math.abs(p.pos.x - 1520) < 50), 'red prim placed');

      // Assert: NO bond between any RED prim and any BLUE prim.
      const state = await readWorldState(hostPage);
      const redIds = new Set(state.primitives.filter((p) => p.placerColor === 0xff3b6b).map((p) => p.id));
      const blueIds = new Set(state.primitives.filter((p) => p.placerColor === 0x3bd7ff).map((p) => p.id));
      const crossColorBonds = state.bonds.filter((b) => {
        return (redIds.has(b.aId) && blueIds.has(b.bId)) || (redIds.has(b.bId) && blueIds.has(b.aId));
      });
      expect(crossColorBonds).toEqual([]);
    } finally {
      await hostCtx.close();
      await joinerCtx.close();
    }
  });
});

test.describe('Sym E — score display layout (placeholder — needs Pixi Graphics bounds inspection helper for full assertion)', () => {
  test.fixme('Both score readouts show "/50" without charge-dot collision', async ({ browser }) => {
    const { hostCtx, hostPage, joinerCtx, joinerPage } = await open2Peers(browser);
    try {
      const code = await hostNewRoom(hostPage);
      await joinRoom(joinerPage, code);
      await waitForWorld(hostPage, (w) => w.peerCount >= 1, 'peers connected');
      const beginBtn = await canvasToCss(hostPage, CANVAS_WIDTH / 2, 814);
      await hostPage.mouse.click(beginBtn.x, beginBtn.y);
      await waitForWorld(hostPage, (w) => w.gameState === 'PLAYING', 'PLAYING');

      // Assert via DOM/canvas inspection that both score Text objects are
      // visible AND not horizontally overlapped by chargeDots Graphics.
      // Reads via __SPARK__ — the future-P6 fix moves charge dots to a
      // non-colliding x; this assertion verifies the bounding rects
      // don't intersect.
      const layout = await hostPage.evaluate(() => {
        const spark = (window as { __SPARK__?: { app: { stage: { children: Array<{ label?: string; getBounds?: () => { x: number; y: number; width: number; height: number } }> } } } }).__SPARK__;
        if (!spark) return null;
        // P6 will add `label` to scoreText + chargeDots Graphics objects.
        // For now this is a placeholder that returns null → fixme expected.
        return null;
      });
      expect(layout).not.toBeNull();
    } finally {
      await hostCtx.close();
      await joinerCtx.close();
    }
  });
});
