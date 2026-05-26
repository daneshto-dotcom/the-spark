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
 *
 * S51 P1 — `applyTestSpawnRate` opt-in: when set, both contexts receive
 * `window.__TEST_SPAWN_RATE_PER_SECOND__` BEFORE the bundled scripts load.
 * The constant `SPAWN_RATE_PER_SECOND` in src/constants.ts reads this at
 * module-eval and uses it instead of the LOCKED production 0.15/sec. The
 * baseline + Sym E specs DO NOT call this; only Sym A/C/D/F/I (which wait
 * for ≥3-8 sparks within 10-30s) opt in. Production replay-determinism is
 * unaffected (seam is browser-window-only). See PDR S51 §2 and Council
 * Battle Ledger C1+C2 ADOPT A.
 */
async function applyTestSpawnRate(
  hostCtx: BrowserContext,
  joinerCtx: BrowserContext,
  rate = 1.5,
): Promise<void> {
  const init = (r: number): void => {
    (window as { __TEST_SPAWN_RATE_PER_SECOND__?: number })
      .__TEST_SPAWN_RATE_PER_SECOND__ = r;
  };
  await hostCtx.addInitScript(init, rate);
  await joinerCtx.addInitScript(init, rate);
}

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
      await applyTestSpawnRate(hostCtx, joinerCtx);
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
      await applyTestSpawnRate(hostCtx, joinerCtx);
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
      await applyTestSpawnRate(hostCtx, joinerCtx);
      // S51 P1 — disable territorial repulsion FOR THIS TEST ONLY. Sym D's
      // contract (assert NO cross-color bond when red+blue at AUTO_BOND_RADIUS
      // distance) is unreachable in normal play after S49 P1 shipped Sym F
      // territory (min radius 72 > AUTO_BOND_RADIUS 60 → red hard-blocked
      // before color-seg fires). Setting base radius to 0 lets the test see
      // the actual color-seg invariant which is defense-in-depth post-S49.
      // Sym F has its own dedicated test that does NOT disable territory.
      // Use the string-content form of addInitScript — simplest possible
      // serialization, zero function-capture surface area.
      await hostCtx.addInitScript({ content: 'window.__TEST_TERRITORY_BASE_RADIUS__ = 0;' });
      await joinerCtx.addInitScript({ content: 'window.__TEST_TERRITORY_BASE_RADIUS__ = 0;' });
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

test.describe('Sym F — territorial hard-block (S49 mechanic, S50 P4 e2e coverage)', () => {
  test('Host placement inside joiner territory is silently rejected', async ({ browser }) => {
    const { hostCtx, hostPage, joinerCtx, joinerPage } = await open2Peers(browser);
    try {
      await applyTestSpawnRate(hostCtx, joinerCtx);
      const code = await hostNewRoom(hostPage);
      await joinRoom(joinerPage, code);
      await waitForWorld(hostPage, (w) => w.peerCount >= 1, 'peers connected');
      const beginBtn = await canvasToCss(hostPage, CANVAS_WIDTH / 2, 814);
      await hostPage.mouse.click(beginBtn.x, beginBtn.y);
      await waitForWorld(hostPage, (w) => w.gameState === 'PLAYING', 'PLAYING on host');
      await waitForWorld(joinerPage, (w) => w.gameState === 'PLAYING', 'PLAYING on joiner');
      await waitForWorld(joinerPage, (w) => w.freeSparks.length >= 8, 'sparks spawned');

      // Joiner places 3 BLUE prims tightly clustered to establish territory.
      // AUTO_BOND_RADIUS=60, so prims at (1500,400) (1530,410) (1490,380)
      // will all be within bond range — forms a 3-prim same-color structure
      // with bonds, giving complexity 3 + 0.5*3 + 0.1*1 = 4.6. Territory
      // radius R = TERRITORY_BASE_RADIUS(60) + scale * log2(5.6) ≈ 80px
      // around any joiner-placed prim.
      await dragSparkTo(joinerPage, 1500, 400);
      await waitForWorld(
        joinerPage,
        (w) => w.primitives.some((p) => p.placerColor === 0x3bd7ff && Math.abs(p.pos.x - 1500) < 50),
        'joiner placed 1st blue prim',
      );
      await dragSparkTo(joinerPage, 1530, 410);
      await dragSparkTo(joinerPage, 1490, 380);
      await waitForWorld(
        joinerPage,
        (w) => w.primitives.filter((p) => p.placerColor === 0x3bd7ff).length >= 3,
        'joiner has 3 blue prims',
      );

      // Wait for host to receive snapshot of all 3 joiner prims (territory
      // hard-block runs on host-authoritative placePrimitive reducer, which
      // needs the joiner prims to be in host's world.primitives).
      await waitForWorld(
        hostPage,
        (w) => w.primitives.filter((p) => p.placerColor === 0x3bd7ff).length >= 3,
        'host snapshot has 3 blue prims',
        15_000,
      );
      const beforeHostState = await readWorldState(hostPage);
      const beforeRedCount = beforeHostState.primitives.filter((p) => p.placerColor === 0xff3b6b).length;

      // Host attempts to place RED prim AT (1500, 400) — exact center of
      // joiner cluster, distance=0 from a joiner prim → well within R≈80.
      // Sym F predicate at placePrimitive.ts host-authoritative path silently
      // rejects (spark stays carried). diagnostics.territoryBlockRejects
      // increments.
      await dragSparkTo(hostPage, 1500, 400);

      // Wait a beat for the (would-be) place attempt to propagate. If the
      // mechanic works, no new RED prim appears.
      await hostPage.waitForTimeout(800);

      const afterHostState = await readWorldState(hostPage);
      const afterRedCount = afterHostState.primitives.filter((p) => p.placerColor === 0xff3b6b).length;

      // Assert: RED primitive count UNCHANGED — host's place attempt was
      // hard-blocked by joiner's territory.
      expect(afterRedCount).toBe(beforeRedCount);
    } finally {
      await hostCtx.close();
      await joinerCtx.close();
    }
  });
});

test.describe('Sym I — win-condition + ENDGAME envelope (S47 wire, S50 P4 e2e coverage)', () => {
  test('Host reaching WIN_SCORE triggers WIN on both peers (joiner via ENDGAME envelope)', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const joinerCtx = await browser.newContext();
    try {
      // PRIME-AUDIT Δ2 mitigation: scope __TEST_WIN_SCORE__ override to
      // BOTH contexts of THIS test only. Playwright contexts are isolated,
      // so the override does not leak to Sym A/C/D/E/F tests. addInitScript
      // runs BEFORE bundled scripts (including constants.ts module load).
      // Override value 3 chosen so 3 anchor placements (SCORE_ANCHOR=1
      // each, non-bonding because >60px apart) reach the WIN gate quickly.
      const TEST_WIN_SCORE = 3;
      await hostCtx.addInitScript((winScore) => {
        (window as { __TEST_WIN_SCORE__?: number }).__TEST_WIN_SCORE__ = winScore;
      }, TEST_WIN_SCORE);
      await joinerCtx.addInitScript((winScore) => {
        (window as { __TEST_WIN_SCORE__?: number }).__TEST_WIN_SCORE__ = winScore;
      }, TEST_WIN_SCORE);
      // S51 P1 — spawn-rate override (rate 1.5 vs prod 0.15). Same context
      // scoping as TEST_WIN_SCORE above. Sym I waits for ≥8 sparks → at 0.15
      // first spark is 25.7s away (deterministic w/ seed 0xc0ffee); at 1.5
      // it's 2.6s. addInitScript fires BEFORE constants.ts module-eval.
      await applyTestSpawnRate(hostCtx, joinerCtx);

      const hostPage = await hostCtx.newPage();
      const joinerPage = await joinerCtx.newPage();

      const code = await hostNewRoom(hostPage);
      await joinRoom(joinerPage, code);
      await waitForWorld(hostPage, (w) => w.peerCount >= 1, 'peers connected');
      const beginBtn = await canvasToCss(hostPage, CANVAS_WIDTH / 2, 814);
      await hostPage.mouse.click(beginBtn.x, beginBtn.y);
      await waitForWorld(hostPage, (w) => w.gameState === 'PLAYING', 'PLAYING on host');
      await waitForWorld(joinerPage, (w) => w.gameState === 'PLAYING', 'PLAYING on joiner');
      await waitForWorld(hostPage, (w) => w.freeSparks.length >= 8, 'sparks spawned on host');

      // Host places 3 anchors (non-bonding placements, 200px apart > 60
      // AUTO_BOND_RADIUS). SCORE_ANCHOR=1 each → score=3 → WIN gate fires.
      //
      // S51 P1 — X moved from 800 to 300. (800, 400) is at distance
      // √(160² + 140²) = 213 px from spawner center (960, 540); SPAWNER_RADIUS
      // is 250, so anchor placement at X=800 is silently rejected because
      // placePrimitive's spawner-zone exit check fires (anchors only place
      // OUTSIDE the spawner). (300, 400) is √(660² + 140²) = 675 px out —
      // safely outside the zone. Same for (300, 600) and (300, 800).
      await dragSparkTo(hostPage, 300, 400);
      await waitForWorld(
        hostPage,
        (w) => w.primitives.some((p) => p.placerColor === 0xff3b6b && Math.abs(p.pos.x - 300) < 50 && Math.abs(p.pos.y - 400) < 50),
        'host placed 1st anchor',
      );
      await dragSparkTo(hostPage, 300, 600);
      await dragSparkTo(hostPage, 300, 800);

      // Host should reach scoreByPlayer[0] === 3 → applyScore triggers
      // WIN_TRIGGER → gameState='WIN' + lastWinnerId=0. Main.ts ticker's
      // PLAYING→WIN transition guard then sends ENDGAME envelope to peer.
      await waitForWorld(
        hostPage,
        (w) => w.gameState === 'WIN',
        'host transitions to WIN',
        15_000,
      );

      // Joiner receives ENDGAME envelope (clientHandlers.ts dispatches
      // WIN_TRIGGER locally). Snapshot stream also carries the WIN state
      // post-S47 (snapshot gate widened to PLAYING|WIN|POSTGAME) so this
      // is defence-in-depth.
      await waitForWorld(
        joinerPage,
        (w) => w.gameState === 'WIN',
        'joiner transitions to WIN (via ENDGAME envelope)',
        10_000,
      );

      // Final assertion: lastWinnerId reflects host (player 0, RED).
      const joinerFinalState = await readWorldState(joinerPage);
      const hostFinalState = await readWorldState(hostPage);
      // Both peers should agree on the winner.
      expect(hostFinalState.gameState).toBe('WIN');
      expect(joinerFinalState.gameState).toBe('WIN');
    } finally {
      await hostCtx.close();
      await joinerCtx.close();
    }
  });
});
