/**
 * SPARK — S183 — **ALPHA-MATTED SHEET → ATLAS. The intake for the owner's four new tower ramps.**
 *
 * The second family of contact sheet. `build-sheet-atlas.mjs` (S182) took the lightning hub's sheet:
 * opaque RGB on a near-BLACK field, cells separated by DRAWN RULES, a frame number baked into every
 * cell. The four sheets the owner sent for the goblin tower, the laser turret, the pentagram and
 * Helga are none of those things — they are **RGBA with the cut-out already in the alpha channel,
 * no rules at all, and only one of the four carries frame numbers.**
 *
 * ## ⛔ WHY A SIBLING AND NOT A FLAG ON THE HUB'S INTAKE
 *
 * Three of that script's four hard-won behaviours invert here, not toggle:
 *
 * 1. **The grid.** It finds cells by looking for lines that are non-background along their ENTIRE
 *    length — the drawn rules. These sheets have no rules; what separates their cells is a band of
 *    FULLY TRANSPARENT pixels. The detector is the photographic negative of that one, and a flag
 *    that reversed it would leave the enclosed-pocket rule and the rule-run threshold reading a
 *    signal they were never tuned for.
 * 2. **The matte.** It KEYS a background colour. There is no background colour here; keying one
 *    would eat the art's own dark ink. What these sheets need instead is a CLEAN-UP of an alpha
 *    channel that already exists and is dirty (see below).
 * 3. **The frame number.** It requires exactly one blob in a corner box and FAILS otherwise. Three
 *    of these four sheets have no numerals at all, and the one that does writes two digits.
 *
 * ⭐ **EVERYTHING DOWNSTREAM IS THE SAME CODE DOING THE SAME THING, AND THAT IS THE POINT.** Ground-
 * line alignment on the SOLID mass, one union bbox across every frame, height-fit into the cell,
 * a MEASURED foot anchor written into the manifest, `subjectFill` for the renderer's size constant
 * to be pinned against, `<name>-atlas.png` + `<name>-anim.json`, 2 rows of 12. A sheet-sourced
 * building must not disagree with a clip-sourced one about where the ground is, and after this step
 * nothing downstream can tell which intake produced the file. `structureRampAtlas.test.ts` is
 * `describe.each(RAMP_SPECS)` and therefore asserts the same manifest contract over the hub (intake
 * A) and these four (intake B) with one body of assertions — which is the mechanical check that the
 * two intakes really did converge, rather than a sentence in this docblock claiming they did.
 *
 * ## THE THREE MEASUREMENTS THIS SCRIPT IS BUILT ON — taken S183, on all four sheets
 *
 * 1. ⛔ **THE CELLS ARE UNEVEN, SO A UNIFORM STRIDE CLIPS FRAMES.** Measured row heights:
 *    goblin 285/263/216 · laser 258/250/211 · pentagram 260/240/206 · Helga 272/240/234. A
 *    793 / 3 = 264 stride cuts the top off row 1 of the goblin sheet. So the bounds are DETECTED
 *    from transparent gutters and `grid: {cols, rows}` is an ASSERTION against that detection,
 *    never its source — exactly the contract the hub's intake states for its drawn rules.
 *
 * 2. ⛔ **THE ALPHA IS DIRTY AND SHIPPING IT RAW GIVES EVERY TOWER A TRANSLUCENT BOX.** Essentially
 *    NOTHING on these sheets is fully opaque (α = 255 covers 0.0–0.1 % of each canvas) and 15–53 %
 *    of every canvas sits at α 1–31, a ghost wash across the whole rectangle. Pasted as-is the
 *    building reads through, and the wash reads as the faint square the owner rejected on the
 *    Voltkin. So alpha is FLOORED (α ≤ 24 → 0) and CEILED (α ≥ 244 → 255), and everything between
 *    is left exactly as drawn because that is where the real soft edges and the smoke live.
 *    Measured on the goblin sheet after the fix: 64.6 % at exactly 0, 23.7 % at exactly 255, 9.7 %
 *    genuinely mid-range. Before it: 3 % and 0 %.
 *
 * 3. ⭐ **HORIZONTAL ALIGNMENT IS ON THE FOOTPRINT, NOT ON THE CELL CENTRE, AND THAT IS A CHANGE
 *    FROM THE HUB'S INTAKE WITH A MEASUREMENT BEHIND IT.** The hub centres each frame on its CELL,
 *    with the stated reason *"the artist centred the tower in its cell; centring the SUBJECT bbox
 *    instead would let a smoke plume drifting right pull the tower left"*. That reason depends on
 *    the cell being DRAWN. Here the cell edge is wherever the alpha happens to end — so a smoke
 *    plume moves the cell, and centring on it moves the tower. MEASURED, as the drift between a
 *    cell-centred and a footprint-centred placement across the 24 frames: goblin 5.1 px, pentagram
 *    12.4 px, Helga 16.5 px, **laser 24.5 px** — about 10 px on screen at the shipped sprite size,
 *    i.e. the building visibly sliding sideways as it burns. Aligning on the footprint (the solid
 *    mass in the bottom 15 % of the subject) is the horizontal twin of the ground-line rule the hub
 *    intake already applies vertically, and it is drift-free by construction. Both numbers are
 *    PRINTED on every build so the next sheet is judged rather than assumed; `hAlign: "cell"`
 *    restores the hub's behaviour for a sheet that turns out to want it.
 *
 * ## THE FRAME NUMBER, WHEN THERE IS ONE
 *
 * Only the pentagram sheet has them. Its numerals are DARK INK in a small top-left box — measured
 * across all 24 cells, every label pixel lies within 20 rows and 23 columns of the corner, while the
 * nearest artwork starts at column 35. So the erase box is 26 × 30 and the guard is not "exactly one
 * blob" (which the hub's numerals happened to satisfy and a two-digit "24" does not) but: every blob
 * inside the box must be DARK and must clear the box's right and bottom edges by `labelMarginPx`.
 * A sheet whose art reaches into that corner, or whose numerals are drawn in colour, FAILS here
 * instead of silently losing a corner of the drawing.
 *
 * Usage:  node scripts/build-alpha-sheet-atlas.mjs <spec.json>
 * Exit 0 = built · 2 = bad usage · 3 = the Python toolchain is missing (pip install numpy scipy Pillow)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const specPath = process.argv[2];
if (specPath === undefined) {
  console.error('usage: node scripts/build-alpha-sheet-atlas.mjs <spec.json>');
  process.exit(2);
}
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
if (!existsSync(resolve(spec.source))) {
  console.error(`[alpha-sheet] source missing: ${spec.source}`);
  process.exit(2);
}

const PY = String.raw`
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage

spec = json.loads(sys.argv[1]); out_png, out_json = sys.argv[2], sys.argv[3]
src = np.array(Image.open(spec['source']).convert('RGBA'))
H, W = src.shape[0], src.shape[1]

# ── 0. CLEAN THE ALPHA ────────────────────────────────────────────────────────────────────────
# See measurement 2 in the file docblock. Done ONCE over the whole sheet, before anything reads it,
# so the gutter detector, the label guard, the ground line and the bbox all agree about what is
# background. Doing it per-cell would let the detector see a different sheet from the packer.
FLOOR = int(spec.get('alphaFloor', 24))
CEIL = int(spec.get('alphaCeil', 244))
raw = src[:, :, 3].astype(np.int32)
alpha = np.where(raw <= FLOOR, 0, np.where(raw >= CEIL, 255, raw))
src = np.dstack([src[:, :, :3], alpha.astype(np.uint8)])
print('  alpha cleaned: %.1f%% at 0, %.1f%% at 255, %.1f%% mid (was %.1f%% / %.1f%%)' % (
    100.0 * (alpha == 0).mean(), 100.0 * (alpha == 255).mean(),
    100.0 * ((alpha > 0) & (alpha < 255)).mean(),
    100.0 * (raw == 0).mean(), 100.0 * (raw == 255).mean()))

# ── 1. DETECT THE GRID FROM TRANSPARENT GUTTERS ───────────────────────────────────────────────
# A gutter is a column (or row) that is clear along its ENTIRE length. GUTTER_ALPHA is deliberately
# well above 0: these sheets carry a 1-31 haze everywhere, so a strict == 0 test finds no gutters at
# all on the laser sheet. MEASURED: at 32 the laser sheet loses a row gutter; at 48 all four sheets
# give exactly 7 column gutters and 2 row gutters. It is safe against smoke because the test is
# "clear across the WHOLE axis" — a plume only has to be non-clear ONCE to defend its column.
GUTTER = int(spec.get('gutterAlpha', 48))
clear = alpha <= GUTTER

def runs(mask):
    out, s = [], None
    for i, v in enumerate(mask):
        if v and s is None: s = i
        elif not v and s is not None: out.append((s, i - 1)); s = None
    if s is not None: out.append((s, len(mask) - 1))
    return out

def spans(gutters, total):
    # The art bands BETWEEN the gutters. Leading and trailing gutters (these sheets have a clear
    # border) produce no band, which is why this skips empties — the rule-based sibling cannot,
    # because a drawn rule never sits at the sheet edge.
    out, prev = [], 0
    for (s, e) in gutters:
        if s > prev: out.append((prev, s))
        prev = e + 1
    if prev < total: out.append((prev, total))
    return out

col_spans = spans(runs(clear.all(axis=0)), W)
row_spans = spans(runs(clear.all(axis=1)), H)
want_c, want_r = spec['grid']['cols'], spec['grid']['rows']
if len(col_spans) != want_c or len(row_spans) != want_r:
    raise SystemExit(
        f"[alpha-sheet] grid mismatch: detected {len(col_spans)}x{len(row_spans)} cells, "
        f"spec declares {want_c}x{want_r}. The transparent gutters in this sheet are not where "
        f"the spec says — look at the sheet before touching gutterAlpha.")
print(f'  grid: {want_c}x{want_r}  col widths {[b - a for a, b in col_spans]}'
      f'  row heights {[b - a for a, b in row_spans]}')

# ── 2. THE BAKED FRAME NUMBER, WHEN THE SPEC SAYS THERE IS ONE ────────────────────────────────
LBL_H = int(spec.get('labelBoxH', 26))
LBL_W = int(spec.get('labelBoxW', 30))
LBL_MARGIN = int(spec.get('labelMarginPx', 4))
LBL_DARK = int(spec.get('labelMaxChannel', 90))

def strip_label(cell, idx):
    a = cell[:, :, 3].astype(np.int32)
    box = a[:LBL_H, :LBL_W] > 0
    lab, n = ndimage.label(box, structure=np.ones((3, 3)))
    if n == 0:
        raise SystemExit(
            f'[alpha-sheet] frame {idx}: stripCornerLabel is on but the {LBL_H}x{LBL_W} corner box '
            f'is empty. This sheet does not label its frames.')
    for j in range(1, n + 1):
        ys, xs = np.nonzero(lab == j)
        margin = min(LBL_H - 1 - int(ys.max()), LBL_W - 1 - int(xs.max()))
        if margin < LBL_MARGIN:
            raise SystemExit(
                f'[alpha-sheet] frame {idx}: a blob in the corner box touches its edge '
                f'(margin {margin}px). The numeral is larger than the box, or the artwork reaches '
                f'into the corner. Look at the cell before widening labelBoxH/labelBoxW.')
        rgb = cell[:LBL_H, :LBL_W, :3][lab == j].astype(np.float64).mean(axis=0)
        if rgb.max() > LBL_DARK:
            raise SystemExit(
                f'[alpha-sheet] frame {idx}: a blob in the corner box is not dark ink '
                f'(mean rgb {tuple(int(v) for v in rgb)}). That is artwork, not a frame number.')
    grow = ndimage.binary_dilation(box, np.ones((3, 3)), iterations=2)
    a[:LBL_H, :LBL_W] = np.where(grow, 0, a[:LBL_H, :LBL_W])
    return np.dstack([cell[:, :, :3], a.astype(np.uint8)]), int(box.sum())

frames, label_px = [], 0
idx = 0
for (y0, y1) in row_spans:
    for (x0, x1) in col_spans:
        idx += 1
        cell = src[y0:y1, x0:x1].copy()
        if spec.get('stripCornerLabel', False):
            cell, lp = strip_label(cell, idx)
            label_px += lp
        frames.append(cell)
print(f'  sliced {len(frames)} cells' + (f', erased {label_px}px of frame numbers' if label_px else ''))

# ── 3. ALIGN EVERY CELL ON ITS SUBJECT'S GROUND LINE ──────────────────────────────────────────
#
# ⛔⛔ VERBATIM THE HUB INTAKE'S RULE AND FOR VERBATIM ITS REASON: the cell bottom is NOT the ground
# line, so bottom-aligning the CELLS makes the ramp HOP as the rubble's skirt changes depth. Each
# cell is placed by its own SUBJECT BOTTOM, measured on the SOLID mass (alpha > GROUND) rather than
# on the last faint pixel, because the soft fade under a rubble skirt is not the same depth on every
# frame and aligning on it scatters the mass.
#
# ⭐ HORIZONTALLY THIS DIVERGES, WITH THE MEASUREMENT IN THE FILE DOCBLOCK: the footprint, not the
# cell centre, because here the cell edge is drawn by the smoke.
OPAQUE = int(spec.get('bboxAlphaFloor', 24))
GROUND = int(spec.get('groundAlphaFloor', 128))
FOOT_BAND = float(spec.get('footBandFrac', 0.15))
H_ALIGN = spec.get('hAlign', 'foot')

metrics, drift = [], []
for a in frames:
    al = a[:, :, 3].astype(np.int32)
    ys, xs = np.nonzero(al > OPAQUE)
    if ys.size == 0:
        raise SystemExit('[alpha-sheet] a cell is empty after the alpha clean — check alphaFloor')
    sy, sx = np.nonzero(al > GROUND)
    if sy.size == 0:
        raise SystemExit('[alpha-sheet] a cell has no SOLID mass — check alphaCeil / groundAlphaFloor')
    ground = int(sy.max())
    band = ground - int(FOOT_BAND * (ground - int(sy.min())))
    sel = sy >= band
    foot_cx = float(sx[sel].mean()) if sel.any() else float(sx.mean())
    cell_cx = a.shape[1] / 2.0
    drift.append(cell_cx - foot_cx)
    metrics.append((int(ys.min()), ground, a.shape[0], a.shape[1], int(ys.max()), foot_cx, cell_cx))
print('  h-align: %s  (footprint-vs-cell-centre drift across the sheet: %.1f px)'
      % (H_ALIGN, max(drift) - min(drift)))

# Deep enough that the softest fade below the solid mass still lands on the canvas.
FOOT_PAD = max(4, max(fy - g for (_, g, _, _, fy, _, _) in metrics) + 2)
canvasH = max(g - y0_ + 1 for (y0_, g, _, _, _, _, _) in metrics) + FOOT_PAD * 2
canvasW = max(w for (_, _, _, w, _, _, _) in metrics) + 2 * int(max(abs(d) for d in drift) + 2)
foot_row = canvasH - 1 - FOOT_PAD
anchor_x = canvasW / 2.0
placed = []
for a, (sy0, sy1, h, w, _fy, fcx, ccx) in zip(frames, metrics):
    canvas = np.zeros((canvasH, canvasW, 4), dtype=a.dtype)
    dy = foot_row - sy1                                  # ground line onto foot_row
    dx = int(round(anchor_x - (fcx if H_ALIGN == 'foot' else ccx)))
    src_y0, src_y1 = max(0, -dy), min(h, canvasH - dy)
    src_x0, src_x1 = max(0, -dx), min(w, canvasW - dx)
    dst_y0, dst_x0 = src_y0 + dy, src_x0 + dx
    canvas[dst_y0:dst_y0 + (src_y1 - src_y0), dst_x0:dst_x0 + (src_x1 - src_x0)] = \
        a[src_y0:src_y1, src_x0:src_x1]
    placed.append(canvas)
frames = placed
print(f'  aligned {len(frames)} cells on the subject ground line -> canvas {canvasW}x{canvasH}')

# ── 4. ONE UNION BBOX ACROSS EVERY FRAME — the anti-jitter guarantee, as the clip packer states it.
x0 = y0 = 10 ** 9; x1 = y1 = -1
for a in frames:
    ys, xs = np.nonzero(a[:, :, 3] > OPAQUE)
    if xs.size == 0: continue
    x0, x1 = min(x0, int(xs.min())), max(x1, int(xs.max()))
    y0, y1 = min(y0, int(ys.min())), max(y1, int(ys.max()))
bw, bh = x1 - x0 + 1, y1 - y0 + 1

# ── 5. PACK ───────────────────────────────────────────────────────────────────────────────────
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

# ⛔ THE FOOT ANCHOR IS MEASURED, NOT ASSUMED TO BE THE CELL BOTTOM — the S178 Voltkin defect.
ground_in_cell = (chh - sh) + (foot_row - y0) * scale

# ⭐ AND THE FIRST FRAME'S FILL GOES IN THE MANIFEST, so the renderer's sprite-size constant can be
# PINNED against the shipped art by an ordinary unit test that owns no PNG decoder.
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
print(f'  atlas {sheet.size[0]}x{sheet.size[1]}  cell {cw}x{chh}  bbox {bw}x{bh} -> {sw}x{sh}'
      f'  subjectFill {manifest["subjectFill"]}  footAnchor.y {manifest["footAnchor"]["y"]}')
`;

const outDir = resolve(spec.outDir);
mkdirSync(outDir, { recursive: true });
const pngOut = join(outDir, `${spec.name}-atlas.png`);
const jsonOut = join(outDir, `${spec.name}-anim.json`);
const pyFile = join(tmpdir(), `spark-alpha-sheet-${spec.name}.py`);
writeFileSync(pyFile, PY);
try {
  execFileSync('python', [pyFile, JSON.stringify(spec), pngOut, jsonOut], { stdio: 'inherit' });
} catch (err) {
  // ⚠ The pixel toolchain is optional on a dev box and absent on the Pages runner. Exit 3 with the
  // install line, never a stack trace — the same contract `build-sheet-atlas.mjs` states.
  console.error('[alpha-sheet] build failed — if this is ModuleNotFoundError: pip install numpy scipy Pillow');
  process.exit(err.status === 1 ? 3 : (err.status ?? 1));
}
console.log(`✓ ${spec.name}: ${pngOut}`);
