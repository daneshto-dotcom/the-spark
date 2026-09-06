/**
 * SPARK — ATLAS SCENERY GUARD (S165).
 *
 * ⛔ THE DEFECT THIS EXISTS FOR. veo sometimes ignores "plain solid pure white background, empty,
 * no scenery" and paints BACKGROUND FURNITURE behind the character — grey stone pillars and arches,
 * grey corner brackets, grey slabs. Measured S165: 4 of 24 tier-3 clips on veo-3.1-fast.
 *
 * ⭐ WHY THE MATTE CANNOT CATCH IT, WHICH IS THE WHOLE REASON THIS FILE EXISTS.
 * `build-sprite-atlas.mjs` removes background by two rules: near-white connected to the frame
 * border, and near-black connected to the border SHAPED LIKE A BAR (the letterbox). Mid-grey
 * scenery is neither, so it is treated as artwork and ships as opaque geometry welded to the sprite.
 * And no threshold can safely eat it, because mid-grey is exactly where a steel blade, a stone tusk
 * and a bone horn live. It has to be caught as a SHAPE, after the fact, and re-rolled.
 *
 * ⚠ AND IT IS INVISIBLE TO EVERY OTHER CHECK. The suite never opens a PNG, the matte reports
 * success, and the sprite only looks wrong once it is on a black board in a running match.
 *
 * ## What counts as scenery
 *
 * A connected region that is OPAQUE, MID-BRIGHT, DESATURATED, LARGE and BLOCKY:
 *   alpha > 200 · min channel > 110 · max channel < 235 · (max-min) < 22 · >= 400 px
 *   · bbox fill > 0.62 · at least 25x25
 * The fill term is what separates a slab from a character: a drawn creature is irregular and fills
 * maybe a third of its bounding box, while a wall or a bracket fills nearly all of its own.
 *
 * ## Calibration — measured, not guessed
 *
 * Run against the twelve atlases live at S165, this scored ZERO on all six CASTLE units (generated
 * on the full veo tier, no scenery seen by eye) and flagged exactly the tier-3 rows that had already
 * been rejected by eye: souleater 49,547 px · bat 5,084 · scarab 3,524 · warband 1,852 · hound 1,601.
 * ⭐ It also scored ZERO on the piranha, whose defect was CREATURE DRIFT (it grew arms and legs) and
 * not scenery — i.e. it does not fire on things it is not measuring.
 *
 * ## Where this runs, and where it deliberately does NOT
 *
 * ⛔ NOT IN `npm run build`, and that is a correction, not an omission. S165 wired it there and the
 * GitHub Pages deploy went red on `ModuleNotFoundError: No module named 'numpy'` — the Pages runner
 * is a Node image with no scientific Python. The site then sat STALE while the owner was waiting to
 * see the new art, which is the exact failure the project charter already names for the bundle cap:
 * an asset-quality opinion must never be the thing that stops a live deploy.
 *
 * ⭐ It runs instead as its OWN CI job (`atlas-guard` in .github/workflows/e2e.yml) which installs
 * numpy/scipy/Pillow first. A dirty atlas therefore still turns CI red — it just ships while it
 * does, so the owner sees the flawed art and the red signal at the same time instead of neither.
 *
 * Usage:  node scripts/check-atlas-scenery.mjs <dir> [<dir>...]
 * Exit 0 = clean, 1 = scenery found, 2 = bad usage, 3 = the Python toolchain is missing.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * ⛔ SCOPE — THIS GUARD IS FOR **CHARACTER** ATLASES, AND POINTING IT AT STRUCTURES CRIES WOLF.
 *
 * Both checks rest on assumptions that only hold for characters, and S165 proved it by running the
 * guard over the six tier-3 TOWERS and getting two confident false positives:
 *
 *   · SCENERY on `t3destroy-orcs` (5,809 px) — that is the SMOKE of a burning hut. Deliberate
 *     foreground art, and grey, blocky and opaque exactly like a wall. There is no automatic
 *     discriminator between "veo invented a stone pillar" and "the artist asked for smoke".
 *   · SIZE MISMATCH `destroyed=0.80x` on two towers — which is CORRECT. Check 2 assumes every row is
 *     the same pose seeded off one image, so a size difference is veo error. A tower's four rows are
 *     four separate DRAWINGS of a building in different conditions, and rubble is SUPPOSED to be
 *     shorter than the intact building.
 *
 * A guard that fires on healthy art teaches people to ignore it, which is worse than no guard. So
 * structures are audited BY EYE on a contact sheet, and the flags below exist to say so explicitly
 * at the call site rather than silently widening a threshold until the noise stops.
 *
 *   --no-size          skip check 2 (rows are conditions, not seeded states)
 *   --allow-scenery N  tolerate up to N px of grey blocks (deliberate smoke, dust, ash)
 */
const argv = process.argv.slice(2);
const noSize = argv.includes('--no-size');
const allowIdx = argv.indexOf('--allow-scenery');
const allowScenery = allowIdx >= 0 ? Number(argv[allowIdx + 1]) : 0;
if (allowIdx >= 0 && !Number.isFinite(allowScenery)) {
  console.error('[atlas] --allow-scenery needs a number');
  process.exit(2);
}
const dirs = argv.filter((a, i) => !a.startsWith('--') && !(allowIdx >= 0 && i === allowIdx + 1));
if (dirs.length === 0) {
  console.error('usage: node scripts/check-atlas-scenery.mjs [--no-size] [--allow-scenery N] <dir> [<dir>...]');
  process.exit(2);
}

/** ⚠ Pixel work goes to Python: numpy+scipy are already the atlas builder's own dependency. */
const PY = `
import sys, json
import numpy as np
from PIL import Image
from scipy import ndimage

out = {}
for path in sys.argv[1:]:
    a = np.asarray(Image.open(path).convert('RGBA'))
    rgb = a[:, :, :3].astype(np.int16)
    al = a[:, :, 3]
    mn = rgb.min(axis=2); mx = rgb.max(axis=2)
    grey = (al > 200) & (mn > 110) & (mx < 235) & ((mx - mn) < 22)
    lab, n = ndimage.label(grey)
    total = 0; largest = 0
    if n:
        sizes = ndimage.sum(grey, lab, index=np.arange(1, n + 1))
        for i, s in enumerate(sizes, 1):
            if s < 400:
                continue
            ys, xs = np.nonzero(lab == i)
            h = int(ys.max() - ys.min() + 1); w = int(xs.max() - xs.min() + 1)
            if h < 25 or w < 25:
                continue
            if s / (h * w) <= 0.62:
                continue
            total += int(s); largest = max(largest, int(s))
    # ── cross-row SEED-SIZE consistency ───────────────────────────────────────────────────
    # Every state of a character is seeded image-to-video off the SAME design PNG, so the FIRST
    # sampled frame of every row is a render of one identical pose. Any height difference there is
    # veo choosing its own zoom per clip, not art direction — the defect the owner spotted as
    # "size difference between row one and two not consistent in hounds and lifestealers".
    #
    # ⚠ HEIGHT, NOT AREA. The builder height-fits, and area conflates scale with POSE: a bat biting
    # front-on is legitimately narrower than the same bat gliding side-on at the same size.
    import os
    mpath = path.replace('-atlas.png', '-anim.json')
    heights = []
    if os.path.exists(mpath):
        man = json.load(open(mpath))
        cw, ch = man['cellW'], man['cellH']
        img = Image.open(path).convert('RGBA')
        for st, info in man['states'].items():
            cell = np.asarray(img.crop((0, info['row'] * ch, cw, (info['row'] + 1) * ch)))
            ys = np.nonzero((cell[:, :, 3] > 40).sum(axis=1))[0]
            heights.append([st, int(ys[-1] - ys[0] + 1) if ys.size else 0])
    # ── check 3: OPAQUE NEAR-WHITE that survived the matte ────────────────────────────────
    # The owner's words: "some of them have that white background because not cut out too well".
    # build-sprite-atlas.mjs deliberately KEEPS enclosed near-white BELOW enclosedWhiteLimitPct so
    # that eyes and blade glints survive, which means a loose limit ships background pockets as
    # opaque white blobs.
    #
    # ⭐ LARGEST POCKET, NOT TOTAL, and that distinction is the whole check. At the tuned 4e-05 the
    # race units carry 66-768 px of near-white in total while their biggest single pocket is 2-52 px
    # — eye glints, correctly kept. The castles and towers, which had silently inherited the 0.003
    # DEFAULT, totalled about the same but had pockets of 113-168 px, and that is a visible patch.
    # Summing would have called the healthy sheets worse than the broken ones.
    white = (al > 200) & (mn > 205) & ((mx - mn) < 28)
    wlab, wn = ndimage.label(white)
    wbig = 0
    if wn:
        wbig = int(ndimage.sum(white, wlab, index=np.arange(1, wn + 1)).max())
    out[path] = [total, largest, heights, int(white.sum()), wbig]
print(json.dumps(out))
`;

const files = [];
for (const d of dirs) {
  if (!existsSync(d)) { console.error(`[scenery] no such directory: ${d}`); process.exit(2); }
  for (const f of readdirSync(d)) if (f.endsWith('-atlas.png')) files.push(join(d, f));
}
if (files.length === 0) { console.error('[scenery] no *-atlas.png found'); process.exit(2); }

/*
 * ⚠ EXIT 3, NAMED, RATHER THAN A RAW TRACEBACK. The first time this ran without numpy it emitted a
 * 30-line Node/child_process stack whose actual cause — one missing pip package — was four screens
 * up. A guard that cannot say why it could not run is a guard that gets deleted.
 */
let raw;
try {
  raw = execFileSync('python', ['-c', PY, ...files], { encoding: 'utf8', maxBuffer: 1 << 24 });
} catch (err) {
  const why = String(err?.stderr ?? err?.message ?? err);
  const missing = /No module named '([^']+)'/.exec(why);
  if (missing) {
    console.error(`[scenery] cannot run: Python is missing '${missing[1]}'.`);
    console.error('[scenery] this guard reads PNG pixels and needs:  pip install numpy scipy Pillow');
    console.error('[scenery] it is NOT part of `npm run build` by design — see the header of this file.');
    process.exit(3);
  }
  console.error('[scenery] the pixel pass failed:\n' + why);
  process.exit(3);
}
const res = JSON.parse(raw);

/** How far a row's seed-frame height may sit from the median before it reads as a size mismatch. */
const SIZE_TOLERANCE = 0.15;

let bad = 0;
let sized = 0;

console.log('[atlas] 1/3 — opaque mid-grey BLOCKS welded to the sprite (the matte cannot remove these)\n');
for (const [path, [total, largest]] of Object.entries(res)) {
  const verdict = total <= allowScenery ? 'clean' : 'SCENERY';
  if (total > allowScenery) bad++;
  console.log(`  ${verdict.padEnd(8)} ${String(total).padStart(7)} px  (largest ${String(largest).padStart(6)})  ${path}`);
}

console.log(noSize
  ? '\n[atlas] 2/2 — SKIPPED (--no-size: these rows are conditions, not states seeded off one image)\n'
  : '\n[atlas] 2/2 — cross-row SEED-SIZE consistency (frame 0 is the same pose in every row)\n');
for (const [path, [, , heights]] of Object.entries(res)) {
  if (noSize || !heights || heights.length === 0) continue;
  const hs = heights.map(([, h]) => h).filter((h) => h > 0).sort((a, b) => a - b);
  if (hs.length === 0) continue;
  const med = hs[Math.floor(hs.length / 2)];
  const offenders = heights.filter(([, h]) => h > 0 && Math.abs(h / med - 1) > SIZE_TOLERANCE);
  if (offenders.length > 0) sized++;
  const detail = heights.map(([st, h]) => `${st}=${(h / med).toFixed(2)}x`).join(' ');
  console.log(`  ${(offenders.length === 0 ? 'clean' : 'MISMATCH').padEnd(8)} ${detail}  ${path}`);
}

/** Largest single opaque near-white pocket allowed. Eye glints measure 2-52 px; leaks measure 113+. */
const WHITE_POCKET_MAX = 60;

let leaky = 0;
console.log('\n[atlas] 3/3 — opaque NEAR-WHITE that survived the matte (largest pocket, not total)\n');
for (const [path, [, , , wtotal, wbig]] of Object.entries(res)) {
  const over = wbig > WHITE_POCKET_MAX;
  if (over) leaky++;
  console.log(`  ${(over ? 'WHITE' : 'clean').padEnd(8)} largest ${String(wbig).padStart(5)} px  (total ${String(wtotal).padStart(6)})  ${path}`);
}

console.log('');
if (leaky > 0) {
  console.error(`[atlas] FAIL — ${leaky} atlas(es) ship a visible white patch. Set`);
  console.error('        "enclosedWhiteLimitPct": 4e-05 on that spec — the builder DEFAULT of 0.003 is 75x');
  console.error('        looser and is what lets background pockets through as opaque blobs.');
}
if (bad > 0) {
  console.error(`[atlas] FAIL — ${bad} atlas(es) carry background scenery. Re-roll those clips; the matte`);
  console.error('        cannot remove mid-grey. See the SHARED instruction in gen-character-clips.mjs.');
}
if (sized > 0) {
  console.error(`[atlas] FAIL — ${sized} atlas(es) have rows that disagree about the character's size.`);
  console.error('        Set "normaliseStateScale": true on that spec, and if the offending clip is');
  console.error('        FRAME-FILLING re-roll it demanding visible empty margin — a clamped measurement');
  console.error('        makes the normaliser under-estimate and over-shrink the row.');
}
if (bad > 0 || sized > 0 || leaky > 0) process.exit(1);
// ⚠ Say WHICH checks actually ran. "clean on both checks" when only one ran is exactly the kind of
// false assurance this repo has been bitten by before (a gate that FAILED read as passing, S161).
const ran = noSize ? 'the scenery and white-leak checks' : 'all three checks';
const tol = allowScenery > 0 ? ` (scenery tolerance ${allowScenery} px)` : '';
console.log(`[atlas] OK — ${files.length} atlas(es) clean on ${ran}${tol}.`);
