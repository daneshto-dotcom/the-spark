/**
 * SPARK — CHARACTER DESIGN GENERATOR (S152 P3).
 *
 * Produces the SEED PNG that `build-sprite-atlas.mjs` needs. It is the missing first stage of the
 * art pipeline: S151 shipped the atlas builder but the three characters it animated were seeded off
 * PNGs the OWNER drew by hand, and no tool existed for the rest of the roster.
 *
 * ## ⛔ WHY THIS EXISTS AND DOES NOT USE THE `imagen_generate` MCP TOOL
 *
 * That tool posts to `models/imagen-4.0-*:predict` and returns **404 NOT_FOUND on this account** —
 * not an auth failure, a model-does-not-exist failure. The configured endpoint is the *Gemini
 * Developer API* (`generativelanguage.googleapis.com`, key from aistudio.google.com), which serves
 * NO `imagen-*` model at all. `ListModels` on it returns exactly six image models, all
 * `gemini-*-image`, plus three `veo-3.1-*`. So the image half of the pipeline has to go through
 * `:generateContent` with `responseModalities: ['IMAGE']`, which is what this script does.
 *
 * ⚠ Do not "fix" this by switching back to the MCP tool. Verified 2026-08-23: both
 * `imagen-4.0-generate-001` and `imagen-4.0-fast-generate-001` 404 on this key.
 *
 * ## ⭐ THE STYLE BIBLE IS DERIVED FROM THE OWNER'S OWN THREE DESIGNS, NOT INVENTED
 *
 * `SPARK_S137_starter_designs/` holds the swordsman, the archer and the stink tower the owner drew.
 * `SHARED_STYLE` below is read off those images so a generated character stands beside them without
 * looking like a different game. Two constraints are load-bearing:
 *
 *   1. ⛔ **NO WHITE STICKER HALO.** The owner's own rejected variant is named
 *      `2b-archer-ALT-rejected-sticker-halo.png` — a die-cut white outline around the silhouette.
 *      It is named in the negative prompt because it is the one thing already known to be refused.
 *   2. ⭐ **PLAIN PURE WHITE BACKGROUND.** Not aesthetic — `build-sprite-atlas.mjs` mattes by
 *      finding near-white connected to the frame border. A textured or tinted ground defeats the
 *      matte and the character ships with a visible box, which the owner has also already rejected
 *      once ("the old sprite had a visible square box, worst on attack").
 *
 * ## Usage
 *   node scripts/gen-character-design.mjs <spec.json> [--only <name>]
 *
 * Spec: { "outDir": "...", "characters": [ { "name": "...", "prompt": "..." } ] }
 * The key is read from the gcp-vertex MCP env at run time and is NEVER written to disk or logged.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

/* ── The key: read from the MCP server's env, never committed, never printed ─────────────────── */
function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envPath = join(homedir(), '.claude', 'mcp-servers', 'gcp-vertex', '.env');
  if (!existsSync(envPath)) {
    throw new Error(`no GEMINI_API_KEY in env and no ${envPath}`);
  }
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^GEMINI_API_KEY=(.+)$/.exec(line.trim());
    if (m) return m[1];
  }
  throw new Error('GEMINI_API_KEY not found in the gcp-vertex .env');
}

/**
 * ⭐ THE SHARED STYLE, read off the owner's three hand-made designs.
 *
 * Appended to every character prompt so the roster stays one visual family — the owner's standing
 * requirement is that a character "need[s] to stay consistent throughout", and that applies across
 * characters as much as across one character's states.
 */
const SHARED_STYLE = [
  'Cartoon vector game-asset illustration in a bold black ink outline style with flat cel shading',
  'and a few crisp highlight streaks. Olive sage-green goblin skin with slightly darker green',
  'speckles, worn brown leather straps and belts, grey riveted steel, muted earthy palette.',
  // ⛔ FACING RIGHT IS NOT A PREFERENCE — IT IS THE RENDERER'S CONVENTION.
  // `goblinRenderer.syncSprite` mirrors with `sp.scale.set(face * SCALE, SCALE)` and its comment
  // states "the source clips all walk to the right", so face=1 (unmirrored) MUST be a right-facing
  // character. Verified against the shipped atlas, not taken from the comment: the melee goblin's
  // walk row (row 1, frames 0 and 6) faces right. A left-facing seed ships the character mirrored
  // for its entire life, and every state would be backwards from its siblings.
  'Full body, single character, three-quarter view action pose, facing and moving to the RIGHT.',
  'Centered on a plain pure white background with a small soft dark oval shadow on the ground',
  'directly beneath the character.',
  'No text, no logo, no border, no frame, no white outline around the silhouette,',
  'no die-cut sticker edge, no drop-shadow behind the character, no background scenery.',
].join(' ');

const MODEL = 'gemini-3-pro-image';

/*
 * ⭐ S157 — TWO ADDITIVE SPEC KNOBS, BOTH `absent ⇒ byte-identical to the S152 behaviour`.
 *
 * 1. `spec.sharedStyle` (string | string[]) REPLACES `SHARED_STYLE` for one spec file. The default
 *    above is not neutral house style — it hard-codes *"olive sage-green goblin skin"* and *"facing
 *    and moving to the RIGHT"*, which are correct for the goblin ROSTER and wrong for a PROP. The
 *    landed stink bag is a squashed sack on the ground: it has no skin, no facing, and forcing an
 *    action pose on it produces a goblin holding a bag rather than a bag.
 *
 * 2. `ch.refImages` (string[]) sends real images alongside the text, because the owner's binding
 *    requirement here is *"make sure the bag that's generated looks like the bags that are hanging
 *    on the branches"* — an IDENTITY constraint, not a style one. A text description of a burlap
 *    sack yields *a* burlap sack; the actual pixels of the owner's own hanging sacks yield THAT
 *    sack. Same reasoning as `gen-character-clips.mjs` seeding image-to-video off the design PNG.
 *
 * ⚠ The reference images are STYLE/IDENTITY input, never a copy source: the prompt asks for a new
 *   drawing of the same object in a new pose, and every reference is the project's own art.
 */
function styleBlock(spec) {
  const s = spec.sharedStyle;
  if (s === undefined) return SHARED_STYLE;
  return Array.isArray(s) ? s.join(' ') : s;
}

const specPath = process.argv[2];
if (specPath === undefined) {
  console.error('usage: node scripts/gen-character-design.mjs <spec.json> [--only <name>]');
  process.exit(2);
}
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx === -1 ? null : process.argv[onlyIdx + 1];

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const outDir = resolve(spec.outDir);
mkdirSync(outDir, { recursive: true });
const key = apiKey();

for (const ch of spec.characters) {
  if (only !== null && ch.name !== only) continue;
  // Reference images FIRST, then the text — the order the API documents for image-conditioned
  // generation, and the order that makes the text read as instructions ABOUT the images.
  const reqParts = [];
  for (const ref of ch.refImages ?? []) {
    const p = resolve(ref);
    if (!existsSync(p)) throw new Error(`${ch.name}: refImage missing: ${p}`);
    reqParts.push({
      inlineData: {
        mimeType: p.endsWith('.jpg') || p.endsWith('.jpeg') ? 'image/jpeg' : 'image/png',
        data: readFileSync(p).toString('base64'),
      },
    });
  }
  reqParts.push({ text: `${ch.prompt} ${styleBlock(spec)}` });
  const body = {
    contents: [{ parts: reqParts }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
  };
  const bodyFile = join(outDir, `.req-${ch.name}.json`);
  writeFileSync(bodyFile, JSON.stringify(body));
  const respFile = join(outDir, `.resp-${ch.name}.json`);

  // curl rather than fetch: the key goes in the URL, and passing it through argv here keeps it out
  // of any file we write. `-sS` so a transport failure is loud but the key is never echoed.
  execFileSync('curl', [
    '-sS', '-X', 'POST',
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    '-H', 'Content-Type: application/json',
    '-d', `@${bodyFile}`,
    '-o', respFile,
  ]);

  const resp = JSON.parse(readFileSync(respFile, 'utf8'));
  if (resp.error !== undefined) {
    throw new Error(`${ch.name}: API ${resp.error.code} ${resp.error.status}: ${resp.error.message}`);
  }
  const parts = resp.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData !== undefined);
  if (img === undefined) {
    // A refusal comes back as TEXT, not an error — surface it verbatim rather than as "no image".
    const text = parts.map((p) => p.text).filter(Boolean).join(' ').slice(0, 400);
    throw new Error(`${ch.name}: no image returned. finishReason=${resp.candidates?.[0]?.finishReason}. text=${text}`);
  }
  const bytes = Buffer.from(img.inlineData.data, 'base64');
  // The model returns JPEG; normalise to PNG so the matte never has to fight JPEG ringing at the
  // ink outline. Pillow is already a hard dependency of build-sprite-atlas.mjs.
  const rawFile = join(outDir, `${ch.name}.raw`);
  writeFileSync(rawFile, bytes);
  const pngFile = join(outDir, `${ch.name}.png`);
  execFileSync('python', ['-c',
    'import sys;from PIL import Image;Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2])',
    rawFile, pngFile,
  ]);
  // Clean up the intermediates. They are gitignored anyway, but a `.resp-*.json` carries the whole
  // base64 image and leaving a pile of them next to the tracked PNGs invites someone to commit one.
  for (const f of [bodyFile, respFile, rawFile]) rmSync(f, { force: true });
  console.log(`  ${ch.name}: ${bytes.length} B ${img.inlineData.mimeType} -> ${pngFile}`);
}
console.log('done');
