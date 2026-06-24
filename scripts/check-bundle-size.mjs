// SPARK — main-bundle charter guard (S95 P1).
//
// The "550 KiB charter" lived only in handoff prose for ~40 sessions with NO mechanical guard, so
// nothing ever blocked a size regression (it had silently crept to 553.0 KiB). This runs as the
// last step of `npm run build` — so the deploy.yml CI (`npm ci && npm run build`) enforces it — and
// fails the build when the main entry chunk exceeds the cap. Measures the RAW byte size of the
// hashed entry chunk (the historical metric is raw KiB = bytes / 1024), found by parsing the entry
// <script> out of dist/index.html so it is robust to Vite's content-hash filenames. Also prints the
// total INITIAL JS (entry + modulepreloaded chunks) for trend visibility, but the GATE is the entry
// chunk alone — that is what the charter has always meant.
//
// To change the cap: bump CAP_KIB here AND update the bundle clause in LOCKED_DECISIONS.md. Both
// moving together is the point — the charter is no longer a number that drifts in prose.

import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CAP_KIB = 750; // ← keep in sync with LOCKED_DECISIONS.md § Bundle charter (raised 560→750 S101)
const CAP_BYTES = CAP_KIB * 1024;
// S101 early-warning band: shout when headroom drops below this BEFORE the hard cap
// silently hard-fails `npm run build` (= the exact command deploy.yml runs → a breach
// blocks the live deploy, not just a local build). Policy: when you see this warning,
// RAISE the charter now (bump CAP_KIB + the LOCKED_DECISIONS clause) — the cap is
// self-imposed, gzip transfer is tiny, and raising it is cheaper than a stuck deploy.
const WARN_HEADROOM_KIB = 60;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

let html;
try {
  html = readFileSync(resolve(dist, 'index.html'), 'utf8');
} catch {
  console.error('[bundle] dist/index.html not found — run `vite build` first.');
  process.exit(2);
}

const entryMatch = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
if (entryMatch === null) {
  console.error('[bundle] could not locate the entry module <script> in dist/index.html.');
  process.exit(2);
}

const sizeOf = (rel) => statSync(resolve(dist, rel.replace(/^\//, ''))).size;
const entryRel = entryMatch[1];
const entryBytes = sizeOf(entryRel);

// Informational: sum the entry + every modulepreloaded chunk (the true initial JS download).
const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
let initialBytes = entryBytes;
for (const href of preloads) {
  try { initialBytes += sizeOf(href); } catch { /* ignore a missing preload */ }
}

const kib = (b) => (b / 1024).toFixed(1);
console.log(`[bundle] main entry ${entryRel.replace(/^\//, '')}: ${kib(entryBytes)} KiB (${entryBytes} B)`);
console.log(`[bundle] cap ${CAP_KIB} KiB — headroom ${kib(CAP_BYTES - entryBytes)} KiB`);
console.log(`[bundle] total initial JS (entry + ${preloads.length} modulepreloads): ${kib(initialBytes)} KiB`);

if (entryBytes > CAP_BYTES) {
  console.error(
    `[bundle] FAIL: main entry ${kib(entryBytes)} KiB exceeds the ${CAP_KIB} KiB charter by `
    + `${kib(entryBytes - CAP_BYTES)} KiB.`,
  );
  console.error('[bundle] This HARD-FAILS the deploy (npm run build). RAISE the charter (CAP_KIB here + LOCKED_DECISIONS.md) — the cap is self-imposed; do NOT get stuck debugging it.');
  process.exit(1);
}
const headroomKib = (CAP_BYTES - entryBytes) / 1024;
if (headroomKib < WARN_HEADROOM_KIB) {
  // Non-fatal early warning (S101): caught locally on every `npm run build` so the
  // next session raises the cap proactively instead of discovering a blocked deploy.
  console.warn(
    `[bundle] ⚠ WARNING: only ${headroomKib.toFixed(1)} KiB headroom under the ${CAP_KIB} KiB cap. `
    + `Per S101 policy, RAISE the charter NOW (CAP_KIB + LOCKED_DECISIONS clause) before it hard-fails a deploy.`,
  );
}
console.log('[bundle] OK — under charter.');
