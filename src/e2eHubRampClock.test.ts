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
