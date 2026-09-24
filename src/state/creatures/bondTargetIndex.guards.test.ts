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
/**
 * ⭐ S190 audit PERF-2 — OCCURRENCES PER FILE, NOT FILES. A file list stays green when a second writer
 * lands in a file that already had one — which is exactly how a new bond birth could slip past the
 * fingerprint's allocator argument. So every set below is pinned as `{file: count}`, measured on the
 * s190/perf tree over comment-stripped code.
 *
 * ⚠ FOR THE MERGE OWNER: s189/weld edits `placePrimitive.ts` (the spawner-weld lock). Re-count after
 * that merge; if a count moves, read the new site against the question in this file's header before
 * updating the number.
 */
function countsOf(re: RegExp): Record<string, number> {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  const out: Record<string, number> = {};
  for (const f of SRC) {
    const n = f.text.match(g)?.length ?? 0;
    if (n > 0) out[f.path] = n;
  }
  return out;
}
/** Plain assignment AND the logical-assignment forms (`??=`, `||=`, `&&=`), never a comparison. */
const assignTo = (field: string): RegExp => new RegExp(String.raw`\.${field}\s*(?:\?\?|\|\||&&)?=(?!=)`);
/** A field written through `Object.assign(target, { …field… })`. */
const objectAssignOf = (field: string): RegExp => new RegExp(String.raw`Object\.assign\([\s\S]{0,300}?\b${field}\b`);

describe('S190 C5 — the bond-target index fingerprint is exact only while these sets hold', () => {
  it('1 · every bond id comes from makeBond, every shape id from nextPrimitiveId++ — counted per file', () => {
    expect(countsOf(/nextBondId\+\+/), 'the ONE bond-id allocator is makeBond').toEqual({ 'src/state/placePrimitive.ts': 1 });
    expect(countsOf(/\bbonds\.set\(/), 'bond insertion sites (save.ts = load, which rewrites the counters)').toEqual({
      'src/state/blueprintBuild.ts': 1, 'src/state/placePrimitive.ts': 3, 'src/state/save.ts': 1, 'src/state/structureRepair.ts': 1,
    });
    expect(countsOf(/nextPrimitiveId\+\+/), 'shape-id allocators').toEqual({
      'src/state/blueprintBuild.ts': 1, 'src/state/placePrimitive.ts': 1, 'src/state/structureRepair.ts': 1,
    });
    expect(countsOf(/\bprimitives\.set\(/), 'shape insertion sites (save.ts = load)').toEqual({
      'src/state/blueprintBuild.ts': 1, 'src/state/placePrimitive.ts': 1, 'src/state/save.ts': 1, 'src/state/structureRepair.ts': 1,
    });
  });

  it('2 · bonds and shapes leave only through razePrimitives — and the three whole-board clears', () => {
    // razePrimitives: world.bonds.delete + the two endpoint `prim.bonds.delete`s; two primitive deletes.
    expect(countsOf(/\bbonds\.delete\(/)).toEqual({ 'src/state/razePrimitives.ts': 3 });
    expect(countsOf(/\bprimitives\.delete\(/)).toEqual({ 'src/state/razePrimitives.ts': 2 });
    // applyReturnToTitle (gameMode.ts), softReset (gameState.ts) and applySnapshotCore — the save /
    // snapshot restore (save.ts) — empty the board wholesale. None can run inside the creature loop,
    // and a clear drops both sizes to 0.
    const clears = { 'src/state/gameMode.ts': 1, 'src/state/gameState.ts': 1, 'src/state/save.ts': 1 };
    expect(countsOf(/\bbonds\.clear\(/)).toEqual(clears);
    expect(countsOf(/\bprimitives\.clear\(/)).toEqual(clears);
  });

  it('3 · placerColor is rewritten only by the rainbow, from an intent; placedBy never', () => {
    expect(countsOf(assignTo('placerColor')), 'placerColor writers, including ??= ||= &&=').toEqual({ 'src/state/rainbowLifecycle.ts': 1 });
    expect(countsOf(objectAssignOf('placerColor')), 'no Object.assign writes placerColor').toEqual({});
    expect(countsOf(assignTo('placedBy')), 'placedBy is never rewritten').toEqual({});
    expect(countsOf(objectAssignOf('placedBy'))).toEqual({});
    // The rainbow reducer is reached only through `dispatch` (world.ts) — the definition is excluded…
    expect(countsOf(/(?<!function\s)\bapplyTriggerRainbow\(/), 'applyTriggerRainbow callers').toEqual({ 'src/state/world.ts': 1 });
    // …and the action is dispatched by a player's click or a bot's decision — never by the sim itself.
    // (An object literal OPENING with the type — the action's own `readonly type:` declaration is not
    // a dispatch.)
    expect(countsOf(/\{\s*type:\s*'TRIGGER_RAINBOW'/)).toEqual({ 'src/bots/botController.ts': 1, 'src/input/controls.ts': 1 });
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
