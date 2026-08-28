/**
 * SPARK — S155 P1: **THE OWNER'S STUCK LOBBY, REPRODUCED ON PURPOSE.**
 *
 * Owner, after an evening of trying to play with a friend: *"multiplayer mdoe doesnt work, neither
 * the quick match nor the host/join the server. you see that player already in when trying to
 * connect and it keeps saying connected... but then its stuck."*
 *
 * ## Why this file exists, and why it is a SEAM test rather than a natural reproduction
 *
 * The 2-peer host/join/Begin flow PASSES at HEAD over real Trystero/Nostr — measured three times
 * (CI run 32701269568 on 2026-08-24, and twice locally at S155 HEAD). So the happy path is fine and
 * the owner's failure lives somewhere a dev build on one machine cannot reach. That left the
 * player-facing half of the fix verifiable only by reading the reducer — which is precisely the
 * "static parse ≠ runtime validation" trap the PRIME-AUDIT protocol forbids, and precisely how the
 * bot-tower defect got certified twice by a fixture that could not fail.
 *
 * So the joiner is given `__FORCE_ATTEST_FAIL__`, which makes host verification refuse — the ONE
 * state that produces every clause of the owner's sentence at once:
 *
 *   - `LOBBY_PRESENCE` is buffered pre-latch, so the seat rack falls back to COUNT-based derivation
 *     and the joiner **still sees the other player** (clause 1, produced by the fallback);
 *   - the status line is driven by transport `peerCount`, which knows nothing about trust, so it
 *     **still says "Connected"** (clause 2);
 *   - `START_GAME_SIGNAL` is buffered too so the joiner never leaves LOBBY, and `hostAuthFilter`
 *     independently drops `NETSNAPSHOT` so the S39 P1 snapshot fallback that exists to rescue a lost
 *     Begin **cannot fire either** (clause 3 — "stuck").
 *
 * ## What is asserted, and what is deliberately NOT changed
 *
 * ⛔ THE FIX IS NOT "LET THEM IN". The S155 Council killed that as a BLOCKER: the room code is public
 * in quickmatch and room membership is racy, so "the only host-candidate peer" is attacker-
 * controllable and admitting an unattested Begin would hand out unfiltered snapshot authority —
 * strictly worse than being stuck. So test 1 below asserts the joiner is **STILL REFUSED**. That is
 * the security property, and it must never be "fixed".
 *
 * What changes is that the game now SAYS SO and points at the way out, which is test 2.
 *
 * Tagged `@quarantine-flaky` per the standing rule for real-WebRTC specs, and additionally selected
 * by the GATING `e2e-lobby` lane (`npm run e2e:lobby`) alongside the S46 Baseline — the S142 P2
 * grep-lane idiom, so multiplayer finally has a binding signal without flaky multi-peer tests being
 * able to red the shared gating lane.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  CANVAS_WIDTH,
  canvasToCss,
  hostNewRoom,
  joinRoom,
  readLobbyStatus,
  readWorldState,
  waitForWorld,
} from './helpers';

/** Mirror of smoke.spec.ts's open2Peers, minus the gameplay seams this spec does not need. */
async function open2Peers(browser: import('@playwright/test').Browser): Promise<{
  hostCtx: BrowserContext;
  hostPage: Page;
  joinerCtx: BrowserContext;
  joinerPage: Page;
}> {
  const hostCtx = await browser.newContext();
  const joinerCtx = await browser.newContext();
  for (const c of [hostCtx, joinerCtx]) {
    await c.addInitScript(() => {
      (window as { __FOG_DISABLE__?: boolean }).__FOG_DISABLE__ = true;
    });
  }
  // ⭐ THE SEAM, joiner-only: this peer will refuse to verify the host. Installed BEFORE newPage so
  // it is live before any message can arrive (the same ordering every other seam here relies on).
  await joinerCtx.addInitScript(() => {
    (window as { __FORCE_ATTEST_FAIL__?: boolean }).__FORCE_ATTEST_FAIL__ = true;
  });
  const hostPage = await hostCtx.newPage();
  const joinerPage = await joinerCtx.newPage();
  return { hostCtx, hostPage, joinerCtx, joinerPage };
}

/** The Begin Match button, at the coordinates smoke.spec.ts already uses. */
async function pressBegin(hostPage: Page): Promise<void> {
  const btn = await canvasToCss(hostPage, CANVAS_WIDTH / 2, 814);
  await hostPage.mouse.click(btn.x, btn.y);
}

test.describe('S155 join-stall — an unverifiable host is refused, and SAID SO @quarantine-flaky', () => {
  test('⛔ SECURITY: an unverifiable host cannot start the match on the joiner', async ({ browser }) => {
    const { hostCtx, hostPage, joinerCtx, joinerPage } = await open2Peers(browser);
    try {
      const code = await hostNewRoom(hostPage);
      await joinRoom(joinerPage, code);
      await waitForWorld(hostPage, (w) => w.peerCount >= 1, 'host sees the joiner', 60_000);

      await pressBegin(hostPage);

      // The HOST starts normally — its own Begin is local and needs no attestation.
      await waitForWorld(hostPage, (w) => w.gameState === 'PLAYING', 'host PLAYING', 30_000);

      // ...and the JOINER does NOT, because it could not verify who it is talking to. Held for a
      // real interval rather than sampled once: the buffered Begin must stay buffered, and the
      // 10 Hz snapshot stream must keep being dropped, for as long as trust is absent.
      await joinerPage.waitForTimeout(4_000);
      const js = await readWorldState(joinerPage);
      expect(js.gameState).toBe('LOBBY');
    } finally {
      await joinerCtx.close();
      await hostCtx.close();
    }
  });

  test('⭐ the joiner is TOLD it is stuck, and told the way out', async ({ browser }) => {
    const { hostCtx, hostPage, joinerCtx, joinerPage } = await open2Peers(browser);
    try {
      const code = await hostNewRoom(hostPage);
      await joinRoom(joinerPage, code);
      await waitForWorld(hostPage, (w) => w.peerCount >= 1, 'host sees the joiner', 60_000);
      await pressBegin(hostPage);

      /*
       * ⭐ THIS IS THE ASSERTION THE OWNER'S EVENING BOUGHT. Before S155 the joiner's status line
       * read "Connected. Waiting for host to begin..." forever, with the failure recorded nowhere but
       * the console. JOIN_STALL_WARN_MS is 8 s, so poll past it and require the line to have changed
       * into something that names the layer AND names an exit.
       */
      await expect
        .poll(async () => await readLobbyStatus(joinerPage), { timeout: 25_000, intervals: [500] })
        .toContain('could not verify');

      const status = await readLobbyStatus(joinerPage);
      // It must name what happened — the host DID press Begin and we threw it away. That branch
      // outranks the generic "cannot verify" precisely because it is what the owner hit.
      expect(status).toContain('The host started the match');
      // And it must name both exits that genuinely exist today. A stall message with no way out is
      // the original bug wearing a label.
      expect(status).toMatch(/Back/);
      expect(status).toMatch(/VS BOTS/);
      // Still refused, still in the lobby — the message is a diagnosis, never an admission.
      expect((await readWorldState(joinerPage)).gameState).toBe('LOBBY');
    } finally {
      await joinerCtx.close();
      await hostCtx.close();
    }
  });
});
