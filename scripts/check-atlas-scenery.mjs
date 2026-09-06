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
    out[path] = [total, largest]
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

let bad = 0;
console.log('[scenery] opaque mid-grey BLOCKS welded to the sprite (matte cannot remove these)\n');
for (const [path, [total, largest]] of Object.entries(res)) {
  const verdict = total === 0 ? 'clean' : 'SCENERY';
  if (total > 0) bad++;
  console.log(`  ${verdict.padEnd(8)} ${String(total).padStart(7)} px  (largest ${String(largest).padStart(6)})  ${path}`);
}
console.log('');
if (bad > 0) {
  console.error(`[scenery] FAIL — ${bad} atlas(es) carry background scenery. Re-roll those clips; the`);
  console.error('          matte cannot remove mid-grey. See the SHARED instruction in gen-character-clips.mjs.');
  process.exit(1);
}
console.log(`[scenery] OK — ${files.length} atlas(es) clean.`);
