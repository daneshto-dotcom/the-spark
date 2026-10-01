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

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
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

  it('the enumerated call sites are exactly the known three (a new one must be wired, then re-pinned)', () => {
    expect(sites.map((s) => `${s.file}:${s.callee}`)).toEqual([
      'src/arcade/pitchMasters/bridge.ts:joinRoom',
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
