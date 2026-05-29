/**
 * SPARK — E2E test helpers.
 *
 * S46 P1 (BUG-CRITICAL-5) — shared utilities for 2-browser harness specs.
 *
 * Three areas covered:
 *  1. canvas-coord → CSS-coord mapping (inverse of S39 P2 cssToCanvasCoords)
 *     so mouse.move(cssX, cssY) lands at the expected canvas-space target.
 *  2. game-state readers via page.evaluate() against __SPARK__ DEV global.
 *  3. lobby-flow helpers (host new room, join room, begin match).
 *
 * All helpers operate on a single Playwright Page; multi-peer specs
 * orchestrate them across N pages.
 */
import { type Page, expect } from '@playwright/test';

/** Canonical canvas dimensions — matches src/constants.ts CANVAS_WIDTH/HEIGHT. */
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

/**
 * Map a canvas-space coordinate to a CSS-space coordinate (page-relative)
 * given the current canvas bounding rect. Inverse of S39 P2 cssToCanvasCoords.
 *
 * Under object-fit:contain (Pixi default), the canvas content occupies a
 * letterboxed sub-rect of getBoundingClientRect(); the mapping accounts for
 * this so mouse events fire at the correct visual position regardless of
 * viewport aspect.
 */
export async function canvasToCss(
  page: Page,
  canvasX: number,
  canvasY: number,
): Promise<{ x: number; y: number }> {
  return await page.evaluate(
    ({ cx, cy, CW, CH }) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) throw new Error('No canvas found on page');
      const rect = canvas.getBoundingClientRect();
      const canvasAspect = CW / CH;
      const boxAspect = rect.height > 0 ? rect.width / rect.height : canvasAspect;
      const fittedW = boxAspect > canvasAspect ? rect.height * canvasAspect : rect.width;
      const fittedH = boxAspect > canvasAspect ? rect.height : rect.width / canvasAspect;
      const offsetX = (rect.width - fittedW) / 2;
      const offsetY = (rect.height - fittedH) / 2;
      const scale = CW > 0 ? fittedW / CW : 1;
      return {
        x: rect.left + offsetX + cx * scale,
        y: rect.top + offsetY + cy * scale,
      };
    },
    { cx: canvasX, cy: canvasY, CW: CANVAS_WIDTH, CH: CANVAS_HEIGHT },
  );
}

/**
 * Read __SPARK__.world state from the page (DEV mode only).
 * Returns a plain-object snapshot (Maps serialized as arrays).
 *
 * Council C6/Δ1: state assertions read live world state, not just visual.
 */
export async function readWorldState(page: Page): Promise<{
  gameState: string;
  gameMode: string;
  isHost: boolean;
  tick: number;
  localPlayerId: number;
  players: Array<{ id: number; color: number; kind: string; avatarPos: { x: number; y: number } }>;
  freeSparks: Array<{ id: number; pos: { x: number; y: number }; state: { kind: string; carrierId?: number } }>;
  primitives: Array<{ id: number; pos: { x: number; y: number }; placerColor: number; placedBy: number; bondCount: number }>;
  bonds: Array<{ id: number; aId: number; bId: number }>;
  scoreByPlayer: Array<[number, number]>;
  peerCount: number;
}> {
  return await page.evaluate(() => {
    const spark = (window as { __SPARK__?: { world: unknown; netTransport: unknown } }).__SPARK__;
    if (!spark) throw new Error('__SPARK__ DEV global not exposed — not in DEV mode?');
    const w = spark.world as {
      gameState: string; gameMode: string; isHost: boolean; tick: number;
      localPlayerId: number;
      players: Map<number, { id: number; color: number; kind: string; avatarPos: { x: number; y: number }; carriedSparkId?: number }>;
      freeSparks: Map<number, { id: number; pos: { x: number; y: number }; state: { kind: string; carrierId?: number } }>;
      primitives: Map<number, { id: number; pos: { x: number; y: number }; placerColor: number; placedBy: number; bonds: Set<number> }>;
      bonds: Map<number, { id: number; aId: number; bId: number }>;
      scoreByPlayer: Map<number, number>;
    };
    const nt = spark.netTransport as { peerCount: () => number } | null;
    return {
      gameState: w.gameState,
      gameMode: w.gameMode,
      isHost: w.isHost,
      tick: w.tick,
      localPlayerId: w.localPlayerId,
      players: Array.from(w.players.values()).map((p) => ({
        id: p.id, color: p.color, kind: p.kind,
        avatarPos: { x: p.avatarPos.x, y: p.avatarPos.y },
      })),
      freeSparks: Array.from(w.freeSparks.values()).map((s) => ({
        id: s.id, pos: { x: s.pos.x, y: s.pos.y },
        state: { kind: s.state.kind, carrierId: s.state.carrierId },
      })),
      primitives: Array.from(w.primitives.values()).map((p) => ({
        id: p.id, pos: { x: p.pos.x, y: p.pos.y },
        placerColor: p.placerColor, placedBy: p.placedBy,
        bondCount: p.bonds.size,
      })),
      bonds: Array.from(w.bonds.values()).map((b) => ({
        id: b.id, aId: b.aId, bId: b.bId,
      })),
      scoreByPlayer: Array.from(w.scoreByPlayer.entries()),
      peerCount: nt ? nt.peerCount() : 0,
    };
  });
}

/**
 * Wait until a predicate against world state becomes true. Polls every 200ms.
 * Times out at the page's expect timeout.
 */
export async function waitForWorld(
  page: Page,
  predicate: (state: Awaited<ReturnType<typeof readWorldState>>) => boolean,
  description: string,
  timeoutMs = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const state = await readWorldState(page);
      if (predicate(state)) return;
    } catch {
      // __SPARK__ may not exist yet during boot
    }
    await page.waitForTimeout(200);
  }
  const finalState = await readWorldState(page).catch(() => null);
  throw new Error(
    `waitForWorld timeout (${timeoutMs}ms): ${description}\nFinal state: ${JSON.stringify(finalState, null, 2)}`,
  );
}

/**
 * Host flow — TitleScreen → 1v1 → HOST → returns room code.
 * Council C6/Δ1 + Sym A diagnostic: each step asserts world state advanced.
 */
export async function hostNewRoom(page: Page): Promise<string> {
  await page.goto('/?debug=1');
  // Wait for the SPARK title to mount.
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE state on host page');
  // Click "1v1 (2 Player)" — text matched against canvas text via locator.
  // Pixi text isn't queryable via DOM, so we click by canvas coord.
  // S50 P5 EOS audit fix: title screen layout (src/render/titleScreen.ts):
  //   btnSolo  at (CANVAS_W/2, CANVAS_H/2 + 40)              = (960, 580)
  //   btn1v1   at (CANVAS_W/2, CANVAS_H/2 + 40 + 72 + 24)    = (960, 676)
  // Pre-S50, this clicked at y=580 (Solo button) — sent host to PLAYING/solo,
  // not LOBBY, so every e2e baseline test was timing out post-S49 P3
  // (which removed the masking continue-on-error gate). Constants
  // BUTTON_HEIGHT=72, BUTTON_GAP=24 from titleScreen.ts; hardcoded here to
  // avoid an import cycle (e2e/ is bundled separately from src/).
  const oneVOne = await canvasToCss(page, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40 + 72 + 24);
  await page.mouse.click(oneVOne.x, oneVOne.y);
  await waitForWorld(page, (w) => w.gameState === 'LOBBY', 'LOBBY state on host page');
  // Click HOST button — host pane center, button at PANE_WIDTH/2 + paneX, paneY+220
  // hostPaneX = CANVAS_W/2 - PANE_WIDTH(480) - PANE_GAP(40)/2 = 1920/2 - 480 - 20 = 460
  // paneY = CANVAS_H/2 - PANE_HEIGHT(360)/2 = 1080/2 - 180 = 360
  // HOST button at (460 + 480/2, 360 + 220) = (700, 580)
  const hostBtn = await canvasToCss(page, 700, 580);
  await page.mouse.click(hostBtn.x, hostBtn.y);
  // After clicking HOST: lobbyScreen.mode = 'hosting', codeText populated.
  // Read code from a fresh evaluate that looks at lobbyScreen state.
  // codeText is a Pixi Text — we have to either re-expose it via __SPARK__
  // or read it from a known DOM hook. For now, use a small assertion:
  // wait for netTransport to exist + read from S46 P1 Phase A.0 strip text.
  // Future: add lobbyScreen to __SPARK__ for direct access.
  await page.waitForFunction(
    () => {
      const spark = (window as { __SPARK__?: { netTransport: unknown } }).__SPARK__;
      return spark?.netTransport !== undefined && spark.netTransport !== null;
    },
    { timeout: 10_000 },
  );
  // Read room code from the lobbyScreen's codeText. Requires lobbyScreen
  // accessor — added to __SPARK__ in S46 P1 follow-up edit.
  const code = await page.evaluate(() => {
    const spark = (window as { __SPARK__?: { lobbyScreen?: { getRoomCode?: () => string } } }).__SPARK__;
    return spark?.lobbyScreen?.getRoomCode?.() ?? '';
  });
  if (!code || code.length !== 6) {
    throw new Error(`Room code read failed: got "${code}". Need lobbyScreen.getRoomCode() accessor.`);
  }
  return code;
}

/**
 * Joiner flow — TitleScreen → 1v1 → type code → CONNECT.
 */
export async function joinRoom(page: Page, code: string): Promise<void> {
  await page.goto('/?debug=1');
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE state on joiner page');
  // S50 P5 EOS audit fix: same Solo-vs-1v1 button-coord bug as hostNewRoom.
  const oneVOne = await canvasToCss(page, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40 + 72 + 24);
  await page.mouse.click(oneVOne.x, oneVOne.y);
  await waitForWorld(page, (w) => w.gameState === 'LOBBY', 'LOBBY state on joiner page');
  // Type the code into the HTML input overlay (S16 P1).
  // The input element is present in DOM (not Pixi); use Playwright locator.
  const input = page.locator('input[type="text"][maxlength="6"]');
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.click();
  await input.fill(code);
  // Press Enter to attempt join (S17 P0' Enter handler).
  await input.press('Enter');
}

/**
 * Drag a free spark from spawner area out to a target canvas position.
 * Returns the spark ID that was picked.
 *
 * Council C6/Δ1: explicit move/down/move/up sequence with timing so the
 * cursor state captured at LMB-up is deterministic. Spawner ring is
 * centered at (CANVAS_W/2, CANVAS_H/2) with radius 200. Pick a spark
 * that's currently inside the ring, drag it to (targetX, targetY).
 */
export async function dragSparkTo(
  page: Page,
  targetX: number,
  targetY: number,
): Promise<number | null> {
  // Read current free sparks; pick one inside spawner zone.
  const state = await readWorldState(page);
  const spawnerSpark = state.freeSparks.find((s) => {
    const dx = s.pos.x - CANVAS_WIDTH / 2;
    const dy = s.pos.y - CANVAS_HEIGHT / 2;
    return dx * dx + dy * dy < 200 * 200 && s.state.kind === 'Free';
  });
  if (!spawnerSpark) return null;

  const startCss = await canvasToCss(page, spawnerSpark.pos.x, spawnerSpark.pos.y);
  const endCss = await canvasToCss(page, targetX, targetY);

  await page.mouse.move(startCss.x, startCss.y);
  await page.mouse.down({ button: 'left' });
  // Multi-step move to trigger pointermove events + UPDATE_AVATAR_POS dispatches
  for (let t = 1; t <= 10; t++) {
    const fx = startCss.x + (endCss.x - startCss.x) * (t / 10);
    const fy = startCss.y + (endCss.y - startCss.y) * (t / 10);
    await page.mouse.move(fx, fy);
    await page.waitForTimeout(20); // ~50fps trail, 200ms total — exceeds 100ms UPDATE_AVATAR_POS throttle
  }
  await page.mouse.up({ button: 'left' });
  return spawnerSpark.id;
}

/**
 * S55 P1 — deterministic place-from-spawner with availability + landing
 * confirmation. Closes the Sym F spark-starvation flake (recurred S53 + S54).
 *
 * Root cause of the flake: the bare `dragSparkTo` reads `freeSparks` and picks
 * one inside the 200px spawner pick-zone AT CALL TIME; if no Free spark is in
 * the zone at that instant it returns `null` and places nothing — silently.
 * Sym F fired three `dragSparkTo` calls back-to-back with no availability-wait
 * and no null-check on the 2nd/3rd, so it raced the spawner cadence: an empty
 * pick-zone moment → fewer than 3 prims → the downstream `>=3 blue prims` wait
 * timed out → intermittent RED that passed on retry.
 *
 * Fix sequence: (1) wait until a Free spark exists in the pick-zone; (2)
 * snapshot the primitive count; (3) drag to (x,y); (4) if the pick found no
 * spark (rare TOCTOU between the wait and the synchronous pick), re-wait +
 * re-drag exactly ONCE (Council #4 bounded retry — fail loud, never silent);
 * (5) wait until the primitive count increments, i.e. the placement actually
 * landed (for a client/joiner this is the host-authoritative round-trip).
 *
 * Throws a descriptive Error on a genuine no-spark or non-landing condition,
 * so a real regression surfaces as a clear failure rather than a flaky timeout.
 * Returns the placed spark's id.
 */
export async function placeFreeSparkAndConfirm(
  page: Page,
  targetX: number,
  targetY: number,
  timeoutMs = 15_000,
): Promise<number> {
  const hasZoneSpark = (
    w: Awaited<ReturnType<typeof readWorldState>>,
  ): boolean =>
    w.freeSparks.some((s) => {
      const dx = s.pos.x - CANVAS_WIDTH / 2;
      const dy = s.pos.y - CANVAS_HEIGHT / 2;
      return s.state.kind === 'Free' && dx * dx + dy * dy < 200 * 200;
    });

  await waitForWorld(
    page,
    hasZoneSpark,
    `Free spark available in spawner zone for place at (${targetX}, ${targetY})`,
    timeoutMs,
  );
  const before = (await readWorldState(page)).primitives.length;

  let sparkId = await dragSparkTo(page, targetX, targetY);
  if (sparkId === null) {
    // TOCTOU: the in-zone spark was consumed or drifted out of the pick-zone
    // between the availability wait and dragSparkTo's synchronous pick.
    // Re-wait + re-drag exactly once before giving up.
    await waitForWorld(
      page,
      hasZoneSpark,
      `Free spark re-available after null drag at (${targetX}, ${targetY})`,
      timeoutMs,
    );
    sparkId = await dragSparkTo(page, targetX, targetY);
  }
  if (sparkId === null) {
    throw new Error(
      `placeFreeSparkAndConfirm: no Free spark to drag for (${targetX}, ${targetY}) after one retry`,
    );
  }

  await waitForWorld(
    page,
    (w) => w.primitives.length >= before + 1,
    `placement landed near (${targetX}, ${targetY}) (prims ${before} → >=${before + 1})`,
    timeoutMs,
  );
  return sparkId;
}
