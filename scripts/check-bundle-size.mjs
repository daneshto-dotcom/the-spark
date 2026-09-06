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

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CAP_KIB = 900; // ← keep in sync with LOCKED_DECISIONS.md § Bundle charter (raised 750→900 S145)
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
/*
 * ⭐ S165 — THE STATIC PAYLOAD, REPORTED. A sweep asked why a "bundle charter" says nothing about
 * the 63 MB of `public/` that ships beside the bundle, and the honest answer was that nobody had
 * ever looked. This prints it.
 *
 * ⛔ REPORTED, NOT GATED, AND THAT IS DELIBERATE — the same session learned this the hard way. An
 * asset guard wired into `npm run build` took the live deploy down over a missing pip package, and
 * the site sat stale while the owner waited on new art. An art budget must never be able to stop a
 * ship. This line exists so the number is VISIBLE on every build instead of invisible until it is a
 * problem; the JS entry chunk remains the only thing with teeth.
 *
 * ⚠ AND IT IS NOT AN INITIAL-LOAD NUMBER. Every atlas and backdrop here is fetched on demand — a
 * player who never sees a mummies zone never downloads one. Read it as total hosted weight (a
 * Pages-quota and cache-churn figure), never as what the first frame costs.
 */
const walk = (dir) => {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push([full, statSync(full).size]);
  }
  return out;
};
try {
  const all = walk(dist);
  const isCode = (f) => /\.(js|css|html|map)$/i.test(f);
  const assets = all.filter(([f]) => !isCode(f));
  const total = assets.reduce((a, [, b]) => a + b, 0);
  const mib = (b) => (b / (1024 * 1024)).toFixed(1);
  const byDir = new Map();
  for (const [f, b] of assets) {
    const rel = f.slice(dist.length + 1).split(String.fromCharCode(92)).join('/');
    const key = rel.split('/').slice(0, 2).join('/');
    byDir.set(key, (byDir.get(key) ?? 0) + b);
  }
  const top = [...byDir].sort((a, b) => b[1] - a[1]).slice(0, 4);
  console.log(
    `[bundle] static assets (NOT gated, NOT initial-load): ${mib(total)} MiB across `
    + `${assets.length} files — ${top.map(([k, b]) => `${k} ${mib(b)}M`).join(', ')}`,
  );
} catch {
  // A missing or unreadable dist subtree is not a reason to fail a build that already passed.
}

console.log('[bundle] OK — under charter.');
