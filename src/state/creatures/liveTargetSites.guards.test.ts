/**
 * SPARK — S192 T13 — **EVERY PICK AND EVERY HOLD TAKES THE LIVENESS PREDICATE. COUNTED, NOT ARGUED.**
 *
 * > *"my spawn were attacking him, even though it was already dead"* — owner, S192
 *
 * `isLiveCreatureTarget` (`creature.ts`) is the one statement of "may this creature be selected / kept
 * as a target": a live pool, not a corpse-in-waiting, and not untargetable.
 * The S192 enumeration found it owed at fourteen sites in nine files. Prose cannot hold an enumeration
 * (`untargetableCallSites.test.ts` learned that), so this file pins it two ways:
 *
 *  1. **WHERE THE PREDICATE IS CALLED** — per file, in code (comments stripped). A site removed, or a
 *     new pick added through it, changes a count and turns this red until someone decides.
 *  2. **WHERE THE BARE GATE IS STILL CALLED** — `isUntargetable(` outside the predicate. Each remaining
 *     one is a recorded VERDICT that it is not an AI pick/hold. A new bare call is red: the reflex
 *     "add `isUntargetable`" from the S171 era would silently miss the dead.
 *
 * ⚠ A source-text guard proves a line EXISTS, never that it is REACHED. The behavioural half is
 * `deadTargets.test.ts` (each site with a corpse beside a live unit) and the perf differential
 * (through the real host tick, `pendingDeathReturned === 0`). ⭐ MUTATION-TESTED: reverting the
 * `pickNavUnit` hold to the bare gate turns this file red (count 3 → 2) AND six behavioural cases.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..');

function productionFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // ⛔ Pitch Masters (`src/arcade/**`) is a separate project — never enumerated (S193 rule).
      if (full === join(SRC, 'arcade')) continue;
      productionFiles(full, out);
    }
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}
const rel = (p: string): string => p.slice(SRC.length + 1).split('\\').join('/');
/** Code only: block comments, then line comments, removed (CRLF-safe). */
const code = (src: string): string =>
  src.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function countsOf(re: RegExp): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of productionFiles(SRC)) {
    const n = (code(readFileSync(f, 'utf8')).match(re) ?? []).length;
    if (n > 0) out[rel(f)] = n;
  }
  return out;
}

describe('S192 T13 — the liveness predicate is consulted at every pick and hold', () => {
  it('⭐⭐ the predicate sites, per file', () => {
    expect(countsOf(/\bisLiveCreatureTarget\(/g)).toEqual({
      'state/creatures/creature.ts': 1, // the definition
      // the chokepoint (castle guns, defenders, the Voltkin, the gatherer preview), the pickNavUnit
      // hold, and the S191 indexed acquire
      'state/creatures/creatureAI.ts': 3,
      // the SEEKING→ATTACKING engage (`unitInReach`), the ATTACKING re-validation, the wind-up abort
      'state/creatures/creatureLifecycle.ts': 3,
      'state/creatures/voltkinChain.ts': 1, // the chain hop
      'state/defenders/defenderLifecycle.ts': 2, // `targetValid` (WINDUP on) and the WALK hold
      'state/creatures/retaliation.ts': 1, // who can be retaliated against
      'state/racial/corpseEater.ts': 1, // CORPSE EATER's victim
      'state/bossSkillsArchdemon.ts': 1, // the teleport victim
      'state/bossSkillsKraken.ts': 1, // the sonar's aim point
    });
  });

  it('⛔ every bare `isUntargetable(` left is a recorded verdict, not a forgotten pick', () => {
    const VERDICTS: Record<string, readonly [count: number, why: string]> = {
      'state/creatures/creature.ts': [2, 'the definition, and the predicate calling it'],
      'state/creatures/retaliation.ts': [1, 'the VICTIM gate — whether the unit being hit may re-aim; it picks nobody'],
      'state/world.ts': [1, 'the RAID_TARGET reducer — a PLAYER raid, not a unit pick; it runs outside the strike batch, so no corpse-in-waiting can reach it'],
      'input/controls.ts': [1, 'the raid cursor — cosmetic, the reducer is the gate'],
      'render/creatureProjectile.ts': [1, 'presentation — which body a drawn projectile flies at'],
      'state/creatures/navUnitReference.fixtures.ts': [1, 'the test-only reference, which spells liveness out LONGHAND on purpose'],
    };
    const want: Record<string, number> = {};
    for (const [k, [n, why]] of Object.entries(VERDICTS)) {
      expect(why.length, `${k} needs a real reason`).toBeGreaterThan(30);
      want[k] = n;
    }
    expect(countsOf(/\bisUntargetable\(/g)).toEqual(want);
  });

  it('the predicate is the three conditions, the gate last — and no fade clause', () => {
    const src = code(readFileSync(join(SRC, 'state/creatures/creature.ts'), 'utf8'));
    const at = src.indexOf('export function isLiveCreatureTarget(');
    const body = src.slice(at, src.indexOf('\n}', at)).replace(/\s+/g, ' ');
    expect(body).toContain('if (c.ehp <= 0) return false;');
    expect(body).toContain('if (world.pendingCreatureDeaths?.has(c.id) === true) return false;');
    // ⛔ By ruling (*"Units are either destroyed or respawned"*) there is NO fade clause — pinned absent.
    expect(body).not.toContain('DESPAWNING');
    expect(body).toContain('return !isUntargetable(c, world.tick);');
  });
});
