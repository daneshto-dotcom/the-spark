/**
 * SPARK — S190 P0 (C5) — ⛔ THE BOND-TARGET INDEX'S PRECONDITIONS, ENUMERATED MECHANICALLY.
 *
 * The index in `creatureAI.ts` is reused between the scans of one host-tick creature loop and
 * re-validated before each scan by an O(1) fingerprint: `world.bonds.size`, `world.nextBondId`,
 * `world.primitives.size`, `world.nextPrimitiveId`. That fingerprint is EXACT only while four
 * things stay true of the codebase, and each of them is a fact about WHO WRITES WHAT — which is
 * precisely the kind of fact that rots silently when a new feature adds a writer. So they are
 * pinned here as enumerations, the S182 lesson: *"a source-text guard proves a line EXISTS"* — so
 * make the enumeration itself the guard, and a NEW site fails the test until someone has thought
 * about the index.
 *
 *   1. Every bond is born through `makeBond` (`world.nextBondId++`), every shape through
 *      `world.nextPrimitiveId++` — so a birth always bumps a counter.
 *   2. Bonds and shapes leave only through `razePrimitives` — so a death always lowers a size.
 *   3. `placerColor` is rewritten only by the rainbow shuffle, which is a player/bot INTENT and is
 *      never dispatched from inside the creature loop; `placedBy` is never rewritten at all. The
 *      fingerprint cannot see either, so neither may happen mid-loop.
 *   4. The epoch is opened and closed by `runHostTick`, around its creature loop, and nowhere else.
 *
 * ⚠ IF ONE OF THESE GOES RED, DO NOT JUST ADD YOUR FILE TO THE LIST. Ask the question the list
 * stands for: can the new site run inside `runHostTick`'s creature loop? If it can, the index must
 * be taught to see it (bump a counter, or rebuild) — and `bondTargetIndex.differential.test.ts`
 * should gain an injection that exercises it. If it provably cannot, add it, and say why beside it.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function productionSources(dir = 'src'): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { out.push(...productionSources(p)); continue; }
    if (!p.endsWith('.ts') || p.endsWith('.test.ts') || p.endsWith('.fixtures.ts') || p.endsWith('.d.ts')) continue;
    out.push({ path: p.split('\\').join('/'), text: stripComments(readFileSync(p, 'utf-8')) });
  }
  return out;
}
/** Code only: a docblock that NAMES a writer is not a writer (this index's own docblock names four). */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}
const SRC = productionSources();
const filesMatching = (re: RegExp): string[] => SRC.filter((f) => re.test(f.text)).map((f) => f.path).sort();

describe('S190 C5 — the bond-target index fingerprint is exact only while these sets hold', () => {
  it('1 · every bond id comes from makeBond, every shape id from nextPrimitiveId++', () => {
    expect(filesMatching(/nextBondId\+\+/), 'the ONE bond-id allocator is makeBond').toEqual(['src/state/placePrimitive.ts']);
    expect(filesMatching(/\bbonds\.set\(/), 'bond insertion sites (save.ts = load, which rewrites the counters)').toEqual([
      'src/state/blueprintBuild.ts', 'src/state/placePrimitive.ts', 'src/state/save.ts', 'src/state/structureRepair.ts',
    ]);
    expect(filesMatching(/nextPrimitiveId\+\+/), 'shape-id allocators').toEqual([
      'src/state/blueprintBuild.ts', 'src/state/placePrimitive.ts', 'src/state/structureRepair.ts',
    ]);
    expect(filesMatching(/\bprimitives\.set\(/), 'shape insertion sites (save.ts = load)').toEqual([
      'src/state/blueprintBuild.ts', 'src/state/placePrimitive.ts', 'src/state/save.ts', 'src/state/structureRepair.ts',
    ]);
  });

  it('2 · bonds and shapes leave only through razePrimitives', () => {
    expect(filesMatching(/\bbonds\.delete\(/)).toEqual(['src/state/razePrimitives.ts']);
    expect(filesMatching(/\bprimitives\.delete\(/)).toEqual(['src/state/razePrimitives.ts']);
  });

  it('3 · placerColor is rewritten only by the rainbow, from an intent; placedBy never', () => {
    expect(filesMatching(/\.placerColor\s*=(?!=)/)).toEqual(['src/state/rainbowLifecycle.ts']);
    // The rainbow is dispatched by a player's click or a bot's decision — never by the sim itself.
    // (An object literal OPENING with the type — the action's own `readonly type:` declaration is not
    // a dispatch.)
    expect(filesMatching(/\{\s*type:\s*'TRIGGER_RAINBOW'/)).toEqual(['src/bots/botController.ts', 'src/input/controls.ts']);
    expect(filesMatching(/\.placedBy\s*=(?!=)/)).toEqual([]);
  });

  it('4 · the epoch is opened immediately before the creature loop and closed after it, only there', () => {
    const outside = SRC.filter((f) => f.path !== 'src/state/creatures/creatureAI.ts');
    const opens = outside.filter((f) => /openBondTargetEpoch\(/.test(f.text)).map((f) => f.path);
    const closes = outside.filter((f) => /closeBondTargetEpoch\(/.test(f.text)).map((f) => f.path);
    expect(opens).toEqual(['src/state/hostTick.ts']);
    expect(closes).toEqual(['src/state/hostTick.ts']);
    const ht = SRC.find((f) => f.path === 'src/state/hostTick.ts')!.text;
    expect(ht.split('openBondTargetEpoch(world);').length - 1, 'opened exactly once').toBe(1);
    expect(ht.split('closeBondTargetEpoch();').length - 1, 'closed exactly once').toBe(1);
    const open = ht.indexOf('openBondTargetEpoch(world);');
    const loop = ht.indexOf('for (const id of creatureIds)');
    expect(loop).toBeGreaterThan(open);
    expect(ht.slice(open + 'openBondTargetEpoch(world);'.length, loop).trim(), 'nothing runs between the open and the loop').toBe('');
    // The close comes after the loop's last strike dispatch and before the castle guns fire.
    const close = ht.indexOf('closeBondTargetEpoch();');
    expect(close).toBeGreaterThan(ht.lastIndexOf("type: 'CREATURE_ATTACK'"));
    expect(close).toBeLessThan(ht.indexOf('castleGunsTick(world)'));
  });
});
