/**
 * SPARK — S188 — **LIGHT-ON-BLACK SHEET → ATLAS. The intake for the owner's Ra sky-strike sheet.**
 *
 * Owner, on the code beam this replaces: *"it doesn't look good the way you did it with code and just
 * like an instantaneous fast beam of light, you can't even see it, it's super fast … it needs to be
 * more gnarly"* — and then he generated `assets-source/ra-strike/ra-strike-sheet-v1.png` himself.
 *
 * ## ⛔ WHY A THIRD SIBLING AND NOT A FLAG ON `build-sheet-atlas.mjs`
 *
 * That intake (the lightning hub, S182) and `build-alpha-sheet-atlas.mjs` (S183) both make a
 * BUILDING: something standing on a ground line, which is why both align every cell on the bottom of
 * its SOLID mass. This sheet is an EVENT that happens AT A POINT, and four of the hub intake's rules
 * are wrong for it:
 *
 * 1. **The grid has no drawn rules.** The cells are separated by 2-px black GUTTERS (measured at
 *    x = 207-208, 419-420, 631-632, 843-844, 1055-1056 and y = 193-211, 423-424, 635-637), not by
 *    the full-length rules the hub detector looks for. So cells are found as the spans BETWEEN runs
 *    of near-black lines — the photographic negative of the hub rule — and `grid` is an ASSERTION
 *    against that, never the source. A uniform 1264/6 stride would cut every cell ~1-3 px off.
 * 2. ⛔ **THE ANCHOR IS THE IMPACT POINT, NOT THE SUBJECT BOTTOM.** Aligning on the lowest solid pixel
 *    would put a falling beam's TIP on the ground (frames 5-6) and a mushroom cloud's lowest crack on
 *    it (frames 17-24), so the strike would hop by up to ~30 px between frames. The artist also did not
 *    keep one ground line: MEASURED, the ring centre sits at y = 149 in source row 1, 163 in row 2,
 *    and the crater / crack origin at 172 in rows 3 and 4 (cell-relative). So `groundY` declares the
 *    impact line per SOURCE ROW, and the builder GUARDS it wherever a clean ring makes it measurable
 *    (`groundGuard`): the ring's horizontal extremes lie on its centre line, and the build FAILS if
 *    they are more than `tolPx` off the declared line. Horizontally every frame is centred on its CELL
 *    (measured beam centres sit within 2.2 px of it on every beam frame).
 * 3. ⛔ **SOME CELLS CARRY A LIT RECTANGLE, AND IT MUST NOT SHIP.** Frames 10-16 were drawn on a warm
 *    ground wash (sum-of-RGB 20-220 at the cell edges, rising toward the impact) that stops dead at the
 *    cell border — on the board it would read as a glowing box. It is removed in two steps:
 *      · the wash is estimated from the cell's own LEFT and RIGHT edge columns (a low-percentile
 *        filter along y, so an explosion that grazes the edge does not count as wash) and subtracted,
 *        interpolated linearly across the cell — the top of every cell is black sky, so nothing is
 *        estimated there (the beam enters through it and is ART);
 *      · alpha is feathered to zero over `featherPx` at the left, right and bottom edges, so whatever
 *        wash survives the subtraction (it is brighter in the middle than at the edges) fades out
 *        before the rectangle can show. The TOP edge is not feathered: the beam is cut by it, and the
 *        renderer continues the beam upward from there (`beamTop`).
 * 4. ⭐ **ALPHA IS LIGHT, NOT A KEYED CUT-OUT.** A beam, a flash, fire and embers on black are LIGHT,
 *    and the hub's binary key would turn their soft falloff into an opaque brown rim. So alpha is the
 *    pixel's own brightness (`max(R,G,B) / alphaFullAt`, clamped) and the colour is un-premultiplied
 *    against black — the classic additive-to-alpha conversion. The ONE exception is enclosed dark ink
 *    (rock outlines, the gaps between rubble): a dim component that neither touches the border nor is
 *    large (`enclosedBgLimitPct`) stays opaque, exactly the area rule the hub intake uses for pockets.
 *
 * ⭐ **THE DOWNSTREAM CONTRACT IS THE SAME PAIR**, `<name>-atlas.png` + `<name>-anim.json`, rows of 12,
 * `cellW` / `cellH` / `footAnchor` / `subjectFill` / `states{row, frames}`. What this manifest adds is
 * what an EVENT needs and a building does not: `sourceFrames` (which sheet frame each slot holds, so a
 * dropped frame is on the record), `frameTicks` + `impactFrame` (the timeline, pinned by a unit test
 * against the renderer's constant), `beamTop` (per slot, where the source cell's top edge cut the
 * beam, or null) and `blastWidthPx` (the widest blast footprint, which the renderer sizes to the
 * column's REAL damage radius). There is no per-state `ticksPerFrame`: a strike is a timeline hung on
 * an impact tick, not a loop at one cadence.
 *
 * Usage:  node scripts/build-light-sheet-atlas.mjs <spec.json>
 * Exit 0 = built · 2 = bad usage / a guard failed · 3 = the Python toolchain is missing
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const specPath = process.argv[2];
if (specPath === undefined) {
  console.error('usage: node scripts/build-light-sheet-atlas.mjs <spec.json>');
  process.exit(2);
}
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
if (!existsSync(resolve(spec.source))) {
  console.error(`[light-sheet] source missing: ${spec.source}`);
  process.exit(2);
}

const PY = String.raw`
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage

def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(2)

spec = json.loads(sys.argv[1]); out_png, out_json = sys.argv[2], sys.argv[3]
src = np.array(Image.open(spec['source']).convert('RGB')).astype(np.float64)
H, W = src.shape[0], src.shape[1]
lum = src.sum(axis=2)

# ── 1. DETECT THE GRID FROM THE BLACK GUTTERS ────────────────────────────────────────────────────
GUT = float(spec.get('gutterMaxSum', 40))
def dark_runs(profile_max):
    runs, s = [], None
    for i, v in enumerate(profile_max):
        if v <= GUT and s is None: s = i
        elif v > GUT and s is not None: runs.append((s, i - 1)); s = None
    if s is not None: runs.append((s, len(profile_max) - 1))
    return runs
def spans(runs, total):
    out, prev = [], 0
    for (s, e) in runs:
        if s > prev: out.append((prev, s))
        prev = e + 1
    if prev < total: out.append((prev, total))
    return out
col_spans = spans(dark_runs(lum.max(axis=0)), W)
row_spans = spans(dark_runs(lum.max(axis=1)), H)
want_c, want_r = spec['grid']['cols'], spec['grid']['rows']
if len(col_spans) != want_c or len(row_spans) != want_r:
    fail(f"[light-sheet] grid mismatch: detected {len(col_spans)}x{len(row_spans)} cells, spec declares "
         f"{want_c}x{want_r}. col spans {col_spans} row spans {row_spans}")
print(f'  grid: {want_c}x{want_r}  col widths {[b - a for a, b in col_spans]}  row heights {[b - a for a, b in row_spans]}')
print(f'  cell origins x {[a for a, _ in col_spans]}  y {[a for a, _ in row_spans]}')

ground = spec['groundY']
if len(ground) != want_r: fail('[light-sheet] groundY needs one entry per source row')

# ── 2. WASH OUT, THEN LIGHT TO ALPHA ─────────────────────────────────────────────────────────────
PCT = float(spec.get('washPercentile', 25)); WIN = int(spec.get('washWindowPx', 61))
INSET = int(spec.get('washEdgeInsetPx', 2))
AF = float(spec.get('alphaFullAt', 128))
DIM = float(spec.get('inkDimMax', 60))
ENCL = float(spec.get('enclosedBgLimitPct', 0.015))
FEATHER = int(spec.get('featherPx', 8))
FLOOR = float(spec.get('alphaFloor', 0.03))

HUE_LO = float(spec.get('keepHueFromMax', 150)); HUE_HI = float(spec.get('keepHueFullMax', 230))
POOL_MAX = float(spec.get('poolAlphaMax', 0.55)); POOL_KEEP = float(spec.get('poolKeep', 0.45))
POOL_RX = float(spec.get('poolRx', 0.46)); POOL_UP = float(spec.get('poolUp', 0.40)); POOL_DN = float(spec.get('poolDown', 0.30))
WASH_ROW_FULL = float(spec.get('washRowFullAt', 12))

def edge_profile(col):
    return np.stack([ndimage.percentile_filter(col[:, ch], PCT, size=WIN, mode='nearest') for ch in range(3)], axis=1)

def process(c, ax, ay):
    ch, cw = c.shape[0], c.shape[1]
    Lp = edge_profile(c[:, INSET]); Rp = edge_profile(c[:, cw - 1 - INSET])
    u = (np.arange(cw) / max(1, cw - 1))[None, :, None]
    wash = (1 - u) * Lp[:, None, :] + u * Rp[:, None, :]
    lit = np.clip(c - wash, 0, 255)
    m = lit.max(axis=2)
    m_obs = c.max(axis=2)
    alpha = np.clip(m / AF, 0, 1)
    # Enclosed dark INK stays opaque: a dim component that does not touch the border, is not large,
    # and is THIN — nothing survives two erosions. A dim BLOB (the dark ground inside the landing ring,
    # split in two by the fire in frame 7) is background showing through, not ink, and shipping it
    # opaque drew a black hole under the beam.
    dim = m <= DIM
    lab, k = ndimage.label(dim, structure=np.ones((3, 3)))
    ink = np.zeros_like(dim)
    if k:
        border = set(np.unique(np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]]))); border.discard(0)
        sizes = ndimage.sum(dim, lab, index=np.arange(1, k + 1))
        cores = set(np.unique(lab[ndimage.binary_erosion(dim, np.ones((3, 3)), iterations=2)])); cores.discard(0)
        limit = ENCL * ch * cw
        keep = [i for i, sz in enumerate(sizes, 1) if i not in border and i not in cores and sz <= limit]
        if keep: ink = np.isin(lab, keep)
    rgb = np.where(alpha[..., None] > 0, lit / np.maximum(alpha[..., None], 1e-6), 0)
    # ⚠ HUE: subtracting a WARM wash from a white-hot core leaves it BLUE. Bright pixels keep their
    # observed colour; the subtraction only decides their alpha (and the dim halo's colour).
    t = np.clip((m_obs - HUE_LO) / max(1.0, HUE_HI - HUE_LO), 0, 1)[..., None]
    rgb = (1 - t) * rgb + t * c
    rgb = np.where(ink[..., None], lit, rgb)
    alpha = np.where(ink, 1.0, alpha)
    # ⭐ THE POOL: the wash is brighter in the middle than at the edges, so the subtraction above leaves
    # a translucent SLAB (measured alpha 60-95/255 across the lower cell of frames 10-16). In the rows
    # where the cell edges are lit, every LOW-alpha pixel is attenuated toward an ellipse around the
    # impact point, so the slab becomes a soft pool of ground-light that dies out well inside the cell.
    # Art (alpha >= poolAlphaMax) is untouched; the weight ramps so there is no step between the two.
    edge_level = np.maximum(Lp.max(axis=1), Rp.max(axis=1))
    # Monotone DOWNWARD: the wash is lit ground, so once it starts it runs to the cell bottom. MEASURED
    # on frame 10: its edge columns go dark ~15 rows above the bottom while the interior stays lit, and
    # a per-row weight switched the pool off there and left a hard horizontal line of alpha ~24.
    wr = np.maximum.accumulate(np.clip(edge_level / WASH_ROW_FULL, 0, 1))[:, None]
    yy, xx = np.mgrid[0:ch, 0:cw]
    dx = (xx - ax) / (POOL_RX * cw)
    dy = np.where(yy < ay, (yy - ay) / (POOL_UP * ch), (yy - ay) / (POOL_DN * ch))
    pool = np.clip(1 - (dx * dx + dy * dy), 0, 1)
    s = np.clip((POOL_MAX - alpha) / (POOL_MAX * 0.5), 0, 1)
    atten = 1 - wr * s * (1 - pool * POOL_KEEP)
    alpha = np.where(ink, alpha, alpha * atten)
    # Feather left / right / bottom — never the top, which the beam enters through.
    yy, xx = np.mgrid[0:ch, 0:cw]
    d = np.minimum(np.minimum(xx, cw - 1 - xx), ch - 1 - yy).astype(np.float64)
    alpha = alpha * np.clip(d / max(1, FEATHER), 0, 1)
    alpha = np.where(alpha < FLOOR, 0, alpha)
    out = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).round().astype(np.uint8)
    return out, float(wash.max())

cells = []
for r, (y0, y1) in enumerate(row_spans):
    for c, (x0, x1) in enumerate(col_spans):
        ax, ay = (x1 - x0) // 2, int(ground[r]) - y0
        rgba, washmax = process(src[y0:y1, x0:x1], ax, ay)
        cells.append({'n': r * want_c + c + 1, 'row': r, 'x0': x0, 'y0': y0, 'img': rgba,
                      'ax': ax, 'ay': ay, 'washmax': washmax})
print('  wash removed (max estimated sum per channel): ' +
      ' '.join(f"{c['n']}:{c['washmax']:.0f}" for c in cells if c['washmax'] > 3))

# ── 3. THE GROUND GUARD — the declared impact line must agree with every measurable ring ─────────
g = spec.get('groundGuard', {})
for n in g.get('frames', []):
    c = cells[n - 1]; a = c['img'][:, :, 3].astype(int); h = a.shape[0]
    ys, xs = np.nonzero(a > 200)
    sel = ys > h * 0.45
    ys, xs = ys[sel], xs[sel]
    L, R = xs.min(), xs.max()
    cy = (ys[xs <= L + 3].mean() + ys[xs >= R - 3].mean()) / 2
    off = cy - c['ay']
    if abs(off) > float(g.get('tolPx', 3)):
        fail(f"[light-sheet] ground guard: frame {n}'s ring centre is at cell y {cy:.1f}, "
             f"{off:+.1f} px off the declared groundY. The spec's impact line is wrong for this sheet.")
    print(f'  ground guard frame {n:2d}: ring centre {cy:6.1f} vs declared {c["ay"]} ({off:+.1f} px)')

# ── 4. DROP, THEN ALIGN EVERY KEPT FRAME ON ITS IMPACT POINT ─────────────────────────────────────
drop = set(spec.get('dropFrames', []))
kept = [c for c in cells if c['n'] not in drop]
print(f'  kept {len(kept)} of {len(cells)} frames; dropped {sorted(drop)}')
up = max(c['ay'] for c in kept); down = max(c['img'].shape[0] - 1 - c['ay'] for c in kept)
left = max(c['ax'] for c in kept); right = max(c['img'].shape[1] - 1 - c['ax'] for c in kept)
PAD = int(spec.get('padPx', 2))
cw, chh = left + right + 1 + 2 * PAD, up + down + 1 + 2 * PAD
AX, AY = PAD + left, PAD + up
frames = []
for c in kept:
    canvas = np.zeros((chh, cw, 4), dtype=np.uint8)
    ox, oy = AX - c['ax'], AY - c['ay']
    ih, iw = c['img'].shape[0], c['img'].shape[1]
    canvas[oy:oy + ih, ox:ox + iw] = c['img']
    c['top_out'] = oy          # where the SOURCE cell's top edge landed in the output cell
    frames.append(canvas)

# ⭐ BEAM TOP — a slot whose beam was cut by its source cell's top edge. The renderer continues the
# beam upward from this row, so the column really comes from the sky instead of ending mid-air.
# ⚠ DECLARED, THEN GUARDED — not detected alone. Frame 21's rising flame-and-smoke column also
# touches its cell top, and continuing THAT into the sky would draw a pillar of smoke to heaven. So the
# spec names the beam frames and the build fails if a named one is not actually cut by the top edge.
BT = float(spec.get('beamTopMinAlpha', 200)); BW = int(spec.get('beamTopMinWidthPx', 3))
beam_frames = set(spec['beamFrames'])
beam_top, touching = [], []
for c in kept:
    top_rows = c['img'][0:3, :, 3]
    cut = int((top_rows.max(axis=0) >= BT).sum()) >= BW
    if cut: touching.append(c['n'])
    if c['n'] in beam_frames and not cut:
        fail(f"[light-sheet] beam frame {c['n']} is not cut by its cell top — beamFrames is wrong for this sheet")
    # The CUT row itself; the renderer samples its strip RA_BEAM_STRIP_INSET (2) px below it, clear of
    # the gutter's anti-aliasing, and starts the sky continuation exactly here so nothing is drawn twice.
    beam_top.append(c['top_out'] if c['n'] in beam_frames else None)
print(f'  touching the cell top: {touching}; continued into the sky: {sorted(beam_frames)}')

# ── 5. BLAST FOOTPRINT — sized to the column's REAL damage radius by the renderer ────────────────
blast = spec['blastFrames']
widths = []
for n in blast:
    c = next((k for k in kept if k['n'] == n), None)
    if c is None: fail(f'[light-sheet] blast frame {n} was dropped')
    a = c['img'][:, :, 3].astype(int)
    band = a[max(0, c['ay'] - 30):c['ay'] + 40]
    xs = np.nonzero((band > 200).any(axis=0))[0]
    widths.append(int(xs.max() - xs.min() + 1))
blast_w = max(widths)
print(f'  blast footprint widths {dict(zip(blast, widths))} -> blastWidthPx {blast_w}')

# ── 6. PACK ───────────────────────────────────────────────────────────────────────────────────────
states = spec['states']
if sum(s['count'] for s in states) != len(kept): fail('[light-sheet] states do not cover exactly the kept frames')
if len(spec['frameTicks']) != len(kept): fail('[light-sheet] frameTicks needs one entry per kept frame')
cols_out = max(s['count'] for s in states)
sheet = Image.new('RGBA', (cw * cols_out, chh * len(states)), (0, 0, 0, 0))
for r, st in enumerate(states):
    for i in range(st['count']):
        a = frames[st['from'] - 1 + i]
        sheet.paste(Image.fromarray(a), (i * cw, r * chh))
sheet.save(out_png, optimize=True)

_ys = np.nonzero(frames[0][:, :, 3] > 24)[0]
manifest = {
    'cellW': cw, 'cellH': chh,
    'footAnchor': {'x': round(AX / cw, 4), 'y': round(AY / chh, 4)},
    'subjectFill': round(float((_ys.max() - _ys.min() + 1) / chh), 4),
    'states': {st['name']: {'row': r, 'frames': st['count']} for r, st in enumerate(states)},
    'sourceFrames': [c['n'] for c in kept],
    'droppedFrames': sorted(drop),
    'frameTicks': spec['frameTicks'],
    'impactFrame': spec['impactFrame'],
    'beamTop': beam_top,
    'blastWidthPx': blast_w,
}
json.dump(manifest, open(out_json, 'w', newline='\n'), indent=2)
print(f'  atlas {sheet.size[0]}x{sheet.size[1]}  cell {cw}x{chh}  impact anchor ({AX},{AY})')
`;

const outDir = resolve(spec.outDir);
mkdirSync(outDir, { recursive: true });
const pngOut = join(outDir, `${spec.name}-atlas.png`);
const jsonOut = join(outDir, `${spec.name}-anim.json`);
const pyFile = join(tmpdir(), `spark-light-sheet-${spec.name}.py`);
writeFileSync(pyFile, PY);
try {
  execFileSync('python', [pyFile, JSON.stringify(spec), pngOut, jsonOut], { stdio: 'inherit' });
} catch (err) {
  // ⚠ Same contract as the two sibling intakes: a missing toolchain is exit 3 with the install line.
  if (err.status === 1) {
    console.error('[light-sheet] build failed — if this is ModuleNotFoundError: pip install numpy scipy Pillow');
    process.exit(3);
  }
  process.exit(err.status ?? 1);
}
console.log(`✓ ${spec.name}: ${pngOut}`);
