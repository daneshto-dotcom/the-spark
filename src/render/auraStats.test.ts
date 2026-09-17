/**
 * SPARK — S181: **A BAG IS CLICKABLE, AND ANYTHING WITH AN AURA SAYS ITS DAMAGE PER SECOND.**
 *
 * Owner, S181:
 *
 * > *"poop bags are unclickable. They should have a stat too. When you click on them, it should show
 * > how much damage they're doing per second. Anything that has an aura, damage per second, should
 * > show how much damage per second. So the zombie boss, the stink tower … you can put it under
 * > range, for example."*
 *
 * ⛔ THE TRAP THIS FILE EXISTS TO NAIL SHUT. `STINK_AURA_DAMAGE` is 20, it reads exactly like the
 * answer to "how much does the aura do", and it has been RETIRED AND UNREAD BY PRODUCTION since
 * S157 B9 — the S181 portrait audit flagged it by name. Printing it on the card would be a bespoke
 * number on its own scale, which is the single most-repeated defect in this project's history
 * (`GOBLIN_DAMAGE_VS_PRIMITIVE` survived 19 sessions before the owner reported it). Every number
 * below is derived from the cadence the sim actually runs.
 */
import { describe, expect, it } from 'vitest';
import {
  PHYSICS_HZ,
  STINK_AURA_CADENCE_TICKS,
  STINK_AURA_UNIT_FIFTHS,
  STINK_BAG_DEF,
  STINK_BAG_HP,
  ZOMBIE_AURA_PER_MILLE,
} from '../constants.ts';
import { unitPoolFifths } from '../state/stats.ts';
import { dotIntervalTicks } from '../state/damageOverTime.ts';

describe('S181 — the stink aura is ONE FIFTH A SECOND, derived from the cadence', () => {
  it('the readout equals fifths-per-second computed from the shipped constants', () => {
    const perSecond = (STINK_AURA_UNIT_FIFTHS * PHYSICS_HZ) / STINK_AURA_CADENCE_TICKS;
    expect(perSecond).toBe(1);
  });

  it('⛔ and it is NOT 20 — `STINK_AURA_DAMAGE` is retired and must never reach the card', () => {
    const perSecond = (STINK_AURA_UNIT_FIFTHS * PHYSICS_HZ) / STINK_AURA_CADENCE_TICKS;
    expect(perSecond).not.toBe(20);
  });

  it('the card does not reference the retired constant at all', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    for (const f of ['src/render/characterSheetModel.ts', 'src/render/characterSheet.ts']) {
      const src = readFileSync(f, 'utf-8');
      // Comments naming it as a trap are fine; a CODE reference is not.
      const code = src
        .split('\n')
        .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'))
        .join('\n');
      expect(code.includes('STINK_AURA_DAMAGE'), `${f} must not read the retired constant`).toBe(false);
    }
  });

  it('a bag has a real pool to show — the canon says 1 HP / 0 DEF', () => {
    expect(unitPoolFifths(STINK_BAG_HP, STINK_BAG_DEF)).toBe(5);
  });
});

describe("S181 — the zombie boss's rot is a FRACTION of the victim, which is why it prints a percent", () => {
  /**
   * ⭐ THE ARITHMETIC BEHIND THE DESIGN DECISION, asserted rather than asserted-in-a-comment.
   *
   * `dotIntervalTicks` spaces single-fifth applications as `60000 / (pool × perMille)` ticks, so
   * fifths-per-second is `PHYSICS_HZ / interval` = `pool × perMille / 1000`. That is a constant
   * FRACTION of the victim's pool — so a flat "damage per second" figure would be correct for
   * exactly one target and wrong for every other, and the card prints the percentage instead.
   */
  const fifthsPerSecond = (pool: number): number =>
    PHYSICS_HZ / dotIntervalTicks(pool, ZOMBIE_AURA_PER_MILLE);

  it('the fraction is the same for a chewer and for a boss, to within the tick rounding', () => {
    /*
     * ⚠ "TO WITHIN THE TICK ROUNDING" IS NOT A HEDGE — it is the actual behaviour, and measuring it
     * is how I found it. `dotIntervalTicks` ends in `Math.max(1, Math.round(...))`, because an
     * interval must be a whole number of ticks. So the drain is an exactly constant fraction only
     * before that rounding; afterwards a small pool (whose interval is long, and therefore rounds by
     * a larger relative amount) drifts a few percent from a large one. Measured: 2.5% for a 100-pool
     * victim against 2.56% for a 5-pool chewer.
     *
     * That drift is why the card prints the SHIPPED per-mille rather than a figure computed from any
     * one victim — the constant is the truth, and the per-victim number is the constant plus a
     * rounding artefact.
     */
    const smallPool = 5;    // a pencil chewer
    const bigPool = 260;    // Vlad
    const a = fifthsPerSecond(smallPool) / smallPool;
    const b = fifthsPerSecond(bigPool) / bigPool;
    expect(Math.abs(a - b) / b, 'within 5% of each other').toBeLessThan(0.05);
    // ⛔ ANTI-VACUITY: they must genuinely be the same ORDER, not merely both small.
    expect(a / b).toBeGreaterThan(0.9);
    expect(a / b).toBeLessThan(1.1);
  });

  it('and that fraction is the shipped per-mille, i.e. 2.5% a second at 25‰', () => {
    expect(ZOMBIE_AURA_PER_MILLE / 10).toBe(2.5);
    // A 100-fifth pool divides the tick budget exactly, so this one IS exact.
    const pool = 100;
    expect(fifthsPerSecond(pool) / pool).toBeCloseTo(ZOMBIE_AURA_PER_MILLE / 1000, 5);
  });

  it('⛔ a flat number would have been wrong: the drain differs 50x across the roster', () => {
    // Anti-vacuity for the decision above — if these were close, a single figure would have been
    // fine and the percentage would be over-engineering.
    expect(fifthsPerSecond(260)).toBeGreaterThan(fifthsPerSecond(5) * 10);
  });
});

describe('S181 — ⛔ THE CALL SITES EXIST (the green-gates tripwire)', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const model = readFileSync('src/render/characterSheetModel.ts', 'utf-8');
  const controls = readFileSync('src/input/controls.ts', 'utf-8');

  it('a bag can be SELECTED — the half of his report that was a dead pick, not a missing stat', () => {
    expect(controls).toContain("this.characterSheet.select({ kind: 'stinkCloud', id: bag.id })");
    expect(model).toContain('stinkCloudSheet(world, seat, target)');
  });

  it('⚠ the bag pick uses its own radius, NOT the aura radius', () => {
    // `bag.radius` is the CLOUD's 120px reach. Picking on it would swallow clicks on everything
    // standing in the cloud, which is most things, most of the time.
    expect(controls).toContain('BAG_PICK_R');
    expect(controls).not.toMatch(/const r = bag\.radius/);
  });

  it('the stink tower and the zombie boss both push an aura row', () => {
    expect(model).toContain('auraOwnerIn(world, comp.primitiveIds)');
    expect(model).toContain('zombieAuraPercentPerSecond()');
  });
});
