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

/**
 * SPARK — S150 P1: THE CHANGELOG-COMPLETENESS GATE. (CF-S147-b, closed mechanically.)
 *
 * ## Why prose needed a machine
 *
 * `protocol.ts` carries the bump history in TWO places by design — a narrative block above the
 * constant (the argument for each bump) and a compact list on `HelloMsg` (the index). Neither was
 * enforced by anything, and the docblock's own warning had been caught stale so often that it kept a
 * running count of its own staleness — which then went stale too.
 *
 * ⭐ THE MEASUREMENT THAT JUSTIFIES THIS FILE. When S150 stopped reading the block and instead
 * ENUMERATED the chain, the narrative carrier turned out to be missing FOUR links, not the two that
 * were visible: 25→26 and 26→27 at the head, plus **8→9 and 20→21**, absent since S93 and S144 while
 * the `HelloMsg` list had carried both the whole time. Every prior session that touched this drift
 * had read the same comment and believed it complete, because a human checks that the LAST entry
 * matches the constant. Only a machine checks every link.
 *
 * ## Why these assertions are on COMMENT text, inverting this file's other rule
 *
 * The block above strips comments before matching, for the `ci.deployGate.test.ts` reason: a spec
 * legitimately *mentions* old version numbers in prose, so text matching would be satisfied by the
 * documentation of a bug. Here the comments ARE the artifact under test — the changelog is prose by
 * construction — so the polarity is deliberately reversed. The risk swaps with it: not a false match
 * on documentation, but a false PASS from an unrelated number pair. Both carriers are therefore
 * matched on their own distinct anchored shapes (`bumped N->M` / `N->M (`), never on a bare `N->M`.
 *
 * ## What this CANNOT catch, stated so the next session does not over-trust it
 *
 * That an entry is TRUE. A backfilled link with a fabricated reason satisfies every assertion here.
 * This gate proves the chain is UNBROKEN and ENDS AT THE CONSTANT — sites 1, 2, 3 and 5 of the
 * six-item checklist. Site 4 is tsc. Site 6 (the session label) is irreducibly prose.
 */
describe('S150 P1 — the bump changelog is complete in both carriers, mechanically', () => {
  const PROTOCOL_PATH = fileURLToPath(new URL('./protocol.ts', import.meta.url));
  const PROTOCOL_SRC = readFileSync(PROTOCOL_PATH, 'utf8');

  const CONST_ANCHOR = 'export const PROTOCOL_VERSION';
  const anchorAt = PROTOCOL_SRC.indexOf(CONST_ANCHOR);

  /** The narrative argument block — everything ABOVE the constant. */
  const NARRATIVE = PROTOCOL_SRC.slice(0, anchorAt);
  /** The compact index on `HelloMsg` — from the constant to the `protoVersion` literal it documents. */
  const HELLO_LIST = PROTOCOL_SRC.slice(
    anchorAt,
    PROTOCOL_SRC.indexOf('readonly protoVersion:', anchorAt),
  );

  /**
   * Both arrow spellings ship in this file (`->` and `→`), interchangeably and across many authors.
   * Normalising is the only honest option: a gate that accepted one spelling would report a missing
   * link that is present, which is worse than no gate — it would train the next session to distrust it.
   */
  const links = (region: string, shape: RegExp): Set<number> => {
    const found = new Set<number>();
    for (const m of region.replace(/→/g, '->').matchAll(shape)) {
      if (Number(m[1]) + 1 === Number(m[2])) found.add(Number(m[2]));
    }
    return found;
  };

  // `bumped N->M:` — the narrative block's own consistent phrasing for 26 entries.
  const NARRATIVE_LINKS = links(NARRATIVE, /bumped\s+(\d+)\s*->\s*(\d+)/g);
  // `N->M (` — the HelloMsg index's phrasing, which always opens a parenthesised reason.
  const HELLO_LINKS = links(HELLO_LIST, /(\d+)\s*->\s*(\d+)\s*\(/g);

  /**
   * ⭐ EACH CARRIER GETS ITS OWN FLOOR, MEASURED — NOT A SHARED CONSTANT.
   *
   * The first draft of this gate asserted both carriers ran from 2, and the HelloMsg one failed on
   * 2–6. That was the GATE being wrong, not the file: the narrative block goes back to `1->2`, while
   * the HelloMsg index was started later and legitimately opens at `6->7`. Inventing a floor would
   * have made a true file look broken — the fastest way to teach the next session to ignore a test.
   *
   * So the invariant asserted is the one that is actually true of both: **no gaps between the
   * earliest link a carrier documents and `PROTOCOL_VERSION`.** The floors are then pinned separately
   * below, so entries silently disappearing off the FRONT still fails.
   */
  const chainFrom = (found: Set<number>): number[] => {
    // ⛔ S150 LANDING AUDIT — FAIL LOUDLY ON AN EMPTY SET, RATHER THAN RETURNING ONE.
    //
    // The audit caught this and it is the sharpest finding against my own gate: `Math.min(...∅)` is
    // `Infinity`, so `PROTOCOL_VERSION - Infinity + 1` is `-Infinity`, and
    // `Array.from({length: -Infinity})` normalises to `[]`. Every assertion built on this would then
    // compare `[]` to `[]` and pass — FOUR of them, including both headline "unbroken chain" tests.
    //
    // They were protected only by the separate anti-vacuity test below asserting the link sets are
    // non-empty. That is real protection but it is NON-LOCAL: deleting or weakening that one test
    // would silently convert four assertions into permanent green with no other signal. A gate whose
    // teeth live in a different test is one refactor away from being decoration — which is precisely
    // the class of failure this whole file exists to stop.
    if (found.size === 0) {
      throw new Error(
        'chainFrom: no bump links matched at all. Either a carrier region is empty (the constant or ' +
          '`protoVersion` moved and the region split broke) or the changelog phrasing changed and the ' +
          'regex no longer matches. Both are gate failures, not passes.',
      );
    }
    const floor = Math.min(...found);
    return Array.from({ length: PROTOCOL_VERSION - floor + 1 }, (_, i) => floor + i);
  };

  it('the region split actually found both carriers (anti-vacuity)', () => {
    // Without this, a refactor that moved the constant or renamed `protoVersion` would empty one
    // region and every assertion below would pass over nothing at all — green, and meaningless.
    expect(anchorAt).toBeGreaterThan(0);
    expect(NARRATIVE.length).toBeGreaterThan(1_000);
    expect(HELLO_LIST.length).toBeGreaterThan(1_000);
    expect(NARRATIVE_LINKS.size).toBeGreaterThan(20);
    expect(HELLO_LINKS.size).toBeGreaterThan(20);
  });

  it('the NARRATIVE block documents an unbroken chain up to PROTOCOL_VERSION', () => {
    // ⛔ IF THIS IS RED: you bumped PROTOCOL_VERSION and did not add the narrative entry above the
    // constant (checklist site 2) — or you added one that skips a link. Write the argument for the
    // bump, in the `bumped N->M:` form the rest of the block uses.
    //
    // This is the assertion that found 8->9 and 20->21 missing after eight and three bumps.
    const missing = chainFrom(NARRATIVE_LINKS).filter((v) => !NARRATIVE_LINKS.has(v));
    expect(missing).toEqual([]);
  });

  it('the HelloMsg list documents an unbroken chain up to PROTOCOL_VERSION', () => {
    // ⛔ IF THIS IS RED: checklist site 3. Add the entry to the `HelloMsg` docblock, in chronological
    // order, at the same indentation as its neighbours.
    const missing = chainFrom(HELLO_LINKS).filter((v) => !HELLO_LINKS.has(v));
    expect(missing).toEqual([]);
  });

  it('neither carrier has lost entries off the FRONT of its history', () => {
    // The floors are measured, so a deletion at the front would silently shorten the chain the two
    // tests above check and they would both stay green. These two numbers are the backstop. They are
    // allowed to FALL (documenting older history is welcome) and never to rise.
    expect(Math.min(...NARRATIVE_LINKS)).toBeLessThanOrEqual(2);
    // The HelloMsg index was started at S77 P3, later than the narrative block. Not drift — history.
    expect(Math.min(...HELLO_LINKS)).toBeLessThanOrEqual(7);
  });

  it('neither carrier claims a version that does not exist yet', () => {
    // The mirror failure, and the one that actually shipped once: a backfill written while the
    // literal already read the new number, leaving the two out of step in the other direction.
    const ahead = [...NARRATIVE_LINKS, ...HELLO_LINKS].filter((v) => v > PROTOCOL_VERSION);
    expect(ahead).toEqual([]);
  });

  it('the HelloMsg entries are in CHRONOLOGICAL ORDER', () => {
    // S150 found the last four entries scrambled (27, 24, 26, 25). Order is not cosmetic here: the
    // list is read as a history, and a scrambled tail is precisely where a missing link hides.
    const seq = [...HELLO_LIST.replace(/→/g, '->').matchAll(/(\d+)\s*->\s*(\d+)\s*\(/g)]
      .map((m) => [Number(m[1]), Number(m[2])] as const)
      .filter(([from, to]) => from + 1 === to)
      .map(([, to]) => to);
    expect(seq).toEqual([...seq].sort((a, b) => a - b));
  });

  it('the six-item checklist is still SIX items, and still names the session-label trap', () => {
    // The checklist itself drifted — it said THREE for four bumps running. Pinning the count means
    // silently dropping an item fails here rather than being discovered by the next drift.
    expect(HELLO_LIST).toMatch(/means\s+editing\s+\*\*SIX\*\*\s+things/);
    for (const n of [1, 2, 3, 4, 5, 6]) expect(HELLO_LIST).toContain(`   *   ${n}.`);
    expect(HELLO_LIST).toContain('THE SESSION LABEL');
  });
});
