/**
 * SPARK — S143 P1: THE ONE SIM-WORKER FLAG PREDICATE.
 *
 * The bug this file exists to make un-reintroducible is NOT "the flag was parsed wrong". Both
 * old call sites parsed it identically and correctly (`get('worker') === '1'`). The bug was
 * that one of them was asking the wrong QUESTION: `probeHarness` needed "is the worker active?"
 * and asked "does the URL literally say worker=1?" — two questions with the same answer in
 * today's regime and OPPOSITE answers the moment the default flips.
 *
 * So the load-bearing tests here are the DEFAULT-ON ones. They exercise a regime the shipped
 * build is not in yet, which is the only way a flip can be verified before it is taken.
 */
import { describe, expect, it } from 'vitest';
import {
  WORKER_DEFAULT_ON,
  WORKER_FLAG_PARAM,
  isSimWorkerRequested,
} from './workerFlag.ts';

describe('S143 P1 — isSimWorkerRequested', () => {
  describe('explicit values win in BOTH regimes', () => {
    // The asymmetry that matters: `?worker=1` must stay an opt-IN while the default is off,
    // and `?worker=0` must become a real opt-OUT the instant the default is on. If either
    // stopped being honoured, the flip would strand the player with no way back.
    it('?worker=1 is ON regardless of the default', () => {
      expect(isSimWorkerRequested('?worker=1', false)).toBe(true);
      expect(isSimWorkerRequested('?worker=1', true)).toBe(true);
    });

    it('?worker=0 is OFF regardless of the default — the escape hatch', () => {
      expect(isSimWorkerRequested('?worker=0', false)).toBe(false);
      expect(isSimWorkerRequested('?worker=0', true)).toBe(false);
    });

    it('accepts a search string with or without the leading ?', () => {
      expect(isSimWorkerRequested('worker=1', false)).toBe(true);
      expect(isSimWorkerRequested('worker=0', true)).toBe(false);
    });

    it('honours the flag among other params, in any position', () => {
      expect(isSimWorkerRequested('?debug=1&worker=1&probe=1', false)).toBe(true);
      expect(isSimWorkerRequested('?worker=0&debug=1', true)).toBe(false);
      expect(isSimWorkerRequested('?spawn=0.03125&worker=1', false)).toBe(true);
    });
  });

  describe('absent / unrecognised falls through to the DEFAULT', () => {
    // ⛔ THE REGRESSION. Under `defaultOn: true` an ABSENT param means the worker IS active.
    // The old `=== '1'` guard returned false here, which is what would have armed the probe
    // harness while the worker owned the world.
    it('an ABSENT flag means the worker is ACTIVE once the default is on', () => {
      expect(isSimWorkerRequested('', true)).toBe(true);
      expect(isSimWorkerRequested('?debug=1', true)).toBe(true);
    });

    it('an ABSENT flag means the worker is INACTIVE while the default is off', () => {
      expect(isSimWorkerRequested('', false)).toBe(false);
      expect(isSimWorkerRequested('?debug=1', false)).toBe(false);
    });

    it('an unrecognised value is the DEFAULT, never an opt-in', () => {
      // A typo must not hand one player a different simulation from everyone else. The default
      // is the tested posture, so it is the safe fallthrough in both directions.
      for (const bad of ['?worker=', '?worker=yes', '?worker=true', '?worker=2', '?worker=01']) {
        expect(isSimWorkerRequested(bad, false)).toBe(false);
        expect(isSimWorkerRequested(bad, true)).toBe(true);
      }
    });
  });

  describe('the production default', () => {
    it('omitting defaultOn uses WORKER_DEFAULT_ON', () => {
      // Flip-proof by construction: this keeps passing after WORKER_DEFAULT_ON changes, and it
      // is what guarantees both call sites move together when it does.
      expect(isSimWorkerRequested('')).toBe(WORKER_DEFAULT_ON);
      expect(isSimWorkerRequested('?debug=1')).toBe(WORKER_DEFAULT_ON);
    });

    it('still honours both explicit values through the production entry point', () => {
      expect(isSimWorkerRequested('?worker=1')).toBe(true);
      expect(isSimWorkerRequested('?worker=0')).toBe(false);
    });

    it('the param name is exported rather than re-spelled at call sites', () => {
      expect(WORKER_FLAG_PARAM).toBe('worker');
      expect(isSimWorkerRequested(`?${WORKER_FLAG_PARAM}=1`, false)).toBe(true);
    });
  });

  describe('⛔ the probeHarness inversion, stated as an executable claim', () => {
    it('"worker is active" and "url says worker=1" DIVERGE under default-on', () => {
      const search = '?probe=1'; // a probe run with no worker flag, exactly as documented
      const urlLiterallySaysOne = new URLSearchParams(search).get('worker') === '1';
      const workerIsActuallyActive = isSimWorkerRequested(search, true);

      // The old guard's question...
      expect(urlLiterallySaysOne).toBe(false);
      // ...and the true state of the world. These disagreeing IS the bug: the harness would
      // have armed (guard false) while the worker owned the authoritative world (active true).
      expect(workerIsActuallyActive).toBe(true);
      expect(urlLiterallySaysOne).not.toBe(workerIsActuallyActive);
    });

    it('they AGREE under default-off, which is why this never showed up', () => {
      const search = '?probe=1';
      const urlLiterallySaysOne = new URLSearchParams(search).get('worker') === '1';
      expect(isSimWorkerRequested(search, false)).toBe(urlLiterallySaysOne);
    });
  });
});
