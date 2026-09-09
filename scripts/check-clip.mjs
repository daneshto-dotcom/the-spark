#!/usr/bin/env node
/**
 * SPARK — CLIP PRE-FLIGHT. Judge a generated clip BEFORE it costs anything downstream.
 *
 * ## ⛔ WHY THIS EXISTS
 *
 * Owner, on the Kraken: *"when he tries to extend his arms to look like he's attacking, it gets cut
 * off because it's, like, square where he is ... it cuts out his tentacles, which looks stupid."*
 * That clip was generated TWICE and packed once, and the defect was only found by pulling the atlas
 * apart by hand, long after the money was spent.
 *
 * Two distinct faults were in that one file, and **only one of them is recoverable** — which is the
 * whole reason this script reports them separately:
 *
 *   1. **PILLARBOXING** — black bars down the left and right. RECOVERABLE. `build-sprite-atlas.mjs`
 *      already crops them, and already carries a `sampleStart` escape hatch (added when a Warlord
 *      clip had letterboxed LEADING frames). The Kraken clip simply was never given one. So the
 *      useful output here is not "bad clip" but **the exact frame index the bars stop at**, i.e. the
 *      `sampleStart` to put in the spec.
 *
 *   2. **EDGE AMPUTATION** — the subject runs off the side of the source frame. NOT RECOVERABLE.
 *      Those pixels were never generated; widening the cell just puts empty space around a limb that
 *      still ends in a flat stump. This one means REGENERATE, framed smaller.
 *
 * ⚠ AND THE PACKER'S OWN ASSUMPTION IS WHY #1 SURVIVED. `content_column()` averages brightness over
 * the WHOLE clip because "veo's letterbox is fixed for a whole clip" — true for every clip until the
 * Kraken's, where the bars are present in the first frames and gone later. Averaging then picks a
 * column that is wrong for both halves. This script tests **per frame**, precisely to catch the case
 * the packer is documented as not handling.
 *
 * ## USAGE
 *
 *   node scripts/check-clip.mjs <clip.mp4> [more.mp4 ...]
 *   node scripts/check-clip.mjs assets-source/race-tier9-bosses/clips/t9boss-nagas/
 *
 * Exit codes, matching `check-atlas-scenery.mjs`'s convention:
 *   0 — every clip is packable as-is
 *   1 — at least one clip has a fault (the report says which, and whether it is recoverable)
 *   3 — the pixel toolchain is missing (`pip install numpy Pillow`), NOT a verdict on the art
 *
 * ⚠ THIS IS A REPORT, NEVER A GATE ON A DEPLOY. It runs against `assets-source/`, which the shipped
 * build does not read. The project rule that an asset-quality opinion must never block a live deploy
 * (S165 broke it and the site sat stale) applies here too.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** How many frames to sample across the clip. 24 is enough to localise a bar transition to ~4%. */
const SAMPLES = 24;

/**
 * Luminance above which a pixel counts as "not a black bar".
 *
 * ⚠ MATCHED TO THE PACKER (`content_column` uses `lum > 40`) ON PURPOSE. A validator that disagreed
 * with the tool it is protecting would pass clips the packer then mangles, which is worse than no
 * validator at all.
 */
const BAR_LUM = 40;

/** A column is "content" when this fraction of its pixels are above `BAR_LUM`. Also the packer's. */
const CONTENT_FRAC = 0.15;

/**
 * How close to the frame edge the subject may come before it is called AMPUTATED, as a fraction of
 * width. ⚠ THIS NUMBER IS MINE. 1% of 1280 ≈ 13 px — tight enough that a deliberate full-bleed
 * background does not trip it, loose enough to catch a limb that has been sliced off, which is what
 * the Kraken's tentacles did (they reached column 1 of 1280).
 */
const EDGE_MARGIN_FRAC = 0.01;

function die(msg, code) {
  console.error(msg);
  process.exit(code);
}

function haveTool(cmd, args) {
  try { execFileSync(cmd, args, { stdio: 'ignore' }); return true; } catch { return false; }
}

if (!haveTool('ffmpeg', ['-version'])) {
  die('[check-clip] ffmpeg not found on PATH — cannot sample frames. This is a TOOLCHAIN gap, not a verdict on the art.', 3);
}

const PY = `import sys, json
try:
    import numpy as np
    from PIL import Image
except Exception as e:
    print(json.dumps({"toolchain": str(e)})); sys.exit(0)

BAR_LUM, CONTENT_FRAC, EDGE = float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
out = []
import glob, os
allf = sorted(glob.glob(os.path.join(sys.argv[1], '*.png')))
SAMPLES = 24
stride = max(1, len(allf) // SAMPLES)
picked = [(i, allf[i]) for i in range(0, len(allf), stride)][:SAMPLES]
for srcidx, f in picked:
    a = np.asarray(Image.open(f).convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    lum = a.mean(axis=2)
    colf = (lum > BAR_LUM).mean(axis=0)          # fraction of each column that is "content"
    cols = np.where(colf > CONTENT_FRAC)[0]
    if cols.size == 0:
        out.append({"file": os.path.basename(f), "idx": srcidx, "blank": True}); continue
    # ⛔ LARGEST CONTIGUOUS RUN, NOT first..last — and this was a real false positive, not a nicety.
    # Taking the outermost content columns spans ACROSS the pillarbox bars whenever a few stray
    # bright pixels sit outside them, so the "subject" then began at the bar edge and every clip
    # reported as amputated, including two that render perfectly in game. The packer's own
    # content_column() takes the largest run for the same reason; matching it is what makes this
    # validator agree with the tool it protects.
    breaks = np.where(np.diff(cols) > 1)[0]
    runs, start = [], 0
    for b in breaks:
        runs.append((int(cols[start]), int(cols[b]))); start = b + 1
    runs.append((int(cols[start]), int(cols[-1])))
    lo, hi = max(runs, key=lambda r: r[1] - r[0])
    # BARS ARE MEASURED BEFORE THE INSET. Measuring after made a perfectly clean full-width frame
    # report 3px bars and trip the >2 threshold, so every clip read as "barred throughout" - including
    # the one whose bars I had confirmed by hand STOP at frame 60. The inset exists only to keep the
    # bar/panel boundary out of the SUBJECT test; it is not a property of the frame.
    barL, barR = int(lo), int(w - 1 - hi)
    # ⚠ INSET past the bar/panel boundary before judging the subject. The transition is not a hard
    # step — a couple of columns of half-lit ink sit there, and they read as "subject" otherwise.
    INSET = 3
    lo, hi = lo + INSET, hi - INSET
    if hi - lo < 32:
        out.append({"file": os.path.basename(f), "idx": srcidx, "blank": True}); continue
    # Amputation is judged on the SUBJECT, not on the lit background: find the ink (dark-on-white)
    # plus anything strongly non-white, then ask whether it reaches the content column's own edge.
    sub = a[:, lo:hi+1]
    sl = sub.mean(axis=2)
    # a pixel belongs to the subject when it is not near-white background
    mask = (sl < 235)
    xs = np.where(mask.any(axis=0))[0]
    ys = np.where(mask.any(axis=1))[0]
    if xs.size == 0:
        out.append({"file": os.path.basename(f), "idx": srcidx, "blank": True}); continue
    cw = hi - lo + 1
    margin = max(1, int(cw * EDGE))
    out.append({
        "file": os.path.basename(f), "idx": srcidx, "blank": False,
        "w": int(w), "h": int(h), "barL": barL, "barR": barR,
        "touchL": bool(int(xs[0]) <= margin),
        "touchR": bool(int(xs[-1]) >= cw - 1 - margin),
        "touchT": bool(int(ys[0]) <= margin),
        "touchB": bool(int(ys[-1]) >= int(h) - 1 - margin),
        "subL": int(xs[0]), "subR": int(xs[-1]), "cw": int(cw),
    })
print(json.dumps(out))
`;

function pythonCmd() {
  for (const c of ['python', 'python3', 'py']) if (haveTool(c, ['--version'])) return c;
  return null;
}
const PYCMD = pythonCmd();
if (PYCMD === null) {
  die('[check-clip] no python on PATH — cannot inspect pixels. TOOLCHAIN gap, not a verdict on the art.', 3);
}

/** Expand a directory argument into the clips inside it. */
function clipsFrom(arg) {
  if (!existsSync(arg)) die(`[check-clip] no such path: ${arg}`, 1);
  if (statSync(arg).isDirectory()) {
    return readdirSync(arg).filter((f) => f.endsWith('.mp4')).map((f) => join(arg, f));
  }
  return [arg];
}

const args = process.argv.slice(2);
if (args.length === 0) {
  die('usage: node scripts/check-clip.mjs <clip.mp4 | clips-dir> [...]', 1);
}
const clips = args.flatMap(clipsFrom);
if (clips.length === 0) die('[check-clip] no .mp4 files found in the given path(s)', 1);

let anyFault = false;

for (const clip of clips) {
  const dir = mkdtempSync(join(tmpdir(), 'sparkclip-'));
  try {
    // Sample evenly across the clip. `-vsync 0` keeps one output per selected frame.
    /*
     * ⛔ EVERY FRAME, THEN STRIDE IN PYTHON - NOT an ffmpeg select filter.
     *
     * The first cut used select='not(mod(n,N))'. It silently did not apply, so all 24 "samples"
     * came from the FIRST 24 frames - entirely inside the Kraken's barred opening - and the tool
     * reported "bars throughout" on a clip I had already confirmed by hand changes at frame 60.
     * A sampler that quietly samples the wrong end of the file is worse than none, and
     * filter-escaping through argv is not worth the doubt when decoding 96 PNGs costs a second.
     */
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', clip, join(dir, 'f_%03d.png')], { stdio: 'ignore' });

    const raw = execFileSync(PYCMD, ['-c', PY, dir, String(BAR_LUM), String(CONTENT_FRAC), String(EDGE_MARGIN_FRAC)], {
      encoding: 'utf8',
    });
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
      die(`[check-clip] pixel toolchain missing (${data.toolchain}). Run: pip install numpy Pillow`, 3);
    }

    const name = clip.replace(/\\/g, '/').split('/').slice(-2).join('/');
    const barred = data.filter((f) => !f.blank && (f.barL > 2 || f.barR > 2));
    const amputated = data.filter((f) => !f.blank && (f.touchL || f.touchR || f.touchT || f.touchB));

    console.log(`\n${name}  (${data.length} frames sampled)`);

    if (barred.length === 0 && amputated.length === 0) {
      console.log('  PASS  no side bars, subject clear of every edge — packable as-is');
      continue;
    }
    anyFault = true;

    if (barred.length > 0) {
      const firstClean = data.findIndex((f) => !f.blank && f.barL <= 2 && f.barR <= 2);
      const allBarred = firstClean === -1;
      console.log(`  ⚠ PILLARBOXED in ${barred.length}/${data.length} sampled frames  (max bars L${Math.max(...barred.map((f) => f.barL))} R${Math.max(...barred.map((f) => f.barR))})`);
      if (allBarred) {
        console.log('    RECOVERABLE — bars are present throughout, which is the case the packer already');
        console.log('    handles: `content_column` crops one stable column. No action needed.');
      } else {
        // The stride we sampled at, so the suggestion is in SOURCE frame numbers.
        const suggest = data[firstClean].idx;
        console.log('    ⛔ BARS CHANGE MID-CLIP — this is the case the packer is documented as NOT handling');
        console.log('    ("veo\'s letterbox is fixed for a whole clip"). Averaging picks a column wrong for both halves.');
        console.log(`    RECOVERABLE — set  "sampleStart": ${suggest}  on this state in the atlas spec.`);
      }
    }

    if (amputated.length > 0) {
      const sides = new Set();
      for (const f of amputated) {
        if (f.touchL) sides.add('left');
        if (f.touchR) sides.add('right');
        if (f.touchT) sides.add('top');
        if (f.touchB) sides.add('bottom');
      }
      console.log(`  ⛔ SUBJECT TOUCHES THE FRAME EDGE in ${amputated.length}/${data.length} frames  (${[...sides].join(', ')})`);
      console.log('    NOT RECOVERABLE — those pixels were never generated. Widening the cell adds empty');
      console.log('    space around a limb that still ends in a flat stump. REGENERATE, framed smaller,');
      console.log('    with "the whole character must stay fully inside the frame with margin on all sides".');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(
  anyFault
    ? '\n[check-clip] FAULTS FOUND — see each clip above for whether it is recoverable or needs regenerating.'
    : '\n[check-clip] all clips clean.',
);
process.exit(anyFault ? 1 : 0);
