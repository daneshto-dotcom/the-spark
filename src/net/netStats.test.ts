/**
 * SPARK — S182 STEP 0 tests: the net-bandwidth / snapshot-arrival counters.
 *
 * ⭐ HALF OF THIS FILE IS SOURCE-TEXT TRIPWIRES, ON PURPOSE. The briefs record this project's
 * signature defect: a rule that is correct where it is written and never reached at some of its call
 * sites, shipping green because the failure mode is UNREACHED CODE rather than wrong code. A counter
 * has exactly that shape — every behavioural assertion below would stay green if `transport.send`
 * or `ClientSync.receive` simply never called it. So the call sites are asserted to EXIST, by text.
 *
 * The other rule being defended is the zero-cost-when-disabled contract: every call site must test
 * `isEnabled()` BEFORE evaluating its arguments, because the arguments include `performance.now()`.
 * A refactor that "tidies" the guard inside the recorder would silently put a clock read on the hot
 * path of the host that is already the bottleneck. That is asserted by text too.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NetStats, netStats, netStatsRequested } from './netStats.ts';

const TRANSPORT_SRC = readFileSync(new URL('./transport.ts', import.meta.url), 'utf8');
const SYNC_SRC = readFileSync(new URL('./sync.ts', import.meta.url), 'utf8');
const OVERLAY_SRC = readFileSync(new URL('../render/statsOverlay.ts', import.meta.url), 'utf8');
const MAIN_SRC = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');

describe('S182 step 0 — NetStats gate', () => {
  it('is disabled by default and records nothing until enabled', () => {
    const s = new NetStats();
    expect(s.isEnabled()).toBe(false);
    s.recordSend('nostr', 'NETSNAPSHOT', 50_000, 0);
    s.recordReceive(50_000, 0);
    s.recordSnapshotAccepted(0);
    s.recordSnapshotDropped(0);
    const r = s.read(5_000);
    expect(r.enabled).toBe(false);
    expect(r.outBytesPerSec).toBe(0);
    expect(r.acceptedTotal).toBe(0);
    expect(r.dupTotal).toBe(0);
  });

  it('enable() zeroes a dirty instance so a mid-match re-arm reads a clean window', () => {
    const s = new NetStats();
    s.enable();
    s.recordSnapshotAccepted(0);
    s.recordSnapshotAccepted(100);
    expect(s.read(100).acceptedTotal).toBe(2);
    s.enable();
    expect(s.read(100).acceptedTotal).toBe(0);
  });

  it('the shared singleton ships DISABLED — an ordinary session must arm nothing', () => {
    expect(netStats.isEnabled()).toBe(false);
  });
});

describe('S182 step 0 — netStatsRequested', () => {
  it('arms on ?netstats=1 and on the existing ?debug=1 seam', () => {
    expect(netStatsRequested('?netstats=1')).toBe(true);
    expect(netStatsRequested('?debug=1')).toBe(true);
    expect(netStatsRequested('?foo=2&debug=1&bar=3')).toBe(true);
  });

  it('stays off for an ordinary URL', () => {
    expect(netStatsRequested('')).toBe(false);
    expect(netStatsRequested('?room=ABCD')).toBe(false);
    expect(netStatsRequested('?worker=1')).toBe(false);
  });
});

describe('S182 step 0 — outbound rates', () => {
  it('reports per-strategy bytes/sec, and the two-row shape IS the double-send', () => {
    const s = new NetStats();
    s.enable();
    // One 10 Hz second of a 100 KiB snapshot sent over BOTH strategies, exactly as transport.send
    // does today: one serialize, two dispatches.
    for (let i = 0; i < 10; i++) {
      s.recordSend('nostr', 'NETSNAPSHOT', 102_400, i * 100);
      s.recordSend('torrent', 'NETSNAPSHOT', 102_400, i * 100);
    }
    const r = s.read(1_000);
    const byName = new Map(r.outByStrategy.map((x) => [x.name, x.bytesPerSec]));
    expect(byName.get('nostr')).toBeCloseTo(1_024_000, 0);
    expect(byName.get('torrent')).toBeCloseTo(1_024_000, 0);
    // The headline number is the SUM — what the host's uplink actually has to carry.
    expect(r.outBytesPerSec).toBeCloseTo(2_048_000, 0);
    // 20 dispatches of one snapshot each in the window.
    expect(r.snapTxPerSec).toBeCloseTo(20, 5);
    expect(r.snapTxBytes).toBe(102_400);
  });

  it('separates NETSNAPSHOT from the rare control traffic in the snapshot counter', () => {
    const s = new NetStats();
    s.enable();
    s.recordSend('nostr', 'HELLO', 200, 0);
    s.recordSend('nostr', 'INTENT', 120, 10);
    s.recordSend('nostr', 'NETSNAPSHOT', 50_000, 20);
    const r = s.read(1_000);
    expect(r.snapTxPerSec).toBeCloseTo(1, 5);
    expect(r.snapTxBytes).toBe(50_000);
    // …but every kind still counts toward the uplink total.
    expect(r.outBytesPerSec).toBeCloseTo(50_320, 0);
  });

  it('counts inbound bytes pre-dedup, so both copies are visible on the joiner', () => {
    const s = new NetStats();
    s.enable();
    s.recordReceive(102_400, 0);
    s.recordReceive(102_400, 50);
    expect(s.read(1_000).inBytesPerSec).toBeCloseTo(204_800, 0);
  });
});

describe('S182 step 0 — the starvation numbers', () => {
  it('accepted rate + gaps reproduce the brother`s "every five seconds" symptom', () => {
    const s = new NetStats();
    s.enable();
    // 0.2 Hz of arrivals — the reported symptom, in numbers.
    for (let i = 0; i <= 5; i++) s.recordSnapshotAccepted(i * 5_000);
    const r = s.read(25_000);
    expect(r.gapLastMs).toBe(5_000);
    expect(r.gapMaxMs).toBe(5_000);
    expect(r.acceptedTotal).toBe(6);
    // Well under the 10 Hz cadence cap — which is the whole finding.
    expect(r.snapRxPerSec).toBeLessThan(1);
  });

  it('gapMax is cumulative across windows — a single 5 s stall must not be averaged away', () => {
    const s = new NetStats();
    s.enable();
    s.recordSnapshotAccepted(0);
    s.recordSnapshotAccepted(5_000); // the stall
    for (let i = 1; i <= 10; i++) s.recordSnapshotAccepted(5_000 + i * 100); // then healthy
    const r = s.read(7_000);
    expect(r.gapMaxMs).toBe(5_000);
    expect(r.gapLastMs).toBe(100);
  });

  it('dup tracking accepted one-for-one is the double-send seen from the receiving end', () => {
    const s = new NetStats();
    s.enable();
    for (let i = 0; i < 10; i++) {
      s.recordSnapshotAccepted(i * 100); // first copy wins the seq gate
      s.recordSnapshotDropped(i * 100 + 5); // second copy loses it
    }
    const r = s.read(1_000);
    expect(r.acceptedTotal).toBe(10);
    expect(r.dupTotal).toBe(10);
    expect(r.snapDupPerSec).toBeCloseTo(r.snapRxPerSec, 5);
  });

  it('a read during a total stall decays to zero instead of freezing the last healthy rate', () => {
    const s = new NetStats();
    s.enable();
    for (let i = 0; i < 10; i++) s.recordSnapshotAccepted(i * 100);
    expect(s.read(1_000).snapRxPerSec).toBeCloseTo(10, 5);
    // Nothing arrives for three seconds. The overlay reads every frame; the window must roll on
    // READ, or the display would still say 10 Hz over a visibly frozen board — the exact
    // misreading this instrument exists to prevent.
    expect(s.read(4_000).snapRxPerSec).toBe(0);
  });
});

describe('S182 step 0 — call sites exist (source-text tripwires)', () => {
  it('transport.send records ONE row per strategy, inside the dispatch loop', () => {
    expect(TRANSPORT_SRC).toContain('netStats.recordSend(handle.name');
    // Inside the loop, not hoisted above it: `handle` is only in scope within the loop body, so a
    // hoist cannot compile — but assert the ordering anyway so a future rewrite that reintroduces a
    // single per-message record (hiding the doubling) fails here rather than in a playtest.
    const loopAt = TRANSPORT_SRC.indexOf('for (const handle of this.strategies.values())');
    const recordAt = TRANSPORT_SRC.indexOf('netStats.recordSend(handle.name');
    expect(loopAt).toBeGreaterThan(-1);
    expect(recordAt).toBeGreaterThan(loopAt);
  });

  it('transport.handleRawMessage records inbound bytes BEFORE the JSON.parse', () => {
    const recordAt = TRANSPORT_SRC.indexOf('netStats.recordReceive(data.length');
    const parseAt = TRANSPORT_SRC.indexOf('parsed = JSON.parse(data)');
    expect(recordAt).toBeGreaterThan(-1);
    expect(parseAt).toBeGreaterThan(-1);
    expect(recordAt).toBeLessThan(parseAt);
  });

  it('ClientSync.receive instruments BOTH gate arms plus the accept', () => {
    expect(SYNC_SRC).toContain('netStats.recordSnapshotAccepted(now)');
    // Two drop arms: the epoch gate and the seq gate. The seq gate is the one that catches the
    // redundant second-strategy copy, so losing it would silently zero the headline `dup` number.
    const drops = SYNC_SRC.match(/netStats\.recordSnapshotDropped\(now\)/g) ?? [];
    expect(drops.length).toBe(2);
  });

  it('the overlay renders the net block', () => {
    expect(OVERLAY_SRC).toContain('netStats.read(performance.now())');
    expect(OVERLAY_SRC).toContain('this.netSection()');
  });

  it('main.ts arms the counters from the URL', () => {
    expect(MAIN_SRC).toContain('netStatsRequested(window.location.search)');
    expect(MAIN_SRC).toContain('netStats.enable()');
  });
});

describe('S182 step 0 — zero-cost-when-disabled contract', () => {
  /**
   * ⛔ Every call site must read `isEnabled()` BEFORE its arguments, because one of those arguments
   * is `performance.now()`. Moving the guard inside the recorder would look like a tidy-up and would
   * put a clock read on the hot path of the host that is already the bottleneck — on the SEND path,
   * once per strategy per snapshot, forever. Asserted by text because no behavioural test can see it.
   */
  it('every netStats call on a hot path is preceded by an isEnabled() guard', () => {
    // The guard may sit on the call's own line or open a block just above it — both evaluate
    // `isEnabled()` before the arguments, which is the property under test. Asserting SAME-LINE
    // would have been a formatting rule wearing a correctness rule's clothes.
    const GUARD_LOOKBACK = 2;
    let checked = 0;
    for (const src of [TRANSPORT_SRC, SYNC_SRC]) {
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (!/netStats\.record/.test(line)) return;
        checked++;
        const window = lines.slice(Math.max(0, i - GUARD_LOOKBACK), i + 1).join('\n');
        expect(window).toMatch(/netStats\.isEnabled\(\)/);
      });
    }
    // 5 sites: send · receive · snapshot accept · 2 × snapshot drop.
    expect(checked).toBe(5);
  });

  it('the recorders still self-guard, so an unguarded future call site is inert rather than wrong', () => {
    const s = new NetStats();
    // Never enabled: a call site that forgets the outer guard must still record nothing.
    s.recordSend('nostr', 'NETSNAPSHOT', 999, 0);
    expect(s.read(1_000).outBytesPerSec).toBe(0);
  });

  it('netStats.ts reads no clock and touches no sim — asserted against CODE, not prose', () => {
    // ⚠ Strip comments first. The docblock necessarily NAMES `performance.now()` to explain why the
    // module does not call it, and the first cut of this test matched its own explanation. A source
    // tripwire that cannot tell code from the comment describing the code is not a tripwire.
    const code = readFileSync(new URL('./netStats.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/from '\.\.\/state\//);
    expect(code).not.toMatch(/Math\.random/);
    // No wall clock inside: `now` is an explicit parameter on every record call.
    expect(code).not.toMatch(/performance\.now\(\)/);
    expect(code).not.toMatch(/Date\.now\(\)/);
    // Guard the guard: prove the stripper left the actual code behind.
    expect(code).toContain('recordSnapshotAccepted');
  });
});
