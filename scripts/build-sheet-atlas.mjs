/**
 * SPARK — S182 — **SHEET → ATLAS. The art half of the damage-state pilot.**
 *
 * The owner sends a CONTACT SHEET: one PNG, a grid of drawn frames, rules between the cells and a
 * frame number baked into every corner. He has more of them waiting — *"I already have art for
 * goblins and for pencil chewers and pentagram and for laser tower, for everything else, but I first
 * want to see you implement this before I give you all the rest."* So this is the intake for all of
 * them, written once on the lightning hub.
 *
 * ## ⛔ WHY THIS IS A SIBLING OF `build-sprite-atlas.mjs` AND NOT A BRANCH IN IT
 *
 * That script's matte keys **near-WHITE connected to the frame border**, because veo returns a
 * character on a white field. This sheet's background is **near-BLACK** (measured (0,10,17)), so the
 * white key finds nothing, every pixel survives, and the sprite ships as a solid navy rectangle.
 * Inverting the key is not a knob on that function — it changes which of its two rules is which, and
 * the enclosed-pocket rule, the letterbox-bar rule and the pale-fringe strip all exist for the white
 * case specifically. A flag that reverses the meaning of three tuned thresholds is a second script
 * wearing the first one's name.
 *
 * ⭐ **BUT THE CONTRACT DOWNSTREAM IS IDENTICAL, DELIBERATELY.** One union bbox across every frame,
 * height-fit into the cell, bottom-centre foot anchor, and the same `<name>-atlas.png` +
 * `<name>-anim.json` pair the renderers already read. A sheet-sourced building therefore cannot
 * disagree with a clip-sourced one about where the ground is, and nothing downstream forks.
 *
 * ## THE FOUR THINGS THIS SHEET DOES THAT A veo CLIP DOES NOT
 *
 * 1. ⛔ **THE GRID DOES NOT DIVIDE EVENLY, AND COMPUTING A STRIDE CLIPS EVERY FRAME.** Measured on
 *    `hub-transitions-24.png`: 1908/8 = 238.5 and 824/3 = 274.67, while the real cells are
 *    254·255·252·253·252·246·**198·184** wide and 270·265·285 tall. The last two columns are 27 %
 *    narrower than the first. A uniform slice would cut into frames 7, 8, 15, 16, 23 and 24 and the
 *    drift would read as jitter down the ramp. So the cell bounds are **DETECTED** from the drawn
 *    rules — full-height columns and full-width rows that are non-background everywhere — and the
 *    spec's declared `cols`/`rows` are an ASSERTION against that detection, never its source.
 *
 * 2. ⭐ **THE FRAME NUMBER IS BAKED INTO EVERY CELL** and the matte would happily ship it as art.
 *    It is erased from a top-left box, and the erase is GUARDED rather than trusted: within that box
 *    there must be exactly ONE connected blob, with real margin to the box's right and bottom edges.
 *    Measured across all 24 cells of the hub sheet: one blob every time, 188–476 px, margin 11–31 px.
 *    A future sheet whose numerals are bigger, doubled, or whose art reaches into the corner FAILS
 *    here instead of silently losing a corner of the drawing.
 *
 * 3. ⭐ **THE EDGE IS RAMPED, NOT ERODED.** `build-sprite-atlas.mjs` cuts a binary alpha and then
 *    erodes a pixel to kill veo's pale halo. That is right for ink-on-white. This art is **glow on
 *    black** — electric rings, smoke, fire — and a binary cut there amputates the glow and leaves a
 *    visible hard rim around it. So boundary alpha is set from how far the pixel actually is from the
 *    background colour, which keeps the falloff the artist drew.
 *
 * 4. ⚠ **THE ROWS OF THE SOURCE ARE NOT THE ROWS OF THE OUTPUT.** The hub sheet is 8×3 read in
 *    reading order as ONE 24-frame ramp; the atlas ships it as 2 rows of 12, which is the shape the
 *    rest of the pipeline is built around (`ART_PIPELINE.md`: *"The pipeline does not need video. It
 *    needs 12 frames."*). `states[]` does that remapping and is the only place frame numbering and
 *    row numbering meet.
 *
 * Usage:  node scripts/build-sheet-atlas.mjs <spec.json>
 * Exit 0 = built · 2 = bad usage · 3 = the Python toolchain is missing (pip install numpy scipy Pillow)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const specPath = process.argv[2];
if (specPath === undefined) {
  console.error('usage: node scripts/build-sheet-atlas.mjs <spec.json>');
  process.exit(2);
}
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
if (!existsSync(resolve(spec.source))) {
  console.error(`[sheet] source missing: ${spec.source}`);
  process.exit(2);
}

const PY = String.raw`
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage

spec = json.loads(sys.argv[1]); out_png, out_json = sys.argv[2], sys.argv[3]
src = np.array(Image.open(spec['source']).convert('RGB')).astype(np.int16)
H, W = src.shape[0], src.shape[1]
BG = np.array(spec.get('backgroundRGB', [0, 10, 17]), dtype=np.int16)
TOL = int(spec.get('bgTolerance', 30))
dist_full = np.abs(src - BG).sum(axis=2)
nonbg = dist_full > TOL

# ── 1. DETECT THE GRID ────────────────────────────────────────────────────────────────────────
# A drawn rule is a line that is non-background along its ENTIRE length. Nothing else in the art
# is: the tallest smoke plume in the hub sheet covers 77 % of a column, not 100 %.
def rule_runs(frac):
    runs, s = [], None
    for i, v in enumerate(frac):
        if v > 0.995 and s is None: s = i
        elif v <= 0.995 and s is not None: runs.append((s, i - 1)); s = None
    if s is not None: runs.append((s, len(frac) - 1))
    return runs

def spans(runs, total):
    out, prev = [], 0
    for (s, e) in runs:
        out.append((prev, s)); prev = e + 1
    out.append((prev, total))
    return out

col_spans = spans(rule_runs(nonbg.mean(axis=0)), W)
row_spans = spans(rule_runs(nonbg.mean(axis=1)), H)
want_c, want_r = spec['grid']['cols'], spec['grid']['rows']
if len(col_spans) != want_c or len(row_spans) != want_r:
    raise SystemExit(
        f"[sheet] grid mismatch: detected {len(col_spans)}x{len(row_spans)} cells, "
        f"spec declares {want_c}x{want_r}. The rules in this sheet are not where the spec says.")
print(f'  grid: {want_c}x{want_r}  col widths {[b - a for a, b in col_spans]}'
      f'  row heights {[b - a for a, b in row_spans]}')

# ── 2. MATTE ONE CELL ─────────────────────────────────────────────────────────────────────────
def matte(c):
    ch, cw = c.shape[0], c.shape[1]
    dist = np.abs(c - BG).sum(axis=2)
    near = dist <= TOL
    lab, k = ndimage.label(near)
    border = set(np.unique(np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]])))
    border.discard(0)
    kill = set(border)
    # Enclosed background judged by AREA, the same rule and the same reasoning as the white-key
    # matte: a dark pocket the size of a rivet is art, a dark pocket the size of the gap under the
    # tower's legs is background that happens to be surrounded.
    if k:
        limit = spec.get('enclosedBgLimitPct', 0.002) * ch * cw
        for i, sz in enumerate(ndimage.sum(near, lab, index=np.arange(1, k + 1)), 1):
            if i not in kill and sz > limit: kill.add(i)
    bgm = np.isin(lab, list(kill)) if kill else np.zeros_like(near)
    alpha = np.where(bgm, 0, 255).astype(np.int32)

    # ── the baked frame number ────────────────────────────────────────────────────────────────
    label_px = 0
    if spec.get('stripCornerLabel', False):
        box_h = min(int(spec.get('cornerLabelBoxPx', 56)), int(0.20 * ch))
        box_w = min(int(spec.get('cornerLabelBoxPx', 56)), int(0.30 * cw))
        subj = ndimage.binary_opening(dist > TOL, np.ones((2, 2)))
        box = subj[:box_h, :box_w]
        blab, bn = ndimage.label(box, structure=np.ones((3, 3)))
        if bn != 1:
            raise SystemExit(
                f'[sheet] corner label: expected exactly 1 blob in the {box_h}x{box_w} corner box, '
                f'found {bn}. This sheet does not label its frames the way the spec assumes.')
        ys, xs = np.nonzero(box)
        margin = min(box_h - 1 - int(ys.max()), box_w - 1 - int(xs.max()))
        if margin < 4:
            raise SystemExit(
                f'[sheet] corner label touches the box edge (margin {margin}px) — the numeral is '
                f'larger than the box, or the artwork reaches into the corner. Widen '
                f'cornerLabelBoxPx only after looking at the cell.')
        grow = ndimage.binary_dilation(box, np.ones((3, 3)), iterations=2)
        alpha[:box_h, :box_w] = np.where(grow, 0, alpha[:box_h, :box_w])
        label_px = int(box.sum())

    # ── the ramped edge ───────────────────────────────────────────────────────────────────────
    # ⭐ Boundary alpha from the pixel's OWN distance to the background, so a glow fades out the way
    # it was drawn instead of ending in a hard rim two pixels from the ink.
    soft = int(spec.get('edgeSoftness', 64))
    if soft > 0:
        op = alpha > 0
        inner = ndimage.binary_erosion(op, np.ones((3, 3)), iterations=2, border_value=1)
        edge = op & ~inner
        ramp = (np.clip((dist - TOL) / soft, 0, 1) * 255).astype(np.int32)
        alpha = np.where(edge, ramp, alpha)
    return np.dstack([c.astype(np.uint8), np.clip(alpha, 0, 255).astype(np.uint8)]), label_px

frames = []
for (y0, y1) in row_spans:
    for (x0, x1) in col_spans:
        m, lp = matte(src[y0:y1, x0:x1])
        frames.append(m)
print(f'  matted {len(frames)} cells')

# ── 3. ONE UNION BBOX ACROSS EVERY FRAME — the anti-jitter guarantee, as the clip packer states it.
#
# ⛔⛔ THE CELLS MUST BE ALIGNED ON THE **SUBJECT'S GROUND LINE**, NOT ON THE CELL BOTTOM, AND THIS IS
# WHERE A HAND-DRAWN SHEET DIVERGES FROM A veo CLIP.
#
# The CLIP packer pads bottom-centre, which is exactly right there: every frame of a clip is
# one canvas and the letterbox is fixed, so the cell bottom IS the ground line. On this sheet the
# three source rows are 270, 265 and 285 px tall and the artist left different amounts of air under
# each. MEASURED: bottom-aligning the CELLS puts the rubble's lowest pixel 23 px above the standing
# tower's, so the ramp would visibly HOP upward between frame 16 and frame 17 — the same defect S178
# found in the Voltkin TV, where two of six rows had 38–43 px of empty cell below the art and the
# building hovered.
#
# So each cell is placed by its own SUBJECT BOTTOM, and horizontally by its own CELL CENTRE (the
# artist centred the tower in its cell; centring the SUBJECT bbox instead would let a smoke plume
# drifting right pull the tower left).
#
# ⚠ AND THE GROUND LINE IS THE BOTTOM OF THE **SOLID** ART, NOT OF THE LAST FAINT PIXEL. The ramped
# edge above leaves a few rows of low alpha under the rubble skirt, and those rows are not the same
# depth on every frame. MEASURED on the hub sheet: aligning on alpha > 24 left the SOLID bottoms
# scattered across 27 px — about 9 px on screen at the shipped sprite size, i.e. a visible hop
# mid-ramp — while aligning on alpha > 128 pins the mass and lets the fade hang below it.
OPAQUE = int(spec.get('bboxAlphaFloor', 24))
GROUND = int(spec.get('groundAlphaFloor', 128))

metrics = []
for a in frames:
    ys, xs = np.nonzero(a[:, :, 3] > OPAQUE)
    if ys.size == 0:
        raise SystemExit('[sheet] a cell matted to nothing — check backgroundRGB / bgTolerance')
    gy, _gx = np.nonzero(a[:, :, 3] > GROUND)
    ground = int(gy.max()) if gy.size else int(ys.max())
    metrics.append((int(ys.min()), ground, a.shape[0], a.shape[1], int(ys.max())))

# Deep enough that the softest fade below the solid mass still lands on the canvas.
FOOT_PAD = max(4, max(fy - g for (_, g, _, _, fy) in metrics) + 2)
canvasH = max(g - y0_ + 1 for (y0_, g, _, _, _) in metrics) + FOOT_PAD * 2
canvasW = max(w for (_, _, _, w, _) in metrics)
foot_row = canvasH - 1 - FOOT_PAD
placed = []
for a, (sy0, sy1, h, w, _fy) in zip(frames, metrics):
    canvas = np.zeros((canvasH, canvasW, 4), dtype=a.dtype)
    dy = foot_row - sy1                       # shift so every subject's GROUND line lands on foot_row
    dx = (canvasW - w) // 2
    src_y0, src_y1 = max(0, -dy), min(h, canvasH - dy)
    dst_y0 = src_y0 + dy
    canvas[dst_y0:dst_y0 + (src_y1 - src_y0), dx:dx + w] = a[src_y0:src_y1]
    placed.append(canvas)
frames = placed
print(f'  aligned {len(frames)} cells on the subject ground line -> canvas {canvasW}x{canvasH}')

x0 = y0 = 10 ** 9; x1 = y1 = -1
for a in frames:
    ys, xs = np.nonzero(a[:, :, 3] > OPAQUE)
    if xs.size == 0: continue
    x0, x1 = min(x0, int(xs.min())), max(x1, int(xs.max()))
    y0, y1 = min(y0, int(ys.min())), max(y1, int(ys.max()))
bw, bh = x1 - x0 + 1, y1 - y0 + 1

# ── 4. PACK ───────────────────────────────────────────────────────────────────────────────────
cw, chh = spec['cellW'], spec['cellH']
pad = 0.94
scale = (chh / bh) * pad                  # height-fit, matching the clip packer's default
if int(bw * scale) > cw:
    cw = int(bw * scale) + 2
    print(f'  cellW widened to {cw} to fit the widest frame at full height')
sw, sh = max(1, int(bw * scale)), max(1, int(bh * scale))

states = spec['states']
cols_out = max(s['count'] for s in states)
sheet = Image.new('RGBA', (cw * cols_out, chh * len(states)), (0, 0, 0, 0))
for r, st in enumerate(states):
    for i in range(st['count']):
        a = frames[st['from'] - 1 + i]
        crop = Image.fromarray(a[y0:y1 + 1, x0:x1 + 1]).resize((sw, sh), Image.LANCZOS)
        sheet.paste(crop, (i * cw + (cw - sw) // 2, r * chh + (chh - sh)), crop)
sheet.save(out_png)

# ⛔ THE FOOT ANCHOR IS MEASURED, NOT ASSUMED TO BE THE CELL BOTTOM.
#
# The clip packer writes (chh-1)/chh because a veo frame's subject stands on the bottom of its own
# canvas. Here the alignment above deliberately leaves FOOT_PAD rows of cell BELOW the ground line so
# the softest fade under the rubble still fits — so the cell bottom is NOT where the building stands,
# and a renderer that assumed it was would hover the tower above its own shapes. That is precisely the
# S178 Voltkin defect ("38-43 px of empty cell BELOW the art"), and the fix is to say where the
# ground is rather than to let each renderer guess.
ground_in_cell = (chh - sh) + (foot_row - y0) * scale

# ⭐ AND THE FIRST FRAME'S FILL GOES IN THE MANIFEST, so the renderer's sprite-size constant can be
# PINNED against the shipped art by an ordinary unit test. Without it the only way to check that
# number is to decode the PNG, which the unit suite has no decoder for and CI has no toolchain for —
# so it would go unchecked, which is exactly how the Voltkin TV shipped at 61 px.
_sy, _sx = np.nonzero(frames[0][:, :, 3] > OPAQUE)
subject_fill = ((_sy.max() - _sy.min() + 1) * scale) / chh

manifest = {
    'cellW': cw, 'cellH': chh,
    'footAnchor': {'x': 0.5, 'y': round(min(1.0, (ground_in_cell + 1) / chh), 4)},
    'subjectFill': round(float(subject_fill), 4),
    'states': {st['name']: {'row': r, 'frames': st['count'],
                            'ticksPerFrame': st['ticksPerFrame']}
               for r, st in enumerate(states)},
}
json.dump(manifest, open(out_json, 'w'), indent=2)
print(f'  atlas {sheet.size[0]}x{sheet.size[1]}  cell {cw}x{chh}  bbox {bw}x{bh} -> {sw}x{sh}')
`;

const outDir = resolve(spec.outDir);
mkdirSync(outDir, { recursive: true });
const pngOut = join(outDir, `${spec.name}-atlas.png`);
const jsonOut = join(outDir, `${spec.name}-anim.json`);
const pyFile = join(tmpdir(), `spark-sheet-${spec.name}.py`);
writeFileSync(pyFile, PY);
try {
  execFileSync('python', [pyFile, JSON.stringify(spec), pngOut, jsonOut], { stdio: 'inherit' });
} catch (err) {
  // ⚠ The pixel toolchain is optional on a dev box and absent on the Pages runner. Exit 3 with the
  // install line, never a stack trace — the same contract `check-atlas-scenery.mjs` states.
  console.error('[sheet] build failed — if this is ModuleNotFoundError: pip install numpy scipy Pillow');
  process.exit(err.status === 1 ? 3 : (err.status ?? 1));
}
console.log(`✓ ${spec.name}: ${pngOut}`);
