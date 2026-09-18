// SPARK — S182: does THIS build actually have a shared leaderboard?
//
// ⭐ WHY THIS RUNS IN CI AT ALL, AND IT IS THE SAME ARGUMENT AS `turn-wiring-report.mjs`.
//
// S157 left the owner one action — provision an account and supply a value — and the failure mode of
// THAT action is silent: a misspelled variable name, a value set on the wrong repository, or a paste
// that arrives wrapped produces a perfectly green deploy that ships nothing. There is nothing to look
// at. S158 wrote that lesson down; S162 then proved the report itself could lie.
//
// The leaderboard is the identical shape. The owner deploys a worker, pastes a URL into a repository
// variable, pushes, watches a green deploy — and if anything about that value is wrong the arcade
// board silently keeps showing only his own rows. **Which is exactly the bug he reported to begin
// with.** He would have no way to tell the fix from the bug.
//
// ⛔ AND THE S162 RULE IS OBEYED HERE BY CONSTRUCTION: "A WATCHDOG THAT SHARES THE WATCHED CODE'S
// BLIND SPOT IS NOT A WATCHDOG. 'Is it set' was never the question. 'Is it USABLE' is." So this does
// NOT test for non-emptiness. It runs the SAME origin rule the client runs, and
// `src/ci.leaderboardGate.test.ts` asserts the two literals are byte-identical so they cannot drift.
//
// ⚠ THIS NEVER FAILS THE BUILD. An unset leaderboard is a fully supported state — the client falls
// back to the local board exactly as it has since S149. Exiting non-zero here would turn "the owner
// has not deployed the worker yet" into a broken deploy of the whole game, which is the mistake
// `check:atlas` already made once (S165) and that this project has a standing rule against.

/** ⚠ MUST MATCH `LEADERBOARD_ORIGIN_RE` in src/render/arcadeLeaderboard.ts — pinned by src/ci.leaderboardGate.test.ts. */
const LEADERBOARD_ORIGIN_RE =
  /^https?:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(?::\d{1,5})?$/i;

/** ⚠ MUST MATCH `LOCAL_HOSTS` in src/render/arcadeLeaderboard.ts. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** ⚠ MUST MATCH `parseLeaderboardBase` in src/render/arcadeLeaderboard.ts. */
function parseLeaderboardBase(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  // ⚠ THE `(?!\/\/)` IS LOAD-BEARING AND ITS ABSENCE WAS CAUGHT BY RUNNING THIS, NOT BY READING IT.
  // Without it this label-stripper reads `https:` in `https://host` as a `key:` prefix and eats the
  // scheme, so the parser rejected every VALID url and accepted only wrapped ones — precisely
  // inverted. A scheme is a colon followed by `//`; a pasted label never is.
  s = s.replace(/^[A-Za-z_][A-Za-z0-9_]*\s*[:=]\s*(?!\/\/)/, '').trim();
  s = s.replace(/,+$/, '').trim();
  const quoted = /^(['"`])([\s\S]*)\1$/.exec(s);
  if (quoted !== null) s = quoted[2].trim();
  s = s.replace(/\/+$/, '');
  if (s === '' || s === 'undefined' || s === 'null' || s === 'false') return '';
  if (!LEADERBOARD_ORIGIN_RE.test(s)) return '';
  if (s.toLowerCase().startsWith('http://')) {
    const host = s.slice('http://'.length).split(':')[0].toLowerCase();
    if (!LOCAL_HOSTS.has(host)) return '';
  }
  return s;
}

const NAME = 'VITE_LEADERBOARD_URL';
const raw = process.env[NAME] ?? '';
const parsed = parseLeaderboardBase(raw);

console.log('── SPARK leaderboard wiring ──────────────────────────────────────────');

if (raw.trim() === '') {
  console.log(`   ${NAME}: not set`);
  console.log('   ℹ️  NO SHARED BOARD IN THIS BUILD — the arcade uses the local per-browser table.');
  console.log('      This is a supported state, not a failure. See server/leaderboard/README.md.');
} else if (parsed === '') {
  // ⛔ THE CASE THIS FILE EXISTS FOR: set, non-empty, and unusable. Say WHICH failure it is, because
  // "it is wrong" without a reason is what sends someone back to a five-step runbook blind.
  const t = raw.trim();
  let why = 'not a bare https origin (scheme + host + optional port, no path or query)';
  if (/^http:\/\//i.test(t)) {
    why = 'plain http — the live site is HTTPS, so the browser blocks this as mixed content and ' +
      'no request ever leaves the page. Use https://';
  } else if (!/^https?:\/\//i.test(t)) {
    why = 'no scheme — fetch would resolve this relative to spark-online.space. Prefix https://';
  } else if (/^https?:\/\/[^/?#]+[/?#]/i.test(t)) {
    why = 'contains a path or query — pass only the worker origin, the client appends /board/<id>';
  }
  console.log(`   ${NAME}: SET but UNUSABLE`);
  console.log(`   ❌ ${why}`);
  console.log('   ⚠️  THE BUILD WILL SHIP WITH NO SHARED BOARD and the arcade will look exactly as');
  console.log('      it did before — only your own scores. This line is the only warning you get.');
} else {
  console.log(`   ${NAME}: ${parsed}`);
  console.log('   ✅ SHARED BOARD WILL BE SHIPPED — the arcade will read and write this worker.');
}
console.log('──────────────────────────────────────────────────────────────────────');

// Always 0. See the header: an unset or malformed leaderboard must never break a deploy of the game.
process.exit(0);
