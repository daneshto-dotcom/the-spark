import { describe, expect, it } from 'vitest';
import { recordingSink } from './emitter.ts';
import { ROT_FX_BUBBLES, ROT_FX_CYCLE, rotBubbleAt, rotFx } from './rotFx.ts';

function run(id: number, tick: number, radius = 85) {
  const top = recordingSink();
  const ground = recordingSink();
  rotFx(ground, top, id, 500, 400, tick, radius);
  return { top: top.out, ground: ground.out };
}

describe('S192 V05 — the zombie rot boil (`rotFx`)', () => {
  it('every bubble sits inside the damage circle (squashed to the board)', () => {
    for (let k = 0; k < ROT_FX_BUBBLES; k++) {
      const b = rotBubbleAt(3, k, 0, 85);
      expect(Math.hypot(b.dx, b.dy / 0.55)).toBeLessThanOrEqual(85);
    }
  });

  it('a bubble swells for 70 % of its cycle and then POPS (splash ring + 3 droplets), once a cycle', () => {
    const k = 0;
    let pops = 0;
    let prev = rotBubbleAt(5, k, 0, 85).t;
    for (let tick = 1; tick <= ROT_FX_CYCLE * 2; tick++) {
      const t = rotBubbleAt(5, k, tick, 85).t;
      if (prev < 0.7 && t >= 0.7) pops++;
      prev = t;
    }
    expect(pops).toBe(2);
  });

  it('pops draw splash rings; there is no ring around the EDGE (the owner\'s stink-tower complaint)', () => {
    for (let tick = 0; tick < ROT_FX_CYCLE; tick++) {
      for (const e of run(2, tick).ground.filter((s) => s.tex === 'ring')) expect(e.w).toBeLessThan(70);
    }
  });

  it('⛔ DETERMINISM — same boss and tick → identical; it animates; two bosses differ', () => {
    expect(run(4, 900)).toEqual(run(4, 900));
    expect(run(4, 901)).not.toEqual(run(4, 900));
    expect(run(5, 900)).not.toEqual(run(4, 900));
  });

  it('stays bounded (bubbles + pop droplets + wisps)', () => {
    for (let tick = 0; tick < 200; tick += 3) {
      const r = run(1, tick);
      expect(r.ground.length).toBeGreaterThanOrEqual(ROT_FX_BUBBLES);
      expect(r.ground.length).toBeLessThanOrEqual(ROT_FX_BUBBLES * 2);
      expect(r.top.length).toBeLessThanOrEqual(ROT_FX_BUBBLES * 3 + 18);
    }
  });
});
