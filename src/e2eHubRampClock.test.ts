/**
 * SPARK — S194 (T8): `e2e/hub-ramp-art.spec.ts` waits for the hub's damage cursor on the SIM clock.
 *
 * The spec cannot import `src/` (no e2e spec does), so it carries its own copy of the ramp's ticks per
 * frame. This pins that copy to the real constant, and pins that the wait is a tick wait — the wall-clock
 * `waitForTimeout(1200)` it replaced is what turned deploy #22's gating lane red on a slow runner.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HUB_RAMP_TICKS_PER_FRAME } from './render/structureRamp.ts';

const spec = readFileSync(join(__dirname, '..', 'e2e', 'hub-ramp-art.spec.ts'), 'utf8');

describe('S194 T8 — the hub-ramp e2e waits on ticks, with the real ticks-per-frame', () => {
  it('its HUB_RAMP_TICKS_PER_FRAME copy equals the renderer’s', () => {
    const m = /\nconst HUB_RAMP_TICKS_PER_FRAME = (\d+);/.exec(spec);
    expect(m, 'the spec’s copy is missing').not.toBeNull();
    expect(Number(m![1])).toBe(HUB_RAMP_TICKS_PER_FRAME);
  });

  it('the walk 1 → 12 is awaited with waitForTickAdvance over 11 × ticks-per-frame, not a wall timeout', () => {
    const at = spec.indexOf('and the sprite FOLLOWS THE DAMAGE');
    expect(at, 'the damage-follow test was found').toBeGreaterThan(0);
    const body = spec.slice(at);
    expect(body).toMatch(/waitForTickAdvance\(page, page, 11 \* HUB_RAMP_TICKS_PER_FRAME \+ \d+,/);
    expect(body).not.toMatch(/await page\.waitForTimeout\(1200\)/);
  });
});

describe('S194 T8 — tower-art polls for the LAZY tower atlas instead of reading at a fixed 900 ms', () => {
  const tower = readFileSync(join(__dirname, '..', 'e2e', 'tower-art.spec.ts'), 'utf8');
  it('both sprite-count checks are polled, and none is read once', () => {
    expect(tower.match(/expect\.poll\(async \(\) => \(await towerState\(page\)\)\.towerSprites/g)?.length).toBe(2);
    expect(tower).not.toMatch(/expect\(after\.towerSprites/);
  });
});

describe('S194 T8 — the shared gating lane has room for a retried flake', () => {
  // Green runs measured 8.9–10.5 min (runs 36929138050 … 36979950077); deploy #22 overran 12 with 3 retries.
  const MEASURED_GREEN_MAX_MIN = 10.5;
  const yml = readFileSync(join(__dirname, '..', '.github', 'workflows', 'e2e.yml'), 'utf8').replace(/\r\n/g, '\n');
  const at = yml.indexOf('\n  e2e:\n');
  const block = yml.slice(at, yml.indexOf('\n  e2e-soak:', at)); // the gating job sits just above e2e-soak
  it('Playwright ≥ 4 min above the slowest green run, and the runner ≥ 8 min above Playwright', () => {
    const cap = Number(/\n {4}timeout-minutes:\s*(\d+)/.exec(block)![1]);
    const pw = Number(/\n {6}PW_GLOBAL_TIMEOUT_MIN:\s*'?(\d+)'?/.exec(block)![1]);
    expect(pw - MEASURED_GREEN_MAX_MIN).toBeGreaterThanOrEqual(4);
    expect(cap - pw).toBeGreaterThanOrEqual(8);
  });
});

describe('S194 T8 — hub-ramp polls for the LAZY ramp atlas before reading a sprite', () => {
  it('both sprite reads wait on expect.poll over rampSprites, and none reads it once', () => {
    expect(spec.match(/expect\.poll\(async \(\) => \(await rampState\(page\)\)\.rampSprites/g)?.length).toBe(2);
    expect(spec).not.toMatch(/expect\(after\.rampSprites/);
  });
});
