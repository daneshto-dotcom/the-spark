/**
 * SPARK — S191 P12 (`s191/perf`) — ⛔ THE NAV-UNIT ENEMY INDEX'S PRECONDITIONS, ENUMERATED MECHANICALLY.
 *
 * `pickNavUnit` re-acquires from a per-seat list of the live creature objects that seat can target
 * (`EnemyCreatureIndex` in `creatureAI.ts`), reused between the calls of one host-tick creature loop
 * and re-validated before each call by an O(1) fingerprint: `world.creatures` identity, its size, and
 * `world.nextCreatureId`. Everything else (position, untargetability, range, the tie-break) is read
 * live, so the fingerprint only has to be exact about MEMBERSHIP and OWNERSHIP. It is, while these
 * facts about WHO WRITES WHAT stay true — the kind of fact that rots silently when a feature adds a
 * writer, so each is pinned as a per-file count over comment-stripped production code (the S190
 * `bondTargetIndex.guards.test.ts` pattern, S182 lesson 2):
 *
 *   1. Every creature is born through `world.nextCreatureId++` and inserted with `creatures.set` —
 *      a birth always bumps the counter. The only `set` of an existing id is save's snapshot restore,
 *      which `clear()`s first and never runs inside the loop.
 *   2. Creatures leave only through `creatures.delete` (a size drop) or a whole-Map `clear()`.
 *   3. `world.creatures` itself is never reassigned, and `nextCreatureId` is only ever reset beside a
 *      `clear()`.
 *   4. `Creature.ownerPlayerId` is never written — the per-seat split cannot go stale.
 *   5. `pickNavUnit` is called from the host tick's creature loop only, and the S190 epoch it relies on
 *      resets this index when it opens and when it closes (the epoch's own placement around the loop
 *      is pinned by `bondTargetIndex.guards.test.ts` §4).
 *
 * ⚠ IF ONE OF THESE GOES RED, DO NOT JUST ADD YOUR FILE TO THE LIST. Ask the question the list stands
 * for: can the new site run inside `runHostTick`'s creature loop between two `pickNavUnit` calls? If
 * it can, the index must be taught to see it, and `s191Perf.differential.test.ts` should gain an
 * injection that exercises it. If it provably cannot, add it, and say why beside it.
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
/** Code only: a docblock that NAMES a writer is not a writer. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}
const SRC = productionSources();
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
/** The body of `function name(` in a comment-stripped file, to its closing brace at column 0. */
function bodyOf(path: string, name: string): string {
  const text = SRC.find((f) => f.path === path)!.text;
  const at = text.indexOf(`function ${name}(`);
  expect(at, `${name} exists in ${path}`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf('\n}', at);
  return text.slice(at, end + 2);
}

describe('S191 perf — the nav-unit enemy index fingerprint is exact only while these sets hold', () => {
  it('1 · every creature is born through nextCreatureId++ and inserted with creatures.set — counted per file', () => {
    expect(countsOf(/nextCreatureId\+\+/), 'the creature-id allocators (applySpawnCreature: voltkin / drone / everyone else)')
      .toEqual({ 'src/state/creatures/creatureLifecycle.ts': 3 });
    expect(countsOf(/\bcreatures\.set\(/), 'insertion sites (save.ts = snapshot restore, after a clear, outside the loop)')
      .toEqual({ 'src/state/creatures/creatureLifecycle.ts': 3, 'src/state/save.ts': 1 });
  });

  it('2 · creatures leave only through creatures.delete or a whole-Map clear', () => {
    expect(countsOf(/\bcreatures\.delete\(/), 'removal sites (a size drop the fingerprint sees)').toEqual({
      'src/state/creatures/creatureLifecycle.ts': 2, 'src/state/creatures/suicideBlast.ts': 1, 'src/state/droneLifecycle.ts': 1,
    });
    // applyReturnToTitle (gameMode.ts), applyGodlyAbort (godlyActions.ts), applySnapshotCore (save.ts):
    // none runs inside the creature loop, and a clear drops the size to 0.
    expect(countsOf(/\bcreatures\.clear\(/)).toEqual({
      'src/state/gameMode.ts': 1, 'src/state/godlyActions.ts': 1, 'src/state/save.ts': 1,
    });
  });

  it('3 · world.creatures is never reassigned; nextCreatureId is reset only beside a clear()', () => {
    expect(countsOf(/\bworld\.creatures\s*=(?!=)/), 'world.creatures is never replaced').toEqual({});
    expect(countsOf(/\bnextCreatureId\s*=(?!=)/), 'nextCreatureId resets: title-return + the snapshot restore').toEqual({
      'src/state/gameMode.ts': 1, 'src/state/save.ts': 3,
    });
  });

  it('4 · Creature.ownerPlayerId is never written', () => {
    expect(countsOf(assignTo('ownerPlayerId')), 'ownerPlayerId writers, including ??= ||= &&=').toEqual({});
    expect(countsOf(objectAssignOf('ownerPlayerId')), 'no Object.assign writes ownerPlayerId').toEqual({});
  });

  it('5 · pickNavUnit runs from the host tick only, and the S190 epoch resets this index at both ends', () => {
    const outside = SRC.filter((f) => f.path !== 'src/state/creatures/creatureAI.ts');
    const callers: Record<string, number> = {};
    for (const f of outside) {
      const n = f.text.match(/\bpickNavUnit\(/g)?.length ?? 0;
      if (n > 0) callers[f.path] = n;
    }
    expect(callers, 'pickNavUnit production call sites').toEqual({ 'src/state/hostTick.ts': 1 });
    expect(countsOf(/\bfindNearestEnemyCreatureIndexed\(/), 'the indexed search: its definition + pickNavUnit, nowhere else')
      .toEqual({ 'src/state/creatures/creatureAI.ts': 2 });
    const ai = 'src/state/creatures/creatureAI.ts';
    expect(bodyOf(ai, 'openBondTargetEpoch'), 'opening the epoch drops any index from before').toContain('epochEnemyIndex = null');
    expect(bodyOf(ai, 'closeBondTargetEpoch'), 'closing the epoch drops the index').toContain('epochEnemyIndex = null');
    // The three conjuncts of the fingerprint, each named (the mutation checks in S191_PROGRESS_perf.md
    // prove each one is load-bearing through the exact cases).
    const fp = bodyOf(ai, 'enemyListFor');
    for (const conj of ['idx.creaturesMap !== world.creatures', 'idx.count !== world.creatures.size', 'idx.nextCreatureId !== world.nextCreatureId']) {
      expect(fp, `fingerprint conjunct: ${conj}`).toContain(conj);
    }
    // The indexed search falls back to the live scan outside the epoch, and reads untargetability live.
    const q = bodyOf(ai, 'findNearestEnemyCreatureIndexed');
    expect(q).toContain('epochWorld !== world || epochTick !== world.tick');
    // S192 T6 — the fallback now carries the chaser, so the give-up rule holds outside the epoch too.
    expect(q).toContain('return findNearestEnemyCreatureFrom(world, fromPos, ownerPlayerId, maxRangeSq, excludeId, chaser)');
    expect(q, 'S192 T6 — the chaser-relative rule is read live in the loop').toContain('if (cannotCatch(chase, c, dSq)) continue;');
    // ⭐ S192 T13 — the static TYPE half precomputed; EVERYTHING ELSE LIVE through the one liveness
    // predicate: the ritual half (inside `isUntargetable`), a lethal deferred blow, the fade.
    expect(q, 'the static half precomputed, the rest live').toContain('untargetableType[i] || !isLiveCreatureTarget(world, c)');
    const live = bodyOf('src/state/creatures/creature.ts', 'isLiveCreatureTarget').replace(/\s+/g, ' ');
    expect(live, 'the ritual half is still read live, inside the predicate').toContain('return !isUntargetable(c, world.tick); }');
    expect(live).toContain('if (c.ehp <= 0) return false;');
    expect(live).toContain("world.pendingCreatureDeaths?.has(c.id) === true");
  });

  it('6 · isUntargetable is EXACTLY type || ritual — the split the index relies on — and neither half can change under it', () => {
    // A third condition added to isUntargetable would be silently skipped by the index (which
    // evaluates the two halves itself). This pins the body; if it goes red, teach
    // findNearestEnemyCreatureIndexed the new condition (read LIVE) before updating the text.
    expect(bodyOf('src/state/creatures/creature.ts', 'isUntargetable').replace(/\s+/g, ' '))
      .toContain('return isUntargetableType(c.type) || isChannellingRa(c, tick); }');
    // The TYPE half is precomputed per list: the config flag and the creature's type never change.
    expect(countsOf(assignTo('untargetable')), 'no config untargetable writes').toEqual({});
    expect(countsOf(/CREATURE_CONFIGS\[[^\]]*\]\s*=(?!=)|Object\.assign\(\s*CREATURE_CONFIGS/), 'CREATURE_CONFIGS is never written').toEqual({});
    // Every `.type =` in production is a Web Audio oscillator/filter or a DOM <input> — render code,
    // never a creature (whose `type` is `readonly`). Measured on the s191/perf tree.
    expect(countsOf(assignTo('type')), '`.type =` writes: audio nodes and <input>s only, never a creature').toEqual({
      'src/render/audioManager.ts': 17, 'src/render/lobbyScreen.ts': 1, 'src/render/nonetJuice.ts': 1, 'src/render/settingsOverlay.ts': 3,
    });
  });
});
