/**
 * SPARK — ⭐⭐ S193 (owner R192-T2/T4) — **TEAMS OVER REAL WebRTC: claim a team in the lobby, start, and
 * teammates see no wall.**
 *
 * S192 built the multiplayer lobby's team chip (`CLAIM_TEAM`, the host's `teamByPeer`, the side-by-side
 * re-seat at Begin) and proved it with unit tests only — no two real peers ever exchanged a team. This
 * spec does it over Trystero/Nostr with three browser contexts:
 *
 *   · host + 2 joiners; the host and joiner 1 click THEIR OWN seat's team chip once (— → T1);
 *     joiner 2 clicks twice (— → T1 → T2). Joiners' picks travel as `CLAIM_TEAM`, the host's is local;
 *     every page waits for the host's presence beacon to repaint the chips (no local optimism);
 *   · the host clicks BEGIN; all three reach PLAYING with the SAME `world.teams` (host-minted, it rides
 *     the snapshot — a joiner never computes it);
 *   · ⭐ T2 on EVERY peer: the wall between the two teammates' zones is not a side boundary
 *     (`wallSeparatesSides` false), every wall touching the lone enemy is.
 *
 * Why THREE peers and not two: two peers on one team is a match with no enemy, and Begin refuses it
 * (spec Q2, `teamsPlayable`); two peers on two teams is a free-for-all (`normalizeTeams` → undefined).
 * A team needs a teammate AND an enemy.
 *
 * `@quarantine-flaky` for the same reason as the S63 4-peer test: a real-P2P mesh does not belong in the
 * SHARED gating lane's 12-minute cap. Promotion is the merge owner's call (add the title to
 * `npm run e2e:lobby` and pin it in `src/ci.e2eLanes.test.ts`).
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { canvasToCss, hostNewRoom, joinRoom, readSeats, readWorldState, waitForSeats, waitForWorld, CANVAS_WIDTH } from './helpers';

async function prepCtx(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    (window as { __FOG_DISABLE__?: boolean }).__FOG_DISABLE__ = true;
    (window as { __TEST_WIN_SCORE__?: number }).__TEST_WIN_SCORE__ = 1_000_000_000;
  });
}

/** Click THIS page's own seat's team chip (`seatRack.ts`: chip at (14,10), 56×32, inside the seat rect). */
async function clickOwnTeamChip(page: Page): Promise<void> {
  const seats = await readSeats(page);
  const mine = seats.find((s) => s.isYou && s.occupied);
  if (mine === undefined) throw new Error(`no own seat in ${JSON.stringify(seats)}`);
  const rect = await page.evaluate(async (i) => {
    const p = '/src/render/lobbyGeometry.ts';
    const g = (await import(/* @vite-ignore */ p)) as { getSeatRect: (i: number) => { x: number; y: number } };
    return g.getSeatRect(i);
  }, mine.index);
  const at = await canvasToCss(page, rect.x + 14 + 28, rect.y + 10 + 16);
  await page.mouse.click(at.x, at.y);
}

type SeatWithTeam = { index: number; occupied: boolean; isYou: boolean; team?: number | null };
const teamOfSeat = (seats: SeatWithTeam[], index: number): number | null | undefined =>
  seats.find((s) => s.index === index)?.team;

test.describe('S193 teams lobby — claim teams over real WebRTC, start, teammates see no wall @quarantine-flaky', () => {
  test('host + 2 joiners: T1 / T1 / T2 → all PLAYING, one world.teams, no wall between teammates', async ({ browser }) => {
    test.setTimeout(150_000);
    const ctxs = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
    try {
      for (const c of ctxs) await prepCtx(c);
      const pages = await Promise.all(ctxs.map((c) => c.newPage()));
      const [host, j1, j2] = pages as [Page, Page, Page];

      const code = await hostNewRoom(host);
      await joinRoom(j1, code);
      await joinRoom(j2, code);
      for (const [i, p] of pages.entries()) {
        await waitForWorld(p, (w) => w.peerCount >= 2, `peer ${i} sees the other two`, 60_000);
        await waitForSeats(p, (s) => s.filter((x) => x.occupied).length === 3, `peer ${i} sees three seats`, 30_000);
      }

      // ── claim: host T1 (index 0), joiner 1 T1, joiner 2 T2 — each on its OWN chip ──
      const ownIndex = async (p: Page): Promise<number> => (await readSeats(p)).find((s) => s.isYou && s.occupied)!.index;
      const [hi, i1, i2] = [await ownIndex(host), await ownIndex(j1), await ownIndex(j2)];
      expect(new Set([hi, i1, i2]).size, 'three distinct seats').toBe(3);
      await clickOwnTeamChip(host);
      await clickOwnTeamChip(j1);
      await clickOwnTeamChip(j2);
      // Joiner 2 must SEE its first pick land before cycling again — the chip has no local optimism.
      await waitForSeats(j2, (s) => teamOfSeat(s as SeatWithTeam[], i2) === 0, 'joiner 2 sees its T1 land', 30_000);

      // ⭐ S193 (audit F1) — ALL THREE ON T1: no enemy, so the host's Begin is DIMMED with the hint, and a
      // press does nothing. Read from the live display objects (`getDebugState`), not from the view.
      await waitForSeats(
        host,
        (s) => [hi, i1, i2].every((i) => teamOfSeat(s as SeatWithTeam[], i) === 0),
        'host sees T1 / T1 / T1',
        30_000,
      );
      const lobbyDebug = (): Promise<{ beginButtonVisible: boolean; beginButtonAlpha: number; teamsHintVisible: boolean }> =>
        host.evaluate(() => (window as unknown as { __SPARK__: { lobbyScreen: { getDebugState: () => never } } }).__SPARK__.lobbyScreen.getDebugState());
      await expect.poll(lobbyDebug, { timeout: 10_000 }).toMatchObject({ beginButtonVisible: true, beginButtonAlpha: 0.4, teamsHintVisible: true });
      const dimBegin = await canvasToCss(host, CANVAS_WIDTH / 2, 814);
      await host.mouse.click(dimBegin.x, dimBegin.y);
      await host.waitForTimeout(2_000);
      expect((await readWorldState(host)).gameState, 'one team: Begin does nothing').toBe('LOBBY');

      await clickOwnTeamChip(j2);
      for (const [i, p] of pages.entries()) {
        await waitForSeats(
          p,
          (s) => {
            const ss = s as SeatWithTeam[];
            return teamOfSeat(ss, hi) === 0 && teamOfSeat(ss, i1) === 0 && teamOfSeat(ss, i2) === 1;
          },
          `peer ${i} sees T1 / T1 / T2 on the rack (from the host's presence beacon)`,
          30_000,
        );
      }

      // CONTROL — two sides now: Begin at full strength, no hint.
      await expect.poll(lobbyDebug, { timeout: 10_000 }).toMatchObject({ beginButtonVisible: true, beginButtonAlpha: 1, teamsHintVisible: false });

      // ── begin ──
      const beginBtn = await canvasToCss(host, CANVAS_WIDTH / 2, 814);
      await host.mouse.click(beginBtn.x, beginBtn.y);
      for (const [i, p] of pages.entries()) {
        await waitForWorld(p, (w) => w.gameState === 'PLAYING' && w.players.length === 3, `peer ${i} PLAYING with 3 players`, 45_000);
      }

      // ── every peer: the same teams, and T2's walls ──
      const views = await Promise.all(
        pages.map((p) =>
          p.evaluate(async () => {
            const spark = (window as unknown as { __SPARK__: { world: { teams?: number[]; localPlayerId: number; layout: unknown } } }).__SPARK__;
            const w = spark.world;
            const wp = '/src/state/walls.ts';
            const walls = (await import(/* @vite-ignore */ wp)) as {
              wallSegments: (l: unknown) => Array<{ zoneA: number; zoneB: number }>;
              wallSeparatesSides: (w: unknown, s: { zoneA: number; zoneB: number }) => boolean;
            };
            return {
              teams: w.teams ?? null,
              me: w.localPlayerId,
              walls: walls.wallSegments(w.layout).map((s) => ({ a: s.zoneA, b: s.zoneB, sep: walls.wallSeparatesSides(w, s) })),
            };
          }),
        ),
      );
      const teams = views[0]!.teams;
      expect(teams, 'the host minted a team match').not.toBeNull();
      for (const v of views) expect(v.teams, 'every peer reads the HOST’s teams').toEqual(teams);
      expect(new Set(views.map((v) => v.me)).size, 'three distinct local seats').toBe(3);
      // Two seats share a team, one is alone.
      const counts = new Map<number, number>();
      for (const t of teams!) counts.set(t, (counts.get(t) ?? 0) + 1);
      expect([...counts.values()].sort()).toEqual([1, 2]);
      const [mateA, mateB] = teams!.flatMap((t, s) => (counts.get(t) === 2 ? [s] : []));
      for (const v of views) {
        expect(v.walls.length, 'anti-vacuity: the board has walls').toBeGreaterThan(0);
        for (const w of v.walls) {
          const teammates = (w.a === mateA && w.b === mateB) || (w.a === mateB && w.b === mateA);
          expect(w.sep, `wall ${w.a}|${w.b} on peer ${v.me}: ${teammates ? 'teammates — no wall (T2)' : 'a side boundary'}`).toBe(!teammates);
        }
        // ⭐ the teammates DO share a border (the side-by-side re-seat): a wall between them exists and is down
        expect(v.walls.some((w) => !w.sep), `peer ${v.me}: the teammates' shared border is open`).toBe(true);
      }
      await host.screenshot({ path: 'test-results/s193-teams-lobby-host.png' });
    } finally {
      for (const c of ctxs) await c.close();
    }
  });
});
