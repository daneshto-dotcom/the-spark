/**
 * SPARK — S63 P2: N-player (4/5/6) runtime verification.
 *
 * Complements the deterministic unit backbone (src/state/nplayerSeating.test.ts,
 * which locks applyStartGame seating + per-seat colors + radial positions for
 * N=2..6) with two runtime layers:
 *
 *  1. 4-player FFA over REAL Trystero/Nostr WebRTC (host + 3 joiners) — proves
 *     the netcode generalizes past the S62 3-peer ship: a 3-joiner roster
 *     broadcasts, all 4 peers self-identify distinct seats {0..3} and agree
 *     byte-exact on the 4 colours (incl seat 3 = green, never instantiated
 *     before S63), and FFA scoring produces one winner every peer sees. This
 *     is the S62 3-peer test +1 joiner.
 *
 *  2. 6-player RENDER proof — single-page, deterministic. The only layer that
 *     exercises the avatar + leaderboard-HUD render paths at MAX_PLAYERS=6. It
 *     seats 6 players directly into the world (the seating LOGIC is unit-proven)
 *     and asserts the render loop runs a full second over 6 distinctly-coloured
 *     players with ZERO pageerror — catching a hardcoded-<6 / index-overflow
 *     render crash that unit tests and the 4-peer test cannot reach.
 *
 * Why NOT a real 6-peer WebRTC test: per S63 Council (Grok, risk authority),
 * 6 real peers = 15 data channels under swiftshader = high CI flake for no extra
 * LOGIC coverage. unit(N=6) + this deterministic render proof + the 4-peer real
 * netcode test cover the same ground reliably. (Battle Ledger DP1.)
 */
import { test, expect, type BrowserContext } from '@playwright/test';
import {
  canvasToCss,
  hostNewRoom,
  joinRoom,
  dragSparkTo,
  readWorldState,
  waitForWorld,
  CANVAS_WIDTH,
} from './helpers';

// Mirror of src/constants.ts PLAYER_COLORS (e2e/ is bundled separately from src/,
// so no import — the values are asserted against the live world below + locked by
// src/state/nplayerSeating.test.ts's distinctness guard).
const PLAYER_COLORS = [0xff3b6b, 0x3bd7ff, 0xffe23b, 0x44ff5e, 0xff8c1a, 0xd73bff];

/** Seam injection mirror of smoke.spec.ts: fog off (swiftshader perf) + fast spawn + low win. */
async function prepCtx(ctx: BrowserContext, spawnRate = 1.5, winScore = 3): Promise<void> {
  await ctx.addInitScript(() => {
    (window as { __FOG_DISABLE__?: boolean }).__FOG_DISABLE__ = true;
  });
  await ctx.addInitScript((r) => {
    (window as { __TEST_SPAWN_RATE_PER_SECOND__?: number }).__TEST_SPAWN_RATE_PER_SECOND__ = r;
  }, spawnRate);
  await ctx.addInitScript((w) => {
    (window as { __TEST_WIN_SCORE__?: number }).__TEST_WIN_SCORE__ = w;
  }, winScore);
}

test.describe('S63 - 4-player FFA: roster broadcast + distinct seats/colors + FFA win', () => {
  test('host + 3 joiners get distinct seats {0..3} incl green@seat3, all PLAYING, one wins', async ({
    browser,
  }) => {
    test.setTimeout(90_000); // +1 peer over the proven 3-peer test → extra headroom
    const ctxs = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);
    try {
      for (const c of ctxs) await prepCtx(c);
      const pages = await Promise.all(ctxs.map((c) => c.newPage()));
      const [hostPage, ...joinerPages] = pages;

      // Host opens ONE room; all 3 joiners enter the same code.
      const code = await hostNewRoom(hostPage);
      for (const jp of joinerPages) await joinRoom(jp, code);

      // Host sees all 3 joiners connected.
      await waitForWorld(hostPage, (w) => w.peerCount >= 3, 'host sees 3 joiners connected', 60_000);

      // Host begins → all 4 seated from the authoritative ordered roster.
      const beginBtn = await canvasToCss(hostPage, CANVAS_WIDTH / 2, 814);
      await hostPage.mouse.click(beginBtn.x, beginBtn.y);

      for (const [i, page] of pages.entries()) {
        await waitForWorld(
          page,
          (w) => w.gameState === 'PLAYING' && w.gameMode === '1v1' && w.players.length === 4,
          `peer ${i} PLAYING + 4 players`,
          30_000,
        );
      }

      const states = await Promise.all(pages.map((p) => readWorldState(p)));

      // Host is seat 0; the 4 peers cover distinct seats {0,1,2,3}.
      expect(states[0].localPlayerId).toBe(0);
      expect(new Set(states.map((s) => s.localPlayerId))).toEqual(new Set([0, 1, 2, 3]));

      // Every peer agrees on the SAME 4 colours = crimson / cyan / yellow / green.
      const EXPECT = [PLAYER_COLORS[0], PLAYER_COLORS[1], PLAYER_COLORS[2], PLAYER_COLORS[3]].sort(
        (x, y) => x - y,
      );
      for (const s of states) {
        expect(s.players.map((p) => p.color).sort((x, y) => x - y)).toEqual(EXPECT);
      }
      // Seat 3 (the 4th player) is GREEN — never instantiated at runtime before S63.
      expect(states[0].players.find((p) => p.id === 3)?.color).toBe(0x44ff5e);

      // Cross-client determinism: each seat has the SAME colour on every peer.
      for (const seat of [0, 1, 2, 3]) {
        const c0 = states[0].players.find((p) => p.id === seat)?.color;
        for (const s of states) expect(s.players.find((p) => p.id === seat)?.color).toBe(c0);
      }

      // Render artifact (Playwright screenshot works headless, unlike the preview tool).
      await hostPage.screenshot({ path: 'test-results/s63-4player-hud.png' });

      // FFA scoring → one winner. Host places 3 non-bonding anchors (score 3 = __TEST_WIN_SCORE__).
      await waitForWorld(hostPage, (w) => w.freeSparks.length >= 8, 'sparks spawned on host', 20_000);
      await dragSparkTo(hostPage, 300, 400);
      await dragSparkTo(hostPage, 300, 600);
      await dragSparkTo(hostPage, 300, 800);
      await waitForWorld(hostPage, (w) => w.gameState === 'WIN', 'host reaches FFA WIN', 20_000);

      // All 3 joiners see the game end.
      for (const [i, page] of joinerPages.entries()) {
        await waitForWorld(
          page,
          (w) => w.gameState === 'WIN' || w.gameState === 'POSTGAME',
          `joiner ${i + 1} sees the FFA game end`,
          15_000,
        );
      }
    } finally {
      await Promise.all(ctxs.map((c) => c.close()));
    }
  });
});

test.describe('S63 - 6-player render: MAX_PLAYERS seated + avatars/HUD render without error', () => {
  test('6 distinctly-coloured players render for 1s with zero pageerror (deterministic)', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    // Fog off so the avatar screenshot is clean (mirrors the gameplay specs).
    await page.addInitScript(() => {
      (window as { __FOG_DISABLE__?: boolean }).__FOG_DISABLE__ = true;
    });
    await page.goto('/?debug=1');
    await waitForWorld(page, (w) => w.gameState === 'TITLE', 'TITLE on single page');

    // Seat 6 players directly into the world. The seating LOGIC is unit-proven
    // (nplayerSeating.test.ts); THIS proves the live RENDER loop survives
    // MAX_PLAYERS. radialSpawnPos + PLAYER_COLORS replicated inline (e2e is
    // bundled separately from src/) and the colours are asserted below.
    await page.evaluate((colors) => {
      const spark = (
        window as {
          __SPARK__?: {
            world: {
              gameMode: string;
              gameState: string;
              localPlayerId: number;
              players: Map<number, unknown>;
              scoreByPlayer: Map<number, number>;
            };
          };
        }
      ).__SPARK__;
      if (!spark) throw new Error('__SPARK__ not exposed');
      const w = spark.world;
      const CX = 960;
      const CY = 540;
      const R = 250 + 40; // SPAWNER_RADIUS + 40
      const radial = (seat: number, total: number): { x: number; y: number } => {
        const a = Math.PI + (seat / Math.max(1, total)) * 2 * Math.PI;
        return { x: Math.round(CX + R * Math.cos(a)), y: Math.round(CY + R * Math.sin(a)) };
      };
      w.gameMode = '1v1';
      w.gameState = 'PLAYING';
      w.localPlayerId = 0;
      for (let seat = 0; seat < 6; seat++) {
        w.players.set(seat, {
          id: seat,
          color: colors[seat],
          kind: 'Idle',
          energy: 0,
          buildActions: 0,
          disruptionCharges: 0,
          avatarPos: radial(seat, 6),
          godlyCooldownEndsAtTick: null,
          territorialShrinkUntilTick: null,
        });
        w.scoreByPlayer.set(seat, seat); // distinct scores so the leaderboard ranks all 6
      }
    }, PLAYER_COLORS);

    // Let the render loop run a full second over 6 players (catches a render crash).
    await page.waitForTimeout(1000);

    const s = await readWorldState(page);
    expect(s.players.length).toBe(6);
    // The 6 live colours == the full PLAYER_COLORS palette (incl orange + magenta).
    expect(s.players.map((p) => p.color).sort((x, y) => x - y)).toEqual(
      [...PLAYER_COLORS].sort((x, y) => x - y),
    );
    // 6 distinct radial positions (no overlap at MAX_PLAYERS).
    expect(new Set(s.players.map((p) => `${p.avatarPos.x},${p.avatarPos.y}`)).size).toBe(6);

    // Programmatic RENDER proof (S63 CHECK / Grok #1): "world has 6 players + no
    // pageerror" alone does NOT prove the renderer DREW them — so extract the
    // rendered stage pixels and assert every one of the 6 player colours actually
    // appears on the canvas (avatars + leaderboard rows). Same extract.pixels()
    // technique e2e/fog.spec.ts uses as its Pixi pixel arbiter. ±16/channel
    // tolerance is safe: the palette's min pairwise distance is ~92 (no cross-match).
    const renderedColors = await page.evaluate((colors) => {
      const spark = (
        window as unknown as {
          __SPARK__?: {
            app: {
              stage: unknown;
              renderer: { extract: { pixels: (t: unknown) => { pixels: Uint8ClampedArray } } };
            };
          };
        }
      ).__SPARK__;
      if (!spark) throw new Error('__SPARK__ not exposed');
      const out = spark.app.renderer.extract.pixels(spark.app.stage);
      const px = out.pixels;
      const want = colors.map((c) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff]);
      const found = want.map(() => false);
      const TOL = 16;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        for (let k = 0; k < want.length; k++) {
          if (
            !found[k] &&
            Math.abs(r - want[k][0]) <= TOL &&
            Math.abs(g - want[k][1]) <= TOL &&
            Math.abs(b - want[k][2]) <= TOL
          ) {
            found[k] = true;
          }
        }
      }
      return found;
    }, PLAYER_COLORS);
    expect(
      renderedColors,
      `every PLAYER_COLOR must be drawn on the canvas; found=${JSON.stringify(renderedColors)}`,
    ).toEqual([true, true, true, true, true, true]);

    await page.screenshot({ path: 'test-results/s63-6player-hud.png' });

    // The render loop ran over 6 players with no thrown error.
    expect(pageErrors, `pageerrors during 6-player render: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
