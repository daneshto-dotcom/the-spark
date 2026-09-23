/**
 * SPARK — check the upgrade-card art the owner drops into `assets-source/upgrade-cards/`.
 *
 * ⭐ WHY THIS EXISTS. He generates these in batches, out of order, over more than one session. Without
 * a checker the next session has to open sixteen files by hand to find out which landed, which are
 * the wrong shape, and which are still missing — and the answer changes every time he adds one.
 *
 * ⛔ IT IS A REPORT, NEVER A DEPLOY GATE, and S165 is the reason: an asset opinion was wired into
 * `npm run build`, the Pages runner had no Python, and the live site sat STALE while the owner waited
 * on art. This reads `assets-source/`, which the shipped build never looks at.
 *
 * Usage:  node scripts/check-upgrade-cards.mjs
 * Exit:   0 every present card passes (missing ones are reported, not failed)
 *         1 a present card FAILS a check
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, '..', 'assets-source', 'upgrade-cards');

/** The tile these are drawn into, derived from draftOverlay.ts rather than retyped from memory. */
const TILE_W = 251;
const TILE_H = 242;
/** Below this the card is visibly soft once cover-fitted onto a HiDPI canvas. */
const MIN_EDGE = 512;
/** The tile is 1.037:1, so a card further from square than this gets cropped hard on one axis. */
const MAX_ASPECT_DRIFT = 0.25;

const EXPECTED = [
  ['general-hp.png', 'TOUGHER — L0/L20, the left tile'],
  ['general-def.png', 'ARMOURED — L5/L25'],
  ['general-atk.png', 'STRONGER — L10/L30'],
  ['general-pen.png', 'PIERCING — L15/L35'],
  ['l0-vampires.png', 'BLOOD DEBT'],
  ['l0-zombies.png', 'THE RISEN'],
  ['l0-mummies.png', 'POWER OF RA'],
  ['l0-orcs.png', 'BLOOD FRENZY'],
  ['l0-demons.png', 'SCORCHED GROUND'],
  ['l0-nagas.png', 'DEEP CURRENT'],
  ['l5-vampires.png', 'CRIMSON TIDE'],
  ['l5-zombies.png', 'CORPSE EATER'],
  ['l5-mummies.png', 'ENDLESS DYNASTY'],
  ['l5-nagas.png', 'APEX PREDATOR'],
  ['l5-demons.png', 'HELLSPAWN'],
  ['l5-orcs.png', 'THE HORDE GROWS'],
  ['l10-vampires.png', 'THE SWARM'],
];

/**
 * ⭐ S187 — orcs L5 was the last unruled slot in levels 0 and 5, and the owner closed it:
 * THE HORDE GROWS. Nothing at those two levels is unruled any more. Levels 10-20 are a
 * different matter — only vampires L10 exists, so 16 racial slots remain undesigned, and
 * they are absent here because a card cannot precede a mechanic.
 */
const UNRULED = [];

/**
 * Deliberate alternates the owner generated and asked to keep. Known, so they are not reported as
 * strays, but not EXPECTED either — nothing is missing if they are absent.
 *
 * `l0-demons-alt.png`: he generated SCORCHED GROUND twice and could not choose. Both are good. The
 * primary is the one with more foreground rock and stronger diagonal fissures, which reads better
 * shrunk to a 251px tile; the alt is flatter and more uniform. Swapping them is a file rename.
 */
const ALTERNATES = ['l0-demons-alt.png', 'l5-demons-alt.png'];

/** Read a PNG's dimensions from its IHDR. No image library, so this script has no dependencies. */
function pngSize(path) {
  const b = readFileSync(path);
  if (b.length < 24) return null;
  const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (!isPng) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

if (!existsSync(DIR)) {
  console.error(`[cards] no such directory: ${DIR}`);
  process.exit(1);
}

const present = [];
const missing = [];
const failures = [];

for (const [file, label] of EXPECTED) {
  const p = join(DIR, file);
  if (!existsSync(p)) {
    missing.push([file, label]);
    continue;
  }
  const size = pngSize(p);
  if (size === null) {
    failures.push(`${file}: not a readable PNG (a .webp or .jpg renamed to .png will do this)`);
    continue;
  }
  const notes = [];
  if (size.w < MIN_EDGE || size.h < MIN_EDGE) {
    notes.push(`too small ${size.w}x${size.h}, want >= ${MIN_EDGE} on both edges`);
  }
  const want = TILE_W / TILE_H;
  const got = size.w / size.h;
  const drift = Math.abs(got - want) / want;
  if (drift > MAX_ASPECT_DRIFT) {
    notes.push(`aspect ${got.toFixed(2)} is ${(drift * 100).toFixed(0)}% off the tile's ${want.toFixed(2)} — it will crop hard`);
  }
  if (notes.length > 0) failures.push(`${file}: ${notes.join('; ')}`);
  present.push([file, label, `${size.w}x${size.h}`]);
}

// Anything in the folder that is not an expected name, so a typo'd filename is not silently ignored.
const known = new Set([...EXPECTED.map(([f]) => f), ...UNRULED, ...ALTERNATES, 'MANIFEST.md']);
const strays = readdirSync(DIR).filter((f) => !known.has(f) && !f.startsWith('.'));

console.log(`[cards] ${present.length}/${EXPECTED.length} present in assets-source/upgrade-cards/`);
for (const [file, label, dims] of present) console.log(`   OK   ${file.padEnd(20)} ${dims.padEnd(11)} ${label}`);
if (missing.length > 0) {
  console.log(`\n[cards] still to generate (${missing.length}):`);
  for (const [file, label] of missing) console.log(`   --   ${file.padEnd(20)} ${label}`);
}
if (strays.length > 0) {
  console.log(`\n[cards] ⚠ unrecognised files — check the spelling against MANIFEST.md:`);
  for (const f of strays) console.log(`   ??   ${f}`);
}
console.log(`
[cards] ⛔ levels 0 and 5 are fully ruled. Levels 10-20 have 16 racial slots undesigned.`);

if (failures.length > 0) {
  console.error(`\n[cards] ${failures.length} FAILED:`);
  for (const f of failures) console.error(`   XX   ${f}`);
  process.exit(1);
}
console.log('[cards] every present card passes.');
process.exit(0);
