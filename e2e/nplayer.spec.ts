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
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  canvasToCss,
  hostNewRoom,
  joinRoom,
  readWorldState,
  readSeats,
  waitForWorld,
  waitForSeats,
  CANVAS_WIDTH,
} from './helpers';

// Mirror of src/constants.ts PLAYER_COLORS (e2e/ is bundled separately from src/,
// so no import — the values are asserted against the live world below + locked by
// src/state/nplayerSeating.test.ts's distinctness guard).
// S147 R41 - the bots-only 7th silver (0xc0c8d0) is RETIRED: a 4-player cap cannot seat a 7th
// player. Swept here in the SAME commit as src/, which is exactly what the palette canary in
// src/state/nplayerSeating.test.ts exists to force. R45: the palette stays SIX (a race roster).
const PLAYER_COLORS = [0xff3b6b, 0x3bd7ff, 0xffe23b, 0x44ff5e, 0xff8c1a, 0xd73bff];
// S87 — the NETWORKED seat palette is the first MAX_PLAYERS=6 (the 7th silver is
// reachable only in local VS-BOTS mode, which has no e2e wire path).
// S147 R41 - a match seats at most MAX_PLAYERS=4, so a networked game uses the first FOUR colours.
// The palette keeps six entries because the other two are unchosen RACES (R45), not dead seats.
const SEAT_CAP = 4; // mirror of src/constants.ts MAX_PLAYERS
const NETWORKED_COLORS = PLAYER_COLORS.slice(0, SEAT_CAP);

/**
 * Seam injection mirror of smoke.spec.ts: fog off (swiftshader perf) + fast spawn + a win bar the match
 * cannot reach by itself.
 *
 * ⛔ S192 — THE WIN SCORE WAS 3, AND EVERY SEAT STARTS WITH `STARTING_VICTORY_POINTS` = 100
 * (`src/constants.ts`). So the 4-player match hit WIN on its first tick and the host was in POSTGAME
 * before `peer 0 PLAYING + 4 players` could be observed — the failure `e2e-quarantine` printed in every
 * run sampled 2026-08-11 → 2026-10-01. The bar is now far above any natural score, and the FFA win is
 * still forced by injection below (×1000 the bar, above the largest `WIN_SCORE_BANDS` multiplier of 20).
 */
const NPLAYER_WIN_SCORE = 1_000_000;
const NPLAYER_INJECTED_SCORE = NPLAYER_WIN_SCORE * 1000;
async function prepCtx(ctx: BrowserContext, spawnRate = 1.5, winScore = NPLAYER_WIN_SCORE): Promise<void> {
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

/** This page's Trystero peer id — the SAME module instance the game imported (same dev-server URL). */
async function readSelfId(page: Page): Promise<string> {
  return await page.evaluate(async () => {
    const p = '/src/net/transport.ts';
    return ((await import(/* @vite-ignore */ p)) as { selfId: string }).selfId;
  });
}

/*
 * ⛔⛔ S192 T1 — NOW GATING, VIA THE `e2e-lobby` JOB, AND WHY IT CAN.
 *
 * ⚠ THE TAG STAYS, DELIBERATELY — the S155 / S142 P2 precedent (`S46 Baseline` in smoke.spec.ts,
 * `S155 join-stall`): a real-P2P test is promoted to GATING by adding its title to `npm run e2e:lobby`
 * (`--grep "…|S192 late 4th joiner"`), which runs on its OWN runner with no continue-on-error, while
 * `@quarantine-flaky` keeps it out of the SHARED `e2e:gating` lane. That matters here more than for any
 * other test: this one takes 1.1–2.0 min locally (4 contexts, a 3-way mesh, then a 4th), and CI is 3–5×
 * slower — inside the shared 12-min Playwright cap it could starve 60 other tests. A relay hiccup
 * then reddens the lane that names it, not the whole gate. `src/ci.e2eLanes.test.ts` pins the grep.
 *
 * This was quarantined as a "CI timeout flake" (S65). It was red for TWO reasons, and the second hid
 * the first:
 *   1. the match ended at once (the win-score rot above) — every run, even when all 4 connected;
 *   2. ⭐ THE OWNER'S "THE 4TH PLAYER CAN'T CONNECT". Trystero 0.25 pre-builds pooled offers when a
 *      page joins; one older than 57.3 s is restarted by rolling back its never-answered offer, which
 *      strips the data channel (a 105-byte offer). Which side of a pair offers is `selfId < peerId`.
 *      Here the 4th joined at ~+54–64 s, right on the edge, so about half the runs had a dead pair.
 *      Fixed by `src/net/poolSafePeerConnection.ts`.
 *
 * The coin flips are now REMOVED rather than waited out, so this is red without the fix EVERY time:
 *   · staleness is forced: `Date.now` on the 3 pages already in the room is shifted +60 s, and
 *     Trystero's age test is `Date.now() - peer.created > offerTtl` (`strategy.mjs:99`);
 *   · the 4th joiner's peer id is forced to sort ABOVE all three (Math.random is pinned high only while
 *     modules evaluate, which is when Trystero mints `selfId`), so all three are its OFFERERS, all with
 *     stale pooled offers. The precondition is asserted, not assumed.
 * Without the fix the 4th reaches nobody; with it, the full 4-way mesh forms.
 */
/*
 * ⛔ S193 — THE WHOLE-TEST BUDGET WAS 150 s, AND CI NEEDS ~285 s. THAT, NOT THE MESH, IS WHAT WENT RED.
 *
 * `e2e-lobby` failed on 4 of 5 master pushes after deploy #11. Read from the uploaded traces and
 * error-context snapshots of all 12 attempts (runs 36882836513, 36877965841, 36875812341,
 * 36871399300; the 5th, 36873674352, was a 3-min `actions/checkout` timeout, no test ran):
 *   · 11 of 12 died on `Test timeout of 150000ms exceeded` — no assertion failed;
 *   · ⭐ 4 of those 11 had ALREADY FORMED THE FULL 4-WAY MESH with forced-stale offers (the T1 assertion,
 *     passed) and the host was in PLAYING or WIN with 4 seats when the cap fired;
 *   · the other 7 were still DRIVING THE JOIN UI: with three live canvases on SwiftShader a joiner's
 *     navigate → click → fill → Enter took 40–75 s (a single `fill` of 6 characters took 10–16 s);
 *   · 1 of 12 (36882836513 retry #1) failed `early peer 0 sees the other two` — one ICE pair that
 *     exchanged SDP and never connected. The same "after exchanging SDP" failure hits FRESH pairs on
 *     the torrent strategy in these same traces, so it is the relay/ICE flake class, which is what
 *     the lane's 2 retries are for.
 * Slowest measured critical path: 147 s to the 3-way mesh (36875812341), plus 75–135 s for the 4th
 * join → 4-way mesh → Begin → PLAYING → WIN measured on the attempts that got there ⇒ ~282 s.
 *
 * ⛔ ONLY THE TOTAL MOVES. Every per-step wait and every assertion below is unchanged — relaxing one
 * of those would delete the gate while leaving it green. The total was simply smaller than the
 * runner's measured speed, so a passing mesh could not finish passing. `src/ci.e2eLanes.test.ts`
 * pins this budget against the measured floor AND the lane's own `PW_GLOBAL_TIMEOUT_MIN` (3 attempts
 * of it must fit), so neither can drift back under the other.
 */
const LATE_JOINER_BUDGET_MS = 330_000;

test.describe('S63 - 4-player FFA: roster broadcast + distinct seats/colors + FFA win - S192 late 4th joiner @quarantine-flaky', () => {
  test('host + 3 joiners get distinct seats {0..3} incl green@seat3, all PLAYING, one wins', async ({
    browser,
  }) => {
    test.setTimeout(LATE_JOINER_BUDGET_MS);
    const ctxs = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);
    try {
      for (const c of ctxs) await prepCtx(c);
      // The 4th joiner: Math.random pinned to its top value until the page's modules have run, so
      // Trystero's `selfId = genId(20)` is "zzzz…" — above any id the other three can hold.
      await ctxs[3].addInitScript(() => {
        const real = Math.random;
        Math.random = () => 0.99999;
        document.addEventListener('DOMContentLoaded', () => {
          Math.random = real;
        });
      });
      const pages = await Promise.all(ctxs.map((c) => c.newPage()));
      const [hostPage, ...joinerPages] = pages;
      const early = [hostPage, joinerPages[0], joinerPages[1]];
      const late = joinerPages[2];

      // Host opens ONE room; the first two joiners enter, and the 3-way mesh forms normally.
      const code = await hostNewRoom(hostPage);
      for (const jp of joinerPages.slice(0, 2)) await joinRoom(jp, code);
      for (const [i, p] of early.entries()) {
        await waitForWorld(p, (w) => w.peerCount >= 2, `early peer ${i} sees the other two`, 60_000);
      }

      // Force every pooled offer on the three in-room pages past Trystero's 57.3 s TTL.
      for (const p of early) {
        await p.evaluate(() => {
          const real = Date.now.bind(Date);
          Date.now = () => real() + 60_000;
        });
      }

      // The late 4th joiner, whose id sorts above all three ⇒ all three must OFFER to it.
      await joinRoom(late, code);
      const earlyIds = await Promise.all(early.map((p) => readSelfId(p)));
      const lateId = await readSelfId(late);
      for (const id of earlyIds) {
        expect(id < lateId, `precondition: late id ${lateId} must sort above in-room id ${id}`).toBe(true);
      }

      // ⭐ THE FULL 4-WAY MESH — every page reaches the other three (the S192 T1 assertion).
      for (const [i, p] of pages.entries()) {
        await waitForWorld(p, (w) => w.peerCount === 3, `peer ${i} has the full mesh (3 peers)`, 60_000);
      }

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

      // FFA scoring → one winner. The host score is INJECTED over the win threshold (S78/S79 idiom,
      // mirrors hunter.spec). This test covers the FFA WIN PIPELINE (win fires + ENDGAME propagates to
      // all joiners), not the income rate (unit-tested in scoring.test.ts), so injection is the
      // correct decoupling.
      // ⚠ S192 — the 3 "non-bonding anchor" drags that used to precede this are GONE: they waited for
      // `freeSparks.length >= 8`, and measured S192 the host had ZERO free sparks at tick 900 of
      // PLAYING (the match no longer opens with a free-spark field). They never fed the win —
      // `scoreProgress = max(scoreByPlayer)` — so they were test rot, not coverage.
      // ⚠ S192 — `scoreProgress` TOO, not only `scoreByPlayer`. The win gate reads `scoreProgress`,
      // and since S147 the only thing that re-derives it (`tickScoring`) runs in FIGHT only
      // (`hostTick.ts`), so a match still in its opening BUILD phase never noticed the injected
      // score (measured: 1e9 in `scoreByPlayer`, PLAYING at tick 889, no WIN). Attribution still
      // scans `scoreByPlayer`, so seat 0 is the winner either way.
      await hostPage.evaluate((score) => {
        const w = (
          window as unknown as {
            __SPARK__: { world: { scoreByPlayer: Map<number, number>; scoreProgress: number } };
          }
        ).__SPARK__.world;
        w.scoreByPlayer.set(0, score); // >> the win bar at any wave → WIN on the next tick
        w.scoreProgress = score;
      }, NPLAYER_INJECTED_SCORE);
      await waitForWorld(
        hostPage,
        (w) => w.gameState === 'WIN' || w.gameState === 'POSTGAME',
        'host reaches FFA WIN',
        20_000,
      );

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

test.describe('S63 / S147 R41 - FULL-TABLE render: MAX_PLAYERS seated + avatars/HUD render without error', () => {
  test('a full table of distinct-coloured players renders for 1s with zero pageerror (deterministic)', async ({
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
      /*
       * ⛔ S188 — CLONE THE FACTORY-BUILT SEAT 0, never hand-roll a Player. This fixture used to seat six
       * object literals carrying only the S63 fields, so every field added since (S187 `castleUpgrades`,
       * `draftPicks`, S188 `dynastyHpLost`, `raStrike` — `raStrikes` since S190's protocol 51 —, …) was `undefined` on seats 1–5. It stayed green
       * only until a per-frame reader touched one: S188's keep bar reads `castleUpgrades` and the render
       * loop threw "reading 'hpBonus'" every frame. Production never builds a Player this way (the type
       * makes those fields REQUIRED and every construction site goes through `makeIdlePlayer`), so the
       * fix is the fixture, not a defensive `?.` in the game. Cloning the real seat keeps it true forever.
       */
      const template = w.players.get(0);
      if (template === undefined) throw new Error('fixture: seat 0 missing from makeWorld');
      for (let seat = 0; seat < colors.length; seat++) {
        w.players.set(seat, {
          ...structuredClone(template as Record<string, unknown>),
          id: seat,
          color: colors[seat],
          kind: 'Idle',
          energy: 0,
          buildActions: 0,
          disruptionCharges: 0,
          avatarPos: radial(seat, 6),
          territorialShrinkUntilTick: null,
        });
        w.scoreByPlayer.set(seat, seat); // distinct scores so the leaderboard ranks all 6
      }
      // S87 P4 — a NETWORKED match seats MAX_PLAYERS=6; PLAYER_COLORS now has a
      // 7th (bots-mode-only silver), so this 6-player render asserts the first 6.
    }, NETWORKED_COLORS);

    // Let the render loop run a full second over 6 players (catches a render crash).
    await page.waitForTimeout(1000);

    const s = await readWorldState(page);
    expect(s.players.length).toBe(SEAT_CAP);
    // The 6 live colours == the 6 NETWORKED seat colours (incl orange + magenta).
    expect(s.players.map((p) => p.color).sort((x, y) => x - y)).toEqual(
      [...NETWORKED_COLORS].sort((x, y) => x - y),
    );
    // 6 distinct radial positions (no overlap at MAX_PLAYERS).
    expect(new Set(s.players.map((p) => `${p.avatarPos.x},${p.avatarPos.y}`)).size).toBe(SEAT_CAP);

    // Programmatic RENDER proof (S63 CHECK / Grok #1): "world has 6 players + no
    // pageerror" alone does NOT prove the renderer DREW them — so extract the
    // rendered stage pixels and assert every one of the 6 player colours actually
    // appears on the canvas (avatars + leaderboard rows). Same extract.pixels()
    // technique e2e/fog.spec.ts uses as its Pixi pixel arbiter. ±16/channel
    // tolerance is safe: the palette's min pairwise distance is ~92 (no cross-match).
    // ⛔ S195 T22 (§E F2) — BOARD-FRAMED, TITLE HIDDEN, exactly as `e2e/fog.spec.ts` does. This test sets
    // `gameState = 'PLAYING'` directly (above), without the frame that hides the title, so the S194 living
    // HOME backdrop's embers were still composed and widened the stage's bounds by a different amount every
    // frame; an unframed `extract.pixels(app.stage)` extracts those BOUNDS, so the read sampled an
    // ember-sized, timing-dependent canvas. Framed to 0..1920 × 0..1080 it reads the board, every run.
    const renderedColors = await page.evaluate((colors) => {
      const spark = (
        window as unknown as {
          __SPARK__?: {
            app: {
              stage: unknown;
              screen: { constructor: new (x: number, y: number, w: number, h: number) => unknown };
              renderer: { extract: { pixels: (t: unknown) => { pixels: Uint8ClampedArray; width: number; height: number } } };
            };
            titleScreen: { setVisible: (v: boolean) => void };
          };
        }
      ).__SPARK__;
      if (!spark) throw new Error('__SPARK__ not exposed');
      spark.titleScreen.setVisible(false);
      const board = new spark.app.screen.constructor(0, 0, 1920, 1080);
      const out = spark.app.renderer.extract.pixels({ target: spark.app.stage, frame: board });
      if (out.width !== 1920 || out.height !== 1080) throw new Error(`stage extract not board-framed: ${out.width}x${out.height}`);
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
    }, NETWORKED_COLORS);
    expect(
      renderedColors,
      `every networked PLAYER_COLOR must be drawn on the canvas; found=${JSON.stringify(renderedColors)}`,
      // S147 R41 - derived from the seat cap, not a fixed row of six `true`s. Every SEATED colour must
      // be drawn; the two unchosen race colours (R45) are not on the board and must not be expected.
    ).toEqual(NETWORKED_COLORS.map(() => true));

    await page.screenshot({ path: 'test-results/s63-full-table-hud.png' });

    // The render loop ran over 6 players with no thrown error.
    expect(pageErrors, `pageerrors during 6-player render: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

// @quarantine-flaky — S70 P1: real 2-peer WebRTC, same swiftshader timing flake
// class as the 4-peer test → NON-GATING lane (the deterministic render path gates
// via lobby-construction.spec.ts; this is the end-to-end wire proof the unit tests
// cannot reach). Council DP1: real-peer netcode is quarantined, deterministic gates.
test.describe('S70 - lobby presence: joiner sees its OWN seat over real WebRTC @quarantine-flaky', () => {
  test('host + 1 joiner: the joiner learns its seat (1) from the presence beacon BEFORE Begin; host self-dispatch updates seat 0', async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
    try {
      for (const c of ctxs) await prepCtx(c);
      const [hostPage, joinerPage] = await Promise.all(ctxs.map((c) => c.newPage()));

      const code = await hostNewRoom(hostPage);
      await joinRoom(joinerPage, code);

      // Host sees the joiner connect → its onPeerChange handler broadcasts LOBBY_PRESENCE.
      await waitForWorld(hostPage, (w) => w.peerCount >= 1, 'host sees the joiner connected', 45_000);

      // THE P3 WIN: the joiner, STILL IN LOBBY (no Begin yet), receives the beacon
      // and learns WHICH seat is its OWN (seat 1) — pre-S70 it knew this only at Begin.
      await waitForSeats(
        joinerPage,
        (seats) => seats[1]?.occupied === true && seats[1]?.isYou === true,
        'joiner learns its own seat (1) via the presence beacon',
        30_000,
      );
      const jSeats = await readSeats(joinerPage);
      expect(jSeats[0]).toMatchObject({ occupied: true, isHost: true, isYou: false });
      expect(jSeats[1]).toMatchObject({ occupied: true, isYou: true });
      expect(jSeats.filter((s) => s.isYou)).toHaveLength(1);

      // The host's OWN rack updates via the LOCAL self-dispatch (transport.send()
      // excludes self — Council R6 CRITICAL): seat 0 is the host (isYou), seat 1 the joiner.
      await waitForSeats(
        hostPage,
        (seats) => seats[0]?.isYou === true && seats[1]?.occupied === true,
        'host self-dispatch updates its own rack (seat 0 = you, seat 1 = joiner)',
        15_000,
      );
      const hSeats = await readSeats(hostPage);
      expect(hSeats[0]).toMatchObject({ occupied: true, isHost: true, isYou: true });
      expect(hSeats[1].isYou).toBe(false);

      // Presence is pre-Begin + cosmetic — both peers are STILL in LOBBY (not PLAYING).
      expect((await readWorldState(joinerPage)).gameState).toBe('LOBBY');
      expect((await readWorldState(hostPage)).gameState).toBe('LOBBY');
    } finally {
      await Promise.all(ctxs.map((c) => c.close()));
    }
  });
});
