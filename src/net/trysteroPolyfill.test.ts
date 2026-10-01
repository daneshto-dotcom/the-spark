/**
 * S192 T1 — two tripwires for the pool-safe RTCPeerConnection (`poolSafePeerConnection.ts`).
 *
 * 1. ⛔ WIRING, ENUMERATED MECHANICALLY. Every Trystero join CALL in `src/` (non-test) must pass
 *    `rtcPolyfill: POOL_SAFE_PC`. The call sites are FOUND, not listed: every local name a file
 *    imports `joinRoom` under from `@trystero-p2p/*`, plus the `joinFn(` parameter `transport.ts`
 *    routes its dynamically-imported strategies through. The total is pinned, so a new call site
 *    fails here until someone wires it (CLAUDE.md §2: make the enumeration mechanical).
 *    ⚠ Why EVERY site, not just the game's: the strategy's offer pool is built by the FIRST
 *    `joinRoom` on a page and closes over that call's config (`strategy.mjs:95-96`) — in Quick Match
 *    that is the discovery room, not the game room.
 *    ⚠ A source-text guard proves the line EXISTS, not that it is REACHED. The reach proofs are
 *    `poolSafePeerConnection.test.ts` (Trystero's own restart code over a fake base) and the e2e
 *    `nplayer.spec.ts` 4-player mesh with forced offer staleness.
 *
 * 2. ⛔ UPSTREAM VERSION PIN. The workaround is shaped to Trystero 0.25.x's restart code. An upgrade
 *    turns this RED on purpose: re-read `peer.mjs` `createOffer`, decide whether the workaround is
 *    still needed and still sufficient, then re-pin. (0.25.4 was checked S192 and is identical.)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const norm = (s: string): string => s.replace(/\r\n/g, '\n');

/**
 * ⛔ `src/arcade/**` IS NOT SPARK AND IS NEVER ENUMERATED. Owner, S192: *"Don't touch that game … Just
 * think about it as a whole different Git … it's living inside the arcade of spark-online.space … only
 * because I don't want to buy a new domain … Do not touch pitch masters."* It is another project that
 * only shares the domain and this repo; its Trystero joins are its own business, so this guard must not
 * demand anything of them.
 */
const OTHER_PROJECT_DIR = join(ROOT, 'src', 'arcade');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (p === OTHER_PROJECT_DIR) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/** Strip block comments and `//` line comments (a `//` preceded by `:` — a URL — is kept). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** The text between the `(` at `open` and its matching `)`. */
function callArgs(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error('unbalanced call');
}

interface JoinSite { file: string; callee: string; args: string }

function findJoinSites(): JoinSite[] {
  const sites: JoinSite[] = [];
  for (const abs of walk(join(ROOT, 'src'))) {
    const file = relative(ROOT, abs).replace(/\\/g, '/');
    const src = stripComments(norm(readFileSync(abs, 'utf8')));
    const names = new Set<string>();
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]@trystero-p2p\/[^'"]+['"]/g)) {
      for (const part of m[1]!.split(',')) {
        const mm = /^\s*joinRoom(?:\s+as\s+(\w+))?\s*$/.exec(part);
        if (mm) names.add(mm[1] ?? 'joinRoom');
      }
    }
    // transport.ts routes nostr AND the dynamically-imported torrent/mqtt `mod.joinRoom` through
    // this one parameter; it is the call site for all of them.
    if (/\bjoinFn\s*:\s*JoinFn\b/.test(src)) names.add('joinFn');
    for (const name of names) {
      for (const m of src.matchAll(new RegExp(`\\b${name}\\s*\\(`, 'g'))) {
        const open = m.index! + m[0].length - 1;
        sites.push({ file, callee: name, args: callArgs(src, open) });
      }
    }
  }
  return sites.sort((a, b) => (a.file + a.callee).localeCompare(b.file + b.callee));
}

describe('S192 T1 — every Trystero join passes the pool-safe rtcPolyfill', () => {
  const sites = findJoinSites();

  it('the enumerated SPARK call sites are exactly the known two (a new one must be wired, then re-pinned)', () => {
    expect(sites.map((s) => `${s.file}:${s.callee}`)).toEqual([
      'src/net/quickmatch.ts:joinNostr',
      'src/net/transport.ts:joinFn',
    ]);
  });

  it.each(findJoinSites().map((s) => [`${s.file}:${s.callee}`, s] as const))(
    '%s passes rtcPolyfill: POOL_SAFE_PC',
    (_label, site) => {
      expect(site.args, `${site.file} joins Trystero without the pool-safe PC`).toMatch(
        /\brtcPolyfill\s*:\s*POOL_SAFE_PC\b/,
      );
    },
  );

  it('a dynamically-imported strategy\'s joinRoom is only ever handed to transport.ts\'s joinFn', () => {
    // `mod.joinRoom` called directly anywhere would be a join site this enumeration cannot see.
    for (const abs of walk(join(ROOT, 'src'))) {
      const file = relative(ROOT, abs).replace(/\\/g, '/');
      const src = stripComments(norm(readFileSync(abs, 'utf8')));
      expect(/\.joinRoom\s*\(/.test(src), `${file} calls <module>.joinRoom( directly`).toBe(false);
      if (/\.joinRoom\b/.test(src)) expect(file).toBe('src/net/transport.ts');
    }
  });
});

/**
 * ⛔⛔ S193 (lobby4 audit L2) — **THE DYNAMIC-IMPORT HOLE, CLOSED MECHANICALLY.**
 *
 * The enumeration above finds a join by NAME: `joinRoom` (or its alias) from a STATIC
 * `import { … } from '@trystero-p2p/*'`, plus transport's `joinFn(`. Everything reached any other way was
 * invisible to it, and the `.joinRoom(` sweep below it only caught a direct member call:
 *   · `const { joinRoom } = await import('@trystero-p2p/torrent'); joinRoom(cfg, …)` — a destructured
 *     dynamic import, or `.then(({ joinRoom }) => joinRoom(…))`;
 *   · `const j = mod.joinRoom; j(…)`, or `mod['joinRoom'](…)`;
 *   · an alias handed off: `const j = joinNostr; j(…)`;
 *   · a namespace import (`import * as T from '@trystero-p2p/nostr'`) or a re-export.
 * Each would join Trystero WITHOUT the pool-safe PC and stay green.
 *
 * So instead of searching for the shapes a join can take, this classifies EVERY occurrence of the
 * `joinRoom` token and of every imported alias in SPARK source, and allows exactly the shapes that are
 * already covered — anything else is a failure naming its file and text. And every dynamic import of a
 * Trystero module is pinned, so a new one must be looked at.
 */
describe('⛔ S193 L2 — every way to reach a Trystero joinRoom is one the enumeration above covers', () => {
  const TRYSTERO = /['"](?:@trystero-p2p\/[^'"]+|trystero(?:\/[^'"]*)?)['"]/;

  function sources(): Array<{ file: string; src: string }> {
    return walk(join(ROOT, 'src')).map((abs) => ({
      file: relative(ROOT, abs).replace(/\\/g, '/'),
      src: stripComments(norm(readFileSync(abs, 'utf8'))),
    }));
  }

  /** Every token occurrence that is NOT one of the allowed shapes, as `file: <line text>`. */
  function unclassified(file: string, src: string): string[] {
    const bad: string[] = [];
    const lineOf = (i: number): string => src.slice(src.lastIndexOf('\n', i) + 1, src.indexOf('\n', i)).trim();
    // Static named imports from Trystero: the specifier list is an ALLOWED site for `joinRoom`, and its
    // local alias (if any) becomes a name whose every use is classified below.
    const importSpans: Array<[number, number]> = [];
    const aliases = new Set<string>();
    for (const m of src.matchAll(/import\s*(type\s*)?\{([^}]*)\}\s*from\s*(['"][^'"]+['"])/g)) {
      if (!TRYSTERO.test(m[3]!)) continue;
      importSpans.push([m.index!, m.index! + m[0].length]);
      if (m[1] !== undefined) continue;
      for (const part of m[2]!.split(',')) {
        const mm = /^\s*joinRoom(?:\s+as\s+(\w+))?\s*$/.exec(part);
        if (mm) aliases.add(mm[1] ?? 'joinRoom');
      }
    }
    const inImport = (i: number): boolean => importSpans.some(([a, b]) => i >= a && i < b);
    // Any other import form of a Trystero module: namespace, default, side-effect, re-export, require.
    for (const m of src.matchAll(/(?:import\s*\*\s*as\s+\w+\s*from|import\s+\w+\s*(?:,\s*\{[^}]*\})?\s*from|export\s*(?:\*|\{[^}]*\})\s*from|require\s*\()\s*(['"][^'"]+['"])/g)) {
      if (TRYSTERO.test(m[1]!)) bad.push(`${file}: ${lineOf(m.index!)}`);
    }
    // 1. Every `joinRoom` token: inside a Trystero import's specifier list, or `mod.joinRoom as JoinFn`
    //    handed to transport's startStrategy (whose `joinFn(` call the enumeration above checks).
    for (const m of src.matchAll(/joinRoom/g)) {
      const i = m.index!;
      if (inImport(i)) continue;
      if (file === 'src/net/transport.ts' && /^\bmod\.joinRoom as JoinFn,$/.test(lineOf(i)) && /\bmod\.$/.test(src.slice(i - 4, i))) continue;
      bad.push(`${file}: ${lineOf(i)}`);
    }
    // 2. Every use of an imported alias: a CALL (checked above), `typeof alias` in a type position, or
    //    `alias as JoinFn` handed to transport's startStrategy.
    for (const name of aliases) {
      if (name === 'joinRoom') continue; // a bare `joinRoom` import's calls are caught by rule 1 and checked above
      for (const m of src.matchAll(new RegExp(`\\b${name}\\b`, 'g'))) {
        const i = m.index!;
        if (inImport(i)) continue;
        const after = src.slice(i + name.length);
        const before = src.slice(Math.max(0, i - 7), i);
        if (/^\s*\(/.test(after)) continue; // a call — the enumeration above requires the polyfill on it
        if (/typeof\s+$/.test(before)) continue; // a type query, never a value
        if (file === 'src/net/transport.ts' && /^\s+as JoinFn,/.test(after)) continue;
        bad.push(`${file}: ${lineOf(i)}`);
      }
    }
    // 3. A string key or computed member that names it.
    for (const m of src.matchAll(/\[\s*['"`]joinRoom['"`]\s*\]|['"`]joinRoom['"`]/g)) bad.push(`${file}: ${lineOf(m.index!)}`);
    return bad;
  }

  /** Every `import(…)` of a Trystero module, as `file:<module>` (it must be looked at before it is added). */
  function dynamicImports(file: string, src: string): string[] {
    const out: string[] = [];
    for (const m of src.matchAll(/\bimport\s*\(\s*(['"][^'"]+['"]|[^)'"]+)\s*\)/g)) {
      const spec = m[1]!;
      if (TRYSTERO.test(spec)) out.push(`${file}:${spec.slice(1, -1)}`);
      // A computed specifier cannot be checked at all; none exists in src/net, so pin that too.
      else if (!/^['"]/.test(spec) && file.startsWith('src/net/')) out.push(`${file}:<computed ${spec.trim()}>`);
    }
    return out;
  }

  it('no SPARK source reaches joinRoom by any shape the call-site enumeration cannot see', () => {
    const bad = sources().flatMap(({ file, src }) => unclassified(file, src));
    expect(bad, 'a joinRoom reached around the enumeration — wire POOL_SAFE_PC through a covered shape').toEqual([]);
  });

  it('the dynamically-imported Trystero modules are exactly the two transport hands to joinFn', () => {
    expect(sources().flatMap(({ file, src }) => dynamicImports(file, src)).sort()).toEqual([
      'src/net/transport.ts:@trystero-p2p/mqtt',
      'src/net/transport.ts:@trystero-p2p/torrent',
    ]);
  });

  it('each of those dynamic imports hands its joinRoom ONLY to startStrategy (the joinFn the enumeration checks)', () => {
    const t = stripComments(norm(readFileSync(join(ROOT, 'src/net/transport.ts'), 'utf8')));
    for (const mod of ['torrent', 'mqtt']) {
      const at = t.indexOf(`import('@trystero-p2p/${mod}')`);
      expect(at, mod).toBeGreaterThan(-1);
      const then = /^\s*\.then\(\(mod\) => \{/.exec(t.slice(at + `import('@trystero-p2p/${mod}')`.length));
      expect(then, `${mod}: the .then((mod) => { … }) shape changed — re-check what reaches joinRoom`).not.toBeNull();
      const bodyStart = t.indexOf('{', at + `import('@trystero-p2p/${mod}')`.length);
      const body = t.slice(bodyStart, t.indexOf('.catch(', bodyStart));
      expect(body.match(/joinRoom/g), `${mod}: exactly one joinRoom use`).toHaveLength(1);
      expect(body).toMatch(/this\.startStrategy\(\s*'\w+',\s*roomCode,\s*mod\.joinRoom as JoinFn,/);
    }
  });

  it('⛔ the classifier itself catches every hole the audit named (mutation fixtures)', () => {
    const holes: Record<string, string> = {
      destructuredDynamic: "async function f() { const { joinRoom } = await import('@trystero-p2p/torrent'); joinRoom(cfg, code); }",
      thenDestructure: "import('@trystero-p2p/torrent').then(({ joinRoom }) => joinRoom(cfg, code));",
      memberAlias: 'function f(mod) { const j = mod.joinRoom; j(cfg, code); }',
      computed: "function f(mod) { mod['joinRoom'](cfg, code); }",
      aliasHandoff: "import { joinRoom as joinNostr } from '@trystero-p2p/nostr';\nconst j = joinNostr;\nj(cfg, code);",
      namespace: "import * as T from '@trystero-p2p/nostr';\nT.joinRoom(cfg, code);",
      reExport: "export { joinRoom } from '@trystero-p2p/nostr';",
    };
    for (const [name, src] of Object.entries(holes)) {
      expect(unclassified('src/net/fixture.ts', src).length, `hole "${name}" must be caught`).toBeGreaterThan(0);
    }
    // …and the covered shapes stay clean (positive control).
    expect(unclassified('src/net/fixture.ts', [
      "import { joinRoom as joinNostr, selfId } from '@trystero-p2p/nostr';",
      'type C = Parameters<typeof joinNostr>[0];',
      'const room = joinNostr({ rtcPolyfill: POOL_SAFE_PC }, code);',
    ].join('\n'))).toEqual([]);
    expect(dynamicImports('src/net/fixture.ts', "const m = await import('@trystero-p2p/nostr');")).toEqual([
      'src/net/fixture.ts:@trystero-p2p/nostr',
    ]);
  });
});

describe('S192 T1 — the Trystero restart bug the workaround targets is still the installed code', () => {
  const core = (p: string) => norm(readFileSync(join(ROOT, 'node_modules/@trystero-p2p/core', p), 'utf8'));

  it('Trystero is 0.25.x in package.json and in every installed package', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    for (const name of ['core', 'nostr', 'torrent', 'mqtt']) {
      expect(pkg.dependencies[`@trystero-p2p/${name}`], `package.json @trystero-p2p/${name}`).toMatch(/^\D?0\.25\.\d+$/);
      const installed = JSON.parse(
        readFileSync(join(ROOT, `node_modules/@trystero-p2p/${name}/package.json`), 'utf8'),
      ) as { version: string };
      expect(installed.version, `installed @trystero-p2p/${name} — re-check the S192 workaround`).toMatch(/^0\.25\.\d+$/);
    }
  });

  it('peer.mjs still honours rtcPolyfill and still rolls back the unanswered offer on restart', () => {
    const peer = core('dist/peer.mjs');
    expect(peer).toContain('new (rtcPolyfill ?? RTCPeerConnection)(');
    const restart = /if \(restartIce\) \{([\s\S]*?)\n\t\t\t\}\n\t\t\tawait pc\.setLocalDescription\(restartIce \? await pc\.createOffer\(\{ iceRestart: true \}\) : void 0\);/.exec(peer);
    expect(restart, 'the createOffer(restartIce) block changed shape — re-read it').not.toBeNull();
    expect(restart![1]).toContain('pc.localDescription?.type === offerType) await pc.setLocalDescription({ type: "rollback" });');
    expect(restart![1]).toContain('pc.restartIce()');
    // The only other rollback is glare handling, which returns early for initiators — the reason the
    // predicate cannot swallow it. If that guard moves, the predicate's safety argument must be re-made.
    expect(peer).toMatch(/if \(initiator\) return;\s*await all\(\[pc\.setLocalDescription\(\{ type: "rollback" \}\), pc\.setRemoteDescription\(rtcSdp\)\]\);/);
    expect(peer.match(/type: "rollback"/g)).toHaveLength(2);
  });

  it('pooled offers still go stale at 57.3 s and are restarted from a Date.now() age', () => {
    expect(core('dist/offer-pool.mjs')).toContain('const offerTtl = 57333;');
    const strategy = core('dist/strategy.mjs');
    expect(strategy).toContain('peer.getOffer(Date.now() - peer.created > offerTtl)');
    // The pool is per page and closes over the FIRST join's config — why every site needs the polyfill.
    expect(strategy).toContain('const makeOffer = () => peer_default(true, config);');
    expect(strategy).toContain('offerPool ||= new OfferPool(makeOffer);');
  });
});
