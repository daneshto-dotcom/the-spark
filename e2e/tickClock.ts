/**
 * SPARK — S193: a sim-clock wait for e2e. See the docblock below; used by `hostmigration.spec.ts` and
 * proven against a frozen and a live sim by `tickClock.spec.ts`.
 */
import type { Page } from '@playwright/test';

async function readTick(page: Page): Promise<number> {
  return await page.evaluate(
    () => (window as unknown as { __SPARK__: { world: { tick: number } } }).__SPARK__.world.tick,
  );
}

/*
 * ⛔ S193 — "THE SIM ADVANCES" IS MEASURED ON THE SIM'S OWN CLOCK, NOT THE WALL'S.
 *
 * These waits were `tick > prev + N` within 15–25 s of WALL time. On CI that fails without saying why:
 * runs 36884780286 / 36844358659 (test 1) and 36840314291 (test 2) all died at the successor's
 * `+60 ticks in 15 s`, AFTER it had become host at epoch 1 — and the same three tests pass 3/3 locally.
 * Ticks are frame-bound (`main.ts` clamps dt to 0.05 s ⇒ 1–3 ticks per rendered frame), so a wall
 * window tests the runner's frame rate, not the migration: the S143 lesson, one file over. And a wall
 * timeout cannot tell "the new host froze" (a real defect) from "the runner was slow" (none).
 *
 * The budget is now RENDERED FRAMES of the page that runs the sim (the successor). A live sim moves
 * ≥ 1 tick per frame, so `delta` ticks within `4 × delta` frames (+ snapshot latency for a mirror) can
 * only fail if the sim is frozen or crawling — whatever the runner's speed. The wall cap is only a
 * dead-page backstop, and the failure message reports both counters, so the next red names its cause.
 */
export async function installFrameClock(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __E2E_FRAMES__?: number };
    if (w.__E2E_FRAMES__ !== undefined) return;
    w.__E2E_FRAMES__ = 0;
    const step = (): void => {
      w.__E2E_FRAMES__ = (w.__E2E_FRAMES__ ?? 0) + 1;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
export async function readFrames(page: Page): Promise<number> {
  return await page.evaluate(() => (window as unknown as { __E2E_FRAMES__?: number }).__E2E_FRAMES__ ?? -1);
}
/** Mirror pages see the sim through snapshots: one extra second of the source's frames covers that latency. */
export const MIRROR_LATENCY_FRAMES = 60;
export const TICK_WAIT_WALL_BACKSTOP_MS = 120_000;
/**
 * Waits until `observed`'s tick has advanced by more than `delta`, budgeted in rendered frames of
 * `clock` (the page simulating). Throws, naming both counters, if the frames run out first.
 */
export async function waitForTickAdvance(
  observed: Page,
  clock: Page,
  delta: number,
  label: string,
  mirror: boolean,
): Promise<void> {
  const maxFrames = 4 * delta + (mirror ? MIRROR_LATENCY_FRAMES : 0);
  const t0 = await readTick(observed);
  const f0 = await readFrames(clock);
  if (f0 < 0) throw new Error(`${label}: frame clock not installed on the sim page`);
  const wall0 = Date.now();
  for (;;) {
    const [t, f] = [await readTick(observed), await readFrames(clock)];
    if (t > t0 + delta) return;
    const frames = f - f0;
    if (frames > maxFrames) {
      throw new Error(
        `${label}: tick ${t0}→${t} (needed >${t0 + delta}) while the sim page rendered ${frames} frames ` +
          `(budget ${maxFrames}) ⇒ the sim is FROZEN or crawling, not merely on a slow runner.`,
      );
    }
    if (Date.now() - wall0 > TICK_WAIT_WALL_BACKSTOP_MS) {
      throw new Error(
        `${label}: WALL BACKSTOP — tick ${t0}→${t} and only ${frames}/${maxFrames} frames in ` +
          `${TICK_WAIT_WALL_BACKSTOP_MS / 1000} s: the PAGE is starved or dead; this says nothing about the sim.`,
      );
    }
    await observed.waitForTimeout(250);
  }
}
