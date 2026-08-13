/**
 * SPARK — S142 P2: THE PROTOCOL-VERSION SYNC GATE.
 *
 * WHY THIS EXISTS. `e2e/smoke.spec.ts` cannot import from `src/` (pulling `src/net/protocol.ts`
 * into the Playwright process would drag its whole dependency graph along), so it pins the
 * protocol version as a LITERAL: `const LOCAL_PROTO_V = <n>`. That literal has to be updated by
 * hand on every bump, and the only thing enforcing it was a comment.
 *
 * IT ROTTED, SILENTLY, ACROSS ROUGHLY SIX BUMPS. The older-peer test asserted the host renders
 * `v9` while `PROTOCOL_VERSION` had been 15 since S124 — `'v15'` does not contain `'v9'`, so that
 * assertion could not have passed. It stayed green only because the whole describe block is
 * `@quarantine-flaky` and `npm run e2e:gating` grep-inverts that tag, so nothing ever ran it.
 *
 * S139 fixed HALF of this structurally, by DERIVING `NEWER_PEER_V` from `LOCAL_PROTO_V` so the
 * newer-peer test can never again silently degrade into the older-peer branch. But the other
 * half — `LOCAL_PROTO_V` versus the real `PROTOCOL_VERSION` — stayed hand-synced. This file is
 * the mechanical carrier for that link, and it runs in the GATING vitest suite (`deploy.yml`
 * executes `npx vitest run`), so a bump that forgets the spec now fails before it can ship.
 *
 * ⚠ ASSERTIONS ARE ON CODE, NOT ON FILE TEXT — the `ci.deployGate.test.ts` lesson. That spec
 * legitimately *mentions* older version numbers inside explanatory comments (e.g. the S133 note
 * recording that the literal used to read `v9`). A naive text match would fail on the very
 * documentation that explains the bug, so comment lines are stripped before matching.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PROTOCOL_VERSION } from './protocol.ts';

const SPEC_PATH = fileURLToPath(new URL('../../e2e/smoke.spec.ts', import.meta.url));
const SPEC = readFileSync(SPEC_PATH, 'utf8');

/** Spec source with `//` and `/* *\/` comments removed, so documentation can never satisfy a match. */
const SPEC_CODE = SPEC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('S142 P2 — the e2e protocol pin tracks PROTOCOL_VERSION mechanically', () => {
  it('declares LOCAL_PROTO_V exactly once, as a literal, in code (not in a comment)', () => {
    const decls = [...SPEC_CODE.matchAll(/const\s+LOCAL_PROTO_V\s*=\s*(\d+)\s*;/g)];
    expect(decls).toHaveLength(1);
  });

  it('LOCAL_PROTO_V === PROTOCOL_VERSION', () => {
    const m = /const\s+LOCAL_PROTO_V\s*=\s*(\d+)\s*;/.exec(SPEC_CODE);
    expect(m).not.toBeNull();
    const pinned = Number(m![1]);
    // ⛔ IF THIS IS RED: you bumped PROTOCOL_VERSION and did not update
    // `LOCAL_PROTO_V` at the top of e2e/smoke.spec.ts. Update that ONE number — NEWER_PEER_V
    // follows from it. Do not re-introduce loose version literals into the spec.
    expect(pinned).toBe(PROTOCOL_VERSION);
  });

  it('NEWER_PEER_V stays DERIVED from LOCAL_PROTO_V, never a second literal', () => {
    // The S139 structural fix: a newer-peer test written against a hardcoded number silently
    // became an OLDER-peer test the moment the real version overtook it. Deriving makes that
    // inversion inexpressible, so the derivation itself is worth guarding.
    expect(SPEC_CODE).toMatch(/const\s+NEWER_PEER_V\s*=\s*LOCAL_PROTO_V\s*\+\s*1\s*;/);
    expect(SPEC_CODE).not.toMatch(/const\s+NEWER_PEER_V\s*=\s*\d+\s*;/);
  });
});
