/**
 * SPARK — SPRITE ATLAS BUILDER (S151 P3).
 *
 * Turns veo character clips into a Helga-format atlas (`public/godly/<name>/anim/`), which is the
 * pipeline the project already ships — see `render/princessRenderer.ts` and
 * `public/godly/helga/anim/helga-anim.json`.
 *
 * ## Why this is a script and not a one-off
 *
 * S151 P3 animates three characters (melee goblin, archer goblin, stink tower) and the owner has
 * already scoped FOUR MORE goblins plus the poop bags for the next session. Doing it by hand twice
 * guarantees the second one drifts — different crop, different anchor, different frame count — and a
 * character whose foot-anchor disagrees with its siblings visibly bobs against them on screen.
 *
 * ## What it does, and the two things that are easy to get wrong
 *
 * 1. **The letterbox.** veo returns 1280x720 with the character in a white column between black
 *    bars. Cropping to a fixed rectangle breaks the moment a clip is framed differently, so the
 *    content column is DETECTED per frame.
 *
 * 2. ⭐ **THE MATTE.** A naive "white pixels become transparent" key punches holes straight through
 *    the goblin's EYES and the highlight on his CLEAVER, and leaves a grey fringe everywhere else.
 *    Instead the background is found by CONNECTED COMPONENT from the frame border: only white that
 *    is reachable from outside is removed, so enclosed white stays opaque. This is the fix for the
 *    known defect the owner reported on the previous sprite — *"the old sprite had a visible square
 *    box, worst on attack"*.
 *
 * 3. ⭐ **ONE UNION BOUNDING BOX PER CHARACTER, NOT PER FRAME.** Every state of a character is
 *    measured together and drawn into the same cell against the same foot anchor. Cropping each
 *    frame to its own bounds is what makes a sprite appear to grow, shrink and hop between frames.
 *
 * Usage:
 *   node scripts/build-sprite-atlas.mjs <spec.json>
 *
 * The spec names the output and lists one clip per state:
 *   { "name": "goblin-melee", "cellW": 200, "cellH": 200, "framesPerState": 12,
 *     "states": { "idle": {"clip": "...", "ticksPerFrame": 7}, ... } }
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const specPath = process.argv[2];
if (specPath === undefined) {
  console.error('usage: node scripts/build-sprite-atlas.mjs <spec.json>');
  process.exit(2);
}
const spec = JSON.parse(readFileSync(specPath, 'utf8'));

const work = join(tmpdir(), `spark-atlas-${spec.name}`);
if (existsSync(work)) rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

/* ── 1. Extract evenly-spaced frames from each clip ─────────────────────────────────────────── */
const stateNames = Object.keys(spec.states);
for (const st of stateNames) {
  const dir = join(work, st);
  mkdirSync(dir, { recursive: true });
  const clip = spec.states[st].clip;
  // Count frames first so the sampling stride is derived rather than assumed — a clip at a
  // different length or fps would otherwise silently yield too few frames and pad with duplicates.
  const probe = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-count_frames', '-show_entries', 'stream=nb_read_frames',
    '-of', 'default=nw=1:nk=1', clip,
  ]).toString().trim();
  const total = Number.parseInt(probe, 10);
  if (!Number.isFinite(total) || total < spec.framesPerState) {
    throw new Error(`${st}: clip has ${probe} frames, need >= ${spec.framesPerState}`);
  }
  /*
   * ⭐ S152 P3 — `sampleWindow`: TAKE THE FRAMES FROM THE FRONT OF THE CLIP, NOT THE WHOLE THING.
   *
   * MEASURED, not guessed: veo holds an image-to-video seed faithfully for roughly the first
   * second and then drifts. Over a 4 s clip sampled end to end, the S152 bat rider's goblin turned
   * spindly and washed out by the later frames, and the shield goblin's ATTACK clip zoomed out and
   * slid across frame. Both are invisible to every test in the repo and obvious in a contact sheet.
   *
   * ⛔ AND THE DRIFT IS WORSE THAN IT LOOKS, because ONE union bbox covers every state: a single
   * state whose subject wanders inflates the box for ALL of them, so the other states' characters
   * get scaled down to fit a frame-wide box. That is how a clean idle ends up rendering small.
   *
   * ⚠ THE TRADE IS REAL: a narrower window is more faithful and may clip the tail of a long
   * action. Per-state, so a slow idle can take the whole clip while a drifting attack takes the
   * front. Absent ⇒ the whole clip, i.e. the S151 behaviour is unchanged by default.
   */
  /*
   * ⭐ S153 P7 — `sampleStart`: SKIP LEADING FRAMES. The exact mirror of `sampleWindow` above, and
   * added for a defect only a contact sheet could have shown.
   *
   * MEASURED on the goblin hound: frame 0 of its WALK clip is PILLARBOXED — veo opened the clip
   * with the seed letterboxed inside a narrower frame, so two solid black bars flanked the dog.
   * The S152 border-connected-near-black rule exists to eat exactly that and did NOT fire here, so
   * the bars survived the matte as opaque geometry: 144 bar-like columns of 336 in that one cell,
   * and nowhere else in the atlas. Every other state and every other character was clean, which is
   * what makes this a leading-frame problem rather than a matte-threshold one.
   *
   * ⚠ FIXED BY NOT SAMPLING THE BAD FRAME rather than by loosening the matte. Widening the bar rule
   * to catch this would put every character's dark INK at risk, which is precisely the S152 defect
   * that deleted whole outlines. Skipping three frames of ninety-six costs nothing.
   *
   * Per-state, and ABSENT ⇒ 0 ⇒ byte-identical extraction, so no shipped atlas can regress if it is
   * ever rebuilt.
   */
  const start = Math.max(0, spec.states[st].sampleStart ?? spec.sampleStart ?? 0);
  const available = total - start;
  if (available < spec.framesPerState) {
    throw new Error(`${st}: ${available} frames after sampleStart ${start} < framesPerState ${spec.framesPerState}`);
  }
  const window = Math.min(available, spec.states[st].sampleWindow ?? spec.sampleWindow ?? available);
  if (window < spec.framesPerState) {
    throw new Error(`${st}: sampleWindow ${window} < framesPerState ${spec.framesPerState}`);
  }
  const stride = Math.max(1, Math.floor(window / spec.framesPerState));
  const sel =
    start === 0
      ? `select='not(mod(n\,${stride}))'`
      : `select='gte(n\,${start})*not(mod(n-${start}\,${stride}))'`;
  execFileSync('ffmpeg', [
    '-v', 'error', '-i', clip,
    '-vf', sel, '-vsync', '0',
    join(dir, 'f_%03d.png'),
  ]);
  const got = readdirSync(dir).length;
  console.log(`  ${st}: ${total} frames -> stride ${stride} -> ${got} extracted`);
}

/* ── 2..5. Matte + union-bbox + cell assembly (numpy does the pixel work) ───────────────────── */
const py = `
import json, sys, numpy as np
from PIL import Image
from scipy import ndimage

work, out_png, out_json = sys.argv[1], sys.argv[2], sys.argv[3]
spec = json.loads(sys.argv[4])
states = list(spec['states'].keys())
N = spec['framesPerState']

def content_column(frames):
    """⭐ ONE COLUMN PER CLIP, NOT PER FRAME. veo's letterbox is fixed for a whole clip, so the crop
    must be too. Measuring it per frame looked fine until the stink tower's attack threw a big
    effect across the frame: the widest-bright-run heuristic then chose a DIFFERENT column on those
    frames and black bars leaked into the sprite. Averaging over the whole clip is both more stable
    and cheaper."""
    acc = None
    for a in frames:
        lum = a[:, :, :3].mean(axis=2)
        b = (lum > 40).mean(axis=0)
        acc = b if acc is None else acc + b
    bright = acc / len(frames)
    cols = np.where(bright > 0.15)[0]
    if cols.size == 0: return 0, frames[0].shape[1]
    breaks = np.where(np.diff(cols) > 1)[0]
    runs, start = [], 0
    for b in breaks:
        runs.append((cols[start], cols[b])); start = b + 1
    runs.append((cols[start], cols[-1]))
    lo, hi = max(runs, key=lambda r: r[1] - r[0])
    return int(lo), int(hi) + 1

def matte(a):
    """⭐ THE MATTE, AND IT TAKES TWO RULES, NOT ONE.

    (1) Background is near-white CONNECTED TO THE BORDER. A global "white becomes transparent" key
        would punch holes straight through the goblin's EYES and the highlight on his CLEAVER.

    (2) ⭐ BUT BORDER-CONNECTIVITY ALONE IS NOT ENOUGH, and the first build of this script shipped
        the bug: the white GAP BETWEEN HIS LEGS is enclosed by the character, so rule (1) keeps it,
        and the sprite renders with a solid white blob under the kilt. So enclosed white is judged
        by AREA — an eye or a blade glint is a few hundred pixels, a leg gap is thousands. Anything
        enclosed and LARGE is background that happens to be surrounded."""
    rgb = a[:, :, :3].astype(np.int16)
    near_white = (rgb.min(axis=2) > 205) & (rgb.max(axis=2) - rgb.min(axis=2) < 28)
    lab, n = ndimage.label(near_white)
    border = set(np.unique(np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]])))
    border.discard(0)
    kill = set(border)
    if n > 0:
        # ⭐ S152 P3 — THE THRESHOLD IS NOW A PER-CHARACTER KNOB, AND 0.3% WAS TOO HIGH FOR ART
        # WITH SMALL BACKGROUND POCKETS.
        #
        # The original figure was calibrated on ONE character (the shipped swordsman: eye ~0.05%,
        # between-the-legs gap ~1.5%). The bat rider has several MID-SIZED enclosed pockets - between
        # his arm and the wing, between the rein and the bat's ear - and every one of them measured
        # BELOW 0.3%, so they were KEPT as opaque white and shipped as blobs stuck to the character.
        # That is the exact defect this rule was written to prevent, one size band down.
        #
        # ⛔ AND IT LOOKED LIKE A veo PROBLEM. The atlas showed a washed-out, blotchy goblin, so the
        # first three fixes attempted were all on the GENERATION side (shorter clips, narrower sample
        # windows, different prompts). Extracting the RAW clip frames settled it in one step: frames
        # 0, 5 and 11 were pristine. The pipeline was the culprit, not the model. Check the input
        # before retuning the thing that consumes it.
        #
        # MEASURED on the bat rider: background pockets 446..14291 px; every real feature (eyes,
        # teeth, spear glints) <= 24 px. An 18x gap, so anything in between is safe. Default is
        # UNCHANGED at 0.003 so the two shipped goblins cannot regress if they are ever rebuilt.
        limit = spec.get('enclosedWhiteLimitPct', 0.003) * a.shape[0] * a.shape[1]
        sizes = ndimage.sum(near_white, lab, index=np.arange(1, n + 1))
        for i, sz in enumerate(sizes, start=1):
            if i not in kill and sz > limit:
                kill.add(i)
    bg = np.isin(lab, list(kill)) if kill else np.zeros_like(near_white)
    # ⛔ S152 P3 — KILL BORDER-CONNECTED NEAR-BLACK **ONLY WHEN IT IS SHAPED LIKE A BAR**.
    #
    # THE ORIGINAL RULE DELETED WHOLE CHARACTERS. It removed ANY dark component touching the frame
    # edge, on the reasoning that a surviving letterbox is black and touches the edge. True — but a
    # cartoon's INK OUTLINE is also near-black, and every outline in a drawing is ONE connected
    # region. So the moment any part of the silhouette reaches the frame edge, the outline joins the
    # letterbox bar into a single component and the entire character's linework is erased.
    #
    # Measured on the bat rider's walk clip: his wingtips touch the edge, and the atlas came out with
    # the goblin and bat rendered as flat mid-tone shapes with NO outlines at all — while the ground
    # shadow (not border-connected) stayed pure black. Same mechanism cost the shield goblin its
    # outlines on the attack frames where veo let him drift wide.
    #
    # ⚠ AND IT MASQUERADED AS A MODEL PROBLEM for three fix attempts (shorter clips, narrower sample
    # windows, a different prompt) because "washed out and blotchy" reads exactly like generative
    # drift. Extracting the RAW clip frames settled it in one step: they were pristine.
    #
    # A letterbox bar is a BAR: it spans nearly the whole frame in one axis and is thin in the other.
    # A character outline never is. So that is what gets tested, instead of mere edge contact.
    dark = rgb.max(axis=2) < 42
    dlab, dn = ndimage.label(dark)
    dborder = set(np.unique(np.concatenate([dlab[0, :], dlab[-1, :], dlab[:, 0], dlab[:, -1]])))
    dborder.discard(0)
    H, W = a.shape[0], a.shape[1]
    bars = []
    for i in dborder:
        ys, xs = np.nonzero(dlab == i)
        if ys.size == 0:
            continue
        h = ys.max() - ys.min() + 1
        w = xs.max() - xs.min() + 1
        vertical = h >= 0.90 * H and w <= 0.15 * W
        horizontal = w >= 0.90 * W and h <= 0.15 * H
        if vertical or horizontal:
            bars.append(i)
    if bars:
        bg = bg | np.isin(dlab, bars)
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # Erode by one pixel to kill the pale halo veo leaves at the ink outline.
    solid = ndimage.binary_erosion(alpha > 0, structure=np.ones((3, 3)), border_value=1)
    alpha = np.where(solid, alpha, 0).astype(np.uint8)
    return np.dstack([a[:, :, :3], alpha])

frames = {}
for st in states:
    import os, glob
    fs = sorted(glob.glob(os.path.join(work, st, 'f_*.png')))[:N]
    if len(fs) < N: raise SystemExit(f'{st}: only {len(fs)} frames, need {N}')
    raw = [np.array(Image.open(f).convert('RGBA')) for f in fs]
    lo, hi = content_column(raw)
    frames[st] = [matte(a[:, lo:hi]) for a in raw]

# ⭐ ONE union bbox across EVERY frame of EVERY state — the anti-jitter guarantee.
x0 = y0 = 10**9; x1 = y1 = -1
for st in states:
    for a in frames[st]:
        ys, xs = np.nonzero(a[:, :, 3])
        if xs.size == 0: continue
        x0, x1 = min(x0, xs.min()), max(x1, xs.max())
        y0, y1 = min(y0, ys.min()), max(y1, ys.max())
bw, bh = int(x1 - x0 + 1), int(y1 - y0 + 1)

cw, ch = spec['cellW'], spec['cellH']
pad = 0.94                                   # leave a hair of margin inside the cell
# ⭐ FIT ON HEIGHT BY DEFAULT, AND THIS IS A VISUAL-CONSISTENCY RULE, NOT A PREFERENCE.
# Characters are compared by how TALL they look. Fitting the bounding box means a character holding
# something wide is scaled down by that prop: the archer's bbox is 707x572 because of his BOW, so
# box-fitting rendered his body noticeably smaller than the melee goblin's beside him. Height-fit
# keeps bodies comparable and simply widens the cell for whatever the prop needs.
if spec.get('fit', 'height') == 'height':
    scale = (ch / bh) * pad
    if int(bw * scale) > cw:
        cw = int(bw * scale) + 2
        print(f'  cellW widened to {cw} to fit the prop at full character height')
else:
    scale = min(cw / bw, ch / bh) * pad
sw, sh = max(1, int(bw * scale)), max(1, int(bh * scale))

sheet = Image.new('RGBA', (cw * N, ch * len(states)), (0, 0, 0, 0))
for r, st in enumerate(states):
    for i, a in enumerate(frames[st]):
        # Crop to the SHARED bbox, not this frame's own — identical framing every frame.
        crop = Image.fromarray(a[y0:y1 + 1, x0:x1 + 1]).resize((sw, sh), Image.LANCZOS)
        # Foot-anchored: bottom-centre, so the character stands on the same ground line in
        # every state instead of floating when a pose is shorter.
        sheet.paste(crop, (i * cw + (cw - sw) // 2, r * ch + (ch - sh)), crop)
sheet.save(out_png)

manifest = {
    'cellW': cw, 'cellH': ch,
    'footAnchor': {'x': 0.5, 'y': (ch - (ch - sh) - sh + sh) / ch},
    'states': {st: {'row': r, 'frames': N, 'ticksPerFrame': spec['states'][st]['ticksPerFrame']}
               for r, st in enumerate(states)},
}
manifest['footAnchor']['y'] = round((ch - 1) / ch, 4)
json.dump(manifest, open(out_json, 'w'), indent=2)
print(f'  atlas {sheet.size[0]}x{sheet.size[1]}  cell {cw}x{ch}  bbox {bw}x{bh} -> {sw}x{sh}')
`;

const outDir = resolve(spec.outDir ?? `public/godly/${spec.name}/anim`);
mkdirSync(outDir, { recursive: true });
const pngOut = join(outDir, `${spec.name}-atlas.png`);
const jsonOut = join(outDir, `${spec.name}-anim.json`);
const pyFile = join(work, 'build.py');
writeFileSync(pyFile, py);
execFileSync('python', [pyFile, work, pngOut, jsonOut, JSON.stringify(spec)], { stdio: 'inherit' });
console.log(`✓ ${spec.name}: ${pngOut}`);
