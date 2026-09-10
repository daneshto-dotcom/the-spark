/**
 * SPARK — print the WHOLE combat roster in POINTS, the unit the owner thinks in.
 *
 * ⭐⭐ WHY THIS EXISTS. The sim stores everything in FIFTHS — `attackFifths(atk,pen)` returns
 * `atk * (5 + pen)` — which is a fixed-point trick to keep the arithmetic integral. A locust's
 * strike is 150 FIFTHS, which is 30 POINTS, which is `10 * (1 + 0.2*10)` — the owner's own formula.
 *
 * ⛔ AND REPORTING THE RAW FIFTHS COST A WHOLE SESSION OF CONFUSION. S171 quoted "150 damage
 * against a 143 pool" in a PDR, a stats table and four commit messages. The RATIO was right and the
 * UNIT was internal, so the numbers read as nonsense to the person who has to balance them. He
 * caught it: *"if a locusts cloud has 10 atk and 10 pen then his damage should be 10*3 = 30 not
 * 143?"* He was right.
 *
 * ⇒ Any stat conversation happens in POINTS, and this script is how you get them.
 *
 *   node scripts/stat-table.mjs
 *
 * COLUMNS
 *   ePOOL    effective hit points  = HP * (1 + 0.2*DEF)
 *   HIT      damage per strike     = ATK * (1 + 0.2*PEN)
 *   DPS      HIT / attack cadence in seconds
 *   ownHits  ePOOL / HIT — how many of its OWN hits a unit survives. A rough shape-of-role number:
 *            high = durable relative to its punch, low = glass. Wild spread here means the roster
 *            has no ladder.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';

const SPEC = 'src/__stat_table.test.ts';
writeFileSync(SPEC, `
import { describe, it } from 'vitest';
import { CREATURE_CONFIGS } from './state/creatures/voltkin-config.ts';
import type { CreatureType } from './state/creatures/creature.ts';
describe('stat table', () => { it('prints', () => {
  const mult = (p: number) => 1 + 0.2 * p;
  const rows = (Object.keys(CREATURE_CONFIGS) as CreatureType[]).map((t) => {
    const c = CREATURE_CONFIGS[t];
    const ehp = c.hp * mult(c.def), dmg = c.atk * mult(c.pen), cad = c.attackCadenceTicks / 60;
    return { t, c, ehp, dmg, cad, dps: dmg / cad };
  }).sort((a, b) => b.ehp - a.ehp);
  const L = ['unit                 HP DEF ATK PEN |  ePOOL    HIT   cad    DPS   spd | ownHits'];
  for (const r of rows) L.push(
    r.t.padEnd(20) + String(r.c.hp).padStart(3) + String(r.c.def).padStart(4) +
    String(r.c.atk).padStart(4) + String(r.c.pen).padStart(4) + ' |' +
    r.ehp.toFixed(1).padStart(7) + r.dmg.toFixed(1).padStart(7) + (r.cad + 's').padStart(6) +
    r.dps.toFixed(1).padStart(7) + String(r.c.hopSpeedMul).padStart(6) + ' |' +
    (r.ehp / r.dmg).toFixed(2).padStart(8));
  console.log(L.join(String.fromCharCode(10)));
}); });
`);
try {
  const out = execFileSync('npx', ['vitest', 'run', SPEC], { encoding: 'utf8', shell: true });
  const i = out.indexOf('unit  ');
  console.log(i >= 0 ? out.slice(i, out.indexOf('\n\n', i)) : out);
} finally {
  try { unlinkSync(SPEC); } catch { /* already gone */ }
}
