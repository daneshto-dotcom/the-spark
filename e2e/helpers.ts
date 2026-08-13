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
/** Mirrors src/constants.ts SPAWNER_RADIUS (halved 250 → 125 in S135) + the disc centre. */
export const SPAWNER_RADIUS = 125;
const ZONE_CX = CANVAS_WIDTH / 2;
const ZONE_CY = CANVAS_HEIGHT / 2;

/**
 * S136 — IS THIS SPARK ACTUALLY GRABBABLE BY THE PLAYER? Mirrors `Controls.pickSpark`
 * (src/input/controls.ts): a spark INSIDE the spawn disc that is NOT escrowed is deliberately NOT
 * player-pickable, because V6-1.2 moved harvesting to the gatherers — the player builds from what is
 * parked at their keep. An escrowed shape (a gatherer's in-flight haul, or one sitting on the castle
 * porch) IS grabbable through the same unchanged path, as is anything outside the disc.
 *
 * ⚠ WHY THIS EXISTS. Before S136 the drag helpers just picked any Free spark within 200 px of the
 * arena centre, which encoded the PRE-V6-1.2 rule that the zone was the player's larder. Those specs
 * kept passing anyway, but ONLY BY LUCK: at λ=0.1875 the standing pool was ~2 sparks and a gatherer
 * was usually carrying one, so the spark the helper happened to grab was usually the escrowed (and
 * therefore pickable) one. The S136 B3 ×6 faucet removed that luck — the pool is now ~9, most of it
 * un-escrowed zone sparks — and five gating specs (bomb, fog, hunter, rainbow, worker) began failing
 * with "placement landed (prims 0 → >=1)" because the pickup silently never happened.
 *
 * So this is not a workaround for the faucet: it is the helper finally asserting the same rule the
 * game has enforced since V6-1.2.
 */
function isPlayerPickable(s: {
  pos: { x: number; y: number };
  state: { kind: string };
  escrow?: string;
}): boolean {
  if (s.state.kind !== 'Free') return false;
  if (s.escrow !== undefined) return true; // in-flight haul or a porch shape — grabbable
  const dx = s.pos.x - ZONE_CX;
  const dy = s.pos.y - ZONE_CY;
  return dx * dx + dy * dy > SPAWNER_RADIUS * SPAWNER_RADIUS; // outside the disc
}

/**
 * S136 — A SPARK THE PLAYER CAN ACTUALLY DRAG, which is a strictly smaller set than `isPlayerPickable`.
 *
 * `isPlayerPickable` mirrors the pickup gate, but passing that gate is NOT sufficient to move a shape:
 * a gatherer's in-flight haul is escrowed 'hauled' and `applyGathererTick` re-pins its pos/prevPos to
 * the unit EVERY TICK (both while HAULING and while WAITING at a full bank), so the drag is overwritten
 * as fast as it is applied and the release then fails the MAX_RELEASE_REACH gate. Diagnosed by watching
 * the placement silently never land.
 *
 * The only genuinely draggable source post-V6-1.3 is a shape standing on the CASTLE PORCH — escrow
 * 'banked', outside the quarry disc, pinned by nothing. That is not a harness quirk, it IS the shipped
 * loop: gatherers fill the bank, the player pulls one out, then builds with it.
 */
function isPorchSpark(s: {
  pos: { x: number; y: number };
  state: { kind: string };
  escrow?: string;
}): boolean {
  return s.state.kind === 'Free' && s.escrow === 'banked';
}

/**
 * S136 — PUT A SHAPE ON THE PORCH, through the real UI, so a spec can then drag and place it.
 *
 * Waits for a gatherer to bank something (the economy runs on its own — at the B3 ×6 faucet this takes
 * a few seconds), then clicks the local player's castle to open its panel and clicks the first filled
 * bank slot. Uses the shipped geometry getter (`__SPARK__.castlePanel.getUiPoints`) rather than
 * duplicated coordinates — the S85 P4c convention, and the reason a panel relayout cannot silently
 * break every spec that builds something.
 *
 * No-op when a porch shape is already present, so callers can invoke it freely.
 */
export async function pullFromBank(page: Page, timeoutMs = 30_000): Promise<void> {
  const already = (await readWorldState(page)).freeSparks.some(isPorchSpark);
  if (already) return;

  // 1. wait for the gatherers to actually bank a shape
  await waitForWorld(
    page,
    (w) => (w.castleBanks.find(([seat]) => seat === w.localPlayerId)?.[1] ?? 0) > 0,
    'a gatherer banks a shape into the local castle',
    timeoutMs,
  );

  // 2. open the castle panel (click the local seat's keep)
  const seat = (await readWorldState(page)).localPlayerId;
  // S137 P0c — ASK THE APP WHERE THE KEEP IS; do not re-derive it. This used to transcribe
  // `castleAnchor`'s formula (`Math.PI + (seat / 7) * Math.PI * 2`, radius SPAWNER_RADIUS + 150)
  // into this file, with the seat divisor hardcoded to 7 under a comment asserting
  // PLAYER_COLORS.length. That transcription was correct — but it is exactly the duplicated-geometry
  // class the S85 P4c getter convention exists to delete, and the S50 P5 regression (a hardcoded
  // button centre silently drifting from the screen's own layout) is what it looks like when it
  // finally goes wrong. `__SPARK__.keepCenter` is the shipped `castleAnchor`, so the harness now
  // cannot disagree with the game about where a castle is.
  const anchor = await page.evaluate((s: number) => {
    const sp = (window as { __SPARK__?: { keepCenter?: (n: number) => { x: number; y: number } } })
      .__SPARK__;
    if (sp?.keepCenter === undefined) throw new Error('__SPARK__.keepCenter unavailable — geometry getter missing');
    return sp.keepCenter(s);
  }, seat);
  const keep = await canvasToCss(page, anchor.x, anchor.y);
  // ⚠ THE KEEP CLICK TOGGLES, so this must be STATE-AWARE rather than blindly clicking. A panel left
  // open by a previous call would be CLOSED by an "open" click, and the pull would then fail with
  // "panel did not open" — which is exactly how hunter.spec failed once the retry loop started calling
  // this more than once per test. Read the panel state, act only if needed, and retry once.
  for (let attempt = 0; attempt < 2 && !(await panelIsOpen(page)); attempt++) {
    await page.mouse.click(keep.x, keep.y);
    await page.waitForTimeout(220);
  }

  // 3. click the first FILLED slot — live geometry, never duplicated coords
  const pts = await page.evaluate(() => {
    const sp = (window as {
      __SPARK__?: {
        castlePanel?: {
          getUiPoints?: () => {
            open: boolean;
            slotCenters: Array<{ index: number; x: number; y: number; filled: boolean }>;
          };
        };
      };
    }).__SPARK__;
    const g = sp?.castlePanel?.getUiPoints?.();
    if (g === undefined) throw new Error('castlePanel.getUiPoints unavailable — geometry getter missing');
    return g;
  });
  if (!pts.open) {
    throw new Error(
      `pullFromBank: castle panel did not open on the keep click at canvas(${Math.round(
        anchor.x,
      )}, ${Math.round(anchor.y)}) seat=${seat}` + (await readInputLockDiagnostics(page)),
    );
  }
  const filled = pts.slotCenters.find((x) => x.filled);
  if (filled === undefined) {
    throw new Error(
      'pullFromBank: bank reported non-empty but no slot rendered filled' +
        (await readInputLockDiagnostics(page)),
    );
  }
  const slot = await canvasToCss(page, filled.x, filled.y);
  await page.mouse.click(slot.x, slot.y);

  // 4. confirm the shape really reached the porch
  await waitForWorld(
    page,
    (w) => w.freeSparks.some(isPorchSpark),
    'the pulled shape appears on the castle porch',
    timeoutMs,
  );
  // Close the panel so it cannot swallow the caller's subsequent drag — again state-aware, so a
  // panel that already closed itself is not re-opened by a stray toggle.
  if (await panelIsOpen(page)) {
    await page.mouse.click(keep.x, keep.y);
    await page.waitForTimeout(120);
  }
}

/**
 * S137 P0b — WHY DID THE CLICK NOT LAND? Every input path in `controls.ts` is fronted by
 * `onDown`'s `if (this.isInputLocked()) return;` (controls.ts:345), and `isInputLocked` is true
 * under THREE independent conditions — a NONET sudoku trial, an active cinematic for this seat, or
 * a player BENCHED by the Pac-Man hunter. A pointer event silently swallowed by any of them is
 * indistinguishable from a mis-aimed click, from bad geometry, or from a genuinely broken panel.
 *
 * S136 lost time to exactly that ambiguity: the failure said only "castle panel did not open", so
 * the cause had to be guessed. A throw that reports the live lock state instead names it. This
 * repo's own convention is fail-loud-with-diagnostics; a bare message is the anti-pattern.
 */
async function readInputLockDiagnostics(page: Page): Promise<string> {
  const d = await page
    .evaluate(() => {
      const s = (window as {
        __SPARK__?: {
          world: {
            tick: number;
            gameState: string;
            localPlayerId: number;
            sudoku: unknown;
            activeCinematicPlayerId: number | null;
            hunterSpawned: boolean;
            hunters: Map<number, { state: string; targetPlayerId: number }>;
            players: Map<number, { benchedUntilTick?: number }>;
            castleBanks: Map<number, unknown[]>;
          };
        };
      }).__SPARK__;
      if (s === undefined) return null;
      const w = s.world;
      const me = w.players.get(w.localPlayerId);
      const benchedUntilTick = me?.benchedUntilTick;
      return {
        tick: w.tick,
        gameState: w.gameState,
        // The three isInputLocked() clauses, reported individually so the guilty one is named.
        lockedBySudoku: w.sudoku !== null,
        lockedByCinematic: w.activeCinematicPlayerId === w.localPlayerId,
        lockedByBench:
          benchedUntilTick !== undefined && w.tick < benchedUntilTick,
        benchedUntilTick,
        hunterSpawned: w.hunterSpawned,
        hunters: Array.from(w.hunters.values()).map((h) => h.state),
        bank: w.castleBanks.get(w.localPlayerId)?.length ?? 0,
      };
    })
    .catch(() => null);
  return d === null ? ' [diagnostics unavailable]' : `\n  input-lock diagnostics: ${JSON.stringify(d)}`;
}

/** S136 — is the castle panel currently open? Read through the shipped geometry getter. */
async function panelIsOpen(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const sp = (window as {
      __SPARK__?: { castlePanel?: { getUiPoints?: () => { open: boolean } } };
    }).__SPARK__;
    return sp?.castlePanel?.getUiPoints?.().open === true;
  });
}

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
  freeSparks: Array<{
    id: number;
    pos: { x: number; y: number };
    state: { kind: string; carrierId?: number };
    escrow?: 'hauled' | 'banked';
  }>;
  primitives: Array<{ id: number; pos: { x: number; y: number }; placerColor: number; placedBy: number; bondCount: number }>;
  bonds: Array<{ id: number; aId: number; bId: number }>;
  scoreByPlayer: Array<[number, number]>;
  /** S136 — per-seat castle bank sizes: [seat, shapesHeld]. */
  castleBanks: Array<[number, number]>;
  /** S141 P1 — live defenders, so a spec can wait on a KIND existing rather than on a tick count. */
  defenders: Array<{ id: number; kind: string; bagsRemaining: number; pos: { x: number; y: number } }>;
  /** S141 P2 — per-seat gatherer order queues, ORDER PRESERVED (it is a list, not a set). */
  gathererOrders: Array<{ seat: number; types: number[] }>;
  peerCount: number;
}> {
  return await page.evaluate(() => {
    const spark = (window as { __SPARK__?: { world: unknown; netTransport: unknown } }).__SPARK__;
    if (!spark) throw new Error('__SPARK__ DEV global not exposed — not in DEV mode?');
    const w = spark.world as {
      gameState: string; gameMode: string; isHost: boolean; tick: number;
      localPlayerId: number;
      players: Map<number, { id: number; color: number; kind: string; avatarPos: { x: number; y: number }; carriedSparkId?: number }>;
      freeSparks: Map<number, { id: number; pos: { x: number; y: number }; state: { kind: string; carrierId?: number }; escrow?: 'hauled' | 'banked' }>;
      primitives: Map<number, { id: number; pos: { x: number; y: number }; placerColor: number; placedBy: number; bonds: Set<number> }>;
      bonds: Map<number, { id: number; aId: number; bId: number }>;
      scoreByPlayer: Map<number, number>;
      castleBanks: Map<number, unknown[]>;
      defenders: Map<number, { id: number; kind: string; bagsRemaining: number; pos: { x: number; y: number } }>;
      gathererOrders: Map<number, number[]>;
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
        // S136 — needed by isPlayerPickable: an escrowed shape (gatherer haul / castle porch) is
        // grabbable, an un-escrowed one inside the spawn disc is not.
        escrow: s.escrow,
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
      castleBanks: Array.from(w.castleBanks.entries()).map(([seat, b]) => [seat, b.length] as [number, number]),
      defenders: Array.from(w.defenders.values()).map((d) => ({
        id: d.id, kind: d.kind, bagsRemaining: d.bagsRemaining, pos: { x: d.pos.x, y: d.pos.y },
      })),
      // Copy the array — never alias live world state into a probe result.
      gathererOrders: Array.from(w.gathererOrders.entries()).map(([seat, q]) => ({ seat, types: [...q] })),
      peerCount: nt ? nt.peerCount() : 0,
    };
  });
}

/**
 * S85 P4c — geometry-getter migration (the S82 carry-forward). Click targets
 * come from the app's OWN live layout via __SPARK__ accessors instead of
 * coordinates duplicated into this file (the S50 P5 wrong-button drift class:
 * hardcoded (960,580) silently hit Solo after a title-layout change). Returns
 * CSS coords ready for page.mouse.click.
 */
export async function titleButtonCss(
  page: Page,
  // S87 — 'oneVOne' is the Multiplayer button (key kept for spec stability);
  // 'vsBots' opens the bot setup overlay. S97 — 'combos' opens the Combo Codex.
  which: 'solo' | 'oneVOne' | 'vsBots' | 'codex' | 'combos',
): Promise<{ x: number; y: number }> {
  const c = await page.evaluate((w) => {
    const spark = (window as {
      __SPARK__?: { titleScreen?: { getButtonCenters?: () => Record<string, { x: number; y: number }> } };
    }).__SPARK__;
    const centers = spark?.titleScreen?.getButtonCenters?.();
    if (!centers) throw new Error('titleScreen.getButtonCenters unavailable — geometry getter missing');
    return centers[w];
  }, which);
  return await canvasToCss(page, c.x, c.y);
}

export interface LobbyUiPoints {
  hostButton: { x: number; y: number };
  joinButton: { x: number; y: number };
  beginButton: { x: number; y: number };
  backButton: { x: number; y: number };
  joinPaneRect: { x: number; y: number; w: number; h: number };
  joinInputRect: { x: number; y: number; w: number; h: number };
}

/** S85 P4c — live lobby click geometry (canvas coords; convert via canvasToCss). */
export async function lobbyUiPoints(page: Page): Promise<LobbyUiPoints> {
  return await page.evaluate(() => {
    const spark = (window as {
      __SPARK__?: { lobbyScreen?: { getUiPoints?: () => unknown } };
    }).__SPARK__;
    const pts = spark?.lobbyScreen?.getUiPoints?.();
    if (!pts) throw new Error('lobbyScreen.getUiPoints unavailable — geometry getter missing');
    return pts as never;
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
  // ⛔ S142 P2 — REMEMBER THE LAST POLL ERROR. The bare `catch {}` that used to be here is
  // the single reason nobody has ever diagnosed the quarantine lane: `readWorldState` throwing
  // on EVERY poll (page crashed, bundle failed to load, __SPARK__ never installed,
  // net::ERR_ADDRESS_UNREACHABLE) is indistinguishable from the predicate simply not being
  // satisfied yet. Both produced the identical "waitForWorld timeout" message, so two
  // completely different failures — a dead page and a slow one — read the same in every log.
  // Two competing causal stories about this lane have sat in the repo for sessions, neither
  // substantiated by any captured log, precisely because of this swallow.
  let lastPollError: string | null = null;
  let pollErrorCount = 0;
  while (Date.now() - start < timeoutMs) {
    try {
      const state = await readWorldState(page);
      if (predicate(state)) return;
      // A poll that SUCCEEDS clears the memory: earlier boot-time throws (__SPARK__ not
      // installed yet) are expected and must not be reported as the cause of a later timeout.
      lastPollError = null;
    } catch (err) {
      lastPollError = err instanceof Error ? err.message : String(err);
      pollErrorCount++;
    }
    await page.waitForTimeout(200);
  }
  const finalState = await readWorldState(page).catch(() => null);
  // Only surfaced when the LAST poll was still failing — i.e. the page never recovered.
  // A timeout with no trailing error is a genuine predicate-never-satisfied timeout.
  const diag =
    lastPollError !== null
      ? `\n⚠ The final poll was still THROWING (${pollErrorCount} polls threw). This is very ` +
        `likely a dead/unreachable page rather than an unmet predicate.\nLast poll error: ${lastPollError}`
      : pollErrorCount > 0
        ? `\n(note: ${pollErrorCount} early polls threw and then recovered — normal during boot)`
        : '';
  throw new Error(
    `waitForWorld timeout (${timeoutMs}ms): ${description}${diag}\nFinal state: ${JSON.stringify(finalState, null, 2)}`,
  );
}

/**
 * Host flow — TitleScreen → 1v1 → HOST → returns room code.
 * Council C6/Δ1 + Sym A diagnostic: each step asserts world state advanced.
 */
export async function hostNewRoom(page: Page, url = '/?debug=1'): Promise<string> {
  // S123 P2 — `url` lets a spec boot the host with extra flags (e.g. '&worker=1').
  await page.goto(url);
  // Wait for the SPARK title to mount.
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE state on host page');
  // Click "1v1 (2 Player)" — Pixi text isn't queryable via DOM, so we click
  // by canvas coord. S85 P4c: the coord now comes from the title screen's
  // LIVE layout (titleButtonCss geometry getter) — the S50 P5 regression
  // class (hardcoded button math drifting from titleScreen.ts) is closed.
  const oneVOne = await titleButtonCss(page, 'oneVOne');
  await page.mouse.click(oneVOne.x, oneVOne.y);
  await waitForWorld(page, (w) => w.gameState === 'LOBBY', 'LOBBY state on host page');
  // Click HOST button — live center via the lobby geometry getter.
  const lobbyPts = await lobbyUiPoints(page);
  const hostBtn = await canvasToCss(page, lobbyPts.hostButton.x, lobbyPts.hostButton.y);
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
export async function joinRoom(page: Page, code: string, url = '/?debug=1'): Promise<void> {
  // S123 P2 — `url` lets a spec boot the joiner with extra flags (e.g. '&worker=1').
  await page.goto(url);
  await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE state on joiner page');
  // S85 P4c — live title geometry (was the S50 P5 hardcoded-coord fix site).
  const oneVOne = await titleButtonCss(page, 'oneVOne');
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
  opts?: { holdAtTargetMs?: number },
): Promise<number | null> {
  // S136 — pick a spark the PLAYER can actually grab (see isPlayerPickable). Was "any Free spark
  // within 200px of centre", which encoded the pre-V6-1.2 rule that the zone was the player's larder.
  const state = await readWorldState(page);
  const spawnerSpark = state.freeSparks.find(isPorchSpark);
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
  // S58 (#2) — `holdAtTargetMs` keeps the gesture OPEN (no mouse-up) so a caller
  // can observe the in-flight CLAIM (spark Carried{carrier}) before releasing;
  // the caller is then responsible for the mouse-up. Default: release (place).
  if (opts?.holdAtTargetMs !== undefined) {
    await page.waitForTimeout(opts.holdAtTargetMs);
    return spawnerSpark.id;
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
  // S136 — THE PLAYER'S SHAPE SOURCE IS THE CASTLE PORCH, NOT THE QUARRY. Ensure one is standing
  // there before we try to drag anything (see pullFromBank for the full reasoning).
  await pullFromBank(page, timeoutMs);
  const hasZoneSpark = (
    w: Awaited<ReturnType<typeof readWorldState>>,
  ): boolean => w.freeSparks.some(isPorchSpark);

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

  // S136 — CONFIRM, AND RETRY THE WHOLE PULL+DRAG CYCLE, not just the pick.
  //
  // The pre-existing retry covered only "the pick found nothing". Post-V6-1.3 the drag itself can fail
  // to commit for reasons that are transient rather than structural: the AttractDrag force-lerp has to
  // carry the shape ~880 px from the castle porch to a build site, and if the spark has not caught up
  // to the cursor by mouse-up the release fails the MAX_RELEASE_REACH gate and the placement silently
  // does not happen. Observed intermittently on the THIRD placement of the bomb/rainbow clusters while
  // the first two landed every time. A bounded retry of the full cycle (pull a fresh shape, drag
  // again) is the file's own documented convention — fail loud after a fixed number of attempts,
  // never silently.
  // 4 attempts with an 8s inner budget: bomb/rainbow passed in ISOLATION but failed in the full lane
  // at 3x4s, i.e. the shortfall is wall-clock under load (the sim is frame-bound, so a busy runner
  // advances fewer ticks per second and the AttractDrag needs longer to carry a shape ~880px).
  const ATTEMPTS = 4;
  const INNER_MS = 8_000;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await waitForWorld(
        page,
        (w) => w.primitives.length >= before + 1,
        `placement landed near (${targetX}, ${targetY}) (prims ${before} → >=${before + 1})`,
        attempt === ATTEMPTS ? timeoutMs : INNER_MS,
      );
      return sparkId;
    } catch (err) {
      if (attempt === ATTEMPTS) throw err;
      // Re-stock the porch and drag again. A shape left mid-board from a failed attempt is an
      // ordinary free spark and reaps on its own TTL, so this cannot accumulate litter.
      await pullFromBank(page, timeoutMs);
      const again = await dragSparkTo(page, targetX, targetY);
      if (again !== null) sparkId = again;
    }
  }
  return sparkId;
}

/**
 * S55 P2 — read NetTransport diagnostics via the DEV __SPARK__ accessor.
 * Returns null before the transport exists (pre-host / pre-join).
 */
async function readNetDiagnostics(
  page: Page,
): Promise<{ accepted: number; rejected: number; lastKind: string | null } | null> {
  return await page.evaluate(() => {
    const spark = (
      window as {
        __SPARK__?: {
          netTransport: {
            getDiagnostics: () => {
              accepted: number;
              rejected: number;
              lastKind: string | null;
            };
          } | null;
        };
      }
    ).__SPARK__;
    const nt = spark?.netTransport ?? null;
    return nt ? nt.getDiagnostics() : null;
  });
}

/**
 * S55 P2 — read the lobby's shared status-line text via the DEV __SPARK__
 * accessor (lobbyScreen.getStatusText()). Empty string if unavailable.
 */
export async function readLobbyStatus(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const spark = (
      window as { __SPARK__?: { lobbyScreen?: { getStatusText?: () => string } } }
    ).__SPARK__;
    return spark?.lobbyScreen?.getStatusText?.() ?? '';
  });
}

/**
 * S55 P2 — poll until NetTransport.getDiagnostics().rejected >= n. The
 * protocol-mismatch drop increments rejectedCount the instant the mismatched
 * HELLO is processed (transport.ts handleRawMessage), so this is the
 * deterministic signal that the host's receive-side mismatch latch fired —
 * independent of any lobby-UI write ordering.
 */
export async function waitForRejected(
  page: Page,
  n: number,
  description: string,
  timeoutMs = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const d = await readNetDiagnostics(page).catch(() => null);
    if (d !== null && d.rejected >= n) return;
    await page.waitForTimeout(200);
  }
  const final = await readNetDiagnostics(page).catch(() => null);
  throw new Error(
    `waitForRejected timeout (${timeoutMs}ms): ${description}\nFinal diagnostics: ${JSON.stringify(final)}`,
  );
}

/** S70 P1 — a single lobby seat as exposed by lobbyScreen.getSeats(). */
export interface SeatViewSnapshot {
  index: number;
  color: number;
  occupied: boolean;
  isHost: boolean;
  isYou: boolean;
}

/**
 * S70 P1 — read the lobby seat rack (lobbyView seats) via the DEV
 * __SPARK__.lobbyScreen.getSeats() accessor. Lets a spec assert per-seat
 * occupancy / colour / own-seat (isYou) from the presence beacon WITHOUT
 * OCR-ing the Pixi canvas. Empty array before the lobby exists.
 */
export async function readSeats(page: Page): Promise<SeatViewSnapshot[]> {
  return await page.evaluate(() => {
    const spark = (
      window as { __SPARK__?: { lobbyScreen?: { getSeats?: () => unknown } } }
    ).__SPARK__;
    return (spark?.lobbyScreen?.getSeats?.() ?? []) as Array<{
      index: number;
      color: number;
      occupied: boolean;
      isHost: boolean;
      isYou: boolean;
    }>;
  });
}

/**
 * S70 P1 — poll until a predicate over the lobby seats holds. The seat-rack
 * analogue of waitForWorld: the host's presence beacon arrives asynchronously
 * over WebRTC, so a real-peer presence assertion must poll for it.
 */
export async function waitForSeats(
  page: Page,
  predicate: (seats: SeatViewSnapshot[]) => boolean,
  description: string,
  timeoutMs = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const seats = await readSeats(page).catch(() => [] as SeatViewSnapshot[]);
    if (predicate(seats)) return;
    await page.waitForTimeout(200);
  }
  const final = await readSeats(page).catch(() => null);
  throw new Error(
    `waitForSeats timeout (${timeoutMs}ms): ${description}\nFinal seats: ${JSON.stringify(final)}`,
  );
}

/**
 * S138 P2 — canvas-space centre of `seat`'s keep, read from the APP, never re-derived.
 *
 * Extracted so no spec transcribes the ring formula again. `castle-panel.spec.ts` had inlined
 * `CANVAS_WIDTH / 2 - (125 + 150)` — a hand-copy of `SPAWNER_RADIUS + 150` — and when S138 P2 moved
 * the ring to `KEEP_RING_RADIUS = 420` all four of its tests started clicking empty board. That is
 * precisely the duplicated-geometry failure the `__SPARK__.keepCenter` getter exists to prevent, so
 * the fix is to use the getter rather than to update the copy.
 */
export async function keepAnchor(
  page: Page,
  seat: number,
): Promise<{ x: number; y: number }> {
  return page.evaluate((s: number) => {
    const sp = (window as { __SPARK__?: { keepCenter?: (n: number) => { x: number; y: number } } })
      .__SPARK__;
    if (sp?.keepCenter === undefined) {
      throw new Error('__SPARK__.keepCenter unavailable — geometry getter missing');
    }
    return sp.keepCenter(s);
  }, seat);
}
