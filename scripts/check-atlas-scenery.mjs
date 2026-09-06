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
 * Usage:  node scripts/check-atlas-scenery.mjs <dir> [<dir>...]
 * Exit 0 = clean, 1 = scenery found, 2 = bad usage.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('usage: node scripts/check-atlas-scenery.mjs <dir> [<dir>...]');
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
    out[path] = [total, largest, heights]
print(json.dumps(out))
`;

const files = [];
for (const d of dirs) {
  if (!existsSync(d)) { console.error(`[scenery] no such directory: ${d}`); process.exit(2); }
  for (const f of readdirSync(d)) if (f.endsWith('-atlas.png')) files.push(join(d, f));
}
if (files.length === 0) { console.error('[scenery] no *-atlas.png found'); process.exit(2); }

const raw = execFileSync('python', ['-c', PY, ...files], { encoding: 'utf8', maxBuffer: 1 << 24 });
const res = JSON.parse(raw);

/** How far a row's seed-frame height may sit from the median before it reads as a size mismatch. */
const SIZE_TOLERANCE = 0.15;

let bad = 0;
let sized = 0;

console.log('[atlas] 1/2 — opaque mid-grey BLOCKS welded to the sprite (the matte cannot remove these)\n');
for (const [path, [total, largest]] of Object.entries(res)) {
  const verdict = total === 0 ? 'clean' : 'SCENERY';
  if (total > 0) bad++;
  console.log(`  ${verdict.padEnd(8)} ${String(total).padStart(7)} px  (largest ${String(largest).padStart(6)})  ${path}`);
}

console.log('\n[atlas] 2/2 — cross-row SEED-SIZE consistency (frame 0 is the same pose in every row)\n');
for (const [path, [, , heights]] of Object.entries(res)) {
  if (!heights || heights.length === 0) continue;
  const hs = heights.map(([, h]) => h).filter((h) => h > 0).sort((a, b) => a - b);
  if (hs.length === 0) continue;
  const med = hs[Math.floor(hs.length / 2)];
  const offenders = heights.filter(([, h]) => h > 0 && Math.abs(h / med - 1) > SIZE_TOLERANCE);
  if (offenders.length > 0) sized++;
  const detail = heights.map(([st, h]) => `${st}=${(h / med).toFixed(2)}x`).join(' ');
  console.log(`  ${(offenders.length === 0 ? 'clean' : 'MISMATCH').padEnd(8)} ${detail}  ${path}`);
}

console.log('');
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
if (bad > 0 || sized > 0) process.exit(1);
console.log(`[atlas] OK — ${files.length} atlas(es) clean on both checks.`);
