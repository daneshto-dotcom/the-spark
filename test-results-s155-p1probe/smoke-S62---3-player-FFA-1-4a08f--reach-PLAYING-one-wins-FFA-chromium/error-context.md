# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> S62 - 3-player FFA (1v1v1): seat assignment + distinct colors + FFA win @quarantine-flaky >> host + 2 joiners get distinct seats/colors, all reach PLAYING, one wins FFA
- Location: e2e\smoke.spec.ts:762:3

# Error details

```
Error: waitForWorld timeout (30000ms): host PLAYING + 3 players
Final state: {
  "gameState": "POSTGAME",
  "gameMode": "1v1",
  "isHost": true,
  "tick": 2194,
  "localPlayerId": 0,
  "players": [
    {
      "id": 0,
      "color": 16726891,
      "kind": "Idle",
      "avatarPos": {
        "x": 795,
        "y": 540
      }
    },
    {
      "id": 1,
      "color": 3921919,
      "kind": "Idle",
      "avatarPos": {
        "x": 1043,
        "y": 397
      }
    },
    {
      "id": 2,
      "color": 16769595,
      "kind": "Idle",
      "avatarPos": {
        "x": 1043,
        "y": 683
      }
    }
  ],
  "freeSparks": [],
  "primitives": [],
  "bonds": [],
  "scoreByPlayer": [
    [
      0,
      100
    ],
    [
      1,
      100
    ],
    [
      2,
      100
    ]
  ],
  "castleBanks": [],
  "defenders": [],
  "gathererOrders": [],
  "nextPrimitiveId": 0,
  "maxPrimitiveId": 0,
  "peerCount": 2
}
```

# Test source

```ts
  381 |       // Copy the array — never alias live world state into a probe result.
  382 |       gathererOrders: Array.from(w.gathererOrders.entries()).map(([seat, q]) => ({ seat, types: [...q] })),
  383 |       // S143 P2 — host-only cursor (a TRAP on a worker mirror) + the real growth oracle.
  384 |       // See both docblocks above; they are not interchangeable.
  385 |       nextPrimitiveId: w.nextPrimitiveId,
  386 |       maxPrimitiveId: Array.from(w.primitives.values()).reduce((m, p) => (p.id > m ? p.id : m), 0),
  387 |       peerCount: nt ? nt.peerCount() : 0,
  388 |     };
  389 |   });
  390 | }
  391 | 
  392 | /**
  393 |  * S85 P4c — geometry-getter migration (the S82 carry-forward). Click targets
  394 |  * come from the app's OWN live layout via __SPARK__ accessors instead of
  395 |  * coordinates duplicated into this file (the S50 P5 wrong-button drift class:
  396 |  * hardcoded (960,580) silently hit Solo after a title-layout change). Returns
  397 |  * CSS coords ready for page.mouse.click.
  398 |  */
  399 | export async function titleButtonCss(
  400 |   page: Page,
  401 |   // S87 — 'oneVOne' is the Multiplayer button (key kept for spec stability);
  402 |   // 'vsBots' opens the bot setup overlay. S97 — 'combos' opens the Combo Codex.
  403 |   which: 'solo' | 'oneVOne' | 'vsBots' | 'codex' | 'combos',
  404 | ): Promise<{ x: number; y: number }> {
  405 |   const c = await page.evaluate((w) => {
  406 |     const spark = (window as {
  407 |       __SPARK__?: { titleScreen?: { getButtonCenters?: () => Record<string, { x: number; y: number }> } };
  408 |     }).__SPARK__;
  409 |     const centers = spark?.titleScreen?.getButtonCenters?.();
  410 |     if (!centers) throw new Error('titleScreen.getButtonCenters unavailable — geometry getter missing');
  411 |     return centers[w];
  412 |   }, which);
  413 |   return await canvasToCss(page, c.x, c.y);
  414 | }
  415 | 
  416 | export interface LobbyUiPoints {
  417 |   hostButton: { x: number; y: number };
  418 |   joinButton: { x: number; y: number };
  419 |   beginButton: { x: number; y: number };
  420 |   backButton: { x: number; y: number };
  421 |   joinPaneRect: { x: number; y: number; w: number; h: number };
  422 |   joinInputRect: { x: number; y: number; w: number; h: number };
  423 | }
  424 | 
  425 | /** S85 P4c — live lobby click geometry (canvas coords; convert via canvasToCss). */
  426 | export async function lobbyUiPoints(page: Page): Promise<LobbyUiPoints> {
  427 |   return await page.evaluate(() => {
  428 |     const spark = (window as {
  429 |       __SPARK__?: { lobbyScreen?: { getUiPoints?: () => unknown } };
  430 |     }).__SPARK__;
  431 |     const pts = spark?.lobbyScreen?.getUiPoints?.();
  432 |     if (!pts) throw new Error('lobbyScreen.getUiPoints unavailable — geometry getter missing');
  433 |     return pts as never;
  434 |   });
  435 | }
  436 | 
  437 | /**
  438 |  * Wait until a predicate against world state becomes true. Polls every 200ms.
  439 |  * Times out at the page's expect timeout.
  440 |  */
  441 | export async function waitForWorld(
  442 |   page: Page,
  443 |   predicate: (state: Awaited<ReturnType<typeof readWorldState>>) => boolean,
  444 |   description: string,
  445 |   timeoutMs = 30_000,
  446 | ): Promise<void> {
  447 |   const start = Date.now();
  448 |   // ⛔ S142 P2 — REMEMBER THE LAST POLL ERROR. The bare `catch {}` that used to be here is
  449 |   // the single reason nobody has ever diagnosed the quarantine lane: `readWorldState` throwing
  450 |   // on EVERY poll (page crashed, bundle failed to load, __SPARK__ never installed,
  451 |   // net::ERR_ADDRESS_UNREACHABLE) is indistinguishable from the predicate simply not being
  452 |   // satisfied yet. Both produced the identical "waitForWorld timeout" message, so two
  453 |   // completely different failures — a dead page and a slow one — read the same in every log.
  454 |   // Two competing causal stories about this lane have sat in the repo for sessions, neither
  455 |   // substantiated by any captured log, precisely because of this swallow.
  456 |   let lastPollError: string | null = null;
  457 |   let pollErrorCount = 0;
  458 |   while (Date.now() - start < timeoutMs) {
  459 |     try {
  460 |       const state = await readWorldState(page);
  461 |       if (predicate(state)) return;
  462 |       // A poll that SUCCEEDS clears the memory: earlier boot-time throws (__SPARK__ not
  463 |       // installed yet) are expected and must not be reported as the cause of a later timeout.
  464 |       lastPollError = null;
  465 |     } catch (err) {
  466 |       lastPollError = err instanceof Error ? err.message : String(err);
  467 |       pollErrorCount++;
  468 |     }
  469 |     await page.waitForTimeout(200);
  470 |   }
  471 |   const finalState = await readWorldState(page).catch(() => null);
  472 |   // Only surfaced when the LAST poll was still failing — i.e. the page never recovered.
  473 |   // A timeout with no trailing error is a genuine predicate-never-satisfied timeout.
  474 |   const diag =
  475 |     lastPollError !== null
  476 |       ? `\n⚠ The final poll was still THROWING (${pollErrorCount} polls threw). This is very ` +
  477 |         `likely a dead/unreachable page rather than an unmet predicate.\nLast poll error: ${lastPollError}`
  478 |       : pollErrorCount > 0
  479 |         ? `\n(note: ${pollErrorCount} early polls threw and then recovered — normal during boot)`
  480 |         : '';
> 481 |   throw new Error(
      |         ^ Error: waitForWorld timeout (30000ms): host PLAYING + 3 players
  482 |     `waitForWorld timeout (${timeoutMs}ms): ${description}${diag}\nFinal state: ${JSON.stringify(finalState, null, 2)}`,
  483 |   );
  484 | }
  485 | 
  486 | /**
  487 |  * ⛔ S143 P2 — WAIT IN **SIM TICKS**, NOT WALL-CLOCK.
  488 |  *
  489 |  * `waitForWorld` bounds on `Date.now()`. That is right for "did the page reach TITLE" and wrong
  490 |  * for anything the SIMULATION has to do, because ticks are FRAME-bound, not time-bound:
  491 |  * `main.ts` clamps `dtSec = min(deltaMS/1000, 0.05)` at `PHYSICS_HZ = 60`, so **at most 3 sim
  492 |  * ticks advance per RENDERED FRAME**. A 60 s budget therefore buys ~1530 ticks locally and
  493 |  * ~670 on the 2-core SwiftShader CI runner — a 2.3× difference in how much GAME the same
  494 |  * assertion is allowed to observe. Any threshold tuned locally is then a coin flip in CI, and
  495 |  * the failure reads as a product stall rather than as the instrument running out of runway.
  496 |  *
  497 |  * This is the same defect class S127 fixed for the soak lane (`WARMUP_WALL_CAP_MS`), and the
  498 |  * `waitForTick` helper it introduced was left private to the two soak specs. Promoted here so
  499 |  * every spec can bound on the quantity it actually depends on.
  500 |  *
  501 |  * The wall-clock argument survives as a BACKSTOP only: it exists so a genuinely dead page fails
  502 |  * in bounded time, not to decide pass/fail on a live one. Keep it generous.
  503 |  *
  504 |  * It returns the MOMENT the predicate holds, so a fast machine pays nothing for the generous
  505 |  * budget — the budget only decides how much runway the SIM gets before we call it a failure.
  506 |  *
  507 |  * @param budgetTicks how many sim ticks the world may consume before the predicate is declared
  508 |  *                    unmet. Denominate this in the game's own units (build cooldowns, spawn
  509 |  *                    intervals), never in seconds.
  510 |  * @param wallCapMs   hard backstop for a DEAD page (NOT a throughput budget). Keep it generous.
  511 |  */
  512 | export async function waitForWorldWithinTicks(
  513 |   page: Page,
  514 |   predicate: (state: Awaited<ReturnType<typeof readWorldState>>) => boolean,
  515 |   description: string,
  516 |   budgetTicks: number,
  517 |   wallCapMs = 240_000,
  518 | ): Promise<void> {
  519 |   const t0 = (await readWorldState(page)).tick;
  520 |   const start = Date.now();
  521 |   let lastTick = t0;
  522 |   let lastPollError: string | null = null;
  523 |   while (Date.now() - start < wallCapMs) {
  524 |     try {
  525 |       const state = await readWorldState(page);
  526 |       lastPollError = null;
  527 |       lastTick = state.tick;
  528 |       if (predicate(state)) return;
  529 |       if (state.tick - t0 >= budgetTicks) break; // the SIM had its runway — a real failure
  530 |     } catch (err) {
  531 |       lastPollError = err instanceof Error ? err.message : String(err);
  532 |     }
  533 |     await page.waitForTimeout(200);
  534 |   }
  535 | 
  536 |   const elapsedS = (Date.now() - start) / 1000;
  537 |   const spent = lastTick - t0;
  538 |   const rate = (spent / Math.max(elapsedS, 0.001)).toFixed(2);
  539 |   const finalState = await readWorldState(page).catch(() => null);
  540 | 
  541 |   // Distinguish the three failure modes explicitly. Conflating them is precisely why the
  542 |   // worker-bots red was misread for three sessions as "CI throughput or a real stall, unresolved".
  543 |   const why =
  544 |     lastPollError !== null
  545 |       ? `\n⚠ The final poll was still THROWING — very likely a DEAD page, not an unmet predicate.` +
  546 |         `\nLast poll error: ${lastPollError}`
  547 |       : spent >= budgetTicks
  548 |         ? `\n✅ INSTRUMENT OK, PREDICATE GENUINELY UNMET: the sim advanced the full budget of ` +
  549 |           `${budgetTicks} ticks (${t0} → ${lastTick}) in ${elapsedS.toFixed(1)}s (≈${rate} ticks/s) ` +
  550 |           `and the condition never held. This is a real product failure, not a slow runner.`
  551 |         : `\n⚠ WALL BACKSTOP BOUND FIRST — the sim only advanced ${spent}/${budgetTicks} ticks in ` +
  552 |           `${elapsedS.toFixed(1)}s (≈${rate} ticks/s). The predicate was NEVER GIVEN ITS BUDGET, so ` +
  553 |           `this says nothing about the game. Raise wallCapMs or speed up the runner; do NOT ` +
  554 |           `"fix" the product from this signal.`;
  555 | 
  556 |   throw new Error(
  557 |     `waitForWorldWithinTicks failed: ${description}${why}\nFinal state: ${JSON.stringify(finalState, null, 2)}`,
  558 |   );
  559 | }
  560 | 
  561 | /**
  562 |  * Host flow — TitleScreen → 1v1 → HOST → returns room code.
  563 |  * Council C6/Δ1 + Sym A diagnostic: each step asserts world state advanced.
  564 |  */
  565 | export async function hostNewRoom(page: Page, url = '/?debug=1'): Promise<string> {
  566 |   // S123 P2 — `url` lets a spec boot the host with extra flags (e.g. '&worker=1').
  567 |   await page.goto(url);
  568 |   // Wait for the SPARK title to mount.
  569 |   await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE state on host page');
  570 |   // Click "1v1 (2 Player)" — Pixi text isn't queryable via DOM, so we click
  571 |   // by canvas coord. S85 P4c: the coord now comes from the title screen's
  572 |   // LIVE layout (titleButtonCss geometry getter) — the S50 P5 regression
  573 |   // class (hardcoded button math drifting from titleScreen.ts) is closed.
  574 |   const oneVOne = await titleButtonCss(page, 'oneVOne');
  575 |   await page.mouse.click(oneVOne.x, oneVOne.y);
  576 |   await waitForWorld(page, (w) => w.gameState === 'LOBBY', 'LOBBY state on host page');
  577 |   // Click HOST button — live center via the lobby geometry getter.
  578 |   const lobbyPts = await lobbyUiPoints(page);
  579 |   const hostBtn = await canvasToCss(page, lobbyPts.hostButton.x, lobbyPts.hostButton.y);
  580 |   await page.mouse.click(hostBtn.x, hostBtn.y);
  581 |   // After clicking HOST: lobbyScreen.mode = 'hosting', codeText populated.
```