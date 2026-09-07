/**
 * SPARK — S167 — BUILD EVERY SPEC IN AN `atlas-specs.json`, one at a time.
 *
 * ## ⛔ WHY THIS EXISTS: THE PIPELINE HAD A HOLE WHERE A SCRIPT SHOULD BE
 *
 * `build-sprite-atlas.mjs` takes ONE spec object — `JSON.parse(readFileSync(specPath))` and straight
 * into `spec.name` / `spec.states`. It has never been able to read a `specs` ARRAY, and
 * `assets-source/stink-bag/atlas-spec.json` says so in the tree.
 *
 * But four of the shipped spec files — `race-castles`, `race-tier3-towers` (twice) and
 * `race-tier3-units` — are `{ "_comment": [...], "specs": [ … ] }`. Nothing in `scripts/`, nothing in
 * `package.json` and nothing in CI splits them. **They were built by hand, one entry at a time, and
 * the only record of how is a shell history that no longer exists.**
 *
 * That is a real defect rather than an untidiness: the shipped art is not reproducible from the
 * repo. Regenerating one atlas means reconstructing an invocation nobody wrote down, which is how a
 * cell size or a matte threshold silently drifts between one character and its siblings — and
 * `enclosedWhiteLimitPct` drifting is EXACTLY the S165 defect the owner reported by eye
 * (*"some of them have that white background because not cut out too well"*).
 *
 * ## What it does
 *
 *   node scripts/build-atlas-set.mjs <atlas-specs.json> [nameFilter…]
 *
 * Reads the file, and for each entry in `specs[]` writes it to a temp single-spec file and invokes
 * `build-sprite-atlas.mjs` on it — i.e. exactly the hand process, written down. Name filters are
 * substring matches, so a single subject can be rebuilt without redoing its five siblings.
 *
 * ⚠ ACCEPTS A SINGLE-SPEC FILE TOO (no `specs` key), so it is safe to point at any spec in the tree
 * and there is no second command to remember.
 *
 * ⚠ SEQUENTIAL, NOT PARALLEL, AND DELIBERATELY SO. Each build shells out to ffmpeg and to a python
 * matte pass over every frame; running six at once on a laptop turns a slow job into an unresponsive
 * one, and the failure mode of a half-written PNG is an atlas that loads as garbage rather than one
 * that fails loudly.
 *
 * ⛔ IT DOES NOT SWALLOW A FAILURE. One bad entry stops the run with a non-zero exit and names the
 * spec — a partial art set that reports success is how a missing atlas reaches a deploy, and in this
 * renderer a missing atlas is SILENT (`loadAtlas` catches, and the creature falls back to a green
 * procedural puppet).
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const specPath = process.argv[2];
if (specPath === undefined) {
  console.error('usage: node scripts/build-atlas-set.mjs <atlas-specs.json> [nameFilter...]');
  process.exit(2);
}
const filters = process.argv.slice(3);

const doc = JSON.parse(readFileSync(specPath, 'utf8'));
/** A `specs` array, or the file itself as a single spec — see the header. */
const all = Array.isArray(doc.specs) ? doc.specs : [doc];
const specs = filters.length === 0
  ? all
  : all.filter((s) => filters.some((f) => String(s.name).includes(f)));

if (specs.length === 0) {
  console.error(`[atlas-set] no specs matched ${JSON.stringify(filters)} in ${specPath}`);
  console.error(`[atlas-set] available: ${all.map((s) => s.name).join(', ')}`);
  process.exit(2);
}

const builder = resolve(process.argv[1], '..', 'build-sprite-atlas.mjs');
const work = mkdtempSync(join(tmpdir(), 'spark-atlas-set-'));
let built = 0;

try {
  for (const [i, spec] of specs.entries()) {
    const one = join(work, `${spec.name}.json`);
    writeFileSync(one, JSON.stringify(spec, null, 2));
    console.log(`\n[atlas-set] (${i + 1}/${specs.length}) ${spec.name} -> ${spec.outDir}`);
    // stdio inherit: the builder's own measurements (matte pockets, union bbox) are the useful
    // output of this whole pipeline and must not be hidden behind a progress line.
    execFileSync('node', [builder, one], { stdio: 'inherit' });
    built++;
  }
} catch (err) {
  console.error(`\n[atlas-set] ⛔ FAILED after ${built}/${specs.length} — ${err.message}`);
  console.error('[atlas-set] the art set is INCOMPLETE. A missing atlas is silent at runtime.');
  process.exit(1);
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(`\n[atlas-set] OK — ${built}/${specs.length} atlases built from ${specPath}`);
