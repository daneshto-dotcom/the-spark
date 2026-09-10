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
    #
    # S165 FIX - MEDIAN OVER EVERY FRAME, NOT FRAME 0, AND FRAME 0 IS WHY THIS CHECK MISSED THE
    # DEFECT IT WAS BUILT FOR. It cropped only the first cell of each row and compared those. The
    # owner then found the scarab's WALK row visibly smaller than its idle row - and this check had
    # scored that sheet walk=0.99x and passed it, because the scarab's frame 0 happens to match
    # while the other eleven frames do not. Measured after the change: scarab walk 0.82x, piranha
    # walk 1.49x, vampire-bat attack 1.50x - three playable rows wrong, all of them previously
    # 'clean'.
    #
    # A per-row MEDIAN is the right statistic: it is what the eye averages over a looping
    # animation, and it is immune to one frame where the creature rears up or crouches. A single
    # sampled frame is a measurement of luck.
    heights = []
    # ── check 4: A SURVIVING VEO LETTERBOX (S168) ─────────────────────────────────────────
    # Owner, on the live build: "take a look at the kraken, he is moving within a black frame
    # slightly larger than his body ... the creature need to be cut out so that he looks like he is
    # actually integrated within the map".
    #
    # ⛔ CHECK 3 LOOKS FOR NEAR-WHITE AND THIS DEFECT IS NEAR-BLACK, so nothing here could see it.
    # build-sprite-atlas.mjs DOES try to eat letterbox bars, but only when they are
    # h >= 0.90*H and w <= 0.15*W; the Kraken's are 0.84 and 0.21, so they missed by a little in
    # the safe direction and shipped. Two atlases carried one: t9boss-nagas ATTACK and
    # t3-mummies-scarab WALK — and only the first was reported. The second is the S166 lesson again:
    # a reported defect is a SAMPLE, not the population.
    #
    # ⭐ THE TEST IS A COLUMN SCAN, NOT A COMPONENT SHAPE, because the failure mode of the shape rule
    # is exactly what let this through. Walking inward from each edge, a column counts as letterbox
    # while >=50% of its OPAQUE pixels are near-black AND it covers >=75% of the cell height; the run
    # stops at the first column that is not. A character's ink outline never makes a full-height
    # near-black column, so linework cannot trip it — the S152 disaster this file already records.
    #
    # MEASURED across all 48 shipped atlases: 46 score EXACTLY 0 and the two offenders score 53,703
    # and 414,481. There is no threshold to tune; LETTERBOX_MAX below is slack, not a boundary.
    lbrow, lbpx = '', 0
    if os.path.exists(mpath):
        man = json.load(open(mpath))
        cw, ch = man['cellW'], man['cellH']
        arr = np.asarray(Image.open(path).convert('RGBA'))
        for st, info in man['states'].items():
            per = []; perw = []
            for f in range(int(info['frames'])):
                cell = arr[info['row'] * ch:(info['row'] + 1) * ch, f * cw:(f + 1) * cw]
                # ⭐⭐ S171 — THE **BODY** COMPONENT, NOT EVERY OPAQUE PIXEL.
                # Measuring the bbox of all opaque pixels lets ONE stray matte speck redefine the
                # creature's size. Measured on the scarab's WALK row: a white sliver at the left
                # edge of frame 0 scored it 188 px tall when the beetle is 136 - a 38% phantom that
                # then poisoned the row median this check compares. Taking the LARGEST connected
                # component measures the animal and ignores the litter, and the litter is caught on
                # its own terms by the edge-white check below.
                opq = cell[:, :, 3] > 40
                clab, cn = ndimage.label(opq)
                if not cn:
                    continue
                csz = ndimage.sum(opq, clab, index=np.arange(1, cn + 1))
                body = int(np.argmax(csz)) + 1
                byy, bxx = np.nonzero(clab == body)
                per.append(int(byy.max() - byy.min() + 1))
                perw.append(int(bxx.max() - bxx.min() + 1))
            heights.append([st, int(np.median(per)) if per else 0,
                            int(np.median(perw)) if perw else 0])
        for st, info in man['states'].items():
            barpx = 0
            for f in range(int(info['frames'])):
                cell = arr[info['row'] * ch:(info['row'] + 1) * ch, f * cw:(f + 1) * cw]
                op = cell[:, :, 3] > 200
                dk = cell[:, :, :3].max(axis=2) < 42
                opq = op.sum(axis=0)
                odk = (op & dk).sum(axis=0)
                frac = np.where(opq > 0, odk / np.maximum(opq, 1), 0.0)
                isbar = (frac >= 0.50) & ((opq / ch) >= 0.75)
                # ⭐ S168 — AND A BAR IS WIDE. Without a minimum run width this flagged the Kraken's
                # DIE row: three columns at the extreme left edge, ~800 px, where a dark tentacle
                # hugs the frame. That is a sliver, not a letterbox. The real bars measured 84-85
                # columns each, so requiring 8 separates them by an order of magnitude and does it
                # on SHAPE rather than by loosening the pixel tolerance, which would have hidden
                # small real bars too.
                for order in (range(cw), range(cw - 1, -1, -1)):
                    run = []
                    for x in order:
                        if opq[x] == 0:
                            continue
                        if isbar[x]:
                            run.append(int(odk[x]))
                        else:
                            break
                    if len(run) >= 8:
                        barpx += sum(run)
            if barpx > lbpx:
                lbrow, lbpx = st, barpx
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
    # ── check 5: NEAR-WHITE ON THE SILHOUETTE EDGE — the matte FRINGE (S171) ──────────────
    # Owner, on the shipped build: "when that, like, jumps around ... you can kind of see the
    # borders of the square of the background from its, like, generator. You can see, like,
    # something white around it, like, outside his perimeter." Named on the piranha and the Kraken.
    #
    # ⛔ NEITHER CHECK 3 NOR A TOTAL COULD SEE THIS, and check 3's docblock explains why it refused
    # the obvious fix: "the race units carry 66-768 px of near-white in TOTAL while their biggest
    # single pocket is 2-52 px - eye glints, correctly kept. Summing would have called the healthy
    # sheets worse than the broken ones." That reasoning is right, and it is why the discriminator
    # is not HOW MUCH white but WHERE it sits. A glint is INTERIOR. A matte fringe hugs the cut-out
    # boundary. So this counts only near-white pixels with a TRANSPARENT 8-neighbour.
    #
    # MEASURED over all 48 shipped atlases: 12 score exactly 0, the body sits under 50, and the
    # worst are t9boss-demons 342, t9boss-nagas 180 (the Kraken he named), t9boss-mummies 121,
    # unit-zombies 114, t3-mummies-scarab 107 (the scarab he named) and t9boss-zombies 102.
    edge_white = white & ndimage.binary_dilation(al < 40, structure=np.ones((3, 3), bool))
    out[path] = [total, largest, heights, int(white.sum()), wbig, lbrow, lbpx, int(edge_white.sum())]
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
/*
 * S165 - THE EQUAL-HEIGHT VERDICT COVERS THE PLAYABLE ROWS. `die` IS JUDGED SEPARATELY.
 *
 * The original reason had two halves, and S167 retired exactly one of them.
 *
 * ⛔ THE STALE HALF: it said *"there is no arm that can ever ask for the `die` row, on any sheet,
 * today"*. **That stopped being true in S167.** `goblinRenderer` now hands a dead creature's sprite
 * to a client-local death animation that plays the `die` row once, so all twenty-four of these rows
 * are on screen. A guard whose justification is "nobody can see it" has to be re-derived the moment
 * somebody can.
 *
 * ⭐ THE HALF THAT STILL HOLDS, AND IT IS WHY `die` IS NOT SIMPLY FOLDED INTO THE VERDICT: its
 * heights are POSE-CONFOUNDED rather than zoom-wrong. Every die row measures SHORTER than its idle
 * (hound 0.61x, orcs 0.76x, zombies 0.80x, souleater 0.82x; the S167 bosses run 0.57x-1.12x),
 * because a dying creature COLLAPSES. Holding it to the same +/-15% band as idle/walk/attack would
 * paint correct art red forever, and a guard that is always red is a guard nobody reads.
 *
 * ⭐ SO IT IS GATED ONE-SIDEDLY. A collapse may make a row arbitrarily SHORTER; nothing about
 * dying makes a creature TALLER. A die row measuring ABOVE the playable median is the same defect
 * the two-sided check exists for - a zoom error - and it is now caught, while the legitimate
 * direction stays free. Verified against every shipped sheet before being turned on: the tallest die
 * row in the tree is the naga boss at 1.12x, inside the 1.15x ceiling.
 */
const PLAYABLE_ROWS = new Set(['idle', 'walk', 'attack']);

const SIZE_TOLERANCE = 0.15;

/**
 * ⭐⭐ S171 (owner) — **WIDTH TOLERANCE, BECAUSE HEIGHT-ONLY IS BLIND TO A SIDE-ON CREATURE.**
 *
 * The owner reported the scarab: *"the scarab is very not consistent in size. When he attacks ...
 * he's, like, two times, two and a half times bigger than when he's, like ... he looks like he's
 * inflating."* This guard scored that sheet `idle=1.01x walk=1.00x attack=1.00x` and passed it.
 *
 * ⛔ IT WAS NOT A THRESHOLD PROBLEM. It was measuring the one dimension that carries no signal for
 * this creature. Measured, body-component medians:
 *
 *     scarab    idle 330x136   walk 196x133   attack 270x135   -> width dev 0.27, height dev 0.01
 *     piranha   idle 187x128   walk 110x128   attack 150x129   -> width dev 0.27, height dev 0.00
 *
 * A scarab is side-on in every row and a beetle is squat, so its HEIGHT is body depth and barely
 * moves with scale — while the whole 1.7x error lives in width. The two sheets the owner named are
 * ranks 1 and 2 by width deviation across all 48 atlases, and both are ~0.00 by height.
 *
 * ⚠ WIDTH GETS MORE SLACK THAN HEIGHT, AND THE ORIGINAL REASONING FOR EXCLUDING IT IS WHY. This
 * file already argued: *"area conflates scale with POSE: a bat biting front-on is legitimately
 * narrower than the same bat gliding side-on at the same size."* That is true and it is the reason
 * width cannot share height's ±15%. Measured across the tree, legitimate pose-driven width spread
 * tops out around 0.16 (unit-mummies) with a clean gap to 0.20; 0.18 sits in that gap and flags six
 * sheets — the two he named plus four neighbours — while leaving the pose-varying body alone.
 */
const WIDTH_TOLERANCE = 0.18;

/**
 * ⭐ S171 — NEAR-WHITE ON THE CUT-OUT EDGE: the matte FRINGE. See check 5 in the Python payload for
 * why this is a position test rather than a bigger total. Measured over all 48 shipped atlases: 12
 * score exactly 0 and the healthy body sits under 50, so 60 is slack rather than a boundary. It
 * flags six sheets, including both the Kraken and the scarab the owner named.
 */
const EDGE_WHITE_MAX = 60;

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
  : '\n[atlas] 2/2 — cross-row SIZE consistency (per-row MEDIAN over every frame; die gated ONE-SIDEDLY — taller only)\n');
for (const [path, [, , heights]] of Object.entries(res)) {
  if (noSize || !heights || heights.length === 0) continue;
  const play = heights.filter(([st, h]) => PLAYABLE_ROWS.has(st) && h > 0);
  if (play.length === 0) continue;
  const hs = play.map(([, h]) => h).sort((a, b) => a - b);
  const med = hs[Math.floor(hs.length / 2)];
  // ⭐ S171 — WIDTH, on its own looser band. See WIDTH_TOLERANCE for why height alone was blind.
  const ws = play.map(([, , w]) => w).filter((w) => w > 0).sort((a, b) => a - b);
  const wmed = ws.length > 0 ? ws[Math.floor(ws.length / 2)] : 0;
  const wideOffenders = wmed > 0
    ? play.filter(([, , w]) => w > 0 && Math.abs(w / wmed - 1) > WIDTH_TOLERANCE)
    : [];
  const offenders = play.filter(([, h]) => Math.abs(h / med - 1) > SIZE_TOLERANCE);
  /*
   * ⭐ S167 - THE ONE-SIDED `die` BOUND. Shorter is a collapse; TALLER is a zoom error. See the
   * PLAYABLE_ROWS docblock for why this row cannot share the two-sided band.
   */
  const tallDie = heights.filter(
    ([st, h]) => !PLAYABLE_ROWS.has(st) && h > 0 && h / med - 1 > SIZE_TOLERANCE,
  );
  if (offenders.length > 0 || tallDie.length > 0 || wideOffenders.length > 0) sized++;
  const detail = heights
    .map(([st, h, w]) => {
      const r = (h / med).toFixed(2);
      // ⚠ WIDTH IS PRINTED FOR EVERY ROW, not only the failing ones. The scarab passed this check
      // for three sessions partly because its width was never on screen to be doubted.
      const wr = wmed > 0 && w > 0 ? `/${(w / wmed).toFixed(2)}w` : '';
      const wbad = wmed > 0 && w > 0 && PLAYABLE_ROWS.has(st)
        && Math.abs(w / wmed - 1) > WIDTH_TOLERANCE ? '(WIDE)' : '';
      if (PLAYABLE_ROWS.has(st)) return `${st}=${r}x${wr}${wbad}`;
      return `${st}=${r}x${wr}${h / med - 1 > SIZE_TOLERANCE ? '(die TOO TALL)' : '(die)'}`;
    })
    .join(' ');
  const rowVerdict =
    offenders.length === 0 && tallDie.length === 0 && wideOffenders.length === 0
      ? 'clean'
      : 'MISMATCH';
  console.log(`  ${rowVerdict.padEnd(8)} ${detail}  ${path}`);
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

/*
 * ⭐ S168 — slack, not a boundary. Clean art measures EXACTLY 0 px on all 46 healthy atlases; the two
 * offenders measured 53,703 and 414,481. This exists only so one stray dark column at a frame edge
 * cannot red the gate, and it should never need tuning. If it ever does, the rule is wrong.
 */
const LETTERBOX_MAX = 2000;

let fringed = 0;
console.log('\n[atlas] 5/5 — near-white ON THE CUT-OUT EDGE: the matte FRINGE (position, not amount)\n');
for (const [path, r] of Object.entries(res)) {
  const ew = r[7] ?? 0;
  const over = ew > EDGE_WHITE_MAX;
  if (over) fringed++;
  console.log(`  ${(over ? 'FRINGE' : 'clean').padEnd(8)} ${String(ew).padStart(6)} px on edge  ${path}`);
}

let boxed = 0;
console.log('\n[atlas] 4/4 — a surviving veo LETTERBOX (near-black bars at the frame edge)\n');
for (const [path, [, , , , , lbrow, lbpx]] of Object.entries(res)) {
  const over = lbpx > LETTERBOX_MAX;
  if (over) boxed++;
  const where = lbpx > 0 ? `worst row ${lbrow}` : '';
  console.log(`  ${(over ? 'LETTERBOX' : 'clean').padEnd(10)} ${String(lbpx).padStart(7)} px  ${where.padEnd(16)} ${path}`);
}

console.log('');
if (boxed > 0) {
  console.error(`[atlas] FAIL — ${boxed} atlas(es) still carry a veo letterbox bar.`);
  console.error('        If the bars are CLEAN rectangles (the creature does not overlap them),');
  console.error('        `python scripts/repair-atlas-letterbox.py <atlas.png>` removes them losslessly.');
  console.error('        If the creature BLEEDS over the bars, the source clip is defective and the');
  console.error('        row has to be re-generated — patching it makes the bars flicker mid-animation.');
}
if (fringed > 0) {
  console.error(`[atlas] FAIL — ${fringed} atlas(es) carry a near-white FRINGE on the cut-out edge.`);
  console.error('        This is the owner reporting "you can see something white around it, outside');
  console.error('        his perimeter". A MATTE problem, not a generation one: the alpha edge was cut');
  console.error('        one pixel outside the ink, so the clip background survives as a rim. Re-matte the');
  console.error('        row with a tighter edge rather than re-rolling the clip.');
}
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
// ⚠ S171 — `fringed` BELONGS IN THIS LINE, and forgetting it is how a new check ships inert:
// it would print FRINGE for six atlases and still exit 0, which is worse than not having it.
if (bad > 0 || sized > 0 || leaky > 0 || boxed > 0 || fringed > 0) process.exit(1);
// ⚠ Say WHICH checks actually ran. "clean on both checks" when only one ran is exactly the kind of
// false assurance this repo has been bitten by before (a gate that FAILED read as passing, S161).
const ran = noSize
  ? 'the scenery, white-leak, edge-fringe and letterbox checks'
  : 'all five checks';
const tol = allowScenery > 0 ? ` (scenery tolerance ${allowScenery} px)` : '';
console.log(`[atlas] OK — ${files.length} atlas(es) clean on ${ran}${tol}.`);
