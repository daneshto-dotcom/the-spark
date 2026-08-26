/**
 * SPARK — CHARACTER CLIP GENERATOR (S152 P3).
 *
 * The middle stage of the art pipeline: design PNG → **veo clips** → `build-sprite-atlas.mjs`.
 *
 * ## ⛔ WHY THIS IS A SCRIPT AND NOT THE `veo_generate` MCP TOOL
 *
 * That tool is fine and it works — it is just SEQUENTIAL and BLOCKING. One clip takes 1–3 minutes,
 * a character needs three states, and this priority needs eleven clips; done one at a time that is
 * half an hour of waiting. This fires every request first, collects the operation names, then polls
 * them together, so the wall-clock is roughly ONE clip rather than eleven.
 *
 * ## ⭐ EVERY CLIP IS SEEDED IMAGE-TO-VIDEO OFF THE CHARACTER'S OWN PNG
 *
 * The owner's standing requirement: *"make sure the goblin when he is idle or walking is same as
 * attacking... need to stay consistent throughout"*. Text-to-video three times gives three different
 * goblins. The seed image is what makes idle/walk/attack the SAME character.
 *
 * ## ⛔ AND THE HARD LESSON FROM THE SHIPPED STINK TOWER
 *
 * S151's tower MORPHS between frames — its branch count changes across idle f0/f4/f8, so in play it
 * appears to melt. veo re-drew the subject each frame instead of animating a fixed one. For an
 * organic character that reads as life; for a STRUCTURE it reads as broken. So a spec may set
 * `staticSubject: true`, which appends an explicit hold-the-geometry instruction.
 *
 * ⚠ THAT IS A PROMPT, NOT A GUARANTEE. Nothing here can verify the subject held still, so the
 * frames MUST be looked at before an atlas is wired in — extract with ffmpeg and montage them.
 * That audition is how the shipped tower's melting was found in the first place, and it is a step
 * a human performs, not something this script asserts.
 *
 * ⚠ RETAINED IN-TREE ON PURPOSE. S151 kept neither its specs nor its clips, so the three atlases it
 * shipped cannot be rebuilt or retuned — the owner asked for the stink tower to be redone and there
 * was no source to redo it from. Clips land under `assets-source/` and stay there.
 *
 * ## ⛔ TWO DEFECTS THIS SCRIPT SHIPPED WITH, AND WHAT THEY COST
 *
 * 1. **veo HAS A CONCURRENCY QUOTA.** Firing eleven at once returns `429 RESOURCE_EXHAUSTED` part
 *    way down the list. Requests are now issued in batches of `CONCURRENCY`, and a 429 is treated
 *    as backpressure to retry rather than a failure.
 *
 * 2. ⛔ **AN OPERATION NAME IS MONEY, SO IT IS WRITTEN TO DISK THE MOMENT IT EXISTS.** The first
 *    version THREW on the first queue error, which abandoned SEVEN already-accepted operations —
 *    all of them running and billed on Google's side, with their names only ever held in a local
 *    variable. That is roughly $3.50 of generation made unrecoverable by an error path. Each op
 *    name now lands in `<out>.op.json` immediately, a later run picks up any op that has no mp4
 *    beside it, and a per-clip failure is COLLECTED rather than thrown.
 *
 * Usage:
 *   node scripts/gen-character-clips.mjs <spec.json> [--only <character>] [--state <name>]
 *                                        [--skip-existing]
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';

const PREDICT = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:predictLongRunning';
const OPERATION = 'https://generativelanguage.googleapis.com/v1beta/{name}';
const MODEL = 'veo-3.1-generate-preview'; // strongest tier — quality over cost (ALWAYS-STRONGEST)

/** Read from the MCP server's env; never written to disk, never logged. */
function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envPath = join(homedir(), '.claude', 'mcp-servers', 'gcp-vertex', '.env');
  if (!existsSync(envPath)) throw new Error(`no GEMINI_API_KEY and no ${envPath}`);
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^GEMINI_API_KEY=(.+)$/.exec(line.trim());
    if (m) return m[1];
  }
  throw new Error('GEMINI_API_KEY not found in the gcp-vertex .env');
}

/**
 * ⭐ THE SHARED CLIP INSTRUCTION.
 *
 * `build-sprite-atlas.mjs` mattes by finding near-white connected to the frame border and crops a
 * per-clip content column. Both of those depend on the background staying a flat white field and the
 * camera staying still, so these are PIPELINE REQUIREMENTS rather than aesthetic notes:
 *   · a moving camera makes the letterbox column move, and the builder measures it ONCE per clip;
 *   · a tinted or textured floor defeats the matte and the sprite ships inside a visible box, which
 *     the owner has already rejected once ("the old sprite had a visible square box").
 */
const SHARED = [
  'Traditional 2D cartoon animation of this exact character, in the same bold black ink outline and',
  'flat cel-shaded style as the source image, with the same colours.',
  'The camera is COMPLETELY STATIC — no pan, no zoom, no parallax, no camera shake.',
  'The character stays centered in frame at a constant size and never walks out of shot.',
  'Plain solid pure white background, empty, no floor, no scenery, no shadow cast on anything,',
  'no text, no watermark, no letterboxing artwork, no vignette.',
  'Smooth loopable motion.',
].join(' ');

/** Appended when a subject must not be re-drawn frame to frame. See the header. */
const STATIC_SUBJECT = [
  'CRITICAL: the structure itself is rigid and absolutely motionless — its shape, its silhouette,',
  'the number of its branches and the position of every part stay EXACTLY as in the source image in',
  'every single frame. Do not redraw, redesign, add or remove any part of it.',
  'ONLY the loose elements move.',
].join(' ');

const specPath = process.argv[2];
if (specPath === undefined) {
  console.error('usage: node scripts/gen-character-clips.mjs <spec.json> [--only <character>] [--state <name>]');
  process.exit(2);
}
const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
};
const only = argOf('--only');
const onlyState = argOf('--state');
// ⭐ --skip-existing: a clip that already downloaded is never re-paid for. veo is billed per
// generation, so a run where 1 of 11 clips fails must not cost eleven more to retry.
const skipExisting = process.argv.includes('--skip-existing');

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const key = apiKey();

/**
 * How many generations may be in flight at once. veo answers `429 RESOURCE_EXHAUSTED` beyond its
 * quota, and the first run of this script found that ceiling at eight.
 */
const CONCURRENCY = 4;

/* ── 1. BUILD THE WORK LIST (no requests yet) ─────────────────────────────────────────────────── */
const jobs = [];
for (const ch of spec.characters) {
  if (only !== null && ch.name !== only) continue;
  const seed = resolve(ch.seed);
  if (!existsSync(seed)) throw new Error(`${ch.name}: seed image missing: ${seed}`);
  const b64 = readFileSync(seed).toString('base64');
  const mime = seed.endsWith('.jpg') || seed.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';

  for (const [state, cfg] of Object.entries(ch.states)) {
    if (onlyState !== null && state !== onlyState) continue;
    const out = resolve(ch.outDir ?? `assets-source/${ch.name}`, `${state}.mp4`);
    if (skipExisting && existsSync(out)) {
      console.log(`  skip ${ch.name}/${state} (already downloaded)`);
      continue;
    }
    mkdirSync(dirname(out), { recursive: true });
    const prompt = [cfg.prompt, SHARED, ch.staticSubject === true ? STATIC_SUBJECT : ''].join(' ').trim();

    const body = {
      instances: [{ prompt, image: { bytesBase64Encoded: b64, mimeType: mime } }],
      parameters: {
        aspectRatio: '16:9',
        resolution: spec.resolution ?? '720p',
        durationSeconds: spec.durationSeconds ?? 4,
      },
    };
    jobs.push({ label: `${ch.name}/${state}`, out, body, opName: null });
  }
}
if (jobs.length === 0) {
  console.error('no jobs matched the filters');
  process.exit(2);
}

const sleep = (ms) => execFileSync('node', ['-e', `setTimeout(()=>{}, ${ms})`], { timeout: ms + 5000 });
const failures = [];

/**
 * ⛔ PERSIST THE OPERATION NAME BEFORE ANYTHING ELSE CAN GO WRONG.
 *
 * An accepted operation is BILLED whether or not this process survives to download it. The first
 * version of this script held names in a local array and threw on the first queue error, orphaning
 * seven paid generations. The name goes to disk the instant veo returns it, so any later run can
 * pick the result up.
 */
function opFile(out) {
  return `${out}.op.json`;
}

/** Submit one job. Returns 'ok' | 'quota' | 'fail' — a 429 is BACKPRESSURE, not a failure. */
function submit(job) {
  // Already submitted by an earlier run? Reuse it rather than paying twice.
  if (existsSync(opFile(job.out))) {
    try {
      const prev = JSON.parse(readFileSync(opFile(job.out), 'utf8'));
      if (typeof prev.name === 'string' && prev.name !== '') {
        job.opName = prev.name;
        console.log(`  resume ${job.label} (op from a previous run)`);
        return 'ok';
      }
    } catch { /* unreadable — fall through and submit fresh */ }
  }

  const reqFile = `${job.out}.req.json`;
  writeFileSync(reqFile, JSON.stringify(job.body));
  let respRaw;
  try {
    respRaw = execFileSync('curl', [
      '-sS', '-X', 'POST', PREDICT.replace('{model}', MODEL),
      '-H', 'Content-Type: application/json',
      '-H', `x-goog-api-key: ${key}`,
      '-d', `@${reqFile}`,
    ]).toString();
  } finally {
    // The request body carries a whole base64 image; never leave it lying around.
    rmSync(reqFile, { force: true });
  }

  let op;
  try {
    op = JSON.parse(respRaw);
  } catch {
    failures.push(`${job.label}: veo returned non-JSON: ${respRaw.slice(0, 200)}`);
    return 'fail';
  }
  if (op.error !== undefined) {
    if (op.error.code === 429) return 'quota';
    failures.push(`${job.label}: veo ${op.error.code} ${op.error.status}: ${op.error.message}`);
    return 'fail';
  }
  if (typeof op.name !== 'string' || op.name === '') {
    failures.push(`${job.label}: no operation name in ${JSON.stringify(op).slice(0, 200)}`);
    return 'fail';
  }
  job.opName = op.name;
  writeFileSync(opFile(job.out), JSON.stringify({ name: op.name, label: job.label }));
  console.log(`  queued ${job.label}`);
  return 'ok';
}

/** Poll one in-flight job. Returns true when it is finished with (downloaded or failed). */
function collect(job) {
  const raw = execFileSync('curl', [
    '-sS', OPERATION.replace('{name}', job.opName),
    '-H', `x-goog-api-key: ${key}`,
  ]).toString();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return false; // transient — retry next round rather than killing the batch
  }
  if (data.done !== true) return false;

  if (data.error !== undefined) {
    failures.push(`${job.label}: ${data.error.message}`);
    console.log(`  x ${job.label}: ${data.error.message}`);
    rmSync(opFile(job.out), { force: true });
    return true;
  }
  const samples = data.response?.generateVideoResponse?.generatedSamples ?? [];
  const uri = samples[0]?.video?.uri ?? '';
  if (uri === '') {
    // ⚠ A REFUSAL LANDS HERE, NOT IN `error`. Surface the whole response so the reason is legible
    // rather than reported as "no samples" — a violence-flagged prompt reads as an empty success.
    const reason = JSON.stringify(data.response ?? data).slice(0, 400);
    failures.push(`${job.label}: no video returned - ${reason}`);
    console.log(`  x ${job.label}: no video returned - ${reason}`);
    rmSync(opFile(job.out), { force: true });
    return true;
  }
  execFileSync('curl', ['-sS', '-L', uri, '-H', `x-goog-api-key: ${key}`, '-o', job.out]);
  rmSync(opFile(job.out), { force: true }); // the mp4 is the receipt now
  console.log(`  + ${job.label} -> ${job.out}`);
  return true;
}

/* ── SUBMIT IN BATCHES, POLLING AS SLOTS FREE ─────────────────────────────────────────────────── */
const queue = [...jobs];
const inFlight = [];
console.log(`\n${queue.length} clip(s) to generate, ${CONCURRENCY} at a time...\n`);

for (let round = 0; round < 200 && (queue.length > 0 || inFlight.length > 0); round++) {
  // Fill the free slots.
  while (inFlight.length < CONCURRENCY && queue.length > 0) {
    const job = queue[0];
    const verdict = submit(job);
    if (verdict === 'quota') {
      console.log(`     quota reached with ${inFlight.length} in flight - waiting`);
      break; // leave it queued; a slot will free up
    }
    queue.shift();
    if (verdict === 'ok') inFlight.push(job);
  }
  if (inFlight.length === 0 && queue.length === 0) break;

  sleep(10_000);
  for (let i = inFlight.length - 1; i >= 0; i--) {
    if (collect(inFlight[i])) inFlight.splice(i, 1);
  }
  if (queue.length > 0 || inFlight.length > 0) {
    console.log(`     ... ${inFlight.length} running, ${queue.length} waiting (round ${round + 1})`);
  }
}

for (const j of [...inFlight, ...queue]) {
  failures.push(`${j.label}: not finished - op name kept at ${opFile(j.out)} for a later run`);
}
if (failures.length > 0) {
  console.error(`\n${failures.length} clip(s) FAILED:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nall clips generated');
