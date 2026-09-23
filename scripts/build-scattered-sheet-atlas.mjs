/**
 * SPARK — S188 — **SCATTERED SHEET(S) → ATLAS.** The intake for the owner's already-matted contact
 * sheets whose frames do NOT sit on a clean grid: the elite piranha's swim / attack / death sheets and
 * the zombie boss's CORPSE EATER sheets.
 *
 * ## ⛔ WHY A THIRD SIBLING (`build-sheet-atlas.mjs` = drawn rules, `build-alpha-sheet-atlas.mjs` =
 * transparent gutters), MEASURED S188 RATHER THAN ASSUMED
 *
 * · **No gutters.** Adjacent frames' fins touch, so the gutter detector finds 5 columns on the 8-column
 *   swim sheet and 4–9 per row on the death sheet. Slicing on gutters would weld frames together.
 * · **No uniform pitch on the piranha sheets.** Body left edges drift 18 → 66 px across a row
 *   (absolute pitch 227–290 px), so a uniform stride cuts fins off and hands them to the neighbour.
 * · **Several sources, one atlas.** The piranha's states come from three different sheets.
 *
 * ## WHAT IT DOES
 *
 * 1. Cleans the alpha (floor/ceil, exactly the alpha-sheet intake's rule and defaults).
 * 2. Finds the row bands (full-width transparent gutters — those DO exist on every sheet measured).
 * 3. Assigns every connected component to a FRAME:
 *    · `assign: "uniform"` — the component's centroid picks a uniform `cols` cell (the zombie sheets,
 *      whose pitch measures 192 px ± 3);
 *    · `assign: "nearest-body"` — per row, the big bodies fix a fitted frame pitch, and every
 *      component (fins, bubbles, spray) goes to the nearest fitted frame centre.
 * 4. Aligns each frame: `align: "centroid"` (a swimmer has no ground — alpha-weighted centroid, both
 *    axes) or `align: "ground"` (lowest SOLID pixel onto one ground row, cell centre horizontally —
 *    the artist's own framing, as the hub intake argues).
 * 5. ONE scale for every frame of every source — so no state can change the creature's size — chosen
 *    so the reference frames' median BODY height equals `fitBodyHeightPx`: the same largest-component
 *    height `check-atlas-scenery.mjs` measures, so the new sheet is sized the way the guard will judge it.
 * 6. Packs 12-per-row (or whatever the state lists), writes `<name>-atlas.png` + `<name>-anim.json`.
 *
 * ⚠ FRAME INDICES IN THE SPEC ARE 1-BASED READING ORDER, the numbering the owner's prompts use.
 *
 * Usage:  node scripts/build-scattered-sheet-atlas.mjs <spec.json>
 * Exit 0 = built · 2 = bad usage · 3 = the Python toolchain is missing (pip install numpy scipy Pillow)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const specPath = process.argv[2];
if (specPath === undefined) {
  console.error('usage: node scripts/build-scattered-sheet-atlas.mjs <spec.json>');
  process.exit(2);
}
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
for (const s of spec.sources) {
  if (!existsSync(resolve(s.path))) {
    console.error(`[scattered] source missing: ${s.path}`);
    process.exit(2);
  }
}

const PY = String.raw`
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage

spec = json.loads(sys.argv[1]); out_png, out_json = sys.argv[2], sys.argv[3]
FLOOR = int(spec.get('alphaFloor', 24)); CEIL = int(spec.get('alphaCeil', 244))
OPAQUE = 40            # the guard's body threshold (check-atlas-scenery.mjs)
SOLID = 128            # the ground line is measured on SOLID mass, never on the last faint pixel

def runs(mask):
    out, s = [], None
    for i, v in enumerate(mask):
        if v and s is None: s = i
        elif not v and s is not None: out.append((s, i - 1)); s = None
    if s is not None: out.append((s, len(mask) - 1))
    return out

def spans(g, total):
    out, prev = [], 0
    for (s, e) in g:
        if s > prev: out.append((prev, s))
        prev = e + 1
    if prev < total: out.append((prev, total))
    return out

def body_height(rgba):
    m = rgba[:, :, 3] > OPAQUE
    lab, n = ndimage.label(m)
    if n == 0: return 0
    sz = ndimage.sum(m, lab, index=np.arange(1, n + 1))
    ys, _ = np.nonzero(lab == int(np.argmax(sz)) + 1)
    return int(ys.max() - ys.min() + 1)

frames_by_source = {}
for src in spec['sources']:
    a = np.array(Image.open(src['path']).convert('RGBA'))
    raw = a[:, :, 3].astype(np.int32)
    al = np.where(raw <= FLOOR, 0, np.where(raw >= CEIL, 255, raw)).astype(np.uint8)
    a = np.dstack([a[:, :, :3], al])
    H, W = al.shape
    cols, rows = src['grid']['cols'], src['grid']['rows']
    bands = spans(runs((al == 0).all(axis=1)), H)
    if len(bands) != rows:
        raise SystemExit(f"[scattered] {src['id']}: {len(bands)} row bands, spec says {rows}")
    lab, n = ndimage.label(al > 0, structure=np.ones((3, 3)))
    idx = np.arange(1, n + 1)
    area = ndimage.sum(al > 0, lab, index=idx)
    com = ndimage.center_of_mass(al > 0, lab, index=idx)
    # Which band each component belongs to, by centroid.
    def band_of(cy):
        for r, (y0, y1) in enumerate(bands):
            if y0 <= cy < y1: return r
        return int(np.argmin([abs(cy - (y0 + y1) / 2) for (y0, y1) in bands]))
    comp_band = [band_of(c[0]) for c in com]
    assign = {}   # component label -> frame index (0-based reading order)
    if src.get('assign', 'uniform') == 'uniform':
        cw = W / cols
        for i, (cy, cx) in enumerate(com):
            assign[i + 1] = comp_band[i] * cols + min(cols - 1, int(cx // cw))
    else:
        # nearest-body: the big bodies fix each row's pitch.
        ref = np.median(sorted(area, reverse=True)[:cols])
        big = [i for i in range(n) if area[i] >= 0.2 * ref]
        fits = []
        for r in range(rows):
            xs = sorted(com[i][1] for i in big if comp_band[i] == r)
            fits.append(xs)
        full = [xs for xs in fits if len(xs) == cols]
        if not full:
            raise SystemExit(f"[scattered] {src['id']}: no row shows all {cols} bodies — cannot fit the pitch")
        pitch = float(np.median([np.polyfit(np.arange(cols), xs, 1)[0] for xs in full]))
        for r in range(rows):
            xs = fits[r]
            if len(xs) == cols:
                b, c0 = np.polyfit(np.arange(cols), xs, 1)
                centres = [c0 + b * k for k in range(cols)]
            else:
                # A row whose later frames have dispersed (the death sheet): its visible bodies are its
                # FIRST frames, so they fix the intercept and the other rows lend the pitch.
                if len(xs) == 0:
                    raise SystemExit(f"[scattered] {src['id']}: row {r} has no body to anchor it")
                c0 = float(np.median([x - pitch * k for k, x in enumerate(xs)]))
                centres = [c0 + pitch * k for k in range(cols)]
            for i in range(n):
                if comp_band[i] != r: continue
                k = int(np.argmin([abs(com[i][1] - c) for c in centres]))
                assign[i + 1] = r * cols + k
        print(f"  {src['id']}: nearest-body, pitch {pitch:.1f}px, {len(big)} bodies")
    frames = []
    for f in range(cols * rows):
        labels = [l for l, k in assign.items() if k == f]
        mask = np.isin(lab, labels)
        ys, xs = np.nonzero(mask)
        if ys.size == 0:
            raise SystemExit(f"[scattered] {src['id']}: frame {f + 1} is empty")
        img = np.where(mask[:, :, None], a, 0).astype(np.uint8)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crop = img[y0:y1, x0:x1]
        w8 = crop[:, :, 3].astype(np.float64)
        if spec['align'] == 'centroid':
            yy, xx = np.mgrid[0:crop.shape[0], 0:crop.shape[1]]
            ax = float((xx * w8).sum() / w8.sum()); ay = float((yy * w8).sum() / w8.sum())
        else:
            sy, _ = np.nonzero(crop[:, :, 3] > SOLID)
            ay = float(sy.max())                       # ground line, crop coords
            r = f // cols
            ax = (W / cols) * (f % cols + 0.5) - x0    # the artist's cell centre, crop coords
        frames.append((crop, ax, ay))
    frames_by_source[src['id']] = frames
    print(f"  {src['id']}: {len(frames)} frames from {src['path']}")

# ── ONE scale, from the reference frames' median body height ─────────────────────────────────────
refs = [frames_by_source[r['source']][i - 1] for r in spec['fitReference'] for i in r['frames']]
med = float(np.median([body_height(fr[0]) for fr in refs]))
scale = spec['fitBodyHeightPx'] / med
print(f"  scale {scale:.4f}  (reference median body {med:.0f}px -> {spec['fitBodyHeightPx']}px)")

used = [(st, frames_by_source[st['source']][i - 1]) for st in spec['states'] for i in st['frames']]
# Extents about the alignment point, in SOURCE px, over every frame that ships.
left = max(ax for _, (c, ax, ay) in used); right = max(c.shape[1] - ax for _, (c, ax, ay) in used)
up = max(ay for _, (c, ax, ay) in used); down = max(c.shape[0] - ay for _, (c, ax, ay) in used)
chh = int(spec['cellH'])
if spec['align'] == 'centroid':
    # Alignment point at the horizontal centre; the union's lowest pixel sits on the bottom row.
    cw = max(int(spec.get('cellW', chh)), int(np.ceil(2 * max(left, right) * scale)) + 4)
    ground_row = chh - 2
    anchor_y = ground_row - down * scale       # where the alignment point lands
    foot = (ground_row + 1) / chh
    if anchor_y - up * scale < 0:
        raise SystemExit(f"[scattered] union is {(up + down) * scale:.0f}px tall, cellH {chh} too small")
else:
    cw = int(spec['cellW'])
    foot = float(spec['footAnchorY'])
    anchor_y = foot * chh - 1                  # the ground line lands on the anchor row
    if anchor_y - up * scale < 0 or max(left, right) * scale > cw / 2:
        raise SystemExit(f"[scattered] a frame overflows the {cw}x{chh} cell at scale {scale:.3f}")
cols_out = max(len(st['frames']) for st in spec['states'])
sheet = Image.new('RGBA', (cw * cols_out, chh * len(spec['states'])), (0, 0, 0, 0))
for r, st in enumerate(spec['states']):
    for k, i in enumerate(st['frames']):
        crop, ax, ay = frames_by_source[st['source']][i - 1]
        im = Image.fromarray(crop).resize(
            (max(1, round(crop.shape[1] * scale)), max(1, round(crop.shape[0] * scale))), Image.LANCZOS)
        px = k * cw + round(cw / 2 - ax * scale)
        py = r * chh + round(anchor_y - ay * scale)
        sheet.alpha_composite(im, (px, py))
sheet.save(out_png, optimize=True)
manifest = {
    'cellW': cw, 'cellH': chh,
    'footAnchor': {'x': 0.5, 'y': round(foot, 4)},
    'states': {st['name']: {'row': r, 'frames': len(st['frames']), 'ticksPerFrame': st['ticksPerFrame']}
               for r, st in enumerate(spec['states'])},
}
json.dump(manifest, open(out_json, 'w'), indent=2)
print(f"  atlas {sheet.size[0]}x{sheet.size[1]}  cell {cw}x{chh}  footAnchor.y {manifest['footAnchor']['y']}")
`;

const outDir = resolve(spec.outDir);
mkdirSync(outDir, { recursive: true });
const pngOut = join(outDir, `${spec.name}-atlas.png`);
const jsonOut = join(outDir, `${spec.name}-anim.json`);
const pyFile = join(tmpdir(), `spark-scattered-${spec.name}.py`);
writeFileSync(pyFile, PY);
try {
  execFileSync('python', [pyFile, JSON.stringify(spec), pngOut, jsonOut], { stdio: 'inherit' });
} catch (err) {
  console.error('[scattered] build failed — if this is ModuleNotFoundError: pip install numpy scipy Pillow');
  process.exit(err.status === 1 ? 3 : (err.status ?? 1));
}
console.log(`✓ ${spec.name}: ${pngOut}`);
